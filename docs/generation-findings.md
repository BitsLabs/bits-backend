# Generation findings

Measured against `anthropic/claude-haiku-4.5` through the live `/ai/chat`
endpoint, 2026-08-16, before the course endpoints were deployed.

## Syllabus structure is trustworthy

Four subjects tested: first-year pharmacology, Portuguese for Lisbon, TCP/IP,
and music theory up to hearing chord progressions.

All four produced 11 to 12 units in correct dependency order, with objectives
written as capabilities rather than topic lists. The pharmacology plan matched a
real first-year sequence (PK before PD before autonomics before organ systems).
The TCP/IP plan built addressing before routing before the handshake before
congestion control.

Conclusion: one wide call for the syllabus is safe. Units, objectives and topic
labels carry nothing the learner memorises.

## Unit content is not trustworthy

Asked for "Portuguese for daily life in Lisbon", the model produced material
mixing European and Brazilian Portuguese, and labelled two regular verbs
(`comer`, `partir`) irregular.

This is the failure mode that matters, because spaced repetition makes it
permanent. A learner drilling `Oi, meu nome é...` for Lisbon is being taught to
sound Brazilian, at expanding intervals, with no way to notice.

## Constraints help, and are not enough

The unit prompt was run twice on the same unit, once with an explicit
constraints block and once without.

| | Without constraints | With constraints |
|---|---|---|
| Introducing yourself | `Meu nome é [name]` offered first | `Sou o/a [name]` / `Chamo-me [name]` |
| Informal hello | `Olá` | `Oi. or Olá.` |
| Asking how someone is | `Como está?` | `Como é que estás?` / `Tudo bem?` |

The constraints block moved the introduction from Brazilian phrasing to correct
European phrasing, and pulled the register toward spoken Lisbon usage. It did
not stop `Oi` appearing, which is Brazilian and should not be taught for Lisbon.

**So the prompt is a mitigation, not a fix.** Even with an emphatic, explicit
constraint the model emitted a confidently wrong item. The one-tap "this looks
wrong" affordance on every card is the actual safety net, and it is not optional
garnish.

## What this changed in the design

- `constraints` is a validated first-class field on both the goal and the
  request bodies, not prose folded into the subject.
- The unit prompt restates constraints verbatim rather than assuming they carry
  over from the syllabus call.
- The unit prompt instructs the model to omit anything it is unsure of, on the
  grounds that a missing card costs the learner nothing.
- Parsing drops malformed checks rather than repairing them, because a guessed
  correct-answer index is a silent wrong answer.

## Reproducing

The scripts used are not committed; they post the exact `syllabusPrompt` and
`unitPrompt` output to `/ai/chat` with a session token and diff the results.
Re-run them after any prompt change to the course endpoints, and add a marker
list for whatever variant the subject needs.
