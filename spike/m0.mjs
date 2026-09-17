// spike/m0.mjs — Jevscript M0: one hand-built request, four mixed questions,
// one structured state. Confirms the answer contract, token cost, and latency;
// records the un-batched (one question per request) baseline that M2's fusion
// pass has to beat.
//
// Question set is PLAN §4's first stage: kind/urgent/angry, plus `has_repro`
// asked speculatively (useful mainly on the bug branch) — the fan-out pattern
// the language will automate.
//
// Run: TYPESAFE_API_KEY=... node spike/m0.mjs
// Writes spike/m0-record.json (the seed record/replay fixture for M5).

import { writeFileSync } from "node:fs";

const API_URL = "https://api.typesafe.ai/v1/systemone";
const MODEL = "jev-latest";
const KEY = process.env.TYPESAFE_API_KEY;
if (!KEY) {
  console.error("Set TYPESAFE_API_KEY in the environment.");
  process.exit(1);
}

// --- state: named JSON fields, per docs' state guidance --------------------

const state = {
  ticket: {
    subject: "Payouts failing since this morning",
    body:
      "Our API integration started returning 500 errors on every payout call " +
      "around 9am and nothing has gone through since. We have customers " +
      "waiting on transfers. This is the third ticket we've opened about " +
      "payouts this month and frankly it's getting ridiculous.",
  },
  account: { tier: "enterprise" },
};

// --- four mixed questions, PLAN §4 labels preserved ------------------------

const questions = {
  kind: {
    type: "choice",
    instructions: "What is the main request in `ticket.body`?",
    criteria: {
      bug: "A defect or outage in our product is reported or implied.",
      billing: "About charges, invoices, refunds, or our payment processing.",
      feature: "Asks for new capability or a change in behavior.",
      other: "None of the above.",
    },
  },
  urgent: {
    type: "noul",
    instructions: "The message in `ticket.body` conveys urgency or time-sensitivity.",
    criteria: {
      true: "Time pressure, ongoing harm, or a deadline is explicit.",
      false: "No urgency expressed; the matter can wait days.",
    },
  },
  angry: {
    type: "score",
    instructions: "How frustrated does `ticket.body` read?",
    criteria: [
      "Calm and neutral; states facts without complaint.",
      "Frustrated but civil; complaints or repeated contact, no strong language.",
      "Furious; strong language, threats to leave, or abuse.",
    ],
  },
  has_repro: {
    // Speculative: consumed only if kind selects "bug". Asked anyway —
    // same state, independent question, near-free marginal tokens.
    type: "noul",
    instructions:
      "Does `ticket.body` include concrete steps, error text, times, or " +
      "details an engineer could use to reproduce or investigate the problem?",
  },
};

// --- transport --------------------------------------------------------------

async function ask(qs, label) {
  const body = JSON.stringify({ state, model: MODEL, questions: qs });
  const t0 = performance.now();
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body,
  });
  const json = await res.json().catch(() => ({}));
  const ms = Math.round(performance.now() - t0);
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status} ${JSON.stringify(json)}`);
  return { label, ms, request: JSON.parse(body), response: json };
}

const sum = (obj) => Object.values(obj).reduce((a, b) => a + b, 0);
const near = (x, n = 1e-6) => Math.abs(x - 1) < n;
const fmt = (n) => (Math.round(n * 1000) / 1000).toString();

// --- run: batched once, then one-question-per-request for the baseline ------

const batched = await ask(questions, "batched");
const singles = [];
for (const id of Object.keys(questions)) {
  singles.push(await ask({ [id]: questions[id] }, `single:${id}`));
}

// --- report -----------------------------------------------------------------

console.log(`model: ${batched.response.model}\n`);
console.log("batched answers (contract check):");
const checks = [];
for (const [id, a] of Object.entries(batched.response.answers)) {
  const shape = Object.keys(a).join(", ");
  let line = `  ${id.padEnd(9)} {${shape}}`;
  if (a.type === "noul") line += `  noul=${fmt(a.noul)}`;
  if (a.type === "choice") {
    line += `  choice=${a.choice} confidence=${fmt(a.confidence)} p(sum)=${fmt(sum(a.probabilities))}`;
    checks.push([`${id}: probabilities sum to 1`, near(sum(a.probabilities), 1e-3)]);
    checks.push([`${id}: choice ∈ criteria`, a.choice in questions[id].criteria]);
  }
  if (a.type === "score") {
    line += `  score=${fmt(a.score)} confidence=${fmt(a.confidence)} p(sum)=${fmt(sum(a.probabilities))}`;
    checks.push([`${id}: probabilities sum to 1`, near(sum(a.probabilities), 1e-3)]);
    checks.push([
      `${id}: legend matches criteria order`,
      Object.keys(a.legend).length === questions[id].criteria.length &&
        Object.entries(a.legend).every(([i, d]) => d === questions[id].criteria[+i]),
    ]);
  }
  console.log(line);
}
console.log("\ncontract checks:");
for (const [name, ok] of checks) console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`);

console.log("\nlatency / tokens:");
const rows = [batched, ...singles];
for (const r of rows) {
  const u = r.response.usage;
  console.log(
    `  ${r.label.padEnd(16)} ${String(r.ms).padStart(5)} ms   in=${String(u.input_tokens).padStart(6)}  out=${String(u.output_tokens).padStart(5)}`
  );
}
const b = batched.response.usage;
const sIn = singles.reduce((a, r) => a + r.response.usage.input_tokens, 0);
const sOut = singles.reduce((a, r) => a + r.response.usage.output_tokens, 0);
const sMs = singles.reduce((a, r) => a + r.ms, 0);
console.log("\nbatched vs 4 singles:");
console.log(`  input tokens  ${b.input_tokens}  vs  ${sIn}   (${(sIn / b.input_tokens).toFixed(1)}x)`);
console.log(`  output tokens ${b.output_tokens}  vs  ${sOut}   (${(sOut / b.output_tokens).toFixed(1)}x)`);
console.log(`  wall time     ${batched.ms} ms  vs  ${sMs} ms   (${(sMs / batched.ms).toFixed(1)}x)`);

// --- record -----------------------------------------------------------------

writeFileSync(
  new URL("./m0-record.json", import.meta.url),
  JSON.stringify(
    { recorded_at: new Date().toISOString(), model: MODEL, state, questions, batched, singles },
    null,
    2
  )
);
console.log("\nrecorded: spike/m0-record.json");
