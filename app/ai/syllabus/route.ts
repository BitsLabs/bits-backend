import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { consumeAIQuota } from "../../../lib/aiQuota";
import { authenticate } from "../../../lib/auth";
import { AppError, handleError } from "../../../lib/errors";
import { parseSyllabus, syllabusPrompt } from "../../../lib/learning";
import { MODEL_POLICY } from "../../../lib/models";
import { buildDiagnostics, getModelClient } from "../../../lib/providers";
import { rateLimit } from "../../../lib/rateLimit";
import { validateSyllabusRequest } from "../../../lib/validation";

export const runtime = "nodejs";

/**
 * Authors a goal's plan, once, at goal creation.
 *
 * Deliberately not a chat tool. The syllabus is the only artefact the user sees
 * whole, it has to parse reliably, and letting the agent emit it through a tool
 * call means competing with whatever else it decided to do that turn.
 */
export async function POST(request: NextRequest) {
  try {
    const session = authenticate(request);
    rateLimit(request, "generation");

    const body = validateSyllabusRequest(await request.json());
    await consumeAIQuota(session);

    const model = MODEL_POLICY.syllabus;
    const completion = await getModelClient(model).chat.completions.create({
      model,
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: syllabusPrompt({
            subject: body.subject,
            constraints: body.constraints,
            dailyMinutes: body.dailyMinutes,
            weeksAvailable: body.weeksAvailable,
          }),
        },
      ],
    });

    const raw = completion.choices[0]?.message.content?.trim() ?? "";
    if (!raw) {
      throw new AppError("ai_error", "The AI service returned no content.", 502);
    }

    let units;
    try {
      units = parseSyllabus(raw);
    } catch {
      throw new AppError(
        "ai_error",
        "The plan came back in a format we could not read. Please try again.",
        502,
      );
    }

    if (units.length === 0) {
      throw new AppError(
        "ai_error",
        "We could not build a plan for that. Try describing the subject more specifically.",
        502,
      );
    }

    return NextResponse.json({
      units,
      diagnostics: buildDiagnostics(model, completion.usage),
    });
  } catch (error) {
    return handleError(error);
  }
}
