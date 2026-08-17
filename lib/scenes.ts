/**
 * Scenes: the unit of learning.
 *
 * The first version of courses kept the flashcard as the atom and dressed it
 * up. Every interaction was still "read a prompt, produce a thing, get marked",
 * which is a flashcard app with better prompts. A scene is a situation you
 * would actually be in, the handful of lines you would actually say in it, and
 * then the situation played out with the model in the other role.
 *
 * Two things follow from that, and both are the point:
 *
 * Most exercises are checked on the device, not here. Tapping tiles into order,
 * matching pairs, picking a reply: all of those have one right answer and can
 * be graded with a string comparison, instantly and for free. Only free typing
 * and the live scene need a model. That keeps a lesson responsive and cheap
 * enough to be given away daily.
 *
 * The scene is generated per learner. A course for "moving to Lisbon in
 * September to work in a hospital" gets the pharmacy, the flat handover and the
 * break room. That is the thing an authored curriculum structurally cannot do,
 * and it is worth more than any individual exercise type.
 */

export interface SceneLine {
  /** What the learner says or hears, in the language being learned. */
  target: string;
  /** What it means. */
  native: string;
  /** Optional register or usage note. Kept to one sentence. */
  note?: string;
}

export type Exercise =
  /** Build the line from word tiles. Lowest friction production. */
  | {
      kind: "tap";
      prompt: string;
      answer: string;
      tiles: string[];
      explanation: string;
    }
  /** Produce the line from scratch. Graded by the model. */
  | {
      kind: "type";
      prompt: string;
      answer: string;
      alternatives: string[];
      explanation: string;
    }
  /** Pick the right thing to say next. Tests situation, not vocabulary. */
  | {
      kind: "choose";
      prompt: string;
      choices: string[];
      answerIndex: number;
      explanation: string;
    }
  /** Put the steps or words in order. */
  | {
      kind: "order";
      prompt: string;
      tiles: string[];
      answer: string[];
      explanation: string;
    }
  /** Match each line to its meaning. A warm-up, never the whole lesson. */
  | {
      kind: "match";
      prompt: string;
      pairs: { left: string; right: string }[];
    };

export interface Scene {
  title: string;
  /** One sentence putting the learner in the situation. */
  situation: string;
  /** Who the model plays when the scene is acted out. */
  role: string;
  /** What counts as getting through the scene. Success is task, not accuracy. */
  goal: string;
  lines: SceneLine[];
  exercises: Exercise[];
}

const CONSTRAINT_BLOCK = (constraints: string): string =>
  constraints.trim().length > 0
    ? `\n\nThese constraints are not optional. Every line you write must respect them:\n${constraints.trim()}`
    : "";

const SEEN_BLOCK = (seen: string[]): string =>
  seen.length > 0
    ? `\n\nThe learner already knows these lines. Do not teach them again, but you may reuse them inside exercises:\n${seen
        .slice(0, 40)
        .map((line) => `- ${line}`)
        .join("\n")}`
    : "";

export function scenePrompt(input: {
  subject: string;
  constraints: string;
  unitTitle: string;
  unitObjective: string;
  seenLines: string[];
  exerciseCount: number;
}): string {
  return `You are writing one scene of a course in: ${input.subject}${CONSTRAINT_BLOCK(input.constraints)}

The scene covers this part of the course:
Unit: ${input.unitTitle}
Objective: ${input.unitObjective}${SEEN_BLOCK(input.seenLines)}

A scene is a situation the learner will really be in, and the few things they
would really say in it. Not a topic, not a grammar point. "Ordering at a
counter", "asking a neighbour about the bins", "handing over a shift".

Write 4 to 5 lines. Rules for the lines:
- Only what a real person says out loud in that situation. If a phrase appears
  in textbooks but not in mouths, leave it out.
- Prefer the short natural form over the complete grammatical sentence.
- Keep one register throughout, and make it the register the situation calls
  for. Do not mix formal and casual.
- Where a line could be said differently in another region or by another
  generation, pick one and stay with it for the whole scene.
- Add a note only where a learner would otherwise get it wrong. Most lines need
  no note. One sentence when present.

Then write exactly ${input.exerciseCount} exercises drilling those lines.

Every exercise must be answerable from the lines above and nothing else. Never
require a word the learner has not met. Vary the kinds. Order them so
recognition comes before production.

The kinds, and what each must contain:

"match": prompt, and 3 to 4 pairs of {left, right}. Left is the line, right is
the meaning. Use only as a warm-up, at most one per scene.

"choose": prompt describing what just happened in the situation, 3 choices, and
answerIndex. The wrong choices must be real, correct sentences that are simply
wrong to say at that moment. Never make a wrong choice obviously broken.

"tap": prompt saying what to express, answer as the full line, and tiles.
Tiles must be the answer split into words, plus 2 or 3 distractor words the
learner has already met. Shuffle them. Never let the tile order give it away.

"order": prompt, tiles, and answer as the tiles in the correct order. Use for a
line long enough that its order is the difficult part.

"type": prompt saying what to express, answer as the best line, and
alternatives listing every other phrasing you would accept. Be generous with
alternatives. Use at most two per scene, and put them last.

Every exercise except match has a one-sentence explanation shown afterwards.
Say why the answer is what it is, not that it was correct.

Finally, describe how the scene is acted out:
- role: who you will play, in one phrase. "a server at a café counter in Lisbon"
- goal: what the learner has to achieve to be done. A task, not a sentence.
  "order a coffee and pay for it"

Return JSON only, no prose, no code fence:
{"title":"","situation":"","role":"","goal":"","lines":[{"target":"","native":"","note":""}],"exercises":[]}`;
}

