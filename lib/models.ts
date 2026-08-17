export type BitsFeature =
  | "cards"
  | "summary"
  | "quiz"
  | "tutor"
  | "chat"
  | "syllabus"
  | "unit"
  | "grade";

export type BitsProvider = "openai" | "openrouter";

/**
 * OpenRouter namespaces model IDs by provider (`anthropic/claude-haiku-4.5`),
 * OpenAI does not. The slash is what distinguishes them, and what `providerFor`
 * routes on — so adding a model can't silently point at the wrong client.
 */
export type BitsModel =
  | "gpt-5.4"
  | "gpt-5.4-mini"
  | "gpt-5.4-nano"
  | "gpt-5.5"
  | "anthropic/claude-haiku-4.5";

export const DEFAULT_LEGACY_MODEL: BitsModel = "gpt-5.4-mini";
export const DEFAULT_CHAT_MODEL: BitsModel = "anthropic/claude-haiku-4.5";

/**
 * The four legacy endpoints stay on OpenAI deliberately: they serve the build
 * that's live on the App Store, and a backend deploy must not change the model
 * under users who cannot update. Only the new chat runs on OpenRouter.
 */
export const MODEL_POLICY: Record<BitsFeature, BitsModel> = {
  cards: DEFAULT_LEGACY_MODEL,
  summary: DEFAULT_LEGACY_MODEL,
  quiz: DEFAULT_LEGACY_MODEL,
  tutor: DEFAULT_LEGACY_MODEL,
  chat: DEFAULT_CHAT_MODEL,
  // Course generation is new, so it starts on the current model with no
  // shipped clients depending on it.
  syllabus: DEFAULT_CHAT_MODEL,
  unit: DEFAULT_CHAT_MODEL,
  // Grading runs while the learner waits, so it is the one call where latency
  // is felt. Haiku is both the cheapest and the fastest option available.
  grade: DEFAULT_CHAT_MODEL,
};

/** Retained for callers that used the light policy. */
export const MODEL_POLICY_LIGHT: Record<BitsFeature, BitsModel> = MODEL_POLICY;

export function providerFor(model: BitsModel): BitsProvider {
  return model.includes("/") ? "openrouter" : "openai";
}

const MODEL_LABELS: Record<BitsModel, string> = {
  "gpt-5.4": "GPT-5.4",
  "gpt-5.4-mini": "GPT-5.4 Mini",
  "gpt-5.4-nano": "GPT-5.4 Nano",
  "gpt-5.5": "GPT-5.5",
  "anthropic/claude-haiku-4.5": "Claude Haiku 4.5",
};

export function getModelLabel(model: BitsModel): string {
  return MODEL_LABELS[model];
}
