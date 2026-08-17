/**
 * Prompts and parsing for course generation.
 *
 * Split into two calls on purpose. The syllabus is structure: unit titles,
 * objectives, topic labels. Nothing in it gets memorised, so a single
 * wide-ranging call is safe. Unit material is content the user will drill at
 * expanding intervals until it is unshakeable, so it is generated narrowly, one
 * unit at a time, with the goal's constraints repeated in full.
 *
 * That split came out of testing. Asked for "Portuguese for daily life in
 * Lisbon", the model produced a competent syllabus and then filled it with a
 * mix of European and Brazilian Portuguese, plus two regular verbs labelled
 * irregular. The structure was trustworthy; the facts were not. Constraints are
 * therefore restated in the unit prompt rather than assumed to carry over.
 */

export interface SyllabusUnit {
  title: string;
  objective: string;
  days: number;
  items: string[];
}

export interface GeneratedCard {
  front: string;
  back: string;
}

/** A short teaching moment: the thing a flashcard cannot do. */
export interface GeneratedLesson {
  concept: string;
  explanation: string;
  example: string;
}

/** An open question the learner answers in their own words. */
export interface GeneratedRecall {
  question: string;
  /** What a good answer contains, used to grade, never shown as-is. */
  rubric: string;
}

export interface GeneratedCheck {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

const CONSTRAINT_BLOCK = (constraints: string): string =>
  constraints.trim().length > 0
    ? `\n\nThese constraints are not optional. Every item you write must respect them:\n${constraints.trim()}`
    : "";

export function syllabusPrompt(input: {
  subject: string;
  constraints: string;
  dailyMinutes: number;
  weeksAvailable?: number;
}): string {
  const pacing =
    input.weeksAvailable && input.weeksAvailable > 0
      ? `The learner has about ${input.weeksAvailable} weeks. Size the plan to fit; do not pad it to fill the time.`
      : "There is no deadline. Size the plan to the subject, not to a calendar.";

  return `Build a study plan for a spaced-repetition app.

Subject: ${input.subject}
Time available: ${input.dailyMinutes} minutes a day.
${pacing}${CONSTRAINT_BLOCK(input.constraints)}

Produce 8 to 14 units, ordered so each depends only on earlier ones.

For every unit give:
- title: short, concrete
- objective: what the learner will be able to DO, not what the unit covers
- days: how many days of ${input.dailyMinutes}-minute sessions it needs
- items: 3 to 6 topic labels this unit drills

"items" are labels, not study content. Write "Volume of distribution", not the
definition of it.

Return JSON only, no prose, no code fence:
{"units":[{"title":"","objective":"","days":0,"items":[""]}]}`;
}

export function unitPrompt(input: {
  subject: string;
  constraints: string;
  unit: SyllabusUnit;
  lessonCount: number;
  recallCount: number;
  cardCount: number;
  checkCount: number;
  existingFronts: string[];
  performanceNote?: string;
}): string {
  const avoid =
    input.existingFronts.length > 0
      ? `\n\nThe learner already has cards for these. Do not repeat them:\n${input.existingFronts
          .slice(0, 60)
          .map((f) => `- ${f}`)
          .join("\n")}`
      : "";

  const adapt = input.performanceNote
    ? `\n\nHow the learner has been doing, use it to set difficulty:\n${input.performanceNote}`
    : "";

  return `Write a lesson for one unit of a course.

Subject: ${input.subject}
Unit: ${input.unit.title}
Objective: ${input.unit.objective}
Topics to cover: ${input.unit.items.join("; ")}${CONSTRAINT_BLOCK(
    input.constraints,
  )}${avoid}${adapt}

Write four things:

1. ${input.lessonCount} short teaching moments. Each takes one idea, explains it
   in two or three plain sentences as you would to a smart beginner, and gives
   one concrete worked example. This is teaching, not testing. Do not write it
   as a question.

2. ${input.recallCount} open questions the learner answers in their own words.
   These are not multiple choice and have no options. For each, write a rubric
   saying what a good answer must contain, which the learner never sees. Ask for
   understanding, not for a definition to be recited back.

3. ${input.cardCount} flashcards.

4. ${input.checkCount} check questions.

Rules for flashcards:
- One fact per card. A card testing two things is two cards.
- The front must be answerable without seeing the back.
- Write the back as the shortest complete answer, not a paragraph.

Rules for check questions:
- Exactly 4 options, one correct.
- Wrong options must be plausible and wrong, never absurd or joke answers.
- The explanation says why the right answer is right in one sentence.

If you are not confident a fact is correct, leave it out. A missing card costs
the learner nothing. A wrong card gets drilled until they believe it.

Return JSON only, no prose, no code fence:
{"lessons":[{"concept":"","explanation":"","example":""}],"recalls":[{"question":"","rubric":""}],"cards":[{"front":"","back":""}],"checks":[{"question":"","options":["","","",""],"correctIndex":0,"explanation":""}]}`;
}

/**
 * Judges an answer the learner wrote in their own words.
 *
 * This is the part a flashcard app cannot do and the reason the model has to
 * stay in the loop after generation. Free recall is the strongest form of
 * practice and has always been the hardest to grade at scale.
 *
 * The feedback is written to teach rather than to score. "Incorrect" tells the
 * learner nothing they did not already suspect; naming the specific thing they
 * missed is the whole value.
 */
export function gradePrompt(input: {
  subject: string;
  constraints: string;
  question: string;
  rubric: string;
  answer: string;
}): string {
  return `You are marking one answer a learner typed from memory.

Subject: ${input.subject}${CONSTRAINT_BLOCK(input.constraints)}

Question: ${input.question}
What a good answer contains: ${input.rubric}
The learner wrote: ${input.answer}

Judge what they meant, not how they worded it. Accept paraphrase, shorthand,
missing articles, and typos. Mark down only for content that is wrong or
missing, never for style or for being brief.

verdict:
- "correct" if they have the substance, even loosely worded
- "partial" if part is right and something important is missing
- "incorrect" if the substance is wrong, or they said they do not know

grade, on a 0 to 3 scale used for review scheduling:
- 0 they did not know it
- 1 they struggled or got a lot wrong
- 2 they knew it
- 3 they knew it cleanly and completely

feedback: one or two sentences, speaking to the learner as "you". If they were
right, add the one thing that sharpens it. If they were wrong, say what the
answer actually is and why, in a way that makes it stick. Never just say
"incorrect". Never praise an answer that was wrong.

Return JSON only, no prose, no code fence:
{"verdict":"","grade":0,"feedback":""}`;
}

export interface GradeResult {
  verdict: "correct" | "partial" | "incorrect";
  grade: number;
  feedback: string;
}

/**
 * The 0 to 3 range each verdict is allowed to schedule within.
 *
 * "incorrect" collapses to 0 rather than clamping to a range, because anything
 * above 0 tells the scheduler the learner half knew it and pushes the card away
 * for days.
 */
const GRADE_BAND: Record<GradeResult["verdict"], (grade: number) => number> = {
  correct: (grade) => Math.max(2, grade),
  partial: (grade) => Math.min(2, Math.max(1, grade)),
  incorrect: () => 0,
};

export function parseGrade(raw: string): GradeResult {
  const parsed = JSON.parse(stripFence(raw)) as Record<string, unknown>;

  const verdict =
    parsed.verdict === "correct" || parsed.verdict === "partial"
      ? parsed.verdict
      : "incorrect";

  // A grade outside the scale is clamped rather than trusted; a bad number here
  // silently corrupts a review schedule the learner cannot see.
  const rawGrade = typeof parsed.grade === "number" ? Math.round(parsed.grade) : 0;
  const grade = Math.min(3, Math.max(0, rawGrade));

  return {
    verdict,
    // The two fields can disagree: in testing, a confidently wrong answer came
    // back "incorrect" with a grade of 1, which would have scheduled it as
    // merely hard. The verdict is the judgement the learner is shown, so it
    // wins, and the grade is pulled into the band that matches it.
    grade: GRADE_BAND[verdict](grade),
    feedback:
      typeof parsed.feedback === "string" ? parsed.feedback.trim() : "",
  };
}

/** Strips a code fence the model was told not to add but sometimes adds anyway. */
export function stripFence(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  const withoutOpen = trimmed.replace(/^```(?:json)?\s*/i, "");
  const close = withoutOpen.lastIndexOf("```");
  return (close === -1 ? withoutOpen : withoutOpen.slice(0, close)).trim();
}

export function parseSyllabus(raw: string): SyllabusUnit[] {
  const parsed = JSON.parse(stripFence(raw)) as unknown;
  const units = (parsed as { units?: unknown }).units;
  if (!Array.isArray(units)) return [];

  return units.flatMap((entry): SyllabusUnit[] => {
    if (!entry || typeof entry !== "object") return [];
    const unit = entry as Record<string, unknown>;
    const title = typeof unit.title === "string" ? unit.title.trim() : "";
    if (title.length === 0) return [];

    const items = Array.isArray(unit.items)
      ? unit.items
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter((item) => item.length > 0)
      : [];

    const days = typeof unit.days === "number" ? Math.max(1, Math.round(unit.days)) : 3;

    return [
      {
        title,
        objective:
          typeof unit.objective === "string" ? unit.objective.trim() : "",
        days,
        items,
      },
    ];
  });
}

export function parseUnitMaterial(raw: string): {
  lessons: GeneratedLesson[];
  recalls: GeneratedRecall[];
  cards: GeneratedCard[];
  checks: GeneratedCheck[];
} {
  const parsed = JSON.parse(stripFence(raw)) as Record<string, unknown>;

  const lessons = Array.isArray(parsed.lessons)
    ? parsed.lessons.flatMap((entry): GeneratedLesson[] => {
        if (!entry || typeof entry !== "object") return [];
        const lesson = entry as Record<string, unknown>;
        const concept =
          typeof lesson.concept === "string" ? lesson.concept.trim() : "";
        const explanation =
          typeof lesson.explanation === "string"
            ? lesson.explanation.trim()
            : "";
        if (!concept || !explanation) return [];
        return [
          {
            concept,
            explanation,
            example:
              typeof lesson.example === "string" ? lesson.example.trim() : "",
          },
        ];
      })
    : [];

  const recalls = Array.isArray(parsed.recalls)
    ? parsed.recalls.flatMap((entry): GeneratedRecall[] => {
        if (!entry || typeof entry !== "object") return [];
        const recall = entry as Record<string, unknown>;
        const question =
          typeof recall.question === "string" ? recall.question.trim() : "";
        const rubric =
          typeof recall.rubric === "string" ? recall.rubric.trim() : "";
        // Without a rubric the answer cannot be graded fairly, so the item is
        // dropped rather than graded on vibes.
        if (!question || !rubric) return [];
        return [{ question, rubric }];
      })
    : [];

  const cards = Array.isArray(parsed.cards)
    ? parsed.cards.flatMap((entry): GeneratedCard[] => {
        if (!entry || typeof entry !== "object") return [];
        const card = entry as Record<string, unknown>;
        const front = typeof card.front === "string" ? card.front.trim() : "";
        const back = typeof card.back === "string" ? card.back.trim() : "";
        return front && back ? [{ front, back }] : [];
      })
    : [];

  const checks = Array.isArray(parsed.checks)
    ? parsed.checks.flatMap((entry): GeneratedCheck[] => {
        if (!entry || typeof entry !== "object") return [];
        const check = entry as Record<string, unknown>;
        const question =
          typeof check.question === "string" ? check.question.trim() : "";
        const options = Array.isArray(check.options)
          ? check.options.filter((o): o is string => typeof o === "string")
          : [];
        const correctIndex =
          typeof check.correctIndex === "number" ? check.correctIndex : -1;

        // A check with the wrong shape is dropped rather than repaired. A
        // guessed correct answer is worse than one fewer question.
        if (
          question.length === 0 ||
          options.length !== 4 ||
          correctIndex < 0 ||
          correctIndex > 3
        ) {
          return [];
        }

        return [
          {
            question,
            options,
            correctIndex,
            explanation:
              typeof check.explanation === "string"
                ? check.explanation.trim()
                : "",
          },
        ];
      })
    : [];

  return { lessons, recalls, cards, checks };
}
