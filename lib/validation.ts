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
  maxImagesPerMessage: 4,
  // ~4.5 MB of base64, i.e. roughly a 3.3 MB JPEG. The app downscales before
  // encoding, so this is a backstop rather than the working size.
  maxImageBase64Length: 4_500_000,
  // Course generation.
  maxSubjectLength: 500,
  maxConstraintsLength: 2_000,
  maxUnitItems: 12,
  maxUnitItemLength: 300,
  maxExistingFronts: 200,
  maxCardsPerUnit: 60,
  maxChecksPerUnit: 20,
  maxPerformanceNoteLength: 2_000,
  maxClientFeatures: 12,
  maxClientFeatureLength: 40,
  maxRubricLength: 1_000,
  maxLearnerAnswerLength: 2_000,
  maxLessonsPerUnit: 12,
  maxRecallsPerUnit: 12,
  // Scenes.
  maxSceneLineLength: 400,
  maxSceneLines: 12,
  maxSeenLines: 60,
  maxExercisesPerScene: 10,
  // A scene that has run past six turns is over; the cap is a backstop against
  // a client replaying an unbounded transcript back at us.
  maxTranscriptTurns: 24,
  maxTranscriptTurnLength: 600,
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

/**
 * An image the user attached. PDFs never arrive here — the app extracts their
 * text with PDFKit on-device and folds it into the message, which keeps large
 * documents out of the request and reuses the existing PDF pipeline.
 */
export type ChatImageAttachment = {
  mediaType: string;
  /** Base64, no data-URI prefix. */
  data: string;
};

export type ChatMessage =
  | {
      role: "user" | "assistant";
      content?: string;
      toolCalls: ChatToolCall[];
      images: ChatImageAttachment[];
    }
  | { role: "tool"; toolCallId: string; content: string };

export type ChatRequestBody = {
  messages: ChatMessage[];
  /** Compact "id — name (n cards)" list so the agent can skip list_decks for simple asks. */
  deckSummaries?: string;
  /** Capabilities this build can execute, unlocking feature-gated tools. */
  clientFeatures: string[];
};

export type SyllabusRequestBody = {
  subject: string;
  constraints: string;
  dailyMinutes: number;
  weeksAvailable?: number;
};

export type GradeRequestBody = {
  subject: string;
  constraints: string;
  question: string;
  rubric: string;
  answer: string;
};

export type SceneRequestBody = {
  subject: string;
  constraints: string;
  unitTitle: string;
  unitObjective: string;
  seenLines: string[];
  exerciseCount: number;
};

export type ConverseRequestBody = {
  subject: string;
  constraints: string;
  role: string;
  situation: string;
  goal: string;
  lines: { target: string; native: string; note?: string }[];
  transcript: { speaker: "learner" | "character"; text: string }[];
  learnerTurn: string;
};

