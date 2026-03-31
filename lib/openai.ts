import OpenAI from "openai";

import { AppError } from "./errors";
import type { BitsModel } from "./models";

declare global {
  var __bitsOpenAIClient: OpenAI | undefined;
}

function createOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new AppError(
      "temporarily_unavailable",
      "The AI service is not configured on the server.",
      503,
    );
  }

  return new OpenAI({
    apiKey,
    maxRetries: 2,
    timeout: 30_000,
  });
}

export function getOpenAIClient(): OpenAI {
  if (!globalThis.__bitsOpenAIClient) {
    globalThis.__bitsOpenAIClient = createOpenAIClient();
  }

  return globalThis.__bitsOpenAIClient;
}

export type AIDiagnostics = {
  model: BitsModel;
  inputTokens: number;
  outputTokens: number;
};

export function buildDiagnostics(
  model: BitsModel,
  usage?: {
    prompt_tokens?: number | null;
    completion_tokens?: number | null;
  } | null,
): AIDiagnostics {
  return {
    model,
    inputTokens: usage?.prompt_tokens ?? 0,
    outputTokens: usage?.completion_tokens ?? 0,
  };
}
