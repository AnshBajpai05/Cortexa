import { NodeRegistry } from "./types";

// ─── Validation Types ─────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  type: "CYCLE_DETECTED" | "MISSING_REQUIRED_INPUT" | "UNKNOWN_NODE_TYPE" | "DUPLICATE_NODE_ID" | "EMPTY_GRAPH";
  nodeId: string;
  message: string;
}

interface DAGGraph {
  nodes: Array<{ id: string; data: { kind?: string; nodeType?: string; config?: any; [key: string]: any } }>;
  edges: Array<{ source: string; target: string; targetInput?: string; sourceHandle?: string; [key: string]: any }>;
}

// ─── Graph Validator ──────────────────────────────────────────────────────────
// Pre-flight validation: rejects bad graphs BEFORE execution or persistence.

export function validateGraph(graph: DAGGraph, registry: NodeRegistry): ValidationResult {
  const errors: ValidationError[] = [];

  // 0. Empty Graph
  if (!graph.nodes || graph.nodes.length === 0) {
    errors.push({
      type: "EMPTY_GRAPH",
      nodeId: "*",
      message: "Graph has no nodes",
    });
    return { valid: false, errors };
  }

  // 1. Duplicate Node IDs
  const ids = graph.nodes.map(n => n.id);
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      errors.push({
        type: "DUPLICATE_NODE_ID",
        nodeId: id,
        message: `Duplicate node ID: '${id}'`,
      });
    }
    seen.add(id);
  }

  // 2. Unknown Node Types
  for (const node of graph.nodes) {
    const kind = node.data?.kind || node.data?.nodeType;
    if (kind && !registry.has(kind)) {
      errors.push({
        type: "UNKNOWN_NODE_TYPE",
        nodeId: node.id,
        message: `Node '${node.id}' has unknown type '${kind}'`,
      });
    }
  }

  // 3. Cycle Detection (Kahn's algorithm)
  const inDegree = new Map<string, number>();
  const adjList = new Map<string, string[]>();
  for (const node of graph.nodes) {
    inDegree.set(node.id, 0);
    adjList.set(node.id, []);
  }
  for (const edge of (graph.edges || [])) {
    adjList.get(edge.source)?.push(edge.target);
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
  }
  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }
  let sortedCount = 0;
  while (queue.length) {
    const curr = queue.shift()!;
    sortedCount++;
    for (const neighbor of adjList.get(curr) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }
  if (sortedCount < graph.nodes.length) {
    errors.push({
      type: "CYCLE_DETECTED",
      nodeId: "*",
      message: `Graph contains a cycle. ${graph.nodes.length - sortedCount} node(s) are in a cycle.`,
    });
  }

  // 4. Missing Required Inputs
  for (const node of graph.nodes) {
    const kind = node.data?.kind || node.data?.nodeType;
    if (!kind) continue;
    const manifest = registry.get(kind);
    if (!manifest) continue;

    const requiredInputs = manifest.inputs.filter(p => p.required);
    const connectedInputIds = (graph.edges || [])
      .filter(e => e.target === node.id)
      .map(e => (e as any).targetInput || e.sourceHandle || "value");

    for (const req of requiredInputs) {
      const hasEdge = connectedInputIds.includes(req.id);
      // Also check if the config provides it (e.g. static prompt)
      const configHasField = node.data?.config && (node.data.config as any)[req.id];

      if (!hasEdge && !configHasField) {
        errors.push({
          type: "MISSING_REQUIRED_INPUT",
          nodeId: node.id,
          message: `Node '${node.id}' is missing required input '${req.id}' — no edge or config provides it`,
        });
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