/**
 * One turn of the scene being acted out.
 *
 * This is the payoff, and the reason the whole thing is worth generating rather
 * than authoring. The learner is not reciting: they have a task, the character
 * has a personality and a script only in the loosest sense, and the exchange
 * goes wherever the learner takes it. Correction is offered beside the reply
 * rather than interrupting it, so the conversation never stops to mark work.
 */
export function conversePrompt(input: {
  subject: string;
  constraints: string;
  role: string;
  situation: string;
  goal: string;
  lines: SceneLine[];
  transcript: { speaker: "learner" | "character"; text: string }[];
  learnerTurn: string;
}): string {
  const script = input.lines
    .map((line) => `- ${line.target}  (${line.native})`)
    .join("\n");

  const history =
    input.transcript.length > 0
      ? input.transcript
          .map((turn) => `${turn.speaker === "learner" ? "Learner" : "You"}: ${turn.text}`)
          .join("\n")
      : "(nothing yet, this is the learner's opening line)";

  return `You are playing a part in a practice scene for someone learning: ${input.subject}${CONSTRAINT_BLOCK(input.constraints)}

You are: ${input.role}
The situation: ${input.situation}
What the learner is trying to do: ${input.goal}

The learner has been taught these lines and no others:
${script}

So far:
${history}

The learner just said: ${input.learnerTurn}

Stay in character and reply as that person would, in the language being
learned. One or two sentences. Keep to the vocabulary above wherever you can;
where you must go beyond it, use the simplest words that still sound like a
real person.

Play the part, not a teacher. Do not praise, do not mark, do not explain inside
the reply. If the learner said something odd, react the way a real person would:
ask again, look confused, or answer the question they actually asked.

Adapt. If they are struggling, slow down, shorten your lines and make what you
want obvious. If they are handling it easily, speak more naturally and add a
small complication a real person would add: a follow-up question, something out
of stock, a price they did not expect.

correction: if the learner's line would make a native speaker hesitate, give the
better version and one sentence on why. Grammar that is merely imperfect but
clearly understood is not worth correcting. Leave it null more often than not.

goalMet: true once the learner has achieved what they set out to do.
done: true when the exchange has reached a natural end. Never run past six
turns.

Return JSON only, no prose, no code fence:
{"reply":"","replyNative":"","correction":{"better":"","why":""},"goalMet":false,"done":false}`;
}

export interface ConverseResult {
  reply: string;
  replyNative: string;
  correction: { better: string; why: string } | null;
  goalMet: boolean;
  done: boolean;
}

