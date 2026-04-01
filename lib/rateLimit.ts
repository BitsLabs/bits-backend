import type { NextRequest } from "next/server";

import { AppError } from "./errors";

const WINDOW_MS = 60_000;

const LIMITS_BY_TIER = {
  generation: 20,
  chat: 40,
  session: 30,
} as const;

type RateLimitTier = keyof typeof LIMITS_BY_TIER;

const buckets = new Map<string, number[]>();

function getRequestKey(request: NextRequest, tier: RateLimitTier): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const ip =
    forwardedFor?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  return `${tier}:${ip}`;
}

export function rateLimit(request: NextRequest, tier: RateLimitTier): void {
  const now = Date.now();
  const key = getRequestKey(request, tier);
  const windowStart = now - WINDOW_MS;
  const maxRequests = LIMITS_BY_TIER[tier];
  const recentRequests = (buckets.get(key) ?? []).filter(
    (timestamp) => timestamp > windowStart,
  );

  if (recentRequests.length >= maxRequests) {
    buckets.set(key, recentRequests);

    throw new AppError(
      "rate_limited",
      "Rate limit exceeded. Please try again soon.",
      429,
    );
  }

  recentRequests.push(now);
  buckets.set(key, recentRequests);
}
