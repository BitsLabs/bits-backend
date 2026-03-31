import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { authenticate } from "../../../lib/auth";
import { AppError, handleError } from "../../../lib/errors";
import { MODEL_POLICY } from "../../../lib/models";
import { buildDiagnostics, getOpenAIClient } from "../../../lib/openai";
import { tutorSystemPrompt } from "../../../lib/prompts";
import { rateLimit } from "../../../lib/rateLimit";
import { validateTutorRequest } from "../../../lib/validation";

function buildSystemPrompt(input: {
  deckTitle: string;
  cardContext?: string;
}): string {
  return [
    tutorSystemPrompt,
    `Deck title: ${input.deckTitle}`,
    input.cardContext ? `Card context:\n${input.cardContext}` : undefined,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    authenticate(request);
    rateLimit(request, "chat");

    const body = validateTutorRequest(await request.json());
    const model = MODEL_POLICY.tutor;
    const completion = await getOpenAIClient().chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: buildSystemPrompt(body),
        },
        ...body.history.map((message) => ({
          role: message.role,
          content: message.content,
        })),
        {
          role: "user",
          content: body.message,
        },
      ],
    });

    const reply = completion.choices[0]?.message?.content?.trim();

    if (!reply) {
      throw new AppError("ai_error", "The AI service returned no content.", 502);
    }

    return NextResponse.json({
      reply,
      diagnostics: buildDiagnostics(model, completion.usage),
    });
  } catch (error) {
    return handleError(error);
  }
}
