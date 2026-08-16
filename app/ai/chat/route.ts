import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type OpenAI from "openai";

import { consumeAIQuota } from "../../../lib/aiQuota";
import { authenticate } from "../../../lib/auth";
import { AppError, handleError } from "../../../lib/errors";
import { MODEL_POLICY } from "../../../lib/models";
import { buildDiagnostics, getModelClient } from "../../../lib/providers";
import { chatSystemPrompt } from "../../../lib/prompts";
import { rateLimit } from "../../../lib/rateLimit";
import { CHAT_TOOLS } from "../../../lib/tools";
import { validateChatRequest, type ChatMessage } from "../../../lib/validation";

export const runtime = "nodejs";

/**
 * One turn of the agent loop.
 *
 * The loop itself lives on the client: this endpoint returns either a reply or
 * a set of tool calls, the app executes them against its local SwiftData store,
 * and posts back with the results appended. That split is what lets the agent
 * act on decks and cards the server never sees.
 */
export async function POST(request: NextRequest) {
  try {
    const session = authenticate(request);
    rateLimit(request, "chat");

    const body = validateChatRequest(await request.json());
    await consumeAIQuota(session);

    const model = MODEL_POLICY.chat;
    const completion = await getModelClient(model).chat.completions.create({
      model,
      tools: CHAT_TOOLS,
      tool_choice: "auto",
      max_tokens: 4096,
      messages: [
        {
          role: "system",
          content: body.deckSummaries
            ? `${chatSystemPrompt}\n\nThe user's decks:\n${body.deckSummaries}`
            : chatSystemPrompt,
        },
        ...body.messages.map(toModelMessage),
      ],
    });

    const choice = completion.choices[0];

    if (!choice) {
      throw new AppError("ai_error", "The AI service returned no content.", 502);
    }

    const toolCalls = (choice.message.tool_calls ?? []).flatMap((call) =>
      // Custom (non-function) tool call variants carry no `.function`; we only
      // ever send function tools, so anything else is unexpected — drop it
      // rather than emitting a malformed call the client can't dispatch.
      call.type === "function"
        ? [{
            id: call.id,
            name: call.function.name,
            arguments: call.function.arguments,
          }]
        : [],
    );

    const reply = choice.message.content?.trim() ?? "";

    if (!reply && toolCalls.length === 0) {
      throw new AppError("ai_error", "The AI service returned no content.", 502);
    }

    return NextResponse.json({
      reply,
      toolCalls,
      // The client keeps calling back while this is true.
      awaitingTools: toolCalls.length > 0,
      diagnostics: buildDiagnostics(model, completion.usage),
    });
  } catch (error) {
    return handleError(error);
  }
}

function toModelMessage(
  message: ChatMessage,
): OpenAI.Chat.Completions.ChatCompletionMessageParam {
  if (message.role === "tool") {
    return {
      role: "tool",
      tool_call_id: message.toolCallId,
      content: message.content,
    };
  }

  if (message.role === "assistant") {
    return {
      role: "assistant",
      content: message.content ?? "",
      ...(message.toolCalls.length > 0
        ? {
            tool_calls: message.toolCalls.map((call) => ({
              id: call.id,
              type: "function" as const,
              function: { name: call.name, arguments: call.arguments },
            })),
          }
        : {}),
    };
  }

  // A user turn with attachments becomes multimodal content parts. Haiku 4.5
  // accepts images; PDFs never get here because the app extracts their text
  // on-device and folds it into `content`.
  if (message.images.length > 0) {
    const parts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];

    if (message.content) {
      parts.push({ type: "text", text: message.content });
    }

    for (const image of message.images) {
      parts.push({
        type: "image_url",
        image_url: { url: `data:${image.mediaType};base64,${image.data}` },
      });
    }

    return { role: "user", content: parts };
  }

  return { role: "user", content: message.content ?? "" };
}
