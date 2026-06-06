-- AlterTable
ALTER TABLE "Run" ADD COLUMN     "attempt" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "previousRunId" TEXT;

-- AlterTable
ALTER TABLE "RunLog" ADD COLUMN     "attempt" INTEGER NOT NULL DEFAULT 1;
