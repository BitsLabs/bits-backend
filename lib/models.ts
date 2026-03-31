export type BitsFeature = "cards" | "summary" | "quiz" | "tutor";

export type BitsModel = "gpt-5.4" | "gpt-5.4-mini" | "gpt-5.4-nano";

export const DEFAULT_GPT_5_4_MODEL: BitsModel = "gpt-5.4-mini";

export const MODEL_POLICY: Record<BitsFeature, BitsModel> = {
  cards: DEFAULT_GPT_5_4_MODEL,
  summary: DEFAULT_GPT_5_4_MODEL,
  quiz: DEFAULT_GPT_5_4_MODEL,
  tutor: DEFAULT_GPT_5_4_MODEL,
};

const MODEL_LABELS: Record<BitsModel, string> = {
  "gpt-5.4": "GPT-5.4",
  "gpt-5.4-mini": "GPT-5.4 Mini",
  "gpt-5.4-nano": "GPT-5.4 Nano",
};

export function getModelLabel(model: BitsModel): string {
  return MODEL_LABELS[model];
}
