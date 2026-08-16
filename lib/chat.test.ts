import test from "node:test";
import assert from "node:assert/strict";

import { validateChatRequest } from "./validation.ts";

test("accepts a plain user turn", () => {
  const request = validateChatRequest({
    messages: [{ role: "user", content: "Make me cards on mitosis" }],
  });

  assert.equal(request.messages.length, 1);
  assert.equal(request.messages[0].role, "user");
});

test("round-trips an assistant tool call and its result", () => {
  const request = validateChatRequest({
    messages: [
      { role: "user", content: "Quiz me" },
      {
        role: "assistant",
        toolCalls: [
          { id: "call_1", name: "list_decks", arguments: "{}" },
        ],
      },
      { role: "tool", toolCallId: "call_1", content: '{"decks":[]}' },
    ],
  });

  assert.equal(request.messages.length, 3);
  const assistant = request.messages[1];
  assert.equal(assistant.role, "assistant");
  assert.equal(
    assistant.role === "assistant" ? assistant.toolCalls[0].name : undefined,
    "list_decks",
  );
});

test("rejects a transcript ending on an assistant turn", () => {
  // The model would have nothing to respond to, and a trailing assistant turn
  // with unanswered tool calls is rejected upstream anyway.
  assert.throws(
    () =>
      validateChatRequest({
        messages: [
          { role: "user", content: "Hi" },
          { role: "assistant", content: "Hello" },
        ],
      }),
    /must not end with an assistant message/,
  );
});

test("rejects a message with neither content, tool calls, nor images", () => {
  assert.throws(
    () => validateChatRequest({ messages: [{ role: "user" }] }),
    /must have content, toolCalls, or images/,
  );
});

test("accepts an image attachment on a user turn", () => {
  const request = validateChatRequest({
    messages: [
      {
        role: "user",
        content: "What's on this slide?",
        images: [{ mediaType: "image/jpeg", data: "AAAA" }],
      },
    ],
  });

  const message = request.messages[0];
  assert.equal(message.role === "user" ? message.images.length : 0, 1);
});

test("accepts an image with no accompanying text", () => {
  const request = validateChatRequest({
    messages: [
      { role: "user", images: [{ mediaType: "image/png", data: "AAAA" }] },
    ],
  });

  assert.equal(request.messages.length, 1);
});

test("rejects an unsupported image media type", () => {
  assert.throws(
    () =>
      validateChatRequest({
        messages: [
          {
            role: "user",
            content: "hi",
            images: [{ mediaType: "image/heic", data: "AAAA" }],
          },
        ],
      }),
    /must be one of/,
  );
});

test("rejects a data URI prefix in image data", () => {
  // The route builds the data URI itself; a prefixed payload would double it.
  assert.throws(
    () =>
      validateChatRequest({
        messages: [
          {
            role: "user",
            content: "hi",
            images: [
              { mediaType: "image/jpeg", data: "data:image/jpeg;base64,AAAA" },
            ],
          },
        ],
      }),
    /must be base64 without a data URI prefix/,
  );
});

test("accepts pasted study material well beyond the tutor limit", () => {
  // Chat is the paste surface; the tutor's 2k ceiling would reject real notes.
  const request = validateChatRequest({
    messages: [{ role: "user", content: "x".repeat(15_000) }],
  });

  assert.equal(
    request.messages[0].role === "user" ? request.messages[0].content?.length : 0,
    15_000,
  );
});

test("keeps only the most recent messages", () => {
  const messages = Array.from({ length: 60 }, (_, index) => ({
    role: index % 2 === 0 ? "user" : "assistant",
    content: `m${index}`,
  }));
  // Ensure the trimmed window still ends on a non-assistant turn.
  messages.push({ role: "user", content: "latest" });

  const request = validateChatRequest({ messages });

  assert.equal(request.messages.length, 40);
  assert.equal(
    request.messages.at(-1)?.role === "user"
      ? request.messages.at(-1)?.content
      : undefined,
    "latest",
  );
});
