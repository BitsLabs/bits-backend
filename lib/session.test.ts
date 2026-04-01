import test from "node:test";
import assert from "node:assert/strict";

import { issueSessionToken, verifySessionToken } from "./session.ts";

test("issues and verifies short-lived session tokens", () => {
  process.env.BITS_SESSION_SECRET = "test-session-secret";
  process.env.BITS_ALLOWED_BUNDLE_ID = "technology.mja.Bits";

  const session = issueSessionToken({
    installationId: "installation-123",
    bundleId: "technology.mja.Bits",
  });

  const verified = verifySessionToken(session.token);

  assert.equal(verified.installationId, "installation-123");
  assert.equal(verified.bundleId, "technology.mja.Bits");
  assert.ok(verified.expiresAt.getTime() > Date.now());
});

test("rejects tokens signed for the wrong bundle id", () => {
  process.env.BITS_SESSION_SECRET = "test-session-secret";
  process.env.BITS_ALLOWED_BUNDLE_ID = "technology.mja.Bits";

  const session = issueSessionToken({
    installationId: "installation-123",
    bundleId: "com.example.OtherApp",
  });

  assert.throws(() => verifySessionToken(session.token));
});
