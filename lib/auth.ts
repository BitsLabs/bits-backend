import type { NextRequest } from "next/server";

import { AppError } from "./errors";
import { verifySessionToken } from "./session";

export function authenticate(request: NextRequest): void {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    throw new AppError("unauthorized", "Missing or invalid bearer token.", 401);
  }

  const token = authorization.slice("Bearer ".length).trim();

  if (!token) {
    throw new AppError("unauthorized", "Missing or invalid bearer token.", 401);
  }

  verifySessionToken(token);
}
