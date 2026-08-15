import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { consumeAIQuota } from "../../../lib/aiQuota";
import { authenticate } from "../../../lib/auth";
import { AppError, handleError } from "../../../lib/errors";
import { MODEL_POLICY } from "../../../lib/models";
import { buildDiagnostics, getModelClient } from "../../../lib/openrouter";
import { summarySystemPrompt } from "../../../lib/prompts";
import { rateLimit } from "../../../lib/rateLimit";
import { validateSummaryRequest } from "../../../lib/validation";

type SummaryPayload = {
  overview: string;
  keyPoints: string[];
  memoryCues: string[];
};

function buildUserPrompt(input: {
  sourceText: string;
  deckTitle?: string;
  context?: string;
}): string {
  return [
    "Summarize the provided material for studying.",
    input.deckTitle ? `Deck title: ${input.deckTitle}` : undefined,
    input.context ? `Context hint: ${input.context}` : undefined,
    `Source text:\n${input.sourceText}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function normalizeSummary(payload: unknown): SummaryPayload {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new AppError("ai_error", "The AI service returned invalid JSON.", 502);
  }

  const record = payload as Record<string, unknown>;

  const overview =
    typeof record.overview === "string" && record.overview.trim()
      ? record.overview.trim()
      : "";

  const keyPoints = Array.isArray(record.keyPoints)
    ? record.keyPoints
        .filter((item) => typeof item === "string" && item.trim())
        .map((item) => (item as string).trim())
    : [];

  const memoryCues = Array.isArray(record.memoryCues)
    ? record.memoryCues
        .filter((item) => typeof item === "string" && item.trim())
        .map((item) => (item as string).trim())
    : [];

  if (!overview && keyPoints.length === 0) {
    throw new AppError(
      "ai_error",
      "The AI service returned an invalid summary.",
      502,
    );
  }

  return { overview, keyPoints, memoryCues };
}

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const session = authenticate(request);
    rateLimit(request, "generation");

    const body = validateSummaryRequest(await request.json());
    await consumeAIQuota(session);

    const model = MODEL_POLICY.summary;
    const completion = await getModelClient().chat.completions.create({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: summarySystemPrompt },
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
      summary: normalizeSummary(parsed),
      diagnostics: buildDiagnostics(model, completion.usage),
    });
  } catch (error) {
    return handleError(error);
  }
}
