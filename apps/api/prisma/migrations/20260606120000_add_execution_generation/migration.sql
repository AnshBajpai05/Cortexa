-- AlterTable
ALTER TABLE "Run" ADD COLUMN     "executionId" TEXT NOT NULL DEFAULT 'legacy';

-- CreateIndex
CREATE INDEX "Run_workflowId_executionId_nodeId_status_idx" ON "Run"("workflowId", "executionId", "nodeId", "status");

-- CreateIndex
CREATE INDEX "Run_workflowId_executionId_createdAt_idx" ON "Run"("workflowId", "executionId", "createdAt");
