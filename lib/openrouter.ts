import OpenAI from "openai";

import { AppError } from "./errors";
import type { BitsModel } from "./models";

declare global {
  var __bitsModelClient: OpenAI | undefined;
}

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/**
 * OpenRouter speaks the OpenAI Chat Completions wire format, so the `openai`
 * package is the client — only the base URL and key change. Everything the app
 * uses (tool calling, response_format, usage) is supported on the models we
 * route to; see MODEL_POLICY in ./models.
 */
function createModelClient(): OpenAI {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new AppError(
      "temporarily_unavailable",
      "The AI service is not configured on the server.",
      503,
    );
  }

  return new OpenAI({
    apiKey,
    baseURL: OPENROUTER_BASE_URL,
    maxRetries: 2,
    // Agentic turns run tools and can think for a while; 30s was tuned for
    // one-shot completions and truncates multi-tool turns.
    timeout: 60_000,
    defaultHeaders: {
      // OpenRouter attribution — surfaces the app on openrouter.ai rankings.
      "HTTP-Referer": "https://bits-ai-api.vercel.app",
      "X-Title": "Bits",
    },
  });
}

export function getModelClient(): OpenAI {
  if (!globalThis.__bitsModelClient) {
    globalThis.__bitsModelClient = createModelClient();
  }

  return globalThis.__bitsModelClient;
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
