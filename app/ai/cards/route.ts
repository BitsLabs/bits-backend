import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { authenticate } from "../../../lib/auth";
import { AppError, handleError } from "../../../lib/errors";
import { MODEL_POLICY } from "../../../lib/models";
import { buildDiagnostics, getOpenAIClient } from "../../../lib/openai";
import { cardsSystemPrompt } from "../../../lib/prompts";
import { rateLimit } from "../../../lib/rateLimit";
import { validateCardsRequest } from "../../../lib/validation";

type Flashcard = {
  front: string;
  back: string;
};

function normalizeCards(payload: unknown, maxCards: number): Flashcard[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new AppError("ai_error", "The AI service returned invalid JSON.", 502);
  }

  const cards = "cards" in payload ? payload.cards : undefined;

  if (!Array.isArray(cards)) {
    throw new AppError("ai_error", "The AI service returned invalid JSON.", 502);
  }

  return cards
    .filter(
      (card): card is { front: unknown; back: unknown } =>
        !!card && typeof card === "object" && !Array.isArray(card),
    )
    .map((card) => ({
      front: typeof card.front === "string" ? card.front.trim() : "",
      back: typeof card.back === "string" ? card.back.trim() : "",
    }))
    .filter((card) => card.front.length > 0 && card.back.length > 0)
    .slice(0, maxCards);
}

function buildUserPrompt(input: {
  sourceText: string;
  context?: string;
  maxCards: number;
}): string {
  return [
    `Create up to ${input.maxCards} flashcards from the provided material.`,
    input.context ? `Context hint: ${input.context}` : undefined,
    `Source text:\n${input.sourceText}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    authenticate(request);
    rateLimit(request, "generation");

    const body = validateCardsRequest(await request.json());
    const model = MODEL_POLICY.cards;
    const completion = await getOpenAIClient().chat.completions.create({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: cardsSystemPrompt },
        { role: "user", content: buildUserPrompt(body) },
      ],
    });

    const rawContent = completion.choices[0]?.message?.content;

    if (!rawContent) {
      throw new AppError("ai_error", "The AI service returned no content.", 502);
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(rawContent);
    } catch {
      throw new AppError("ai_error", "The AI service returned invalid JSON.", 502);
    }

    return NextResponse.json({
      cards: normalizeCards(parsed, body.maxCards),
      diagnostics: buildDiagnostics(model, completion.usage),
    });
  } catch (error) {
    return handleError(error);
  }
}
