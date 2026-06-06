// Scripted run simulation that demonstrates the QA self-correction loop.
// Returns a function to drive a state setter through a timed sequence.

import type { Edge, Node } from "reactflow";
import type { CortexaNodeData, RunAttempt } from "./types";

export interface LogEntry {
  id: string;
  ts: number;
  nodeId: string;
  nodeLabel: string;
  status: "started" | "retry" | "failed" | "QA_FAILED" | "success";
  message: string;
}

type FlowNode = Node<CortexaNodeData>;
type SetNodes = (updater: (n: FlowNode[]) => FlowNode[]) => void;
type SetEdges = (updater: (e: Edge[]) => Edge[]) => void;
type AddLog   = (entry: Omit<LogEntry, "id" | "ts">) => void;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function patchNode(setNodes: SetNodes, id: string, patch: (d: CortexaNodeData) => CortexaNodeData) {
  setNodes((nodes) =>
    nodes.map((n) => (n.id === id ? { ...n, data: patch(n.data) } : n))
  );
}

function setEdgeClass(setEdges: SetEdges, id: string, className: string) {
  setEdges((edges) => edges.map((e) => (e.id === id ? { ...e, className, animated: className === "edge-flowing" } : e)));
}

function setStatus(setNodes: SetNodes, id: string, status: CortexaNodeData["status"]) {
  patchNode(setNodes, id, (d) => {
    const attempts = [...d.attempts];
    attempts[attempts.length - 1] = { ...attempts[attempts.length - 1], status };
    return { ...d, status, attempts };
  });
}

function completeAttempt(setNodes: SetNodes, id: string, payload: Partial<RunAttempt>) {
  patchNode(setNodes, id, (d) => {
    const attempts = [...d.attempts];
    attempts[attempts.length - 1] = {
      ...attempts[attempts.length - 1],
      status: "completed",
      ...payload,
    };
    return { ...d, status: "completed", attempts };
  });
}

function failAttempt(setNodes: SetNodes, id: string, payload: Partial<RunAttempt>) {
  patchNode(setNodes, id, (d) => {
    const attempts = [...d.attempts];
    attempts[attempts.length - 1] = {
      ...attempts[attempts.length - 1],
      status: "failed",
      ...payload,
    };
    return { ...d, status: "failed", attempts };
  });
}

function startNewAttempt(setNodes: SetNodes, id: string, qa_feedback: string[]) {
  patchNode(setNodes, id, (d) => {
    const next = d.currentAttempt + 1;
    return {
      ...d,
      status: "queued",
      currentAttempt: next,
      attempts: [...d.attempts, { attempt: next, status: "queued", qa_feedback }],
    };
  });
}

