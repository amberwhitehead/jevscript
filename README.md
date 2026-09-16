# Jevscript

A programming language where **judgment is a runtime primitive** — you write
the program, and the program asks [Jev](https://docs.typesafe.ai) (TypeSafe's
System One model) narrow, typed questions as it runs. Jev is not the
programmer; it's an operator, like `+`, but for meaning.

Two names, one project:

- **Jevscript** — the language. JS-ish surface, three question forms
  (`noul`, `choice`, `score`), typed answers carrying probability and
  confidence, policy (thresholds, gates, weights) as ordinary code.
- **Hocket** — the engine that runs it. Parser, interpreter, and the
  composition passes: automatic fusion of independent judgments into single
  requests, explicit stage boundaries where a real dependency exists, and
  state-identity caching. A hocket is one line of music split between
  voices; Jevscript writes the notes, Hocket keeps the line continuous.

## The idea

Everything compositional — control flow, arithmetic, thresholds, retries —
is code. Only single semantic judgments go to the model:

```text
ask once:
  kind   = choice ["bug","billing","feature","other"]
            by "What is the main request in `ticket.body`?"
  urgent = noul "The message conveys urgency or time-sensitivity"

when urgent.p > 0.6 and ticket.tier == "enterprise":
  page "oncall"
```

The two judgments above run as **one** API request. The author thinks in
judgments; Hocket thinks in requests — batching independent questions
(≈11.5× cheaper, ≈9.6× faster per the TypeSafe docs) and splitting only
when an answer is genuinely needed to build the next question's state or
options.

## Status

**Planning.** Nothing runs yet. [PLAN.md](PLAN.md) is the working spec —
design law, semantics decisions, and the milestone ladder. First code lands
at M0 (a hand-built API spike).

| Milestone | What |
| --- | --- |
| M0 | spike: one request, four mixed questions |
| M1 | evaluator: parser + interpreter, one request per judgment |
| M2 | fusion + cache — the thesis under test |
| M3 | policy stdlib (gates, composites, escalate) |
| M4 | example programs; port the `typesafe_test` car driver |
| M5 | record/replay tests, cost harness |

## Provenance

- [TypeSafe docs](https://docs.typesafe.ai/llms.txt) — the source of truth
  for primitives, state, and API contracts.
- `../typesafe_test/` — sibling project; Jev already drives a car there
  through Noul pedals and a Score steering servo. Its zero-dep proxy
  pattern (API key stays server-side) is the deployment model here.
- TypeScript throughout, per the house stack.
