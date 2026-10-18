-- AlterEnum
ALTER TYPE "IntakeSourceType" ADD VALUE IF NOT EXISTS 'FORM_SUBMISSION';

-- AlterTable
ALTER TABLE "deal" ADD COLUMN     "health" TEXT,
ADD COLUMN     "healthReason" TEXT,
ADD COLUMN     "leadScore" INTEGER,
ADD COLUMN     "leadScoreFactors" JSONB,
ADD COLUMN     "leadScoredAt" TIMESTAMP(3),
ADD COLUMN     "winProbability" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "commitment" (
    "id" TEXT NOT NULL,
    "dealId" TEXT,
    "contactId" TEXT,
    "owner" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'open',
    "sourceKind" TEXT,
    "quote" TEXT,
    "jobId" TEXT,
    "taskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "commitment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leadForm" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "thankYou" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "submissions" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leadForm_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "commitment_status_dueAt_idx" ON "commitment"("status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "commitment_dealId_text_key" ON "commitment"("dealId", "text");

-- CreateIndex
CREATE INDEX "deal_leadScore_idx" ON "deal"("leadScore");

-- AddForeignKey
ALTER TABLE "commitment" ADD CONSTRAINT "commitment_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

