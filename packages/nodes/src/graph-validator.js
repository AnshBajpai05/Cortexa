"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateGraph = validateGraph;
function validateGraph(graph, registry) {
    const errors = [];
    if (!graph.nodes || graph.nodes.length === 0) {
        errors.push({
            type: "EMPTY_GRAPH",
            nodeId: "*",
            message: "Graph has no nodes",
        });
        return { valid: false, errors };
    }
    const ids = graph.nodes.map(n => n.id);
    const seen = new Set();
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
    const inDegree = new Map();
    const adjList = new Map();
    for (const node of graph.nodes) {
        inDegree.set(node.id, 0);
        adjList.set(node.id, []);
    }
    for (const edge of (graph.edges || [])) {
        adjList.get(edge.source)?.push(edge.target);
        inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
    }
    const queue = [];
    for (const [id, deg] of inDegree) {
        if (deg === 0)
            queue.push(id);
    }
    let sortedCount = 0;
    while (queue.length) {
        const curr = queue.shift();
        sortedCount++;
        for (const neighbor of adjList.get(curr) ?? []) {
            const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
            inDegree.set(neighbor, newDeg);
            if (newDeg === 0)
                queue.push(neighbor);
        }
    }
    if (sortedCount < graph.nodes.length) {
        errors.push({
            type: "CYCLE_DETECTED",
            nodeId: "*",
            message: `Graph contains a cycle. ${graph.nodes.length - sortedCount} node(s) are in a cycle.`,
        });
    }
    for (const node of graph.nodes) {
        const kind = node.data?.kind || node.data?.nodeType;
        if (!kind)
            continue;
        const manifest = registry.get(kind);
        if (!manifest)
            continue;
        const requiredInputs = manifest.inputs.filter(p => p.required);
        const connectedInputIds = (graph.edges || [])
            .filter(e => e.target === node.id)
            .map(e => e.targetInput || e.sourceHandle || "value");
        for (const req of requiredInputs) {
            const hasEdge = connectedInputIds.includes(req.id);
            const configHasField = node.data?.config && node.data.config[req.id];
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
//# sourceMappingURL=graph-validator.js.map