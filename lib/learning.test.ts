import assert from "node:assert/strict";
import test from "node:test";

import {
  gradePrompt,
  parseGrade,
  parseSyllabus,
  parseUnitMaterial,
  stripFence,
  syllabusPrompt,
  unitPrompt,
} from "./learning.ts";

test("strips a code fence the model was asked not to add", () => {
  assert.equal(stripFence('```json\n{"units":[]}\n```'), '{"units":[]}');
  assert.equal(stripFence('```\n{"units":[]}\n```'), '{"units":[]}');
  assert.equal(stripFence('{"units":[]}'), '{"units":[]}');
});

test("parses a well-formed syllabus", () => {
  const units = parseSyllabus(
    JSON.stringify({
      units: [
        { title: "Basics", objective: "Do the thing", days: 3, items: ["a", "b"] },
        { title: "More", objective: "Do more", days: 5, items: ["c"] },
      ],
    }),
  );

  assert.equal(units.length, 2);
  assert.equal(units[0]?.title, "Basics");
  assert.equal(units[1]?.days, 5);
});

test("drops syllabus units with no title rather than inventing one", () => {
  const units = parseSyllabus(
    JSON.stringify({
      units: [
        { title: "", objective: "x", days: 2, items: [] },
        { title: "Real", objective: "y", days: 2, items: [] },
      ],
    }),
  );

  assert.equal(units.length, 1);
  assert.equal(units[0]?.title, "Real");
});

test("defaults a missing day count instead of failing the whole plan", () => {
  const units = parseSyllabus(
    JSON.stringify({ units: [{ title: "Unit", objective: "o", items: [] }] }),
  );

  assert.equal(units.length, 1);
  assert.equal(units[0]?.days, 3);
});

test("returns nothing when the payload has no units array", () => {
  assert.deepEqual(parseSyllabus(JSON.stringify({ plan: [] })), []);
});

test("parses cards and checks", () => {
  const material = parseUnitMaterial(
    JSON.stringify({
      cards: [{ front: "Q", back: "A" }],
      checks: [
        {
          question: "Which?",
          options: ["a", "b", "c", "d"],
          correctIndex: 2,
          explanation: "because",
        },
      ],
    }),
  );

  assert.equal(material.cards.length, 1);
  assert.equal(material.checks.length, 1);
  assert.equal(material.checks[0]?.correctIndex, 2);
});

test("drops a check that does not have exactly four options", () => {
  const material = parseUnitMaterial(
    JSON.stringify({
      cards: [{ front: "Q", back: "A" }],
      checks: [
        { question: "Three", options: ["a", "b", "c"], correctIndex: 0, explanation: "" },
        { question: "Four", options: ["a", "b", "c", "d"], correctIndex: 1, explanation: "" },
      ],
    }),
  );

  assert.equal(material.checks.length, 1);
  assert.equal(material.checks[0]?.question, "Four");
});

test("drops a check whose correct index is out of range", () => {
  const material = parseUnitMaterial(
    JSON.stringify({
      cards: [{ front: "Q", back: "A" }],
      checks: [
        { question: "Bad", options: ["a", "b", "c", "d"], correctIndex: 7, explanation: "" },
      ],
    }),
  );

  assert.equal(material.checks.length, 0);
});

test("drops half-written cards", () => {
  const material = parseUnitMaterial(
    JSON.stringify({
      cards: [
        { front: "Q", back: "" },
        { front: "", back: "A" },
        { front: "Good", back: "Card" },
      ],
      checks: [],
    }),
  );

  assert.equal(material.cards.length, 1);
  assert.equal(material.cards[0]?.front, "Good");
});

test("constraints reach both prompts verbatim", () => {
  const constraints = "variant: European Portuguese (Portugal), not Brazilian";

  const syllabus = syllabusPrompt({
    subject: "Portuguese for daily life in Lisbon",
    constraints,
    dailyMinutes: 10,
  });
  assert.ok(syllabus.includes(constraints));

  const unit = unitPrompt({
    subject: "Portuguese for daily life in Lisbon",
    constraints,
    unit: { title: "Greetings", objective: "Greet people", days: 3, items: ["olá"] },
    lessonCount: 4,
    recallCount: 4,
    cardCount: 10,
    checkCount: 3,
    existingFronts: [],
  });
  assert.ok(unit.includes(constraints));
});

