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
  coalescing machinery: lazy judgments flushed as one request per shared
  state, data dependencies becoming stage boundaries on their own, and
  answers memoized on (question identity, state hash). A hocket is one line
  of music split between voices; Jevscript writes the notes, Hocket keeps
  the line continuous.

## The idea

Everything compositional — control flow, arithmetic, thresholds, retries —
is code. Only single semantic judgments go to the model:

```text
ask:
  kind   = choice ["bug","billing","feature","other"]
            by "What is the main request in `ticket.body`?"
  urgent = noul "The message conveys urgency or time-sensitivity"

when urgent.p > 0.6 and ticket.tier == "enterprise":
  page "oncall"
```

The two judgments above run as **one** API request. The author thinks in
judgments; Hocket thinks in requests — coalescing everything constructed
over the same state and splitting only where a question genuinely cannot be
built until an earlier one answers. The win scales with state size: ~2.7×
on input tokens at a ~230-char state (measured, M0), ~12× on
document-dominated workloads (TypeSafe cookbook).

## Status

**M0 done** (2026-09-16). [PLAN.md](PLAN.md) is the working spec — design
law, semantics decisions, and the milestone ladder — revised after design
review. The spike (`spike/m0.mjs`) confirmed the answer contract and
measured the batching baseline; records in `spike/m0-record.json`.

| Milestone | What |
| --- | --- |
| M0 | done — spike: contract confirmed, baseline recorded |
| M1 | evaluator: parser + interpreter, lazy judgments, memo from day one |
| M2 | coalescing + cache — the thesis under test |
| M3 | policy stdlib (gates, composites, escalate) |
| M4 | example programs; port the `typesafe_test` car driver |
| M5 | determinism suite, cost harness |

## Provenance

- [TypeSafe docs](https://docs.typesafe.ai/llms.txt) — the source of truth
  for primitives, state, and API contracts.
- `../typesafe_test/` — sibling project; Jev already drives a car there
  through Noul pedals and a Score steering servo. Its zero-dep proxy
  pattern (API key stays server-side) is the deployment model here.
- TypeScript throughout, per the house stack.
