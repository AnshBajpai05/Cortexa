"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.nodeRegistry = void 0;
__exportStar(require("./types"), exports);
__exportStar(require("./graph-validator"), exports);
__exportStar(require("./nodes/text"), exports);
__exportStar(require("./nodes/image"), exports);
__exportStar(require("./nodes/qa"), exports);
__exportStar(require("./nodes/orchestrator"), exports);
__exportStar(require("./nodes/global-evaluator"), exports);
__exportStar(require("./nodes/export"), exports);
__exportStar(require("./nodes/safety"), exports);
__exportStar(require("./nodes/ocr"), exports);
__exportStar(require("./nodes/rerank"), exports);
__exportStar(require("./nodes/retrieve"), exports);
__exportStar(require("./nodes/decision"), exports);
__exportStar(require("./nodes/consensus"), exports);
__exportStar(require("./nodes/resolver"), exports);
__exportStar(require("./nodes/formatter"), exports);
__exportStar(require("./nodes/validator"), exports);
__exportStar(require("./nodes/adversary"), exports);
__exportStar(require("./nodes/store"), exports);
__exportStar(require("./nodes/recall"), exports);
const text_1 = require("./nodes/text");
const image_1 = require("./nodes/image");
const qa_1 = require("./nodes/qa");
const orchestrator_1 = require("./nodes/orchestrator");
const global_evaluator_1 = require("./nodes/global-evaluator");
const export_1 = require("./nodes/export");
const export_ppt_1 = require("./nodes/export-ppt");
const safety_1 = require("./nodes/safety");
const ocr_1 = require("./nodes/ocr");
const rerank_1 = require("./nodes/rerank");
const retrieve_1 = require("./nodes/retrieve");
const decision_1 = require("./nodes/decision");
const consensus_1 = require("./nodes/consensus");
const resolver_1 = require("./nodes/resolver");
const formatter_1 = require("./nodes/formatter");
const validator_1 = require("./nodes/validator");
const adversary_1 = require("./nodes/adversary");
const store_1 = require("./nodes/store");
const recall_1 = require("./nodes/recall");
exports.nodeRegistry = new Map([
    [text_1.textNode.id, text_1.textNode],
    ["text", text_1.textNode],
    [image_1.imageNode.id, image_1.imageNode],
    ["image", image_1.imageNode],
    [export_1.exportNode.id, export_1.exportNode],
    ["output", export_1.exportNode],
    [export_ppt_1.exportPptNode.id, export_ppt_1.exportPptNode],
    ["export.ppt", export_ppt_1.exportPptNode],
    [orchestrator_1.orchestratorNode.id, orchestrator_1.orchestratorNode],
    [decision_1.decisionNode.id, decision_1.decisionNode],
    ["decision", decision_1.decisionNode],
    [consensus_1.consensusNode.id, consensus_1.consensusNode],
    [resolver_1.resolverNode.id, resolver_1.resolverNode],
    [formatter_1.formatterNode.id, formatter_1.formatterNode],
    ["formatter", formatter_1.formatterNode],
    [validator_1.validatorNode.id, validator_1.validatorNode],
    ["validator", validator_1.validatorNode],
    [adversary_1.adversaryNode.id, adversary_1.adversaryNode],
    ["adversary", adversary_1.adversaryNode],
    [qa_1.qaNode.id, qa_1.qaNode],
    ["logic", qa_1.qaNode],
    [global_evaluator_1.globalEvaluatorNode.id, global_evaluator_1.globalEvaluatorNode],
    [retrieve_1.retrieveNode.id, retrieve_1.retrieveNode],
    [rerank_1.rerankNode.id, rerank_1.rerankNode],
    [store_1.storeNode.id, store_1.storeNode],
    ["store", store_1.storeNode],
    [recall_1.recallNode.id, recall_1.recallNode],
    ["recall", recall_1.recallNode],
    [safety_1.safetyNode.id, safety_1.safetyNode],
    ["safety", safety_1.safetyNode],
    [ocr_1.ocrNode.id, ocr_1.ocrNode],
]);
//# sourceMappingURL=index.js.map