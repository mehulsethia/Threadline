-- AlterTable
ALTER TABLE "appSetting" ADD COLUMN     "playbook" TEXT,
ADD COLUMN     "revivalSlas" JSONB;

-- AlterTable
ALTER TABLE "contact" ADD COLUMN     "timezone" TEXT;

-- AlterTable
ALTER TABLE "deal" ALTER COLUMN "companyId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "outboundDraft" ADD COLUMN     "slackChannelId" TEXT,
ADD COLUMN     "slackMessageTs" TEXT,
ALTER COLUMN "recipientPhone" DROP NOT NULL,
ALTER COLUMN "language" SET DEFAULT 'en';

-- AlterTable
ALTER TABLE "slackInstallation" ADD COLUMN     "alertsChannelId" TEXT,
ADD COLUMN     "alertsChannelName" TEXT,
ADD COLUMN     "botToken" TEXT,
ADD COLUMN     "botUserId" TEXT,
ADD COLUMN     "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "installedBy" TEXT,
ADD COLUMN     "organizationId" TEXT,
ALTER COLUMN "userScopes" SET DEFAULT '';

-- CreateIndex
CREATE INDEX "slackInstallation_organizationId_idx" ON "slackInstallation"("organizationId");

-- CreateIndex
CREATE INDEX "slackInstallation_teamId_idx" ON "slackInstallation"("teamId");

