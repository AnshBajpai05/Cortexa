#!/usr/bin/env node
// Cortexa Evaluation Harness — Phase 2 proof.
//
// Runs golden suites (eval/golden/*.json) against a live API, scores them, and
// prints + persists a scorecard. Turns "designed for" into "verified on".
//
//   node eval/runner.mjs                      # all suites, default API
//   node eval/runner.mjs --suite research     # one suite
//   API_BASE=http://localhost:3001/api CORTEXA_API_KEY=... node eval/runner.mjs
//
// Two assertion classes:
//   structural — pipeline produced an output (works even in MOCK mode; proves
//                the orchestration path end-to-end without keys)
//   content    — output meets quality checks (minLength/hasCTA/hasCitation/...);
//                meaningful only with real NVIDIA keys. In MOCK mode these are
//                reported as "skipped (mock)", not failed.
//
// Output: console scorecard + eval/results/<timestamp>.json

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dir = dirname(fileURLToPath(import.meta.url));
const API_BASE = process.env.API_BASE || "http://localhost:3001/api";
const API_KEY = process.env.CORTEXA_API_KEY || "";
const args = process.argv.slice(2);
const onlySuite = args.includes("--suite") ? args[args.indexOf("--suite") + 1] : null;

// ── Assertion checkers ──────────────────────────────────────────────────────
const CTA = /\b(buy|shop|get|try|sign\s?up|learn more|order|discover|join|start|download|subscribe|grab|unlock|claim)\b/i;
const CITATION = /\[\d+\]|https?:\/\/\S+|\bsource\b/i;

function field(out, name) {
  if (out == null) return "";
  if (typeof out === "string") return out;
  return out[name] ?? out.text ?? out.value ?? (typeof out === "object" ? JSON.stringify(out) : String(out));
}

function runContentAssert(a, out) {
  const v = field(out, a.field);
  const s = typeof v === "string" ? v : JSON.stringify(v ?? "");
  switch (a.check) {
    case "minLength": return s.length >= a.value;
    case "hasCTA": return CTA.test(s);
    case "hasCitation": return CITATION.test(s);
    case "exists": return s.length > 0;
    case "slideCount": return Array.isArray(out?.slides) && out.slides.length >= a.value;
    default: return false;
  }
}

const headers = () => {
  const h = { "Content-Type": "application/json" };
  if (API_KEY) h["x-api-key"] = API_KEY;
  return h;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const POLL_TIMEOUT_MS = Number(process.env.EVAL_TIMEOUT_MS || 180_000);

// ── Build+run pipeline (async), poll to completion, read terminal output ─────
async function runPrompt(prompt) {
  const t0 = Date.now();
  try {
    // 1. Dispatch: agent gateway builds the DAG + triggers (returns workflowId)
    const res = await fetch(`${API_BASE}/agent/run`, {
      method: "POST", headers: headers(), body: JSON.stringify({ prompt }),
    });
    if (!res.ok) return { ok: false, ms: Date.now() - t0, error: `dispatch HTTP ${res.status}` };
    const dispatch = await res.json();
    if (dispatch?.error) return { ok: false, ms: Date.now() - t0, error: dispatch.error };
    const wfId = dispatch.workflowId;
    const nodeOrder = dispatch.pipeline?.nodes ?? [];
    if (!wfId) return { ok: false, ms: Date.now() - t0, error: "no workflowId" };

    // 2. Poll status until finished (or timeout)
    let status;
    while (Date.now() - t0 < POLL_TIMEOUT_MS) {
      const sres = await fetch(`${API_BASE}/runs/status/${wfId}`, { headers: headers() });
      if (sres.ok) { status = await sres.json(); if (status.isFinished) break; }
      await sleep(2000);
    }
    const ms = Date.now() - t0;
    if (!status) return { ok: false, ms, error: "no status" };
    if (!status.isFinished) return { ok: false, ms, error: "timeout" };

    // 3. Terminal output = last pipeline node's completed run (fallback: any completed)
    const terminalId = nodeOrder[nodeOrder.length - 1];
    const completed = status.runs.filter((r) => r.status === "completed");
    const terminal =
      completed.find((r) => r.nodeId === terminalId) ||
      completed[completed.length - 1];

    // 4. Retry recovery: a node that failed an attempt then completed on attempt>1
    const recovered = status.runs.some((r) => r.status === "completed" && r.attempt > 1);
    const anyFailed = status.failed > 0;

    return {
      ok: !!terminal && !anyFailed,
      ms,
      output: terminal?.outputs ?? null,
      recovered,
      counts: { total: status.total, completed: status.completed, failed: status.failed },
    };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, error: e.message };
  }
}