export type UnitRequestBody = {
  subject: string;
  constraints: string;
  unit: { title: string; objective: string; days: number; items: string[] };
  lessonCount: number;
  recallCount: number;
  cardCount: number;
  checkCount: number;
  existingFronts: string[];
  performanceNote?: string;
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

/**
 * Like `validatePositiveInteger` but allows a floor of zero and states both
 * bounds, which the course endpoints need (checkCount may legitimately be 0).
 */
function clampInteger(
  value: unknown,
  field: string,
  minValue: number,
  maxValue: number,
  defaultValue: number,
): number {
  if (value === undefined || value === null) {
    return defaultValue;
  }

  if (typeof value !== "number" || !Number.isInteger(value)) {
    invalid(field, "must be an integer");
  }

  if (value < minValue || value > maxValue) {
    invalid(field, `must be between ${minValue} and ${maxValue}`);
  }

  return value;
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
    const images = validateImages(message.images, index);

    // An assistant turn that only calls tools carries no prose, so content is
    // optional there — but a message with neither content, tool calls, nor an
    // attachment is meaningless and would be rejected by the model anyway.
    const content = validateOptionalString(
      message.content,
      `messages[${index}].content`,
      LIMITS.maxChatMessageLength,
    );

    if (!content && toolCalls.length === 0 && images.length === 0) {
      invalid(
        `messages[${index}]`,
        "must have content, toolCalls, or images",
      );
    }

    if (images.length > 0 && role !== "user") {
      invalid(`messages[${index}].images`, "are only allowed on user messages");
    }

    return { role, content, toolCalls, images };
  });

  if (messages.at(-1)?.role === "assistant") {
    invalid("messages", "must not end with an assistant message");
  }

  // Absent means an older build, which is exactly the case this exists for:
  // it gets the base tool set and nothing it cannot execute.
  const clientFeatures = Array.isArray(payload.clientFeatures)
    ? payload.clientFeatures
        .filter((feature): feature is string => typeof feature === "string")
        .map((feature) => feature.trim())
        .filter(
          (feature) =>
            feature.length > 0 &&
            feature.length <= LIMITS.maxClientFeatureLength,
        )
        .slice(0, LIMITS.maxClientFeatures)
    : [];

  return {
    messages,
    deckSummaries: validateOptionalString(
      payload.deckSummaries,
      "deckSummaries",
      LIMITS.maxContextLength,
    ),
    clientFeatures,
  };
}

const ALLOWED_IMAGE_MEDIA_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

function validateImages(
  value: unknown,
  messageIndex: number,
): ChatImageAttachment[] {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    invalid(`messages[${messageIndex}].images`, "must be an array");
  }

  if (value.length > LIMITS.maxImagesPerMessage) {
    invalid(
      `messages[${messageIndex}].images`,
      `must contain at most ${LIMITS.maxImagesPerMessage} images`,
    );
  }

  return value.map((entry, imageIndex): ChatImageAttachment => {
    const field = `messages[${messageIndex}].images[${imageIndex}]`;
    const image = assertPlainObject(entry, field);

    const mediaType = validateRequiredString(
      image.mediaType,
      `${field}.mediaType`,
      100,
    );

    if (!ALLOWED_IMAGE_MEDIA_TYPES.has(mediaType)) {
      invalid(
        `${field}.mediaType`,
        `must be one of ${[...ALLOWED_IMAGE_MEDIA_TYPES].join(", ")}`,
      );
    }

    const data = validateRequiredString(
      image.data,
      `${field}.data`,
      LIMITS.maxImageBase64Length,
    );

    // Reject anything that isn't base64 before it reaches the model — a
    // malformed data URI comes back as an opaque upstream 400.
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
      invalid(`${field}.data`, "must be base64 without a data URI prefix");
    }

    return { mediaType, data };
  });
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

/**
 * Course generation input.
 *
 * `constraints` is validated as a first-class field rather than folded into
 * `subject` because it has to survive into every later generation call. A goal
 * of "Portuguese" that quietly loses "European, not Brazilian" produces
 * material that is confidently wrong in a way the learner cannot detect.
 */
export function validateSyllabusRequest(body: unknown): SyllabusRequestBody {
  const payload = assertPlainObject(body, "body");

  const subject = validateRequiredString(
    payload.subject,
    "subject",
    LIMITS.maxSubjectLength,
  );

  const constraints =
    payload.constraints === undefined || payload.constraints === null
      ? ""
      : validateOptionalString(
          payload.constraints,
          "constraints",
          LIMITS.maxConstraintsLength,
        ) ?? "";

  const dailyMinutes = clampInteger(
    payload.dailyMinutes,
    "dailyMinutes",
    1,
    180,
    10,
  );

  const weeksAvailable =
    payload.weeksAvailable === undefined || payload.weeksAvailable === null
      ? undefined
      : clampInteger(payload.weeksAvailable, "weeksAvailable", 1, 520, 12);

  return { subject, constraints, dailyMinutes, weeksAvailable };
}

