import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { consumeAIQuota } from "../../../lib/aiQuota";
import { authenticate } from "../../../lib/auth";
import { AppError, handleError } from "../../../lib/errors";
import { MODEL_POLICY } from "../../../lib/models";
import { buildDiagnostics, getModelClient } from "../../../lib/providers";
import { rateLimit } from "../../../lib/rateLimit";
import { parseScene, scenePrompt } from "../../../lib/scenes";
import { validateSceneRequest } from "../../../lib/validation";

export const runtime = "nodejs";

/**
 * Writes one scene: a situation, the lines said in it, and the exercises that
 * drill them.
 *
 * Generated ahead of the lesson rather than during it, so the wait lands while
 * the learner is elsewhere. That is why this route can afford a large token
 * budget while /ai/grade cannot.
 */
export async function POST(request: NextRequest) {
  try {
    const session = authenticate(request);
    rateLimit(request, "chat");

    const body = validateSceneRequest(await request.json());
    await consumeAIQuota(session);

    const model = MODEL_POLICY.scene;
    const completion = await getModelClient(model).chat.completions.create({
      model,
      max_tokens: 4_000,
      messages: [
        {
          role: "user",
          content: scenePrompt({
            subject: body.subject,
            constraints: body.constraints,
            nativeLanguage: body.nativeLanguage,
            unitTitle: body.unitTitle,
            unitObjective: body.unitObjective,
            seenLines: body.seenLines,
            exerciseCount: body.exerciseCount,
          }),
        },
      ],
    });

    const raw = completion.choices[0]?.message.content?.trim() ?? "";
    if (!raw) {
      throw new AppError("ai_error", "The AI service returned no content.", 502);
    }

    let scene;
    try {
      scene = parseScene(raw);
    } catch {
      scene = null;
    }

    // parseScene drops exercises it cannot guarantee are playable, so a scene
    // can come back valid but thin. Lines alone are still a lesson; no lines is
    // not, and is worth failing on rather than showing an empty screen.
    if (!scene) {
      throw new AppError(
        "ai_error",
        "We could not write that scene. Please try again.",
        502,
      );
    }

    return NextResponse.json({
      ...scene,
      diagnostics: buildDiagnostics(model, completion.usage),
    });
  } catch (error) {
    return handleError(error);
  }
}
