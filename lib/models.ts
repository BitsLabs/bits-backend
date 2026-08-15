export type BitsFeature = "cards" | "summary" | "quiz" | "tutor" | "chat";

/**
 * Model IDs are OpenRouter slugs, not first-party Anthropic IDs — OpenRouter
 * namespaces by provider (`anthropic/claude-haiku-4.5`, not `claude-haiku-4-5`).
 * Sending a first-party ID here 404s at the gateway.
 */
export type BitsModel = "anthropic/claude-haiku-4.5";

export const DEFAULT_MODEL: BitsModel = "anthropic/claude-haiku-4.5";

/**
 * Every feature is on Haiku 4.5 for now. The policy map stays per-feature so a
 * single surface (e.g. chat) can be moved to a stronger model without touching
 * the routes.
 */
export const MODEL_POLICY: Record<BitsFeature, BitsModel> = {
  cards: DEFAULT_MODEL,
  summary: DEFAULT_MODEL,
  quiz: DEFAULT_MODEL,
  tutor: DEFAULT_MODEL,
  chat: DEFAULT_MODEL,
};

/** Retained for callers that used the light policy; both tiers are Haiku 4.5 today. */
export const MODEL_POLICY_LIGHT: Record<BitsFeature, BitsModel> = MODEL_POLICY;

const MODEL_LABELS: Record<BitsModel, string> = {
  "anthropic/claude-haiku-4.5": "Claude Haiku 4.5",
};

export function getModelLabel(model: BitsModel): string {
  return MODEL_LABELS[model];
}
