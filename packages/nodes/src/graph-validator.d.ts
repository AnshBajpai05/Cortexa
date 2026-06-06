import { NodeRegistry } from "./types";
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
    nodes: Array<{
        id: string;
        data: {
            kind?: string;
            nodeType?: string;
            config?: any;
            [key: string]: any;
        };
    }>;
    edges: Array<{
        source: string;
        target: string;
        targetInput?: string;
        sourceHandle?: string;
        [key: string]: any;
    }>;
}
export declare function validateGraph(graph: DAGGraph, registry: NodeRegistry): ValidationResult;
export {};
