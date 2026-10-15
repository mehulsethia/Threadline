-- CreateEnum
CREATE TYPE "OutboundDraftStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'SENT', 'REJECTED');

-- CreateEnum
CREATE TYPE "IntakeSourceType" AS ENUM ('WHATSAPP_EXPORT', 'VOICE_NOTE', 'CALL_RECORDING');

-- CreateEnum
CREATE TYPE "IntakeJobStatus" AS ENUM ('QUEUED', 'PROCESSING', 'DONE', 'FAILED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityType" ADD VALUE 'WHATSAPP';
ALTER TYPE "ActivityType" ADD VALUE 'VOICE_NOTE';

-- AlterTable
ALTER TABLE "contactFact" ADD COLUMN     "dealId" TEXT,
ALTER COLUMN "contactId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "whatsAppMessage" (
    "id" TEXT NOT NULL,
    "externalId" TEXT,
    "contactId" TEXT,
    "dealId" TEXT,
    "senderPhone" TEXT NOT NULL,
    "senderName" TEXT,
    "recipientPhone" TEXT,
    "direction" "EmailDirection" NOT NULL DEFAULT 'INBOUND',
    "body" TEXT NOT NULL,
    "rawPayload" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "evidenceRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsAppMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voiceRecording" (
    "id" TEXT NOT NULL,
    "contactId" TEXT,
    "dealId" TEXT,
    "audioUrl" TEXT NOT NULL,
    "durationSeconds" INTEGER,
    "transcript" TEXT,
    "language" TEXT,
    "summary" TEXT,
    "source" TEXT NOT NULL DEFAULT 'WHATSAPP_VOICE_NOTE',
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voiceRecording_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outboundDraft" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'WHATSAPP',
    "recipientPhone" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'hi',
    "contextRationale" TEXT NOT NULL,
    "draftText" TEXT NOT NULL,
    "status" "OutboundDraftStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "waLink" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outboundDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intakeJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "sourceType" "IntakeSourceType" NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "status" "IntakeJobStatus" NOT NULL DEFAULT 'QUEUED',
    "summary" JSONB,
    "error" TEXT,
    "createdContactIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdDealIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "intakeJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsAppMessage_externalId_key" ON "whatsAppMessage"("externalId");

-- CreateIndex
CREATE INDEX "whatsAppMessage_contactId_timestamp_idx" ON "whatsAppMessage"("contactId", "timestamp");

-- CreateIndex
CREATE INDEX "whatsAppMessage_dealId_timestamp_idx" ON "whatsAppMessage"("dealId", "timestamp");

-- CreateIndex
CREATE INDEX "voiceRecording_contactId_recordedAt_idx" ON "voiceRecording"("contactId", "recordedAt");

-- CreateIndex
CREATE INDEX "voiceRecording_dealId_recordedAt_idx" ON "voiceRecording"("dealId", "recordedAt");

-- CreateIndex
CREATE INDEX "outboundDraft_dealId_status_idx" ON "outboundDraft"("dealId", "status");

-- CreateIndex
CREATE INDEX "outboundDraft_status_createdAt_idx" ON "outboundDraft"("status", "createdAt");

-- CreateIndex
CREATE INDEX "intakeJob_status_createdAt_idx" ON "intakeJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "intakeJob_userId_createdAt_idx" ON "intakeJob"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "contactFact_dealId_field_status_idx" ON "contactFact"("dealId", "field", "status");

-- AddForeignKey
ALTER TABLE "contactFact" ADD CONSTRAINT "contactFact_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsAppMessage" ADD CONSTRAINT "whatsAppMessage_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsAppMessage" ADD CONSTRAINT "whatsAppMessage_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voiceRecording" ADD CONSTRAINT "voiceRecording_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voiceRecording" ADD CONSTRAINT "voiceRecording_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outboundDraft" ADD CONSTRAINT "outboundDraft_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outboundDraft" ADD CONSTRAINT "outboundDraft_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outboundDraft" ADD CONSTRAINT "outboundDraft_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intakeJob" ADD CONSTRAINT "intakeJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