/** Strips a code fence the model was told not to add but sometimes adds anyway. */
function stripFence(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  const withoutOpen = trimmed.replace(/^```(?:json)?\s*/i, "");
  const close = withoutOpen.lastIndexOf("```");
  return (close === -1 ? withoutOpen : withoutOpen.slice(0, close)).trim();
}

const str = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const strList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
    : [];

export function parseConverse(raw: string): ConverseResult {
  const parsed = JSON.parse(stripFence(raw)) as Record<string, unknown>;

  const correctionRaw = parsed.correction as Record<string, unknown> | null | undefined;
  const better = str(correctionRaw?.better);
  const why = str(correctionRaw?.why);

  return {
    reply: str(parsed.reply),
    replyNative: str(parsed.replyNative),
    // A correction with nothing in it is worse than none: it puts a red mark
    // beside a line that was fine.
    correction: better.length > 0 ? { better, why } : null,
    goalMet: parsed.goalMet === true,
    done: parsed.done === true,
  };
}

/**
 * Reads a scene back, discarding anything unplayable.
 *
 * Every exercise is checked against the rules its kind has to satisfy on the
 * device: a tap whose tiles cannot spell its answer is not a hard exercise, it
 * is an unwinnable one, and it is better to drop it here than to strand someone
 * mid-lesson. Dropping is safe because a scene keeps its lines either way.
 */
export function parseScene(raw: string): Scene | null {
  const parsed = JSON.parse(stripFence(raw)) as Record<string, unknown>;

  const title = str(parsed.title);
  if (title.length === 0) return null;

  const lines = Array.isArray(parsed.lines)
    ? parsed.lines.flatMap((entry): SceneLine[] => {
        if (!entry || typeof entry !== "object") return [];
        const line = entry as Record<string, unknown>;
        const target = str(line.target);
        const native = str(line.native);
        if (target.length === 0 || native.length === 0) return [];
        const note = str(line.note);
        return [note.length > 0 ? { target, native, note } : { target, native }];
      })
    : [];

  if (lines.length === 0) return null;

  const exercises = Array.isArray(parsed.exercises)
    ? parsed.exercises.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        return parseExercise(entry as Record<string, unknown>);
      })
    : [];

  return {
    title,
    situation: str(parsed.situation),
    role: str(parsed.role),
    goal: str(parsed.goal),
    lines,
    exercises,
  };
}

function parseExercise(raw: Record<string, unknown>): Exercise[] {
  const prompt = str(raw.prompt);
  const explanation = str(raw.explanation);

  switch (raw.kind) {
    case "match": {
      const pairs = Array.isArray(raw.pairs)
        ? raw.pairs.flatMap((entry): { left: string; right: string }[] => {
            if (!entry || typeof entry !== "object") return [];
            const pair = entry as Record<string, unknown>;
            const left = str(pair.left);
            const right = str(pair.right);
            return left.length > 0 && right.length > 0 ? [{ left, right }] : [];
          })
        : [];
      // Two pairs is a coin toss rather than an exercise.
      return pairs.length >= 3 ? [{ kind: "match", prompt, pairs }] : [];
    }

    case "choose": {
      const choices = strList(raw.choices);
      const answerIndex =
        typeof raw.answerIndex === "number" ? Math.round(raw.answerIndex) : -1;
      if (choices.length < 2) return [];
      if (answerIndex < 0 || answerIndex >= choices.length) return [];
      return [{ kind: "choose", prompt, choices, answerIndex, explanation }];
    }

    case "tap": {
      const answer = str(raw.answer);
      const tiles = strList(raw.tiles);
      if (answer.length === 0 || tiles.length === 0) return [];
      // The tiles have to be able to spell the answer, or the exercise cannot
      // be completed at all.
      if (!tilesCanSpell(tiles, answer)) return [];
      return [{ kind: "tap", prompt, answer, tiles, explanation }];
    }

    case "order": {
      const answer = strList(raw.answer);
      const tiles = strList(raw.tiles);
      if (answer.length < 2) return [];
      if (!sameMultiset(tiles, answer)) return [];
      return [{ kind: "order", prompt, tiles, answer, explanation }];
    }

    case "type": {
      const answer = str(raw.answer);
      if (answer.length === 0) return [];
      return [
        {
          kind: "type",
          prompt,
          answer,
          alternatives: strList(raw.alternatives),
          explanation,
        },
      ];
    }

    default:
      return [];
  }
}

/** Whether the answer can be built from the tiles, each used at most once. */
function tilesCanSpell(tiles: string[], answer: string): boolean {
  const needed = answer
    .split(/\s+/)
    .map((word) => normalise(word))
    .filter(Boolean);
  if (needed.length === 0) return false;

  const pool = tiles.map((tile) => normalise(tile));
  for (const word of needed) {
    const at = pool.indexOf(word);
    if (at === -1) return false;
    pool.splice(at, 1);
  }
  return true;
}

function sameMultiset(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const pool = a.map(normalise);
  for (const item of b.map(normalise)) {
    const at = pool.indexOf(item);
    if (at === -1) return false;
    pool.splice(at, 1);
  }
  return true;
}

/**
 * How two pieces of text are compared when checking an answer on the device.
 *
 * Punctuation and case are stripped because nobody is learning where the
 * question mark goes. Accents are kept: in most of the languages this course
 * will teach, an accent is the difference between two words.
 */
export function normalise(text: string): string {
  return text
    .toLocaleLowerCase()
    .replace(/[.,!?;:¿¡"'`´“”‘’()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
