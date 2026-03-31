import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { authenticate } from "../../../lib/auth";
import { AppError, handleError } from "../../../lib/errors";
import { MODEL_POLICY } from "../../../lib/models";
import { buildDiagnostics, getOpenAIClient } from "../../../lib/openai";
import { summarySystemPrompt } from "../../../lib/prompts";
import { rateLimit } from "../../../lib/rateLimit";
import { validateSummaryRequest } from "../../../lib/validation";

function buildUserPrompt(input: {
  sourceText: string;
  context?: string;
}): string {
  return [
    "Summarize the provided material for studying.",
    input.context ? `Context hint: ${input.context}` : undefined,
    `Source text:\n${input.sourceText}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function normalizeSummary(payload: unknown): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new AppError("ai_error", "The AI service returned invalid JSON.", 502);
  }

  const summary = "summary" in payload ? payload.summary : undefined;

  if (typeof summary !== "string" || !summary.trim()) {
    throw new AppError(
      "ai_error",
      "The AI service returned an invalid summary.",
      502,
    );
  }

  return summary.trim();
}

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    authenticate(request);
    rateLimit(request, "generation");

    const body = validateSummaryRequest(await request.json());
    const model = MODEL_POLICY.summary;
    const completion = await getOpenAIClient().chat.completions.create({
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
