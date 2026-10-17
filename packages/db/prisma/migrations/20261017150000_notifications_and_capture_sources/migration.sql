ALTER TYPE "IntakeSourceType" ADD VALUE IF NOT EXISTS 'EMAIL_THREAD';
ALTER TYPE "IntakeSourceType" ADD VALUE IF NOT EXISTS 'SLACK_THREAD';
ALTER TYPE "IntakeSourceType" ADD VALUE IF NOT EXISTS 'MEETING_TRANSCRIPT';

-- AlterTable
ALTER TABLE "appSetting" ADD COLUMN     "fathomApiKey" TEXT,
ADD COLUMN     "firefliesApiKey" TEXT,
ADD COLUMN     "recordersSyncedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "intakeJob" ADD COLUMN     "contentHash" TEXT,
ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "title" TEXT,
ADD COLUMN     "transcript" JSONB;

-- CreateTable
CREATE TABLE "notification" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "entity" TEXT,
    "entityId" TEXT,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_createdAt_idx" ON "notification"("createdAt");

-- CreateIndex
CREATE INDEX "notification_readAt_createdAt_idx" ON "notification"("readAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "intakeJob_externalId_key" ON "intakeJob"("externalId");

