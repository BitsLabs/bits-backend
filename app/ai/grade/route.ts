import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { consumeAIQuota } from "../../../lib/aiQuota";
import { authenticate } from "../../../lib/auth";
import { AppError, handleError } from "../../../lib/errors";
import { gradePrompt, parseGrade } from "../../../lib/learning";
import { MODEL_POLICY } from "../../../lib/models";
import { buildDiagnostics, getModelClient } from "../../../lib/providers";
import { rateLimit } from "../../../lib/rateLimit";
import { validateGradeRequest } from "../../../lib/validation";

export const runtime = "nodejs";

/**
 * Marks an answer the learner wrote from memory.
 *
 * The only call in the product that happens while someone is waiting, and
 * deliberately so. Everything else is generated ahead of time because a wait
 * before you can start kills a habit, but a second or two after you have
 * committed to an answer is the moment you most want to hear back.
 *
 * This is also the thing that makes the model necessary rather than decorative.
 * Without it the app is a flashcard scheduler with a content generator bolted
 * on; with it, the learner recalls in their own words and is actually marked.
 */
export async function POST(request: NextRequest) {
  try {
    const session = authenticate(request);
    rateLimit(request, "chat");

    const body = validateGradeRequest(await request.json());
    await consumeAIQuota(session);

    const model = MODEL_POLICY.grade;
    const completion = await getModelClient(model).chat.completions.create({
      model,
      // Short by construction: a verdict, a number and two sentences.
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: gradePrompt({
            subject: body.subject,
            constraints: body.constraints,
            question: body.question,
            rubric: body.rubric,
            answer: body.answer,
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
      result = parseGrade(raw);
    } catch {
      throw new AppError(
        "ai_error",
        "We could not read that answer back. Please try again.",
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
