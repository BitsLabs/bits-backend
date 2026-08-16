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

  return `Write study material for one unit of a course.

Subject: ${input.subject}
Unit: ${input.unit.title}
Objective: ${input.unit.objective}
Topics to cover: ${input.unit.items.join("; ")}${CONSTRAINT_BLOCK(
    input.constraints,
  )}${avoid}${adapt}

Write ${input.cardCount} flashcards and ${input.checkCount} check questions.

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
{"cards":[{"front":"","back":""}],"checks":[{"question":"","options":["","","",""],"correctIndex":0,"explanation":""}]}`;
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
  cards: GeneratedCard[];
  checks: GeneratedCheck[];
} {
  const parsed = JSON.parse(stripFence(raw)) as Record<string, unknown>;

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

  return { cards, checks };
}
