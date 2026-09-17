# Jevscript — a programming language with Jev

*A plan, not a spec. Syntax below is provisional; the semantics decisions are
the content. Revised 2026-09-16 after design review + the M0 spike; revision
notes at the end.*

**Naming.** **Jevscript** is the language: JS-ish surface, judgment as a
runtime primitive. **Hocket** is the engine that runs it — parser,
tree-walking interpreter, and the coalescing/memo machinery (§3). A hocket is
a single line of music split between voices; Jevscript writes the notes,
Hocket keeps the line continuous while Jev strikes the judgment notes.

## 0. What the phrase can honestly mean

Jev selects, scores, and judges yes/no. It never generates. So "writing a
programming language with Jev" has one honest reading:

> **A language where judgment is a runtime primitive.** The human writes the
> program; the program's semantics include asking Jev narrow, typed questions
> at execution time. Jev is not the programmer. Jev is an operator — like
> `+`, but for meaning.

Two other readings, named to be dismissed:

- *Jev writes the code.* Wrong tool; System One models don't generate.
- *Natural language is the source, Jev is the compiler.* That's intent
  routing — a front end, not a language. Possible later, as a front end that
  compiles **into** this language. Not v1.

## 1. Design law: division of labor

Everything compositional is code. Only single semantic judgments are Jev's.

| Code owns | Jev owns |
| --- | --- |
| parsing, binding, control flow | does this condition hold (Noul) |
| arithmetic, lookup, exact matching | which of these (Choice) |
| thresholds, weights, gates | to what degree (Score) |
| fallbacks, business retries | — |
| actions, side effects, escalation | — |

Transport — HTTP, bounded backoff on 429/529/5xx/network — is the engine's
(§3); it is plumbing, not policy. Fallback *policy* stays code.

Corollary: every Jev touchpoint in the language must be a bounded question
with defined possible answers. If a construct can be evaluated without
semantics, it's code and stays code.

## 2. The three primitives as first-class expressions

The three TypeSafe question types are expression forms with typed results:

- `noul "…"` → `Prob` — `.p`, plus `.judged` (the state hash it answered for)
- `choice {…} by "…"` → `Choice<K>` — `.selected`, `.probabilities`,
  `.confidence`, `.judged`
- `score [levels] by "…"` → `Scored<L>` — `.value` (0..L−1, may land between
  levels), `.probabilities`, `.confidence`, `.judged`

**Rubrics first.** The map form (`{bug: "A defect or outage…"}`) is the
default; the array form (`["bug","billing",…]`) is for labels whose meaning is
self-evident. Criteria are the quality lever — the model answers only as well
as the options describe themselves, and it resists rubrics that claim things
the state doesn't support. `legend` is not part of the value (criteria live in
source); it stays in records.

Policy is never implicit: `when u.p > 0.6` is where the number lives —
visible, diffable, testable.

## 3. Hocket's core: runtime coalescing

Not a compile-time pass. Independence needs no proof — the API evaluates every
question in a request independently, so the only facts that matter are runtime
facts: which questions are *constructed*, and which *state* they share. The
mechanism is lazy evaluation with request coalescing (the Haxl pattern):

- **Judgments are lazy.** Evaluating a judgment expression constructs a
  (state, question) pair; nothing is sent.
- **Forcing flushes.** When an answer is first read, the evaluator sends one
  request per distinct state among all pending pairs — minus memo hits, minus
  duplicates already in flight — then resumes.
- **Dependencies are data dependencies.** A question that needs an earlier
  answer (to build its options, fetch evidence, choose its state) simply is
  not constructible until that answer is forced. There is no `stage` syntax:
  forcing points *are* the stage boundaries, and they arise only where a real
  dependency exists. Two requests remain the exception.
- **`ask:` blocks are speculation sugar.** An `ask:` block forces every
  judgment in it, read or not — fan-out made explicit. Bare expressions ask
  only when read.
- **Memoization is the semantics, not an optimization.** Keyed on question
  identity — hash of type + instructions + criteria, dynamic options included
  — plus a canonical hash of the state (sorted keys, defined float
  formatting). "Asked once" means once per (question, state): a ticket asks
  once, a game frame asks once per frame, because the state hash differs.
  Consequence: an answer is never silently applied to changed state — changed
  state is a different key. Hence `.judged` on every value, for code that
  wants to check.
- **Budget can split.** If one state group exceeds the shared ~32k-token
  budget (state + questions together), it splits; the state is re-paid per
  chunk and the split is reported. Budget overflow is the one legitimate
  split without a data dependency.
- **Errors are request-scoped.** One failed request fails every judgment in
  that flush — the API is all-or-nothing per call. After the engine's bounded
  transport retry, terminal errors reach the language as ordinary errors
  carrying status and body. An API error is not a probability, never a
  confidence; the channels stay distinct.

## 4. Jevscript sketch (provisional)

