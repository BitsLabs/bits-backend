import assert from "node:assert/strict";
import test from "node:test";

import {
  conversePrompt,
  normalise,
  parseConverse,
  parseScene,
  scenePrompt,
} from "./scenes.ts";

const SCENE = {
  title: "Ordering at the counter",
  situation: "You are at a café counter in Lisbon during the morning rush.",
  role: "a server at a café counter in Lisbon",
  goal: "order a coffee and pay for it",
  lines: [
    { target: "Um café, se faz favor.", native: "A coffee, please." },
    { target: "Mais alguma coisa?", native: "Anything else?", note: "You will hear this, not say it." },
    { target: "Só isso, obrigado.", native: "That's all, thanks." },
    { target: "Quanto é?", native: "How much is it?" },
  ],
  exercises: [
    {
      kind: "match",
      prompt: "Match each line to its meaning.",
      pairs: [
        { left: "Quanto é?", right: "How much is it?" },
        { left: "Mais alguma coisa?", right: "Anything else?" },
        { left: "Só isso, obrigado.", right: "That's all, thanks." },
      ],
    },
    {
      kind: "tap",
      prompt: "Ask for a coffee.",
      answer: "Um café, se faz favor.",
      tiles: ["favor", "Um", "se", "café", "faz", "obrigado", "Quanto"],
      explanation: "Se faz favor is the everyday polite form in Portugal.",
    },
    {
      kind: "choose",
      prompt: "The server asks 'Mais alguma coisa?'. What do you say?",
      choices: ["Só isso, obrigado.", "Quanto é?", "Um café, se faz favor."],
      answerIndex: 0,
      explanation: "They are asking whether you want anything more.",
    },
    {
      kind: "type",
      prompt: "Ask how much it costs.",
      answer: "Quanto é?",
      alternatives: ["Quanto custa?", "Quanto é que é?"],
      explanation: "Quanto é is what you actually hear at a counter.",
    },
  ],
};

test("parses a well-formed scene", () => {
  const scene = parseScene(JSON.stringify(SCENE));
  assert.ok(scene);
  assert.equal(scene.title, "Ordering at the counter");
  assert.equal(scene.role, "a server at a café counter in Lisbon");
  assert.equal(scene.lines.length, 4);
  assert.equal(scene.lines[1]?.note, "You will hear this, not say it.");
  assert.equal(scene.exercises.length, 4);
});

test("a note is omitted rather than left empty", () => {
  const scene = parseScene(JSON.stringify(SCENE));
  assert.equal("note" in (scene?.lines[0] ?? {}), false);
});

test("survives a code fence the model was told not to add", () => {
  const scene = parseScene("```json\n" + JSON.stringify(SCENE) + "\n```");
  assert.equal(scene?.title, "Ordering at the counter");
});

test("a scene with no lines is not a scene", () => {
  assert.equal(parseScene(JSON.stringify({ ...SCENE, lines: [] })), null);
  assert.equal(parseScene(JSON.stringify({ ...SCENE, title: "" })), null);
});

test("a tap whose tiles cannot spell its answer is dropped", () => {
  // Unwinnable, not hard. Better to lose the exercise than strand someone.
  const scene = parseScene(
    JSON.stringify({
      ...SCENE,
      exercises: [
        {
          kind: "tap",
          prompt: "Ask for a coffee.",
          answer: "Um café, se faz favor.",
          tiles: ["Um", "café", "obrigado"],
          explanation: "",
        },
      ],
    }),
  );
  assert.equal(scene?.exercises.length, 0);
});

test("a tap survives punctuation and case differing between tiles and answer", () => {
  const scene = parseScene(
    JSON.stringify({
      ...SCENE,
      exercises: [
        {
          kind: "tap",
          prompt: "Ask for a coffee.",
          answer: "Um café, se faz favor.",
          tiles: ["FAVOR", "um", "se", "Café", "faz"],
          explanation: "",
        },
      ],
    }),
  );
  assert.equal(scene?.exercises.length, 1);
});

test("a choose whose answerIndex is out of range is dropped", () => {
  const drop = (answerIndex: number) =>
    parseScene(
      JSON.stringify({
        ...SCENE,
        exercises: [
          {
            kind: "choose",
            prompt: "?",
            choices: ["a", "b", "c"],
            answerIndex,
            explanation: "",
          },
        ],
      }),
    )?.exercises.length;

  assert.equal(drop(3), 0);
  assert.equal(drop(-1), 0);
  assert.equal(drop(2), 1);
});

test("an order whose tiles are not its answer shuffled is dropped", () => {
  const scene = parseScene(
    JSON.stringify({
      ...SCENE,
      exercises: [
        {
          kind: "order",
          prompt: "Put it in order.",
          tiles: ["se", "faz", "favor"],
          answer: ["se", "faz", "favor", "agora"],
          explanation: "",
        },
      ],
    }),
  );
  assert.equal(scene?.exercises.length, 0);
});

test("a match with fewer than three pairs is a coin toss, not an exercise", () => {
  const scene = parseScene(
    JSON.stringify({
      ...SCENE,
      exercises: [
        {
          kind: "match",
          prompt: "Match them.",
          pairs: [{ left: "a", right: "b" }, { left: "c", right: "d" }],
        },
      ],
    }),
  );
  assert.equal(scene?.exercises.length, 0);
});

