import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { authenticate } from "../../../lib/auth";
import { AppError, handleError } from "../../../lib/errors";
import { MODEL_POLICY } from "../../../lib/models";
import { buildDiagnostics, getOpenAIClient } from "../../../lib/openai";
import { quizSystemPrompt } from "../../../lib/prompts";
import { rateLimit } from "../../../lib/rateLimit";
import { validateQuizRequest } from "../../../lib/validation";

type QuizQuestion = {
  question: string;
  options: [string, string, string, string];
  correctIndex: number;
  explanation: string;
};

type QuizPayload = {
  title: string;
  questions: QuizQuestion[];
};

function buildUserPrompt(input: {
  sourceText: string;
  deckTitle?: string;
  context?: string;
  questionCount: number;
}): string {
  return [
    `Create up to ${input.questionCount} multiple-choice questions from the provided material.`,
    input.deckTitle ? `Deck title: ${input.deckTitle}` : undefined,
    input.context ? `Context hint: ${input.context}` : undefined,
    `Source text:\n${input.sourceText}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function normalizeQuiz(payload: unknown, questionCount: number): QuizPayload {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new AppError("ai_error", "The AI service returned invalid JSON.", 502);
  }

  const quiz = "quiz" in payload ? payload.quiz : undefined;

  if (!quiz || typeof quiz !== "object" || Array.isArray(quiz)) {
    throw new AppError("ai_error", "The AI service returned invalid JSON.", 502);
  }

  const quizRecord = quiz as Record<string, unknown>;
  const title =
    typeof quizRecord.title === "string" && quizRecord.title.trim()
      ? quizRecord.title.trim()
      : "Quiz";
  const rawQuestions = Array.isArray(quizRecord.questions)
    ? quizRecord.questions
    : [];
  const questions = rawQuestions
    .filter(
      (question): question is {
        question: unknown;
        options: unknown;
        correctIndex: unknown;
        explanation: unknown;
      } => !!question && typeof question === "object" && !Array.isArray(question),
    )
    .map((question) => {
      const options = Array.isArray(question.options)
        ? question.options
            .map((option) => (typeof option === "string" ? option.trim() : ""))
            .filter((option) => option.length > 0)
        : [];

      return {
        question:
          typeof question.question === "string" ? question.question.trim() : "",
        options,
        correctIndex:
          typeof question.correctIndex === "number"
            ? question.correctIndex
            : Number.NaN,
        explanation:
          typeof question.explanation === "string"
            ? question.explanation.trim()
            : "",
      };
    })
    .filter(
      (question): question is QuizQuestion =>
        question.question.length > 0 &&
        question.explanation.length > 0 &&
        question.options.length === 4 &&
        question.options.every((option) => option.length > 0) &&
        Number.isInteger(question.correctIndex) &&
        question.correctIndex >= 0 &&
        question.correctIndex < 4,
    )
    .map((question) => ({
      ...question,
      options: question.options as [string, string, string, string],
    }))
    .slice(0, questionCount);

  return {
    title,
    questions,
  };
}

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    authenticate(request);
    rateLimit(request, "generation");

    const body = validateQuizRequest(await request.json());
    const model = MODEL_POLICY.quiz;
    const completion = await getOpenAIClient().chat.completions.create({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: quizSystemPrompt },
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
      quiz: normalizeQuiz(parsed, body.questionCount),
      diagnostics: buildDiagnostics(model, completion.usage),
    });
  } catch (error) {
    return handleError(error);
  }
}