test("the unit prompt lists existing fronts so material is not duplicated", () => {
  const prompt = unitPrompt({
    subject: "Biology",
    constraints: "",
    unit: { title: "Cells", objective: "Name organelles", days: 3, items: ["organelles"] },
    lessonCount: 4,
    recallCount: 4,
    cardCount: 10,
    checkCount: 3,
    existingFronts: ["Mitochondrion", "Ribosome"],
  });

  assert.ok(prompt.includes("Mitochondrion"));
  assert.ok(prompt.includes("Ribosome"));
});

test("the unit prompt tells the model to omit anything it is unsure of", () => {
  const prompt = unitPrompt({
    subject: "Pharmacology",
    constraints: "",
    unit: { title: "PK", objective: "Calculate", days: 3, items: ["clearance"] },
    lessonCount: 4,
    recallCount: 4,
    cardCount: 10,
    checkCount: 3,
    existingFronts: [],
  });

  // The correctness instruction is load-bearing: spaced repetition makes a
  // wrong card permanent, so a missing card is always the cheaper failure.
  assert.ok(prompt.includes("leave it out"));
});

test("parses lessons and open recall questions", () => {
  const material = parseUnitMaterial(
    JSON.stringify({
      lessons: [{ concept: "Clearance", explanation: "How fast a drug leaves.", example: "A drug with..." }],
      recalls: [{ question: "Why does half-life matter?", rubric: "Mentions dosing interval and steady state." }],
      cards: [{ front: "Q", back: "A" }],
      checks: [],
    }),
  );

  assert.equal(material.lessons.length, 1);
  assert.equal(material.lessons[0]?.concept, "Clearance");
  assert.equal(material.recalls.length, 1);
});

test("drops a recall question with no rubric rather than grading on impression", () => {
  const material = parseUnitMaterial(
    JSON.stringify({
      recalls: [
        { question: "Ungradeable", rubric: "" },
        { question: "Gradeable", rubric: "Mentions X." },
      ],
      cards: [{ front: "Q", back: "A" }],
    }),
  );

  assert.equal(material.recalls.length, 1);
  assert.equal(material.recalls[0]?.question, "Gradeable");
});

test("a lesson with no explanation is not a lesson", () => {
  const material = parseUnitMaterial(
    JSON.stringify({
      lessons: [{ concept: "Empty", explanation: "", example: "x" }],
      cards: [{ front: "Q", back: "A" }],
    }),
  );
  assert.equal(material.lessons.length, 0);
});

test("grades parse into a verdict, a scheduling grade and feedback", () => {
  const result = parseGrade(
    JSON.stringify({ verdict: "partial", grade: 1, feedback: "You have the mechanism but not the consequence." }),
  );
  assert.equal(result.verdict, "partial");
  assert.equal(result.grade, 1);
  assert.match(result.feedback, /mechanism/);
});

test("an out-of-range grade is clamped, never trusted", () => {
  assert.equal(parseGrade(JSON.stringify({ verdict: "correct", grade: 9 })).grade, 3);
  assert.equal(parseGrade(JSON.stringify({ verdict: "correct", grade: -4 })).grade, 0);
});

test("an unrecognised verdict falls back to incorrect", () => {
  // Erring toward "incorrect" means the learner sees the material again. Erring
  // the other way means a wrong answer is quietly marked as known.
  assert.equal(parseGrade(JSON.stringify({ verdict: "brilliant", grade: 3 })).verdict, "incorrect");
});

test("the grading prompt forbids praising a wrong answer", () => {
  const prompt = gradePrompt({
    subject: "Pharmacology",
    constraints: "",
    question: "What is clearance?",
    rubric: "Volume of plasma cleared per unit time.",
    answer: "no idea",
  });
  assert.ok(prompt.includes("Never praise an answer that was wrong"));
  assert.ok(prompt.includes("Accept paraphrase"));
});
