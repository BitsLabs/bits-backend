import test from "node:test";
import assert from "node:assert/strict";

import { validateTutorRequest } from "./validation.ts";

test("accepts bounded tutor requests", () => {
  const request = validateTutorRequest({
    deckTitle: "Biology",
    cardContext: "Q: Cell\nA: Basic unit of life",
    history: [],
    message: "Quiz me",
  });

  assert.equal(request.deckTitle, "Biology");
  assert.equal(request.message, "Quiz me");
});

test("returns a clear tutor context error when context is too large", () => {
  assert.throws(
    () =>
      validateTutorRequest({
        deckTitle: "Biology",
        cardContext: "x".repeat(5_001),
        history: [],
        message: "Quiz me",
      }),
    /Tutor deck context is too large/,
  );
});
