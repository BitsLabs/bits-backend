import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  InternalServerError,
  RateLimitError,
} from "openai";
import { NextResponse } from "next/server";

export type AppErrorCode =
  | "unauthorized"
  | "rate_limited"
  | "invalid_input"
  | "temporarily_unavailable"
  | "model_unavailable"
  | "ai_error";

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;

  constructor(code: AppErrorCode, message: string, status: number) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
  }
}

function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof SyntaxError) {
    return new AppError(
      "invalid_input",
      "Request body must be valid JSON.",
      400,
    );
  }

  if (
    error instanceof RateLimitError ||
    error instanceof APIConnectionError ||
    error instanceof APIConnectionTimeoutError ||
    error instanceof InternalServerError
  ) {
    return new AppError(
      "temporarily_unavailable",
      "The service is temporarily unavailable. Please try again soon.",
      503,
    );
  }

  if (error instanceof APIError) {
    return new AppError(
      "ai_error",
      "The AI service could not complete the request.",
      502,
    );
  }

  return new AppError("ai_error", "An unexpected error occurred.", 500);
}

export function handleError(error: unknown): NextResponse {
  const appError = toAppError(error);

  if (!(error instanceof AppError)) {
    console.error(error);
  }

  return NextResponse.json(
    {
      error: {
        code: appError.code,
        message: appError.message,
      },
    },
    { status: appError.status },
  );
}
