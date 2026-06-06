import { RunContext } from "../types";
export interface GraphSpec {
    mermaid_code: string;
}
export declare function extractFlow(text: string, ctx: RunContext): Promise<GraphSpec | null>;
