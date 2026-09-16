# Jevscript — a programming language with Jev

*A plan, not a spec. Syntax below is provisional; the semantics decisions are
the content.*

**Naming.** **Jevscript** is the language: JS-ish surface, judgment as a
runtime primitive. **Hocket** is the engine that runs it — parser,
tree-walking interpreter, and the fusion/cache passes (§3). A hocket is a
single line of music split between voices; Jevscript writes the notes,
Hocket keeps the line continuous while Jev strikes the judgment notes.
(The directory is still `typesafe_lang/`; renaming is the keeper's call.)

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
| batching, caching, retries, fallbacks | — |
| actions, side effects, escalation | — |

Corollary: every Jev touchpoint in the language must be a bounded question
with defined possible answers. If a construct can be evaluated without
semantics, it's code and stays code.

## 2. The three primitives as first-class expressions

The three TypeSafe question types become expression forms with typed results:

- `noul` → `Prob` (a probability; no separate confidence)
- `choice` → `Choice<K>` (selected option, full distribution, confidence)
- `score` → `Scored<L>` (level value, distribution, confidence)

Every answer is a value carrying its full object, so probability and
confidence are both addressable (`u.p`, `k.selected`, `k.confidence`).
Policy is never implicit: `when u.p > 0.6` is where the number lives —
visible, diffable, testable.

## 3. Hocket's core: automatic composition

This is what makes Hocket an engine and not a wrapper around the SDK.

- **Fusion pass.** Independent judgments sharing a state are batched into
  one request automatically. Dataflow analysis over judgment expressions
  proves independence the way loop-fusion proves safety. Docs: questions in
  one request are independent; batching 13 questions was 11.5× cheaper and
  9.6× faster. The author thinks in judgments; the compiler thinks in
  requests.
- **Dependency splitting.** When a later judgment genuinely needs an earlier
  answer — to fetch evidence, build new state, or pick options — the
  language makes the stage boundary explicit. Two requests are the
  exception; the compiler refuses to fuse across a real dependency and
  refuses to split without one.
- **State-identity caching.** Judgments keyed by (question identity,
  state hash). Rerun only when state changes; changing a threshold or a
  display filter re-executes nothing.
- **Speculative form.** Syntax for "ask now, possibly ignore" — fan-out
  made explicit. Asking a question you may not need is close to free; the
  language should make that the lazy path.
- **Budget as a constant.** ~32k-token shared budget (state + questions) is
  compiler-visible; fusion respects it and reports against it.

## 4. Jevscript sketch (provisional)

```text
program Triage:

  state ticket = {
    subject: input.subject,
    body: input.body,
    tier: account.tier,
  }

  ask once:
    kind        = choice ["bug","billing","feature","other"]
                  by "What is the main request in `ticket.body`?"
    urgent      = noul "The message conveys urgency or time-sensitivity"
    angry       = score ["calm","frustrated","furious"]
                  by "How frustrated does `ticket.body` read?"

  stage after kind:            # real dependency: options need the answer
    ask once:
      severity  = choice (severity_menu[kind.selected])
                    by "How severe is this report?"

  when urgent.p > 0.6 and ticket.tier == "enterprise":
    page "oncall"
  when kind.selected == "bug" and severity.confidence < 0.4:
    escalate "triage-human"
  else:
    route kind.selected
```

Three judgments, one fused request; a second request only because severity's
*options* depend on kind. Thresholds read like code because they are code.

## 5. Decisions to settle

- **Where criteria live.** Inline strings vs. named, reusable question
  declarations. Named questions are the unit of versioning and reuse; inline
  wins for one-offs. Probably both, like literals vs. consts.
- **State construction.** How program values flow into the state payload;
  named JSON fields by default (docs' guidance), string state for one-liners.
- **Failure semantics.** An API error is not a probability. Errors and
  answers are distinct channels; retry/fallback is ordinary code. Never
  conflate "model unsure" with "call failed."
- **Confidence policy.** Low confidence must be handleable, not forcibly
  handled — no ceremony tax. Stdlib makes gating one line; a linter warns
  when confidence is fetched and ignored on an action path.
- **Determinism.** Record/replay fixtures for tests; an offline mode where
  judgments load from a recorded file. CI costs nothing.
- **Syntax host.** Settled by the name: Jevscript is JS-ish, and the
  keeper's stack is TS. s-expressions remain available as an internal AST
  serialization if the parser wants to be lazy about it.

## 6. Hocket — implementation stages

Stack: TypeScript, tree-walking interpreter, zero-dep Node server proxying
the TypeSafe API with the key server-side (pattern proven in
`typesafe_test/server.js`). Hocket ships as the `hocket` command: it runs
`.jev` programs.

- **M0 — spike.** One hand-built request, four mixed questions, one state.
  Confirm answer shapes, token cost, latency. (Half done already by
  typesafe_test.)
- **M1 — evaluator.** Parser + interpreter, three primitives, one request
  per judgment, no cleverness. Correctness first.
- **M2 — fusion + cache.** The batching pass and state-hash cache. Measure
  request count and token cost before/after on the example programs; this is
  the thesis being tested.
- **M3 — stdlib policy.** Gates, weighted composites, no-match arms,
  escalate — library, not syntax.
- **M4 — example programs.** (a) ticket triage, (b) moderation gate,
  (c) port the typesafe_test driver — prove the language subsumes the car
  game at lower cost.
- **M5 — tests.** Record/replay fixtures, cost harness, deterministic tests
  for code-only paths.

## 7. What it is not

Not generation. Not chat. Not an agent loop. If a program needs generated
text, that's an FFI to a generative model — deliberately outside the core,
because the core claim is that composition + judgment suffices.

## 8. Success criteria

- A program's judgments fuse to near-minimal request count without the
  author thinking about requests.
- Thresholds, weights, and gates read off the source like any other code.
- Record/replay makes CI free and deterministic.
- The car game, rewritten in Jevscript, behaves the same at measurably
  lower cost than its per-question calls.
