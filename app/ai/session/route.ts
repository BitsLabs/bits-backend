import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { handleError } from "../../../lib/errors";
import { rateLimit } from "../../../lib/rateLimit";
import { issueSessionToken } from "../../../lib/session";

const MAX_INSTALLATION_ID_LENGTH = 100;
const MAX_BUNDLE_ID_LENGTH = 200;

function invalid(message: string): never {
  throw new Error(message);
}

function validateSessionBootstrapRequest(body: unknown): {
  bundleId: string;
  installationId: string;
} {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    invalid("body: must be a JSON object");
  }

  const payload = body as Record<string, unknown>;
  const installationId = payload.installationId;
  const bundleId = payload.bundleId;

  if (typeof installationId !== "string" || installationId.trim().length === 0) {
    invalid("installationId: must be a non-empty string");
  }

  if (installationId.trim().length > MAX_INSTALLATION_ID_LENGTH) {
    invalid(
      `installationId: must be at most ${MAX_INSTALLATION_ID_LENGTH} characters`,
    );
  }

  if (typeof bundleId !== "string" || bundleId.trim().length === 0) {
    invalid("bundleId: must be a non-empty string");
  }

  if (bundleId.trim().length > MAX_BUNDLE_ID_LENGTH) {
    invalid(`bundleId: must be at most ${MAX_BUNDLE_ID_LENGTH} characters`);
  }

  return {
    installationId: installationId.trim(),
    bundleId: bundleId.trim(),
  };
}

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    rateLimit(request, "session");

    const body = validateSessionBootstrapRequest(await request.json());
    const session = issueSessionToken(body);

    return NextResponse.json({
      token: session.token,
      expiresAt: session.expiresAt.toISOString(),
    });
  } catch (error) {
    return handleError(error);
  }
}