export function validateUnitRequest(body: unknown): UnitRequestBody {
  const payload = assertPlainObject(body, "body");

  const subject = validateRequiredString(
    payload.subject,
    "subject",
    LIMITS.maxSubjectLength,
  );

  const constraints =
    payload.constraints === undefined || payload.constraints === null
      ? ""
      : validateOptionalString(
          payload.constraints,
          "constraints",
          LIMITS.maxConstraintsLength,
        ) ?? "";

  const rawUnit = assertPlainObject(payload.unit, "unit");
  const title = validateRequiredString(
    rawUnit.title,
    "unit.title",
    LIMITS.maxUnitItemLength,
  );
  const objective =
    validateOptionalString(
      rawUnit.objective,
      "unit.objective",
      LIMITS.maxUnitItemLength,
    ) ?? "";
  const days = clampInteger(rawUnit.days, "unit.days", 1, 60, 3);

  if (!Array.isArray(rawUnit.items)) {
    invalid("unit.items", "must be an array of strings");
  }

  const items = rawUnit.items
    .slice(0, LIMITS.maxUnitItems)
    .map((item, index) =>
      validateRequiredString(
        item,
        `unit.items[${index}]`,
        LIMITS.maxUnitItemLength,
      ),
    );

  const lessonCount = clampInteger(
    payload.lessonCount,
    "lessonCount",
    0,
    LIMITS.maxLessonsPerUnit,
    5,
  );
  const recallCount = clampInteger(
    payload.recallCount,
    "recallCount",
    0,
    LIMITS.maxRecallsPerUnit,
    5,
  );

  const cardCount = clampInteger(
    payload.cardCount,
    "cardCount",
    1,
    LIMITS.maxCardsPerUnit,
    12,
  );
  const checkCount = clampInteger(
    payload.checkCount,
    "checkCount",
    0,
    LIMITS.maxChecksPerUnit,
    4,
  );

  const existingFronts = Array.isArray(payload.existingFronts)
    ? payload.existingFronts
        .filter((front): front is string => typeof front === "string")
        .map((front) => front.trim())
        .filter((front) => front.length > 0)
        .slice(0, LIMITS.maxExistingFronts)
    : [];

  const performanceNote =
    payload.performanceNote === undefined || payload.performanceNote === null
      ? undefined
      : validateOptionalString(
          payload.performanceNote,
          "performanceNote",
          LIMITS.maxPerformanceNoteLength,
        );

  return {
    subject,
    constraints,
    unit: { title, objective, days, items },
    lessonCount,
    recallCount,
    cardCount,
    checkCount,
    existingFronts,
    performanceNote,
  };
}

/**
 * One scene to write.
 *
 * `seenLines` is what stops a course repeating itself. It is capped rather than
 * rejected when long, because a learner forty scenes in has a legitimately long
 * history and refusing to generate their next lesson is the wrong failure.
 */
export function validateSceneRequest(body: unknown): SceneRequestBody {
  const payload = assertPlainObject(body, "body");

  const seenLines = Array.isArray(payload.seenLines)
    ? payload.seenLines
        .filter((line): line is string => typeof line === "string")
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && line.length <= LIMITS.maxSceneLineLength)
        .slice(0, LIMITS.maxSeenLines)
    : [];

  return {
    subject: validateRequiredString(
      payload.subject,
      "subject",
      LIMITS.maxSubjectLength,
    ),
    constraints:
      validateOptionalString(
        payload.constraints,
        "constraints",
        LIMITS.maxConstraintsLength,
      ) ?? "",
    unitTitle: validateRequiredString(
      payload.unitTitle,
      "unitTitle",
      LIMITS.maxUnitItemLength,
    ),
    unitObjective: validateRequiredString(
      payload.unitObjective,
      "unitObjective",
      LIMITS.maxUnitItemLength,
    ),
    seenLines,
    exerciseCount: clampInteger(
      payload.exerciseCount,
      "exerciseCount",
      3,
      LIMITS.maxExercisesPerScene,
      6,
    ),
  };
}

