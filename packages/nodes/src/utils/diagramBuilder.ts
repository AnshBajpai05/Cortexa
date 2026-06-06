import { GraphSpec } from "./flowExtractor";

export interface DiagramSpec {
  mermaid_code: string;
}

export function buildDiagramSpec(graph: GraphSpec): DiagramSpec {
  return {
    mermaid_code: graph.mermaid_code
  };
}
