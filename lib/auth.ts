import { timingSafeEqual } from "node:crypto";

import type { NextRequest } from "next/server";

import { AppError } from "./errors";

function getConfiguredSecret(): string {
  const secret = process.env.BITS_APP_SECRET;

  if (!secret) {
    throw new AppError(
      "temporarily_unavailable",
      "Authentication is not configured on the server.",
      503,
    );
  }

  return secret;
}

function tokensMatch(expected: string, provided: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, providedBuffer);
}

export function authenticate(request: NextRequest): void {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    throw new AppError("unauthorized", "Missing or invalid bearer token.", 401);
  }

  const token = authorization.slice("Bearer ".length).trim();

  if (!token) {
    throw new AppError("unauthorized", "Missing or invalid bearer token.", 401);
  }

  if (!tokensMatch(getConfiguredSecret(), token)) {
    throw new AppError("unauthorized", "Invalid bearer token.", 401);
  }
}