```text
program Triage:

  state ticket = {
    subject: input.subject,
    body:    input.body,
    tier:    account.tier,
  }

  ask:                                   # force-all: one flush, four questions
    kind   = choice {bug:     "A defect or outage in our product is reported",
                     billing: "Charges, invoices, refunds, payment processing",
                     feature: "Asks for new capability or changed behavior",
                     other:   "None of the above"}
                    by "What is the main request in `ticket.body`?"
    urgent = noul "The message in `ticket.body` conveys urgency or time-sensitivity"
    angry  = score ["Calm; states facts without complaint",
                    "Frustrated but civil; complaints, repeated contact",
                    "Furious; strong language, threats, or abuse"]
                    by "How frustrated does `ticket.body` read?"
    repro  = noul "Does `ticket.body` give steps, error text, or times an
                   engineer could use to investigate?"
                                         # speculative: flushed, maybe unused

  sev = choice (severity_menu[kind.selected])   # forcing kind is the real
              by "How severe is this report?"    # dependency → second flush

  when urgent.p > 0.6 and ticket.tier == "enterprise":
    page "oncall"
  when kind.selected == "bug" and sev.confidence < 0.4:
    escalate "triage-human"
  else:
    route kind.selected
```

Flush 1: four judgments over `ticket` (three read, one speculative). Flush 2:
`sev` alone, because its options could not exist before `kind` answered.
No stage keyword produced that split — ordinary dataflow did.

## 5. Settled / open

**Settled by review + M0 (2026-09-16):**

- Judgments are expressions; `ask:` blocks are force-all sugar (§3). This is
  the language shape, not one option among two.
- Answers memoize on (question identity, canonical state hash); `.judged` on
  every value. Freshness is structural, not advisory.
- Coalescing is runtime grouping by state — not a static independence proof.
  Memo hits and in-flight duplicates shrink flushes at runtime.
- Budget overflow splits; the split is reported.
- Engine owns transport retry (bounded, 429/529/5xx/network); terminal errors
  are request-scored and code-visible; fallback policy is stdlib.
- Criteria: both inline and named questions, like literals vs consts; named
  questions are the unit of versioning and reuse.
- State: author-declared named objects. The author's state granularity *is*
  the cache granularity; the engine never slices state on its own.
- Fixture format freezes at M1. Records pin the served model (`jev-1.13.0`
  under `jev-latest`); replay refuses a mismatched model.

**Still open:**

- Exact surface grammar (`by` placement, operator forms, named-question
  declarations).
- Concurrent phases: how a running loop reads only completed answers without
  blocking (the car-game pattern). v1 may run phases to completion first.
- Whether `Choice.probabilities` reads as a map value or `.p(option)`.

## 6. Hocket — implementation stages

Stack: TypeScript, tree-walking interpreter, zero-dep Node server proxying
the TypeSafe API with the key server-side (pattern proven in
`typesafe_test/server.js`). Hocket ships as the `hocket` command: it runs
`.jev` programs.

- **M0 — spike. Done.** `spike/m0.mjs`: one hand-built request, four mixed
  questions; contract confirmed (four PASS checks), baseline recorded —
  batching 2.7× on input tokens at this ~230-char state, sequential wall
  1.7×; records in `spike/m0-record.json`.
- **M1 — evaluator.** Parser + interpreter, three expression forms, lazy
  judgments with flush-on-force, memoization from day one (it is the
  semantics), request-scoped errors, engine transport retry, blocking phases
  only. Record/replay is native from here — every live run writes a fixture,
  and the fixture format freezes at this milestone.
- **M2 — coalescing + cache.** Group-by-state flushes, in-flight dedup,
  budget splits. Measure request count against the forcing-point minimum and
  tokens against the per-question baseline, on the example programs. Still
  the thesis under test.
- **M3 — policy stdlib.** Gates, weighted composites, no-match arms,
  escalate, fallback wrappers — library, not syntax.
- **M4 — example programs.** (a) ticket triage, (b) moderation gate,
  (c) the `typesafe_test` car driver — which forces the concurrency question
  if it is still open.
- **M5 — audit.** Determinism suite (replay against the pinned served
  model), cost harness, concurrency semantics if deferred.

## 7. What it is not

Not generation. Not chat. Not an agent loop. If a program needs generated
text, that's an FFI to a generative model — deliberately outside the core,
because the core claim is that composition + judgment suffices.

## 8. Success criteria

- A program's judgments coalesce to near the forcing-point minimum in request
  count, without the author thinking about requests.
- Thresholds, weights, and gates read off the source like any other code.
- Record/replay makes CI free and deterministic, pinned to the served model.
- The car game, rewritten in Jevscript, behaves the same at no higher cost
  than the hand-batched incumbent (~1 request/frame, ~1.1k tokens). Against a
  naive per-question port the cost drops ~4× on input tokens — that
  comparison is the demo, not the incumbent.

## Revision notes (2026-09-16)

Design review findings, folded: expression-vs-block settled (expressions +
`ask:` sugar); freshness settled structurally (memo on state hash, `.judged`);
fusion restated as runtime coalescing (Haxl pattern) — stage syntax deleted,
splits now arise only from real dependencies or budget; budget splits
admitted and reported; memo key defined precisely (type + instructions +
criteria + canonical state hash); `ask once` renamed to plain `ask:` with
memoization as documented semantics; failure granularity made per-request
with engine-owned transport retry; car-game criterion de-overclaimed (the
incumbent already batches); `legend` dropped from values; rubric maps made
the default form; the batching multiplier stated as state-size-dependent
(2.7× measured at ~230 chars, ~12× document-dominated per the cookbook)
instead of a single borrowed number; fixtures pin the served model and the
format freezes at M1.
