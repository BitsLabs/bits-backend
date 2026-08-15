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
  // Chat is the surface users paste raw study material into, so its per-message
  // ceiling is much higher than the tutor's 2k conversational limit.
  maxChatMessageLength: 20_000,
  maxChatToolResultLength: 20_000,
  maxChatMessages: 40,
  maxToolCallsPerMessage: 8,
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

export type ChatToolCall = {
  id: string;
  name: string;
  /** Raw JSON string as emitted by the model. */
  arguments: string;
};

export type ChatMessage =
  | { role: "user" | "assistant"; content?: string; toolCalls: ChatToolCall[] }
  | { role: "tool"; toolCallId: string; content: string };

export type ChatRequestBody = {
  messages: ChatMessage[];
  /** Compact "id — name (n cards)" list so the agent can skip list_decks for simple asks. */
  deckSummaries?: string;
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
  tooLongMessage?: string,
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
    invalid(field, tooLongMessage ?? `must be at most ${maxLength} characters`);
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

/**
 * One turn of the agent loop. Unlike the tutor's flat history, chat carries the
 * assistant's tool calls and the client's tool results, because the client is
 * what executes tools — the transcript has to round-trip through the device.
 */
export function validateChatRequest(body: unknown): ChatRequestBody {
  const payload = assertPlainObject(body, "body");

  if (!Array.isArray(payload.messages)) {
    invalid("messages", "must be an array");
  }

  const trimmedHistory = payload.messages.slice(-LIMITS.maxChatMessages);

  if (trimmedHistory.length === 0) {
    invalid("messages", "must not be empty");
  }

  const messages = trimmedHistory.map((entry, index): ChatMessage => {
    const message = assertPlainObject(entry, `messages[${index}]`);
    const role = message.role;

    if (role !== "user" && role !== "assistant" && role !== "tool") {
      invalid(`messages[${index}].role`, "must be 'user', 'assistant', or 'tool'");
    }

    if (role === "tool") {
      return {
        role,
        toolCallId: validateRequiredString(
          message.toolCallId,
          `messages[${index}].toolCallId`,
          200,
        ),
        content: validateRequiredString(
          message.content,
          `messages[${index}].content`,
          LIMITS.maxChatToolResultLength,
        ),
      };
    }

    const toolCalls = validateToolCalls(message.toolCalls, index);

    // An assistant turn that only calls tools carries no prose, so content is
    // optional there — but a message with neither content nor tool calls is
    // meaningless and would be rejected by the model anyway.
    const content = validateOptionalString(
      message.content,
      `messages[${index}].content`,
      LIMITS.maxChatMessageLength,
    );

    if (!content && toolCalls.length === 0) {
      invalid(
        `messages[${index}]`,
        "must have content or toolCalls",
      );
    }

    return { role, content, toolCalls };
  });

  if (messages.at(-1)?.role === "assistant") {
    invalid("messages", "must not end with an assistant message");
  }

  return {
    messages,
    deckSummaries: validateOptionalString(
      payload.deckSummaries,
      "deckSummaries",
      LIMITS.maxContextLength,
    ),
  };
}

function validateToolCalls(value: unknown, messageIndex: number): ChatToolCall[] {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    invalid(`messages[${messageIndex}].toolCalls`, "must be an array");
  }

  if (value.length > LIMITS.maxToolCallsPerMessage) {
    invalid(
      `messages[${messageIndex}].toolCalls`,
      `must contain at most ${LIMITS.maxToolCallsPerMessage} calls`,
    );
  }

  return value.map((entry, callIndex): ChatToolCall => {
    const field = `messages[${messageIndex}].toolCalls[${callIndex}]`;
    const call = assertPlainObject(entry, field);

    return {
      id: validateRequiredString(call.id, `${field}.id`, 200),
      name: validateRequiredString(call.name, `${field}.name`, 100),
      // Arguments are the model's own JSON, echoed back verbatim. Validating
      // the JSON shape here would reject calls the model must be allowed to
      // see its own history of.
      arguments: validateRequiredString(
        call.arguments,
        `${field}.arguments`,
        LIMITS.maxChatToolResultLength,
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
      "Tutor deck context is too large. Please reduce the amount of included deck content.",
    ),
    history: validateTutorHistory(payload.history),
    message: validateRequiredString(
      payload.message,
      "message",
      LIMITS.maxUserMessageLength,
    ),
  };
}