/**
 * One turn of a scene being acted out.
 *
 * The taught lines and the transcript both come from the client, which means
 * both are attacker-controlled and both go straight into a prompt. They are
 * length-capped and count-capped for that reason, and the speaker field is
 * restricted to the two values the prompt renders rather than passed through.
 */
export function validateConverseRequest(body: unknown): ConverseRequestBody {
  const payload = assertPlainObject(body, "body");

  const lines = Array.isArray(payload.lines)
    ? payload.lines
        .flatMap((entry): { target: string; native: string; note?: string }[] => {
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
          const line = entry as Record<string, unknown>;
          const target =
            typeof line.target === "string"
              ? line.target.trim().slice(0, LIMITS.maxSceneLineLength)
              : "";
          const native =
            typeof line.native === "string"
              ? line.native.trim().slice(0, LIMITS.maxSceneLineLength)
              : "";
          if (target.length === 0 || native.length === 0) return [];
          const note =
            typeof line.note === "string"
              ? line.note.trim().slice(0, LIMITS.maxSceneLineLength)
              : "";
          return [note.length > 0 ? { target, native, note } : { target, native }];
        })
        .slice(0, LIMITS.maxSceneLines)
    : [];

  if (lines.length === 0) {
    invalid("lines", "must contain at least one line the learner was taught");
  }

  const transcript = Array.isArray(payload.transcript)
    ? payload.transcript
        .flatMap((entry): { speaker: "learner" | "character"; text: string }[] => {
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
          const turn = entry as Record<string, unknown>;
          const speaker = turn.speaker === "character" ? "character" : "learner";
          const text =
            typeof turn.text === "string"
              ? turn.text.trim().slice(0, LIMITS.maxTranscriptTurnLength)
              : "";
          return text.length > 0 ? [{ speaker, text }] : [];
        })
        // Keep the most recent turns: the end of a conversation is what the
        // next reply has to follow from.
        .slice(-LIMITS.maxTranscriptTurns)
    : [];

  return {
    subject: validateRequiredString(
      payload.subject,
      "subject",
      LIMITS.maxSubjectLength,
    ),
    constraints:
      validateOptionalString(
        payload.constraints,
        "constraints",
        LIMITS.maxConstraintsLength,
      ) ?? "",
    role: validateRequiredString(payload.role, "role", LIMITS.maxUnitItemLength),
    situation: validateRequiredString(
      payload.situation,
      "situation",
      LIMITS.maxUnitItemLength,
    ),
    goal: validateRequiredString(payload.goal, "goal", LIMITS.maxUnitItemLength),
    lines,
    transcript,
    learnerTurn: validateRequiredString(
      payload.learnerTurn,
      "learnerTurn",
      LIMITS.maxTranscriptTurnLength,
    ),
  };
}

/**
 * One answer to mark.
 *
 * The rubric is required. Grading an open answer without a statement of what a
 * good one contains means marking on impression, and an unfair mark on
 * something the learner got right is worse than not asking at all.
 */
export function validateGradeRequest(body: unknown): GradeRequestBody {
  const payload = assertPlainObject(body, "body");

  return {
    subject: validateRequiredString(
      payload.subject,
      "subject",
      LIMITS.maxSubjectLength,
    ),
    constraints:
      payload.constraints === undefined || payload.constraints === null
        ? ""
        : validateOptionalString(
            payload.constraints,
            "constraints",
            LIMITS.maxConstraintsLength,
          ) ?? "",
    question: validateRequiredString(
      payload.question,
      "question",
      LIMITS.maxUnitItemLength,
    ),
    rubric: validateRequiredString(
      payload.rubric,
      "rubric",
      LIMITS.maxRubricLength,
    ),
    answer: validateRequiredString(
      payload.answer,
      "answer",
      LIMITS.maxLearnerAnswerLength,
    ),
  };
}
