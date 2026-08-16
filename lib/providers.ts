import OpenAI from "openai";

import { AppError } from "./errors";
import { providerFor, type BitsModel, type BitsProvider } from "./models";

declare global {
  var __bitsOpenAIClient: OpenAI | undefined;
  var __bitsOpenRouterClient: OpenAI | undefined;
}

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/**
 * Two providers, on purpose.
 *
 * The endpoints the shipped App Store build calls (`/ai/cards`, `/ai/summary`,
 * `/ai/quiz`, `/ai/tutor`) stay on OpenAI so a backend deploy never changes
 * behaviour for users who can't update the app. The new agentic `/ai/chat`
 * runs on OpenRouter. Which one a request uses is derived from its model ID,
 * so the routing can't drift from the model policy.
 *
 * OpenRouter speaks the OpenAI Chat Completions format, so both are the same
 * client class with a different base URL.
 */
function createOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new AppError(
      "temporarily_unavailable",
      "The AI service is not configured on the server.",
      503,
    );
  }

  return new OpenAI({ apiKey, maxRetries: 2, timeout: 30_000 });
}

function createOpenRouterClient(): OpenAI {
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

function getClient(provider: BitsProvider): OpenAI {
  if (provider === "openrouter") {
    if (!globalThis.__bitsOpenRouterClient) {
      globalThis.__bitsOpenRouterClient = createOpenRouterClient();
    }
    return globalThis.__bitsOpenRouterClient;
  }

  if (!globalThis.__bitsOpenAIClient) {
    globalThis.__bitsOpenAIClient = createOpenAIClient();
  }
  return globalThis.__bitsOpenAIClient;
}

/** The client that can serve this model. */
export function getModelClient(model: BitsModel): OpenAI {
  return getClient(providerFor(model));
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
