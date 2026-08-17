import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { consumeAIQuota } from "../../../lib/aiQuota";
import { authenticate } from "../../../lib/auth";
import { AppError, handleError } from "../../../lib/errors";
import { MODEL_POLICY } from "../../../lib/models";
import { buildDiagnostics, getModelClient } from "../../../lib/providers";
import { rateLimit } from "../../../lib/rateLimit";
import { conversePrompt, parseConverse } from "../../../lib/scenes";
import { validateConverseRequest } from "../../../lib/validation";

export const runtime = "nodejs";

/**
 * One turn of a scene played out, with the model in the other role.
 *
 * The reason the course is generated rather than authored. A fixed curriculum
 * can teach you the line for ordering a coffee; it cannot be the person behind
 * the counter who is out of oat milk and asks what you want instead. Success
 * here is the learner getting what they came for, not matching a string.
 *
 * Stateless by design: the client holds the transcript and sends it back. A
 * conversation that lives on the device survives a dropped connection, an
 * app switch and a redeploy, none of which a server session would.
 */
export async function POST(request: NextRequest) {
  try {
    const session = authenticate(request);
    rateLimit(request, "chat");

    const body = validateConverseRequest(await request.json());
    await consumeAIQuota(session);

    const model = MODEL_POLICY.converse;
    const completion = await getModelClient(model).chat.completions.create({
      model,
      // A turn is one or two sentences plus a short correction. Anything longer
      // is the model lecturing instead of playing the part.
      max_tokens: 700,
      messages: [
        {
          role: "user",
          content: conversePrompt({
            subject: body.subject,
            constraints: body.constraints,
            role: body.role,
            situation: body.situation,
            goal: body.goal,
            lines: body.lines,
            transcript: body.transcript,
            learnerTurn: body.learnerTurn,
          }),
        },
      ],
    });

    const raw = completion.choices[0]?.message.content?.trim() ?? "";
    if (!raw) {
      throw new AppError("ai_error", "The AI service returned no content.", 502);
    }

    let result;
    try {
      result = parseConverse(raw);
    } catch {
      throw new AppError(
        "ai_error",
        "We lost the thread of that conversation. Please try again.",
        502,
      );
    }

    if (result.reply.length === 0) {
      throw new AppError(
        "ai_error",
        "We lost the thread of that conversation. Please try again.",
        502,
      );
    }

    return NextResponse.json({
      ...result,
      diagnostics: buildDiagnostics(model, completion.usage),
    });
  } catch (error) {
    return handleError(error);
  }
}
