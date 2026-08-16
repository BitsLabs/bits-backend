import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { consumeAIQuota } from "../../../lib/aiQuota";
import { authenticate } from "../../../lib/auth";
import { AppError, handleError } from "../../../lib/errors";
import { parseUnitMaterial, unitPrompt } from "../../../lib/learning";
import { MODEL_POLICY } from "../../../lib/models";
import { buildDiagnostics, getModelClient } from "../../../lib/providers";
import { rateLimit } from "../../../lib/rateLimit";
import { validateUnitRequest } from "../../../lib/validation";

export const runtime = "nodejs";

/**
 * Writes one unit's material: roughly a week of cards and checks in a single
 * call, generated ahead of when the learner needs it.
 *
 * A week at a time rather than a day is both cheaper and better UX. It cuts
 * calls sevenfold, and it means the daily session is already on the device when
 * the reminder fires, so nobody watches a spinner to start studying.
 */
export async function POST(request: NextRequest) {
  try {
    const session = authenticate(request);
    rateLimit(request, "generation");

    const body = validateUnitRequest(await request.json());
    await consumeAIQuota(session);

    const model = MODEL_POLICY.unit;
    const completion = await getModelClient(model).chat.completions.create({
      model,
      max_tokens: 8192,
      messages: [
        {
          role: "user",
          content: unitPrompt({
            subject: body.subject,
            constraints: body.constraints,
            unit: body.unit,
            cardCount: body.cardCount,
            checkCount: body.checkCount,
            existingFronts: body.existingFronts,
            performanceNote: body.performanceNote,
          }),
        },
      ],
    });

    const raw = completion.choices[0]?.message.content?.trim() ?? "";
    if (!raw) {
      throw new AppError("ai_error", "The AI service returned no content.", 502);
    }

    let material;
    try {
      material = parseUnitMaterial(raw);
    } catch {
      throw new AppError(
        "ai_error",
        "The material came back in a format we could not read. Please try again.",
        502,
      );
    }

    if (material.cards.length === 0) {
      throw new AppError(
        "ai_error",
        "No usable cards came back for that unit. Please try again.",
        502,
      );
    }

    return NextResponse.json({
      ...material,
      diagnostics: buildDiagnostics(model, completion.usage),
    });
  } catch (error) {
    return handleError(error);
  }
}
