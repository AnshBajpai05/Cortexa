import { GraphSpec } from "./flowExtractor";
export interface DiagramSpec {
    mermaid_code: string;
}
export declare function buildDiagramSpec(graph: GraphSpec): DiagramSpec;
