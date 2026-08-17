import type OpenAI from "openai";

/**
 * Tools the chat agent can call.
 *
 * These execute on the **client**, not here. Decks and flashcards live in
 * SwiftData on the user's device and never reach the server, so the backend
 * proposes a call, the app runs it against its own store, and the result comes
 * back on the next request as a `tool` message. That keeps study content
 * on-device and means the agent can act on a library the server has never seen.
 *
 * Descriptions are prescriptive about *when* to call — Haiku follows an
 * explicit trigger condition far more reliably than an inferred one.
 */
/**
 * Tools every shipped client can execute.
 *
 * Anything added here reaches every version of the app in the wild, including
 * the ones on the App Store that cannot be updated. A tool a client does not
 * implement comes back as "Unknown tool", which the model recovers from but
 * only after wasting a round trip on a user who got nothing for it. New tools
 * therefore go in `FEATURE_TOOLS` and are unlocked by the client asking for
 * them, not by a deploy.
 */
export const CHAT_TOOLS: OpenAI.Chat.Completions.ChatCompletionFunctionTool[] = [
  {
    type: "function",
    function: {
      name: "list_decks",
      description:
        "List the user's decks with their IDs and card counts. Call this first whenever the user refers to a deck by name, says 'my deck'/'my cards', or asks what they have — you cannot guess deck IDs.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_deck",
      description:
        "Read the flashcards in one deck. Call this before answering questions about what a deck contains, before quizzing the user on existing material, and before creating cards for a deck so you don't duplicate what's already there.",
      parameters: {
        type: "object",
        properties: {
          deckId: {
            type: "string",
            description: "Deck ID from list_decks.",
          },
          limit: {
            type: "integer",
            description: "Maximum cards to return. Defaults to 50.",
          },
        },
        required: ["deckId"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_deck",
      description:
        "Create a new empty deck and return its ID. Call this when the user wants to study material that doesn't fit an existing deck — then pass the returned ID to create_flashcards.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Short deck name, in the user's language.",
          },
          icon: {
            type: "string",
            description:
              "Optional SF Symbol name, e.g. 'function', 'atom', 'globe.europe.africa'.",
          },
        },
        required: ["name"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_flashcards",
      description:
        "Save flashcards you have written into a deck. Call this whenever the user pastes notes, a lecture transcript, or any material to learn, or asks for cards on a topic. Write the cards yourself in this call — do not ask the user to write them.",
      parameters: {
        type: "object",
        properties: {
          deckId: {
            type: "string",
            description:
              "Target deck ID. Use create_deck first if no existing deck fits.",
          },
          cards: {
            type: "array",
            description:
              "The cards to save. Only as many as the material genuinely supports — a few strong cards beat padding.",
            items: {
              type: "object",
              properties: {
                front: {
                  type: "string",
                  description: "The prompt or question side.",
                },
                back: {
                  type: "string",
                  description: "The answer side. Direct and complete.",
                },
              },
              required: ["front", "back"],
              additionalProperties: false,
            },
          },
        },
        required: ["deckId", "cards"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_quiz",
      description:
        "Save a multiple-choice quiz the user can take in the app. Call this when the user asks to be quizzed, tested, or to practice — write the questions yourself in this call. The app opens the quiz for the user automatically, so don't also paste the questions into your reply.",
      parameters: {
        type: "object",
        properties: {
          deckId: {
            type: "string",
            description: "Deck the quiz belongs to.",
          },
          title: {
            type: "string",
            description: "Short study-friendly quiz title.",
          },
          questions: {
            type: "array",
            description: "The quiz questions.",
            items: {
              type: "object",
              properties: {
                question: { type: "string" },
                options: {
                  type: "array",
                  description: "Exactly four answer options.",
                  items: { type: "string" },
                },
                correctIndex: {
                  type: "integer",
                  description: "Zero-based index (0-3) of the correct option.",
                },
                explanation: {
                  type: "string",
                  description: "One or two sentences justifying the answer.",
                },
              },
              required: ["question", "options", "correctIndex", "explanation"],
              additionalProperties: false,
            },
          },
        },
        required: ["deckId", "title", "questions"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_cards",
      description:
        "Search across every deck for cards matching a query. Call this when the user asks whether they already have something, or refers to a topic without naming a deck.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Free-text search over card fronts and backs.",
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
];

/** Tool names the client is expected to implement. Used to reject unknown calls. */
export const CHAT_TOOL_NAMES = new Set(
  CHAT_TOOLS.map((tool) => tool.function.name),
);

/**
 * Tools a client must declare support for before the model is told they exist.
 *
 * The key is the string the app sends in `clientFeatures`. This is what lets a
 * new capability ship to the backend and a new build independently, without a
 * deploy changing behaviour for anyone already installed.
 */
export const FEATURE_TOOLS: Record<
  string,
  OpenAI.Chat.Completions.ChatCompletionFunctionTool[]
> = {
  goals: [
  {
    type: "function",
    function: {
      name: "create_goal",
      description:
        "Create a learning goal when the user says what they want to LEARN or ACHIEVE rather than what to store — 'I want to pass pharmacology in June', 'help me learn Portuguese for my move to Lisbon', 'get me through organic chemistry'. This builds them a paced course, not a deck. Ask for anything you need before calling: how much time a day they have, and any specifics that change the material. Do not call this for a one-off request like 'make me some cards on X'.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Short name for the goal, in the user's language.",
          },
          subject: {
            type: "string",
            description:
              "The subject as you understand it, written for another model to generate from. Be specific: 'first-year university pharmacology' beats 'pharmacology'.",
          },
          constraints: {
            type: "string",
            description:
              "Specifics that change what the material must say, one per line as 'key: value'. Regional variant, exam board, syllabus, level, notation. Example: 'variant: European Portuguese (Portugal), not Brazilian'. Get these right — they are applied to every lesson generated later, and a wrong one produces material that is confidently wrong.",
          },
          dailyMinutes: {
            type: "integer",
            description: "Minutes a day the user has. Ask if they have not said.",
          },
          targetDate: {
            type: "string",
            description: "Optional ISO 8601 date (YYYY-MM-DD) they are working toward.",
          },
          deckId: {
            type: "string",
            description:
              "Optional existing deck ID to build the course around, from list_decks. Use this when the user wants a course based on cards they already have — the course will teach and review those cards instead of starting from an empty deck. Omit to start fresh.",
          },
        },
        required: ["title", "subject", "dailyMinutes"],
        additionalProperties: false,
      },
    },
  },
  ],
};

/** The tools to offer a given client. */
export function toolsFor(
  clientFeatures: string[],
): OpenAI.Chat.Completions.ChatCompletionFunctionTool[] {
  const extra = clientFeatures.flatMap(
    (feature) => FEATURE_TOOLS[feature] ?? [],
  );
  return [...CHAT_TOOLS, ...extra];
}