function isMock(output) {
  const s = field(output, "text");
  return typeof s === "string" && s.includes("[MOCK]");
}

// ── Run a suite ─────────────────────────────────────────────────────────────
async function runSuite(suite) {
  console.log(`\n━━ ${suite.suite} (${suite.cases.length} cases) ━━`);
  const rows = [];
  for (const c of suite.cases) {
    const r = await runPrompt(c.prompt);
    let structural = r.ok;
    let contentPass = 0, contentTotal = 0, contentSkipped = false;

    if (r.ok) {
      const mock = isMock(r.output);
      for (const a of c.assert || []) {
        if (a.type === "content") {
          contentTotal++;
          if (mock) { contentSkipped = true; continue; }
          if (runContentAssert(a, r.output)) contentPass++;
        }
      }
    }
    const verdict = !structural ? "FAIL" : contentSkipped ? "STRUCT✓ (content mock-skipped)" : `${contentPass}/${contentTotal} content`;
    console.log(`  ${structural ? "✓" : "✗"} ${c.id.padEnd(8)} ${String(r.ms).padStart(6)}ms  ${verdict}${r.error ? "  ⟵ " + r.error : ""}`);
    rows.push({ id: c.id, structural, contentPass, contentTotal, contentSkipped, ms: r.ms, error: r.error ?? null });
  }
  return rows;
}

// ── Main ────────────────────────────────────────────────────────────────────
(async () => {
  const goldenDir = join(__dir, "golden");
  let files = readdirSync(goldenDir).filter((f) => f.endsWith(".json"));
  if (onlySuite) files = files.filter((f) => f.startsWith(onlySuite));

  console.log(`Cortexa Eval Harness · API=${API_BASE} · key=${API_KEY ? "set" : "none"}`);

  const all = {};
  for (const f of files) {
    const suite = JSON.parse(readFileSync(join(goldenDir, f), "utf8"));
    all[suite.suite] = await runSuite(suite);
  }

  // Scorecard
  console.log(`\n━━━━━━ SCORECARD ━━━━━━`);
  console.log(`suite       cases  struct%  content%  avg_ms`);
  const summary = {};
  for (const [name, rows] of Object.entries(all)) {
    const n = rows.length;
    const structPct = Math.round((rows.filter((r) => r.structural).length / n) * 100);
    const cTotal = rows.reduce((s, r) => s + r.contentTotal, 0);
    const cPass = rows.reduce((s, r) => s + r.contentPass, 0);
    const anyMock = rows.some((r) => r.contentSkipped);
    const contentPct = anyMock ? "mock" : cTotal ? Math.round((cPass / cTotal) * 100) + "%" : "n/a";
    const avgMs = Math.round(rows.reduce((s, r) => s + r.ms, 0) / n);
    console.log(`${name.padEnd(11)} ${String(n).padStart(5)}  ${String(structPct + "%").padStart(7)}  ${String(contentPct).padStart(8)}  ${String(avgMs).padStart(6)}`);
    summary[name] = { cases: n, structPct, contentPct, avgMs };
  }

  const resultsDir = join(__dir, "results");
  if (!existsSync(resultsDir)) mkdirSync(resultsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = join(resultsDir, `${stamp}.json`);
  writeFileSync(outPath, JSON.stringify({ api: API_BASE, mock: !API_KEY, summary, detail: all }, null, 2));
  console.log(`\nResults → ${outPath}`);
  console.log(API_KEY ? "" : "\nNote: MOCK mode (no key) — structural% is real proof of the orchestration path;\ncontent% requires live NVIDIA keys. Set keys + CORTEXA_API_KEY for quality numbers.");
})();