export async function runScriptedSimulation(opts: {
  setNodes: SetNodes;
  setEdges: SetEdges;
  addLog: AddLog;
  resetEdges: () => void;
}) {
  const { setNodes, setEdges, addLog, resetEdges } = opts;
  resetEdges();

  // 1) Orchestrator
  setStatus(setNodes, "n-orch", "running");
  addLog({ nodeId: "n-orch", nodeLabel: "Campaign Orchestrator", status: "started", message: "Node initialized." });
  await wait(900);
  completeAttempt(setNodes, "n-orch", {
    output: { type: "text", value: "Plan: parallel branches → headline + visual → global eval." },
    explanation: "Selected a fan-out plan because text and image have no mutual dependency.",
    confidence: 0.94,
    usedMemory: true,
  });
  addLog({ nodeId: "n-orch", nodeLabel: "Campaign Orchestrator", status: "success", message: "Output validated and stored." });

  // Fan-out edges flowing
  setEdgeClass(setEdges, "e1", "edge-flowing");
  setEdgeClass(setEdges, "e2", "edge-flowing");
  await wait(500);

  // 2) Headline + Image start in parallel
  setStatus(setNodes, "n-text", "running");
  setStatus(setNodes, "n-img", "running");
  addLog({ nodeId: "n-text", nodeLabel: "Headline Generator", status: "started", message: "Node initialized." });
  addLog({ nodeId: "n-img",  nodeLabel: "Hero Visual",        status: "started", message: "Node initialized." });
  await wait(1400);

  // Headline finishes (weak — will fail QA)
  completeAttempt(setNodes, "n-text", {
    output: { type: "text", value: "Welcome to the future of AI orchestration." },
    explanation: "Generated a generic launch headline emphasizing futurism.",
    confidence: 0.62,
    usedMemory: true,
  });
  addLog({ nodeId: "n-text", nodeLabel: "Headline Generator", status: "success", message: "Output validated and stored." });

  // Image finishes fine
  completeAttempt(setNodes, "n-img", {
    output: { type: "image", value: "hero-cyber-industrial-v1" },
    explanation: "Composed a wide-angle scene with cyan rim-light and purple haze.",
    confidence: 0.91,
    usedMemory: false,
  });
  addLog({ nodeId: "n-img", nodeLabel: "Hero Visual", status: "success", message: "Output validated and stored." });

  // Edge to QA flows
  setEdgeClass(setEdges, "e3", "edge-flowing");
  await wait(500);

  // 3) QA evaluates → fails
  setStatus(setNodes, "n-qa", "running");
  addLog({ nodeId: "n-qa", nodeLabel: "Brand QA", status: "started", message: "Node initialized." });
  await wait(1200);
  failAttempt(setNodes, "n-qa", {
    explanation: "Headline scored 0.42 against brand voice (threshold 0.80). Triggering self-correction.",
    confidence: 0.42,
  });
  addLog({ nodeId: "n-qa", nodeLabel: "Brand QA", status: "QA_FAILED", message: "QA Threshold not met. Initiating backward self-correction." });

  // 4) Backward red arrow → reset parent text node to queued (Attempt 2)
  setEdgeClass(setEdges, "e3", "edge-failed");
  await wait(900);

  const feedback = [
    "Avoid generic phrases like 'future of AI'.",
    "Lead with concrete enterprise outcome.",
    "Match confident, technical brand voice.",
  ];
  startNewAttempt(setNodes, "n-text", feedback);
  // Reset QA back to queued for re-evaluation
  patchNode(setNodes, "n-qa", (d) => ({ ...d, status: "queued" }));
  addLog({ nodeId: "n-text", nodeLabel: "Headline Generator", status: "retry", message: "Local retry triggered (Attempt 2)." });
  await wait(700);

  // 5) Re-run text — succeeds
  setEdgeClass(setEdges, "e3", "edge-flowing");
  setStatus(setNodes, "n-text", "running");
  await wait(1400);
  completeAttempt(setNodes, "n-text", {
    output: { type: "text", value: "Ship agentic workflows your enterprise can actually trust." },
    explanation: "Rewrote headline using QA feedback: concrete outcome, confident tone, no clichés.",
    confidence: 0.93,
    usedMemory: true,
  });
  addLog({ nodeId: "n-text", nodeLabel: "Headline Generator", status: "success", message: "Output validated and stored." });
  await wait(400);

  // 6) Re-run QA — passes
  setStatus(setNodes, "n-qa", "running");
  addLog({ nodeId: "n-qa", nodeLabel: "Brand QA", status: "started", message: "Re-evaluating attempt 2." });
  await wait(1100);
  patchNode(setNodes, "n-qa", (d) => {
    const attempts = [...d.attempts];
    attempts[attempts.length - 1] = {
      ...attempts[attempts.length - 1],
      status: "completed",
      explanation: "Headline scored 0.93 — passes brand voice threshold.",
      confidence: 0.93,
    };
    return { ...d, status: "completed", attempts };
  });
  addLog({ nodeId: "n-qa", nodeLabel: "Brand QA", status: "success", message: "Output validated and stored." });

  // 7) Global evaluator
  setEdgeClass(setEdges, "e4", "edge-flowing");
  setEdgeClass(setEdges, "e5", "edge-flowing");
  await wait(600);
  setStatus(setNodes, "n-global", "running");
  addLog({ nodeId: "n-global", nodeLabel: "Global Evaluator", status: "started", message: "Node initialized." });
  await wait(1300);
  completeAttempt(setNodes, "n-global", {
    output: { type: "text", value: "Campaign approved for release." },
    explanation: "Headline + visual cohere on tone, palette, and audience signal.",
    confidence: 0.96,
    usedMemory: true,
  });
  addLog({ nodeId: "n-global", nodeLabel: "Global Evaluator", status: "success", message: "Output validated and stored." });
}
