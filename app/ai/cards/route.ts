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
  deckTitle?: string;
  context?: string;
  maxCards: number;
  sourceType?: string;
  referenceLabel?: string;
}): string {
  const extractionMode = inferCardExtractionMode(input);

  return [
    extractionMode === "exam"
      ? `This PDF appears to be an exam, worksheet, or question sheet. Extract an exhaustive set of study cards from the provided material, generating as many cards as needed to cover the full document, up to ${input.maxCards} cards for this response.`
      : input.sourceType === "pdf"
        ? `Extract an exhaustive set of study flashcards from the provided PDF material. Generate as many cards as needed to cover the full document, up to ${input.maxCards} cards for this response.`
        : `Create up to ${input.maxCards} flashcards from the provided material.`,
    input.deckTitle ? `Deck title: ${input.deckTitle}` : undefined,
    input.sourceType ? `Source type: ${input.sourceType}` : undefined,
    input.referenceLabel ? `Reference label: ${input.referenceLabel}` : undefined,
    input.context ? `Context hint: ${input.context}` : undefined,
    extractionMode === "exam"
      ? [
          "Exam extraction instructions:",
          "- Prioritize substantive questions, answer keys, worked solutions, and repeated problem patterns.",
          "- If an answer is explicit in the source, put that answer on the back.",
          "- If the source only shows a question without an answer, turn it into a pattern, concept, or method card instead of inventing an answer.",
          "- Ignore logistics such as permitted materials, room assignments, grading rules, due dates, cover pages, or formatting instructions unless they are academically relevant.",
        ].join("\n")
      : input.sourceType === "pdf"
        ? [
            "PDF extraction instructions:",
            "- Cover all important topics, sections, and page-level concepts.",
            "- Ignore agendas, schedules, presenter notes, copyright notices, slide numbers, classroom logistics, and other non-topic filler unless they are central to the material.",
            "- Prefer high-signal study cards over decorative or organizational text.",
            "- Treat slide examples, case studies, toy problems, and walkthrough scenarios as supporting material by default. Exclude cards whose value depends mainly on remembering the example itself, and only keep an example if it is clearly presented as required knowledge or it is needed to teach a transferable concept.",
            "- When an example helps explain a concept, rewrite the card to ask about the general concept, method, or rule rather than the example-specific names, places, or story details.",
          ].join("\n")
        : undefined,
    `Source text:\n${input.sourceText}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function inferCardExtractionMode(input: {
  sourceText: string;
  deckTitle?: string;
  context?: string;
  sourceType?: string;
  referenceLabel?: string;
}): "standard" | "exam" {
  if (input.sourceType !== "pdf") {
    return "standard";
  }

  const combined = [
    input.deckTitle,
    input.context,
    input.referenceLabel,
    input.sourceText.slice(0, 8_000),
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();

  const examPattern =
    /\b(exam|final exam|midterm|quiz|sample exam|practice exam|past paper|mock exam|worksheet|problem set|klausur|prüfung|examensfragen|fragenkatalog|question sheet|answer key|multiple choice)\b/;

  return examPattern.test(combined) ? "exam" : "standard";
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
      temperature: 0.3,
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
