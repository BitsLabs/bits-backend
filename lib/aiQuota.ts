import { AppError } from "./errors";
import type { VerifiedSession } from "./session";

const DEFAULT_WEEKLY_AI_REQUEST_LIMIT = 100;
const WEEK_SECONDS = 7 * 24 * 60 * 60;
const WEEK_MS = WEEK_SECONDS * 1000;

const requestsByUser = new Map<string, number>();

export type AIQuotaStatus = {
  limit: number;
  remaining: number;
  resetsAt: string;
  used: number;
};

export function getWeeklyLimit(): number {
  const configuredLimit = process.env.BITS_AI_WEEKLY_REQUEST_LIMIT;

  if (!configuredLimit) {
    return DEFAULT_WEEKLY_AI_REQUEST_LIMIT;
  }

  const parsedLimit = Number.parseInt(configuredLimit, 10);

  if (!Number.isFinite(parsedLimit) || parsedLimit < 1) {
    return DEFAULT_WEEKLY_AI_REQUEST_LIMIT;
  }

  return parsedLimit;
}

function getRedisConfig(): { token: string; url: string } | null {
  const url =
    process.env.KV_REST_API_URL?.trim() ||
    process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token =
    process.env.KV_REST_API_TOKEN?.trim() ||
    process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (!url || !token) {
    return null;
  }

  return { url, token };
}

function getQuotaKey(session: VerifiedSession, now: number): string {
  const week = Math.floor(now / WEEK_MS);
  const userIdentifier = session.revenueCatAppUserId
    ? `revenuecat:${session.revenueCatAppUserId}`
    : `installation:${session.installationId}`;

  return `ai-quota:v2:${session.bundleId}:${userIdentifier}:${week}`;
}

function getWeekResetDate(now: number): Date {
  const currentWeek = Math.floor(now / WEEK_MS);
  return new Date((currentWeek + 1) * WEEK_MS);
}

function throwQuotaExceeded(): never {
  throw new AppError(
    "rate_limited",
    "Weekly AI request limit reached. Please try again later.",
    429,
  );
}

async function consumeRedisQuota(
  session: VerifiedSession,
  weeklyLimit: number,
): Promise<void> {
  const redis = getRedisConfig();

  if (!redis) {
    return consumeInMemoryQuota(session, weeklyLimit);
  }

  const key = getQuotaKey(session, Date.now());
  const response = await fetch(`${redis.url}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${redis.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      ["INCR", key],
      ["EXPIRE", key, WEEK_SECONDS * 2, "NX"],
    ]),
  });

  if (!response.ok) {
    throw new AppError(
      "temporarily_unavailable",
      "AI usage tracking is temporarily unavailable. Please try again soon.",
      503,
    );
  }

  const results = (await response.json()) as unknown;
  const incrementResult = Array.isArray(results) ? results[0] : undefined;
  const count =
    incrementResult &&
    typeof incrementResult === "object" &&
    "result" in incrementResult
      ? Number(incrementResult.result)
      : Number.NaN;

  if (!Number.isFinite(count)) {
    throw new AppError(
      "temporarily_unavailable",
      "AI usage tracking is temporarily unavailable. Please try again soon.",
      503,
    );
  }

  if (count > weeklyLimit) {
    throwQuotaExceeded();
  }
}

async function readRedisQuotaStatus(
  session: VerifiedSession,
  weeklyLimit: number,
): Promise<AIQuotaStatus> {
  const redis = getRedisConfig();

  if (!redis) {
    return readInMemoryQuotaStatus(session, weeklyLimit);
  }

  const now = Date.now();
  const key = getQuotaKey(session, now);
  const response = await fetch(`${redis.url}/get/${encodeURIComponent(key)}`, {
    headers: {
      Authorization: `Bearer ${redis.token}`,
    },
  });

  if (!response.ok) {
    throw new AppError(
      "temporarily_unavailable",
      "AI usage tracking is temporarily unavailable. Please try again soon.",
      503,
    );
  }

  const payload = (await response.json()) as unknown;
  const value =
    payload && typeof payload === "object" && "result" in payload
      ? (payload.result as unknown)
      : null;
  const used = typeof value === "string" ? Number.parseInt(value, 10) : 0;
  const normalizedUsed = Number.isFinite(used) && used > 0 ? used : 0;

  return quotaStatus(normalizedUsed, weeklyLimit, now);
}

function consumeInMemoryQuota(
  session: VerifiedSession,
  weeklyLimit: number,
): void {
  const now = Date.now();
  const key = getQuotaKey(session, now);
  const currentCount = requestsByUser.get(key) ?? 0;

  if (currentCount >= weeklyLimit) {
    throwQuotaExceeded();
  }

  requestsByUser.set(key, currentCount + 1);
}

function readInMemoryQuotaStatus(
  session: VerifiedSession,
  weeklyLimit: number,
): AIQuotaStatus {
  const now = Date.now();
  const key = getQuotaKey(session, now);
  return quotaStatus(requestsByUser.get(key) ?? 0, weeklyLimit, now);
}

function quotaStatus(used: number, weeklyLimit: number, now: number): AIQuotaStatus {
  return {
    limit: weeklyLimit,
    used,
    remaining: Math.max(weeklyLimit - used, 0),
    resetsAt: getWeekResetDate(now).toISOString(),
  };
}

export async function consumeAIQuota(session: VerifiedSession): Promise<void> {
  await consumeRedisQuota(session, getWeeklyLimit());
}

export async function getAIQuotaStatus(
  session: VerifiedSession,
): Promise<AIQuotaStatus> {
  return readRedisQuotaStatus(session, getWeeklyLimit());
}

export function resetAIQuotaForTests(): void {
  requestsByUser.clear();
}
