import { AppError } from "./errors";

export const LIMITS = {
  maxSourceTextLength: 50_000,
  maxCards: 120,
  defaultCards: 10,
  maxQuestionCount: 40,
  defaultQuestionCount: 5,
  maxChatHistory: 30,
  maxUserMessageLength: 2_000,
  maxContextLength: 5_000,
  maxReferenceLabelLength: 500,
  maxVariationSeedLength: 100,
} as const;

export type TutorHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

export type CardsRequestBody = {
  sourceText: string;
  deckTitle?: string;
  context?: string;
  maxCards: number;
  sourceType?: string;
  referenceLabel?: string;
};

export type SummaryRequestBody = {
  sourceText: string;
  deckTitle?: string;
  context?: string;
};

export type QuizRequestBody = {
  sourceText: string;
  deckTitle?: string;
  context?: string;
  questionCount: number;
  variationSeed?: string;
};

export type TutorRequestBody = {
  deckTitle: string;
  cardContext?: string;
  history: TutorHistoryMessage[];
  message: string;
};

function invalid(field: string, message: string): never {
  throw new AppError("invalid_input", `${field}: ${message}`, 400);
}

function assertPlainObject(
  value: unknown,
  field: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalid(field, "must be a JSON object");
  }

  return value as Record<string, unknown>;
}

function validateRequiredString(
  value: unknown,
  field: string,
  maxLength: number,
): string {
  if (typeof value !== "string") {
    invalid(field, "must be a string");
  }

  const trimmed = value.trim();

  if (!trimmed) {
    invalid(field, "must not be empty");
  }

  if (trimmed.length > maxLength) {
    invalid(field, `must be at most ${maxLength} characters`);
  }

  return trimmed;
}

function validateOptionalString(
  value: unknown,
  field: string,
  maxLength: number,
): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    invalid(field, "must be a string");
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return undefined;
  }

  if (trimmed.length > maxLength) {
    invalid(field, `must be at most ${maxLength} characters`);
  }

  return trimmed;
}

function validatePositiveInteger(
  value: unknown,
  field: string,
  defaultValue: number,
  maxValue: number,
): number {
  if (value === undefined || value === null) {
    return defaultValue;
  }

  if (typeof value !== "number" || !Number.isInteger(value)) {
    invalid(field, "must be an integer");
  }

  if (value < 1 || value > maxValue) {
    invalid(field, `must be between 1 and ${maxValue}`);
  }

  return value;
}

export function validateCardsRequest(body: unknown): CardsRequestBody {
  const payload = assertPlainObject(body, "body");

  return {
    sourceText: validateRequiredString(
      payload.sourceText,
      "sourceText",
      LIMITS.maxSourceTextLength,
    ),
    deckTitle: validateOptionalString(
      payload.deckTitle,
      "deckTitle",
      LIMITS.maxContextLength,
    ),
    context: validateOptionalString(
      payload.context,
      "context",
      LIMITS.maxContextLength,
    ),
    maxCards: validatePositiveInteger(
      payload.maxCards,
      "maxCards",
      LIMITS.defaultCards,
      LIMITS.maxCards,
    ),
    sourceType: validateOptionalString(
      payload.sourceType,
      "sourceType",
      50,
    ),
    referenceLabel: validateOptionalString(
      payload.referenceLabel,
      "referenceLabel",
      LIMITS.maxReferenceLabelLength,
    ),
  };
}

export function validateSummaryRequest(body: unknown): SummaryRequestBody {
  const payload = assertPlainObject(body, "body");

  return {
    sourceText: validateRequiredString(
      payload.sourceText,
      "sourceText",
      LIMITS.maxSourceTextLength,
    ),
    deckTitle: validateOptionalString(
      payload.deckTitle,
      "deckTitle",
      LIMITS.maxContextLength,
    ),
    context: validateOptionalString(
      payload.context,
      "context",
      LIMITS.maxContextLength,
    ),
  };
}

export function validateQuizRequest(body: unknown): QuizRequestBody {
  const payload = assertPlainObject(body, "body");

  return {
    sourceText: validateRequiredString(
      payload.sourceText,
      "sourceText",
      LIMITS.maxSourceTextLength,
    ),
    deckTitle: validateOptionalString(
      payload.deckTitle,
      "deckTitle",
      LIMITS.maxContextLength,
    ),
    context: validateOptionalString(
      payload.context,
      "context",
      LIMITS.maxContextLength,
    ),
    questionCount: validatePositiveInteger(
      payload.questionCount,
      "questionCount",
      LIMITS.defaultQuestionCount,
      LIMITS.maxQuestionCount,
    ),
    variationSeed: validateOptionalString(
      payload.variationSeed,
      "variationSeed",
      LIMITS.maxVariationSeedLength,
    ),
  };
}

export function validateTutorHistory(value: unknown): TutorHistoryMessage[] {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    invalid("history", "must be an array");
  }

  return value
    .slice(-LIMITS.maxChatHistory)
    .map((entry, index): TutorHistoryMessage => {
      const message = assertPlainObject(entry, `history[${index}]`);
      const role = message.role;

      if (role !== "user" && role !== "assistant") {
        invalid(`history[${index}].role`, "must be 'user' or 'assistant'");
      }

      return {
        role,
        content: validateRequiredString(
          message.content,
          `history[${index}].content`,
          LIMITS.maxUserMessageLength,
        ),
      };
    });
}

export function validateTutorRequest(body: unknown): TutorRequestBody {
  const payload = assertPlainObject(body, "body");

  return {
    deckTitle: validateRequiredString(
      payload.deckTitle,
      "deckTitle",
      LIMITS.maxContextLength,
    ),
    cardContext: validateOptionalString(
      payload.cardContext,
      "cardContext",
      LIMITS.maxContextLength,
    ),
    history: validateTutorHistory(payload.history),
    message: validateRequiredString(
      payload.message,
      "message",
      LIMITS.maxUserMessageLength,
    ),
  };
}
