import { createHmac, timingSafeEqual } from "node:crypto";

import { AppError } from "./errors";

const SESSION_TTL_SECONDS = 60 * 60;
const SESSION_VERSION = 1;

type SessionPayload = {
  bundleId: string;
  exp: number;
  iat: number;
  installationId: string;
  v: number;
};

export type VerifiedSession = {
  bundleId: string;
  expiresAt: Date;
  installationId: string;
};

function getSessionSecret(): string {
  const secret = process.env.BITS_SESSION_SECRET;

  if (!secret) {
    throw new AppError(
      "temporarily_unavailable",
      "Session authentication is not configured on the server.",
      503,
    );
  }

  return secret;
}

function base64urlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64urlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(payload: string): string {
  return createHmac("sha256", getSessionSecret())
    .update(payload)
    .digest("base64url");
}

export function issueSessionToken(input: {
  bundleId: string;
  installationId: string;
}): { expiresAt: Date; token: string } {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const expiresAt = new Date((nowSeconds + SESSION_TTL_SECONDS) * 1000);

  const payload: SessionPayload = {
    bundleId: input.bundleId,
    exp: Math.floor(expiresAt.getTime() / 1000),
    iat: nowSeconds,
    installationId: input.installationId,
    v: SESSION_VERSION,
  };

  const encodedPayload = base64urlEncode(JSON.stringify(payload));
  const signature = sign(encodedPayload);

  return {
    token: `${encodedPayload}.${signature}`,
    expiresAt,
  };
}

export function verifySessionToken(token: string): VerifiedSession {
  const [encodedPayload, signature] = token.split(".");

  if (!encodedPayload || !signature) {
    throw new AppError("unauthorized", "Invalid session token.", 401);
  }

  const expectedSignature = sign(encodedPayload);
  const providedSignatureBuffer = Buffer.from(signature);
  const expectedSignatureBuffer = Buffer.from(expectedSignature);

  if (
    providedSignatureBuffer.length !== expectedSignatureBuffer.length ||
    !timingSafeEqual(providedSignatureBuffer, expectedSignatureBuffer)
  ) {
    throw new AppError("unauthorized", "Invalid session token.", 401);
  }

  let payload: SessionPayload;

  try {
    payload = JSON.parse(base64urlDecode(encodedPayload)) as SessionPayload;
  } catch {
    throw new AppError("unauthorized", "Invalid session token.", 401);
  }

  if (
    payload.v !== SESSION_VERSION ||
    !payload.installationId ||
    !payload.bundleId ||
    !payload.exp ||
    payload.exp <= Math.floor(Date.now() / 1000)
  ) {
    throw new AppError("unauthorized", "Session token expired or invalid.", 401);
  }

  const allowedBundleId = process.env.BITS_ALLOWED_BUNDLE_ID?.trim();
  if (allowedBundleId && payload.bundleId !== allowedBundleId) {
    throw new AppError("unauthorized", "Invalid bundle identifier.", 401);
  }

  return {
    installationId: payload.installationId,
    bundleId: payload.bundleId,
    expiresAt: new Date(payload.exp * 1000),
  };
}
