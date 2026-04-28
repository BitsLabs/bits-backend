import test, { afterEach } from "node:test";
import assert from "node:assert/strict";

import { consumeAIQuota, resetAIQuotaForTests } from "./aiQuota.ts";
import type { VerifiedSession } from "./session.ts";

const session: VerifiedSession = {
  bundleId: "technology.mja.Bits",
  expiresAt: new Date(Date.now() + 60_000),
  installationId: "installation-123",
  revenueCatAppUserId: "$RCAnonymousID:customer-123",
};

const originalWeeklyLimit = process.env.BITS_AI_WEEKLY_REQUEST_LIMIT;

afterEach(() => {
  if (originalWeeklyLimit === undefined) {
    delete process.env.BITS_AI_WEEKLY_REQUEST_LIMIT;
  } else {
    process.env.BITS_AI_WEEKLY_REQUEST_LIMIT = originalWeeklyLimit;
  }

  resetAIQuotaForTests();
});

test("limits AI requests per installation per week", async () => {
  process.env.BITS_AI_WEEKLY_REQUEST_LIMIT = "2";
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  resetAIQuotaForTests();

  await consumeAIQuota(session);
  await consumeAIQuota(session);

  await assert.rejects(
    () => consumeAIQuota(session),
    /Weekly AI request limit reached/,
  );
});

test("tracks AI request limits by RevenueCat user across installations", async () => {
  process.env.BITS_AI_WEEKLY_REQUEST_LIMIT = "1";
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  resetAIQuotaForTests();

  await consumeAIQuota(session);

  await assert.doesNotReject(() =>
    consumeAIQuota({
      ...session,
      revenueCatAppUserId: "$RCAnonymousID:customer-456",
    }),
  );

  await assert.rejects(
    () =>
      consumeAIQuota({
        ...session,
        installationId: "installation-456",
      }),
    /Weekly AI request limit reached/,
  );
});

test("falls back to installation limits for older sessions", async () => {
  process.env.BITS_AI_WEEKLY_REQUEST_LIMIT = "1";
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  resetAIQuotaForTests();

  const legacySession = {
    ...session,
    revenueCatAppUserId: undefined,
  };

  await consumeAIQuota(legacySession);

  await assert.doesNotReject(() =>
    consumeAIQuota({
      ...legacySession,
      installationId: "installation-456",
    }),
  );
});
