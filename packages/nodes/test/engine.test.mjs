// Deterministic engine regression tests — no DB/Redis/network/keys required.
// Run: node test/engine.test.mjs  (after `tsc` builds dist/)
// Exercises the orchestration-critical surface: registry completeness, graph
// validation (the trigger choke point), mock-mode node execution, the grounding
// nodes, and the SSRF guard. Exits non-zero on any failure → CI gate.

import { nodeRegistry, validateGraph } from "../dist/index.js";

let pass = 0, fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name}`); }
};
const ctx = (inputs) => ({ runId: "t", workflowId: "w", nodeId: "n", attempt: 1, inputs, env: {} });

console.log("registry");
const expected = [
  "text.run-any-llm", "image.compositor", "logic.qa-evaluator", "logic.grader",
  "memory.retriever", "memory.ingest", "tool.web-search", "safety.pii-guard", "safety.llama-guard",
];
for (const id of expected) ok(`has ${id}`, nodeRegistry.has(id));

console.log("graph-validator (trigger choke point)");
const valid = {
  nodes: [
    { id: "a", data: { kind: "text.run-any-llm", config: { prompt: "hi" } } }, // required 'prompt' via config
    { id: "b", data: { kind: "logic.grader" } },                               // required 'text' via edge
  ],
  edges: [{ source: "a", target: "b", targetInput: "text" }],
};
const vres = validateGraph(valid, nodeRegistry);
ok("valid DAG passes", vres.valid === true);
if (!vres.valid) console.error("    unexpected errors:", JSON.stringify(vres.errors));
const cyclic = { nodes: [{ id: "a", data: { kind: "text.run-any-llm" } }, { id: "b", data: { kind: "logic.grader" } }], edges: [{ source: "a", target: "b" }, { source: "b", target: "a" }] };
const cres = validateGraph(cyclic, nodeRegistry);
ok("cycle rejected", cres.valid === false && cres.errors.some((e) => e.type === "CYCLE_DETECTED"));
const unknown = { nodes: [{ id: "a", data: { kind: "does.not.exist" } }], edges: [] };
ok("unknown type rejected", validateGraph(unknown, nodeRegistry).valid === false);
const dup = { nodes: [{ id: "a", data: { kind: "text.run-any-llm" } }, { id: "a", data: { kind: "logic.grader" } }], edges: [] };
ok("duplicate id rejected", validateGraph(dup, nodeRegistry).valid === false);

await (async () => {
  console.log("node execution (mock mode, no keys)");
  const text = await nodeRegistry.get("text.run-any-llm").run(ctx({ prompt: "hi" }), { model: "meta/llama-3.1-8b-instruct" });
  ok("text node returns mock output", typeof text.text === "string" && text.text.includes("[MOCK]"));

  const ws = await nodeRegistry.get("tool.web-search").run(ctx({ query: "x" }), { provider: "mock", maxResults: 2 });
  ok("web-search mock returns results", Array.isArray(ws.results) && ws.results.length >= 1);

  const pii = await nodeRegistry.get("safety.pii-guard").run(ctx({ text: "mail bob@acme.com" }), { action: "mask" });
  ok("pii-guard masks email", pii.text.includes("[REDACTED:email]") && pii.clean === false);

  const ing = await nodeRegistry.get("memory.ingest").run(ctx({ source: "Para one.\n\nPara two." }), { mode: "text", chunkSize: 100 });
  ok("doc-ingest produces corpus", Array.isArray(ing.corpus) && ing.corpus.length >= 1);

  let blocked = false;
  try { await nodeRegistry.get("memory.ingest").run(ctx({ source: "http://127.0.0.1/x" }), { mode: "url" }); }
  catch (e) { blocked = /SSRF/.test(e.message); }
  ok("doc-ingest SSRF guard blocks loopback", blocked);
})();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
