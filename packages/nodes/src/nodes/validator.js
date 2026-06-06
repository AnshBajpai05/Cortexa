"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validatorNode = void 0;
const zod_1 = require("zod");
const ValidatorRuleSchema = zod_1.z.object({
    field: zod_1.z.string(),
    op: zod_1.z.enum(["==", "!=", ">", ">=", "<", "<=", "includes", "exists"]),
    value: zod_1.z.any().optional(),
});
const ValidatorNodeConfig = zod_1.z.object({
    mode: zod_1.z.enum(["hard", "soft"]).default("hard"),
    rules: zod_1.z.array(ValidatorRuleSchema).default([]),
});
function getValueByPath(obj, path) {
    return path.split('.').reduce((acc, part) => (acc && acc[part] !== undefined) ? acc[part] : undefined, obj);
}
exports.validatorNode = {
    id: "logic.validator",
    name: "Deterministic Validator",
    description: "Enforces strict rule-based constraints on JSON outputs from previous nodes.",
    category: "logic",
    costTier: "low",
    avgLatencyMs: 2000,
    inputs: [
        { id: "input_json", label: "Input JSON String", type: "text", required: true, semanticType: "text" },
        { id: "dynamic_rules", label: "Dynamic Rules (Optional)", type: "json", required: false, semanticType: "json" },
    ],
    outputs: [
        { id: "passed", label: "Passed Validation", type: "text", semanticType: "text" },
        { id: "violationReport", label: "Violation Report", type: "json", semanticType: "json" },
    ],
    configSchema: ValidatorNodeConfig,
    run: async (ctx, rawConfig) => {
        const config = ValidatorNodeConfig.parse(rawConfig);
        const inputRaw = ctx.inputs["input_json"];
        const dynamicRules = ctx.inputs["dynamic_rules"] || [];
        if (!inputRaw || typeof inputRaw !== "string") {
            throw new Error(`[logic.validator] Missing or invalid input_json.`);
        }
        let parsed;
        try {
            parsed = JSON.parse(inputRaw);
        }
        catch (e) {
            throw new Error(`[logic.validator] Input must be valid JSON to run rules against it.`);
        }
        const violations = [];
        const allRules = [...config.rules, ...dynamicRules];
        for (const rule of allRules) {
            const actual = getValueByPath(parsed, rule.field);
            let passed = false;
            switch (rule.op) {
                case "==":
                    passed = actual === rule.value;
                    break;
                case "!=":
                    passed = actual !== rule.value;
                    break;
                case ">":
                    passed = actual > rule.value;
                    break;
                case ">=":
                    passed = actual >= rule.value;
                    break;
                case "<":
                    passed = actual < rule.value;
                    break;
                case "<=":
                    passed = actual <= rule.value;
                    break;
                case "includes":
                    passed = Array.isArray(actual) && actual.includes(rule.value);
                    break;
                case "exists":
                    passed = actual !== undefined && actual !== null;
                    break;
            }
            if (!passed) {
                violations.push({
                    field: rule.field,
                    issue: `Rule '${rule.op}' failed.`,
                    expected: rule.value,
                    actual: actual,
                });
            }
        }
        const hasViolations = violations.length > 0;
        if (hasViolations && config.mode === "hard") {
            const errorMsg = JSON.stringify({
                type: "VALIDATION_FAILED",
                message: "JSON Validation Failed. See violation report.",
                violations: violations
            });
            throw new Error(errorMsg);
        }
        return {
            value: hasViolations ? "FAILED" : "PASSED",
            passed: !hasViolations,
            violationReport: violations,
            label: `Validator: ${hasViolations ? violations.length + ' Violations' : 'Passed'}`,
            confidence: hasViolations ? 0 : 1,
        };
    },
};
//# sourceMappingURL=validator.js.map