test("an unknown exercise kind is dropped rather than shown", () => {
  const scene = parseScene(
    JSON.stringify({
      ...SCENE,
      exercises: [{ kind: "sing", prompt: "Sing it.", answer: "la" }],
    }),
  );
  assert.equal(scene?.exercises.length, 0);
});

test("the scene prompt carries the constraints and what was already taught", () => {
  const prompt = scenePrompt({
    subject: "European Portuguese for daily life in Lisbon",
    constraints: "European Portuguese only. Never Brazilian forms.",
    nativeLanguage: "German",
    unitTitle: "At the café",
    unitObjective: "Order and pay",
    seenLines: ["Bom dia.", "Obrigado."],
    exerciseCount: 6,
  });

  assert.ok(prompt.includes("Never Brazilian forms"));
  assert.ok(prompt.includes("Bom dia."));
  assert.ok(prompt.includes("Do not teach them again"));
  assert.ok(prompt.includes("exactly 6 exercises"));
  // The failure the whole scene format exists to avoid.
  assert.ok(prompt.includes("in textbooks but not in mouths"));
  // Without this the model returned `native` as a copy of `target`, because
  // nothing in the prompt said what the learner's own language was.
  assert.ok(prompt.includes("learner's own language is German"));
  assert.ok(prompt.includes("rather than repeat it"));
});

test("the scene prompt omits the seen block when nothing has been taught", () => {
  const prompt = scenePrompt({
    subject: "Portuguese",
    constraints: "",
    nativeLanguage: "English",
    unitTitle: "At the café",
    unitObjective: "Order and pay",
    seenLines: [],
    exerciseCount: 5,
  });
  assert.equal(prompt.includes("already knows these lines"), false);
});

test("the converse prompt tells the model to play the part, not teach", () => {
  const prompt = conversePrompt({
    subject: "European Portuguese",
    constraints: "European Portuguese only.",
    nativeLanguage: "German",
    role: "a server at a café counter",
    situation: "The morning rush.",
    goal: "order a coffee and pay",
    lines: [{ target: "Um café, se faz favor.", native: "A coffee, please." }],
    transcript: [{ speaker: "character", text: "Bom dia!" }],
    learnerTurn: "Um café se faz favor",
  });

  assert.ok(prompt.includes("Play the part, not a teacher"));
  assert.ok(prompt.includes("plain German translation"));
  // It told a learner that "se faz favor" is not used in Portugal. It is. A
  // correction invented on a correct answer teaches someone to stop using
  // something that works, so the prompt now has to earn every correction.
  assert.ok(prompt.includes("If you are not sure the learner's version is wrong"));
  assert.ok(prompt.includes("a regional variant"));
  assert.ok(prompt.includes("Do not praise"));
  assert.ok(prompt.includes("European Portuguese only."));
  assert.ok(prompt.includes("You: Bom dia!"));
  assert.ok(prompt.includes("Um café se faz favor"));
});

test("the converse prompt says so when the learner is opening", () => {
  const prompt = conversePrompt({
    subject: "Portuguese",
    constraints: "",
    nativeLanguage: "English",
    role: "a server",
    situation: "A café.",
    goal: "order",
    lines: [{ target: "Olá", native: "Hi" }],
    transcript: [],
    learnerTurn: "Olá",
  });
  assert.ok(prompt.includes("this is the learner's opening line"));
});

test("parses a conversation turn", () => {
  const result = parseConverse(
    JSON.stringify({
      reply: "Claro. Mais alguma coisa?",
      replyNative: "Of course. Anything else?",
      correction: { better: "Um café, se faz favor.", why: "You dropped the comma pause." },
      goalMet: false,
      done: false,
    }),
  );

  assert.equal(result.reply, "Claro. Mais alguma coisa?");
  assert.equal(result.correction?.better, "Um café, se faz favor.");
  assert.equal(result.goalMet, false);
});

test("an empty correction is treated as no correction", () => {
  // A red mark beside a line that was fine is worse than staying quiet.
  const result = parseConverse(
    JSON.stringify({
      reply: "Claro.",
      replyNative: "Of course.",
      correction: { better: "", why: "" },
      goalMet: true,
      done: true,
    }),
  );

  assert.equal(result.correction, null);
  assert.equal(result.goalMet, true);
  assert.equal(result.done, true);
});

test("a missing correction field is not an error", () => {
  const result = parseConverse(JSON.stringify({ reply: "Claro." }));
  assert.equal(result.correction, null);
  assert.equal(result.goalMet, false);
  assert.equal(result.done, false);
});

test("answer comparison ignores punctuation and case but keeps accents", () => {
  assert.equal(normalise("Um café, se faz favor."), "um café se faz favor");
  assert.equal(normalise("  QUANTO   É?  "), "quanto é");
  // In most of these languages an accent is the difference between two words,
  // so stripping accents would mark a genuine mistake as correct.
  assert.notEqual(normalise("é"), normalise("e"));
});
