-- CreateSchema

-- CreateEnum
CREATE TYPE "DealStage" AS ENUM ('DEMO_BOOKED', 'QUALIFIED_TO_BUY', 'UNQUALIFIED_TO_BUY', 'DECISION_MAKER_BOUGHT_IN', 'CONTRACT_SENT', 'CLOSED_WON', 'CLOSED_LOST');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('NOTE', 'CALL', 'EMAIL', 'MEETING', 'TASK', 'STAGE_CHANGE', 'ENRICHMENT', 'WHATSAPP', 'VOICE_NOTE');

-- CreateEnum
CREATE TYPE "EnrichmentStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETE', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "RecordSource" AS ENUM ('MANUAL', 'IMPORT', 'EMAIL', 'CALENDAR', 'TRACKING');

-- CreateEnum
CREATE TYPE "AgentConversationKind" AS ENUM ('RECORD', 'BUILDER');

-- CreateEnum
CREATE TYPE "AgentDefinitionStatus" AS ENUM ('DRAFT', 'DEPLOYING', 'LIVE', 'PAUSED', 'ARCHIVED', 'DELETED');

-- CreateEnum
CREATE TYPE "AgentVersionStatus" AS ENUM ('DRAFT', 'VALIDATING', 'READY', 'DEPLOYED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AgentBuilderArtifactStatus" AS ENUM ('WRITING', 'READY');

-- CreateEnum
CREATE TYPE "AgentTriggerType" AS ENUM ('MANUAL', 'SCHEDULE', 'EVENT', 'WEBHOOK');

-- CreateEnum
CREATE TYPE "AgentRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'WAITING_FOR_APPROVAL', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AgentActionStatus" AS ENUM ('PLANNED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AgentConversationShareScope" AS ENUM ('WORKSPACE_LINK');

-- CreateEnum
CREATE TYPE "AgentConversationSubmissionStatus" AS ENUM ('PENDING', 'SENDING', 'ACCEPTED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AgentConversationCommandType" AS ENUM ('CHAT', 'CREATE_AGENT');

-- CreateEnum
CREATE TYPE "AgentResponseRating" AS ENUM ('UP', 'DOWN');

-- CreateEnum
CREATE TYPE "FactBand" AS ENUM ('VERIFIED', 'PROBABLE', 'POSSIBLE');

-- CreateEnum
CREATE TYPE "FactStatus" AS ENUM ('APPLIED', 'PROPOSED', 'DISMISSED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "RateSource" AS ENUM ('FETCHED', 'MANUAL');

-- CreateEnum
CREATE TYPE "FieldEntity" AS ENUM ('COMPANY', 'CONTACT', 'DEAL');

-- CreateEnum
CREATE TYPE "FieldType" AS ENUM ('TEXT', 'LONG_TEXT', 'NUMBER', 'DATE', 'CHECKBOX', 'SELECT', 'URL', 'EMAIL', 'PHONE', 'USER');

-- CreateEnum
CREATE TYPE "GoogleSyncStatus" AS ENUM ('IDLE', 'RUNNING', 'NEEDS_RECONNECT', 'FAILED');

-- CreateEnum
CREATE TYPE "EmailDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "DomainScope" AS ENUM ('SITE_AND_SUBDOMAINS', 'EXACT_HOST');

-- CreateEnum
CREATE TYPE "OutboundDraftStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'SENT', 'REJECTED');

-- CreateEnum
CREATE TYPE "IntakeSourceType" AS ENUM ('WHATSAPP_EXPORT', 'VOICE_NOTE', 'CALL_RECORDING', 'EMAIL_THREAD', 'SLACK_THREAD', 'MEETING_TRANSCRIPT', 'FORM_SUBMISSION');

-- CreateEnum
CREATE TYPE "IntakeJobStatus" AS ENUM ('QUEUED', 'PROCESSING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slackMemberMatch" (
    "id" TEXT NOT NULL,
    "crmUserId" TEXT NOT NULL,
    "slackUserId" TEXT,
    "slackHandle" TEXT,
    "slackEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "slackMemberMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slackChannel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "memberCount" INTEGER,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "isMember" BOOLEAN NOT NULL DEFAULT false,
    "inviteRequestedAt" TIMESTAMP(3),
    "classifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "slackChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slackInstallation" (
    "installerId" TEXT NOT NULL,
    "organizationId" TEXT,
    "teamId" TEXT NOT NULL,
    "teamName" TEXT,
    "botUserId" TEXT,
    "botToken" TEXT,
    "userToken" TEXT,
    "userScopes" TEXT NOT NULL DEFAULT '',
    "installedBy" TEXT,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "alertsChannelId" TEXT,
    "alertsChannelName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "slackInstallation_pkey" PRIMARY KEY ("installerId")
);

-- CreateTable
CREATE TABLE "slackWorkspaceGrant" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "teamName" TEXT,
    "userToken" TEXT NOT NULL,
    "userScopes" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "slackWorkspaceGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,
    "activeOrganizationId" TEXT,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rateLimit" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "lastRequest" BIGINT NOT NULL,

    CONSTRAINT "rateLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT,
    "website" TEXT,
    "description" TEXT,
    "logoUrl" TEXT,
    "logoDarkUrl" TEXT,
    "iconUrl" TEXT,
    "iconDarkUrl" TEXT,
    "iconTone" TEXT,
    "brandColor" TEXT,
    "industry" TEXT,
    "subIndustry" TEXT,
    "city" TEXT,
    "stateCode" TEXT,
    "country" TEXT,
    "countryCode" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "linkedinUrl" TEXT,
    "twitterUrl" TEXT,
    "githubUrl" TEXT,
    "pricingUrl" TEXT,
    "careersUrl" TEXT,
    "ownerId" TEXT,
    "primaryContactId" TEXT,
    "enrichmentStatus" "EnrichmentStatus" NOT NULL DEFAULT 'PENDING',
    "enrichedAt" TIMESTAMP(3),
    "enrichmentError" TEXT,
    "source" "RecordSource" NOT NULL DEFAULT 'MANUAL',
    "pendingReview" BOOLEAN NOT NULL DEFAULT false,
    "lastActivityAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companyEnrichment" (
    "companyId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'context.dev',
    "raw" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "companyEnrichment_pkey" PRIMARY KEY ("companyId")
);

-- CreateTable
CREATE TABLE "contact" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "title" TEXT,
    "seniority" TEXT,
    "function" TEXT,
    "linkedinUrl" TEXT,
    "twitterUrl" TEXT,
    "githubUrl" TEXT,
    "imageUrl" TEXT,
    "timezone" TEXT,
    "optedOut" BOOLEAN NOT NULL DEFAULT false,
    "socialsCheckedAt" TIMESTAMP(3),
    "enrichmentStatus" "EnrichmentStatus" NOT NULL DEFAULT 'PENDING',
    "enrichedAt" TIMESTAMP(3),
    "enrichmentError" TEXT,
    "companyId" TEXT,
    "ownerId" TEXT,
    "source" "RecordSource" NOT NULL DEFAULT 'MANUAL',
    "pendingReview" BOOLEAN NOT NULL DEFAULT false,
    "lastActivityAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contactFact" (
    "id" TEXT NOT NULL,
    "contactId" TEXT,
    "dealId" TEXT,
    "field" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "band" "FactBand" NOT NULL,
    "evidence" JSONB NOT NULL,
    "method" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "sessionId" TEXT,
    "status" "FactStatus" NOT NULL DEFAULT 'PROPOSED',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersededAt" TIMESTAMP(3),

    CONSTRAINT "contactFact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contactBrief" (
    "contactId" TEXT NOT NULL,
    "narrative" TEXT NOT NULL,
    "sections" JSONB NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "sourceUrl" TEXT,
    "sessionId" TEXT,
    "refreshedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contactBrief_pkey" PRIMARY KEY ("contactId")
);

-- CreateTable
CREATE TABLE "agentTask" (
    "id" TEXT NOT NULL,
    "contactId" TEXT,
    "companyId" TEXT,
    "dealId" TEXT,
    "kind" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "payload" JSONB,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "budget" INTEGER NOT NULL DEFAULT 4,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "leasedUntil" TIMESTAMP(3),
    "sessionId" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "outcome" TEXT,
    "subject" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agentTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agentEvent" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "contactId" TEXT,
    "conversationId" TEXT,
    "type" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "emittedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agentConversation" (
    "id" TEXT NOT NULL,
    "kind" "AgentConversationKind" NOT NULL DEFAULT 'RECORD',
    "contactId" TEXT,
    "companyId" TEXT,
    "dealId" TEXT,
    "userId" TEXT NOT NULL,
    "agentId" TEXT,
    "sessionId" TEXT,
    "continuationToken" TEXT,
    "streamIndex" INTEGER NOT NULL DEFAULT 0,
    "pendingInputRequest" JSONB,
    "title" TEXT,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAssistantAt" TIMESTAMP(3),
    "lastReadAt" TIMESTAMP(3),

    CONSTRAINT "agentConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agentConversationFeedback" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "rating" "AgentResponseRating" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agentConversationFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agentConversationShare" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "scope" "AgentConversationShareScope" NOT NULL DEFAULT 'WORKSPACE_LINK',
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "agentConversationShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agentConversationSubmission" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "inputRequestId" TEXT,
    "commandType" "AgentConversationCommandType" NOT NULL DEFAULT 'CHAT',
    "message" JSONB NOT NULL,
    "status" "AgentConversationSubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),

    CONSTRAINT "agentConversationSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agentConversationAttachment" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "content" BYTEA NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agentConversationAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agentDefinition" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "AgentDefinitionStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "currentVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "agentDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agentVersion" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "status" "AgentVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "instructions" TEXT NOT NULL,
    "manifest" JSONB NOT NULL,
    "modelId" TEXT NOT NULL,
    "modelContextWindowTokens" INTEGER NOT NULL DEFAULT 1000000,
    "sandboxPolicy" JSONB NOT NULL,
    "validation" JSONB,
    "sourceConversationId" TEXT,
    "createdById" TEXT NOT NULL,
    "deploymentId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "deployedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agentBuilderArtifact" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT,
    "versionId" TEXT,
    "path" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "previousContent" TEXT,
    "revision" INTEGER NOT NULL,
    "status" "AgentBuilderArtifactStatus" NOT NULL DEFAULT 'WRITING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agentBuilderArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agentTrigger" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "type" "AgentTriggerType" NOT NULL,
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "nextRunAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agentTrigger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agentRun" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "triggerId" TEXT,
    "initiatedById" TEXT,
    "triggerType" "AgentTriggerType" NOT NULL,
    "status" "AgentRunStatus" NOT NULL DEFAULT 'QUEUED',
    "principalId" TEXT,
    "sessionId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "input" JSONB,
    "result" JSONB,
    "summary" TEXT,
    "modelId" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "costUsd" DECIMAL(12,6),
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "nextEventSequence" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "cancelRequestedAt" TIMESTAMP(3),
    "cancelDeliveredAt" TIMESTAMP(3),

    CONSTRAINT "agentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agentRunEvent" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "emittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agentRunEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agentAction" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "targetLabel" TEXT,
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "status" "AgentActionStatus" NOT NULL DEFAULT 'PLANNED',
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT,
    "externalId" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "plannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agentAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agentAuditEvent" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "versionId" TEXT,
    "actorUserId" TEXT,
    "type" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "summary" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "requestId" TEXT,
    "emittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agentAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "companyId" TEXT,
    "ownerId" TEXT NOT NULL,
    "stage" "DealStage" NOT NULL DEFAULT 'DEMO_BOOKED',
    "stageChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "expectedCloseDate" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "closedReason" TEXT,
    "baseAmount" DECIMAL(24,4),
    "baseCurrency" TEXT,
    "fxRate" DECIMAL(20,10),
    "fxRateAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "leadScore" INTEGER,
    "leadScoreFactors" JSONB,
    "leadScoredAt" TIMESTAMP(3),
    "health" TEXT,
    "healthReason" TEXT,
    "winProbability" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exchangeRate" (
    "id" TEXT NOT NULL,
    "baseCurrency" TEXT NOT NULL,
    "quoteCurrency" TEXT NOT NULL,
    "rate" DECIMAL(20,10) NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "source" "RateSource" NOT NULL,
    "provider" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dealContact" (
    "dealId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "role" TEXT,

    CONSTRAINT "dealContact_pkey" PRIMARY KEY ("dealId","contactId")
);

-- CreateTable
CREATE TABLE "fieldDefinition" (
    "id" TEXT NOT NULL,
    "entity" "FieldEntity" NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "FieldType" NOT NULL,
    "agentFilled" BOOLEAN NOT NULL DEFAULT true,
    "agentBrief" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "showOnSheet" BOOLEAN NOT NULL DEFAULT true,
    "showOnTable" BOOLEAN NOT NULL DEFAULT false,
    "showOnFilter" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fieldDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fieldOption" (
    "id" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "fieldOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fieldValue" (
    "id" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "companyId" TEXT,
    "contactId" TEXT,
    "dealId" TEXT,
    "text" TEXT,
    "number" DECIMAL(24,4),
    "date" TIMESTAMP(3),
    "bool" BOOLEAN,
    "optionId" TEXT,
    "userId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fieldValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "savedView" (
    "id" TEXT NOT NULL,
    "entity" "FieldEntity" NOT NULL,
    "name" TEXT NOT NULL,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "filters" JSONB NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "savedView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity" (
    "id" TEXT NOT NULL,
    "type" "ActivityType" NOT NULL,
    "subject" TEXT,
    "body" TEXT,
    "occurredAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "companyId" TEXT,
    "contactId" TEXT,
    "dealId" TEXT,
    "createdById" TEXT NOT NULL,
    "meta" JSONB,
    "emailThreadId" TEXT,
    "calendarEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mailboxSync" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" "GoogleSyncStatus" NOT NULL DEFAULT 'IDLE',
    "cursor" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "retryAfter" TIMESTAMP(3),
    "autoCreate" BOOLEAN NOT NULL DEFAULT false,
    "recentFetchStartedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mailboxSync_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emailThread" (
    "id" TEXT NOT NULL,
    "rootMessageId" TEXT NOT NULL,
    "subject" TEXT,
    "companyId" TEXT,
    "contactId" TEXT,
    "firstMessageAt" TIMESTAMP(3) NOT NULL,
    "lastMessageAt" TIMESTAMP(3) NOT NULL,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "emailThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emailMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "rfcMessageId" TEXT NOT NULL,
    "syncedByUserId" TEXT,
    "gmailMessageId" TEXT,
    "outlookMessageId" TEXT,
    "outlookWebLink" TEXT,
    "direction" "EmailDirection" NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "fromName" TEXT,
    "recipients" JSONB NOT NULL,
    "subject" TEXT,
    "snippet" TEXT,
    "body" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "emailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendarEvent" (
    "id" TEXT NOT NULL,
    "iCalUid" TEXT NOT NULL,
    "originalStartTime" TIMESTAMP(3) NOT NULL,
    "recurringEventId" TEXT,
    "title" TEXT,
    "description" TEXT,
    "location" TEXT,
    "conferenceUrl" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "isAllDay" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL,
    "organizerEmail" TEXT,
    "companyId" TEXT,
    "contactId" TEXT,
    "syncedByUserId" TEXT,
    "googleEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendarAttendee" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "responseStatus" TEXT,
    "isOrganizer" BOOLEAN NOT NULL DEFAULT false,
    "contactId" TEXT,

    CONSTRAINT "calendarAttendee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppressedDomain" (
    "domain" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suppressedDomain_pkey" PRIMARY KEY ("domain")
);

-- CreateTable
CREATE TABLE "suppressedContact" (
    "email" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suppressedContact_pkey" PRIMARY KEY ("email")
);

-- CreateTable
CREATE TABLE "appSetting" (
    "id" TEXT NOT NULL,
    "agentModelId" TEXT,
    "agentModelContextWindow" INTEGER,
    "contextDevApiKey" TEXT,
    "firefliesApiKey" TEXT,
    "fathomApiKey" TEXT,
    "recordersSyncedAt" TIMESTAMP(3),
    "reportingCurrency" TEXT,
    "ratesRefreshedAt" TIMESTAMP(3),
    "archiveRetentionDays" INTEGER NOT NULL DEFAULT 180,
    "trackingSiteId" TEXT,
    "trackingCrossDomain" BOOLEAN NOT NULL DEFAULT true,
    "trackingLimitToDomains" BOOLEAN NOT NULL DEFAULT true,
    "trackingCookieSubdomains" BOOLEAN NOT NULL DEFAULT false,
    "trackingSecureCookies" BOOLEAN NOT NULL DEFAULT true,
    "trackingHonourDnt" BOOLEAN NOT NULL DEFAULT true,
    "trackingCookieDays" INTEGER NOT NULL DEFAULT 395,
    "trackingConfigHash" TEXT,
    "trackingPaused" BOOLEAN NOT NULL DEFAULT false,
    "revivalSlas" JSONB,
    "playbook" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trackedDomain" (
    "id" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "scope" "DomainScope" NOT NULL DEFAULT 'EXACT_HOST',
    "pageViews" INTEGER NOT NULL DEFAULT 0,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trackedDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trackedVisitor" (
    "id" TEXT NOT NULL,
    "contactId" TEXT,
    "firstSource" TEXT,
    "firstMedium" TEXT,
    "firstCampaign" TEXT,
    "firstTerm" TEXT,
    "firstContent" TEXT,
    "firstReferrer" TEXT,
    "firstLanding" TEXT,
    "firstTouchAt" TIMESTAMP(3),
    "lastSource" TEXT,
    "lastMedium" TEXT,
    "lastCampaign" TEXT,
    "lastTerm" TEXT,
    "lastContent" TEXT,
    "lastReferrer" TEXT,
    "lastLanding" TEXT,
    "lastTouchAt" TIMESTAMP(3),
    "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trackedVisitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trackedEvent" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "referrer" TEXT,
    "label" TEXT,
    "source" TEXT,
    "medium" TEXT,
    "campaign" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trackedEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trackingCounter" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trackingCounter_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "trackedPageDaily" (
    "day" TIMESTAMP(3) NOT NULL,
    "host" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "visitors" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "trackedPageDaily_pkey" PRIMARY KEY ("day","host","path")
);

-- CreateTable
CREATE TABLE "formSubmission" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT,
    "contactId" TEXT,
    "host" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "email" TEXT,
    "fields" JSONB NOT NULL,
    "firstTouch" JSONB,
    "lastTouch" JSONB,
    "dedupeKey" TEXT NOT NULL,
    "filedAt" TIMESTAMP(3),
    "skipReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "formSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "install" (
    "id" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "lastRollupAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "install_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telemetryMilestone" (
    "step" TEXT NOT NULL,
    "reachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telemetryMilestone_pkey" PRIMARY KEY ("step")
);

-- CreateTable
CREATE TABLE "telemetryCounter" (
    "name" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "telemetryCounter_pkey" PRIMARY KEY ("name")
);

-- CreateTable
CREATE TABLE "organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "metadata" TEXT,
    "website" TEXT,

    CONSTRAINT "organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspaceProfile" (
    "id" TEXT NOT NULL,
    "website" TEXT NOT NULL,
    "narrative" TEXT NOT NULL,
    "sections" JSONB NOT NULL,
    "sourceUrl" TEXT,
    "sessionId" TEXT,
    "refreshedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspaceProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inviterId" TEXT NOT NULL,

    CONSTRAINT "invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ssoProvider" (
    "id" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "oidcConfig" TEXT,
    "samlConfig" TEXT,
    "userId" TEXT,
    "providerId" TEXT NOT NULL,
    "organizationId" TEXT,
    "domain" TEXT NOT NULL,

    CONSTRAINT "ssoProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "apikey" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL DEFAULT 'default',
    "name" TEXT,
    "start" TEXT,
    "referenceId" TEXT NOT NULL,
    "prefix" TEXT,
    "key" TEXT NOT NULL,
    "refillInterval" INTEGER,
    "refillAmount" INTEGER,
    "lastRefillAt" TIMESTAMP(3),
    "enabled" BOOLEAN DEFAULT true,
    "rateLimitEnabled" BOOLEAN DEFAULT true,
    "rateLimitTimeWindow" INTEGER,
    "rateLimitMax" INTEGER,
    "requestCount" INTEGER DEFAULT 0,
    "remaining" INTEGER,
    "lastRequest" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "permissions" TEXT,
    "metadata" TEXT,

    CONSTRAINT "apikey_pkey" PRIMARY KEY ("id")
);

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
    "recipientPhone" TEXT,
    "recipientEmail" TEXT,
    "subject" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "strategy" TEXT,
    "contextRationale" TEXT NOT NULL,
    "draftText" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "citedEvidence" JSONB,
    "stalledReason" TEXT,
    "priorityScore" DOUBLE PRECISION,
    "proposedStage" "DealStage",
    "status" "OutboundDraftStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "waLink" TEXT,
    "slackMessageTs" TEXT,
    "slackChannelId" TEXT,
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
    "externalId" TEXT,
    "title" TEXT,
    "transcript" JSONB,
    "contentHash" TEXT,
    "status" "IntakeJobStatus" NOT NULL DEFAULT 'QUEUED',
    "summary" JSONB,
    "error" TEXT,
    "createdContactIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdDealIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "intakeJob_pkey" PRIMARY KEY ("id")
);

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
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "slackMemberMatch_crmUserId_key" ON "slackMemberMatch"("crmUserId");

-- CreateIndex
CREATE INDEX "slackMemberMatch_slackUserId_idx" ON "slackMemberMatch"("slackUserId");

-- CreateIndex
CREATE INDEX "slackChannel_available_name_idx" ON "slackChannel"("available", "name");

-- CreateIndex
CREATE INDEX "slackChannel_updatedAt_idx" ON "slackChannel"("updatedAt");

-- CreateIndex
CREATE INDEX "slackInstallation_organizationId_idx" ON "slackInstallation"("organizationId");

-- CreateIndex
CREATE INDEX "slackInstallation_teamId_idx" ON "slackInstallation"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "slackWorkspaceGrant_teamId_key" ON "slackWorkspaceGrant"("teamId");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "rateLimit_key_key" ON "rateLimit"("key");

-- CreateIndex
CREATE UNIQUE INDEX "company_primaryContactId_key" ON "company"("primaryContactId");

-- CreateIndex
CREATE INDEX "company_ownerId_idx" ON "company"("ownerId");

-- CreateIndex
CREATE INDEX "company_name_idx" ON "company"("name");

-- CreateIndex
CREATE INDEX "company_lastActivityAt_idx" ON "company"("lastActivityAt");

-- CreateIndex
CREATE INDEX "company_archivedAt_idx" ON "company"("archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "company_domain_active_key" ON "company"("domain") WHERE ("archivedAt" IS NULL);

-- CreateIndex
CREATE INDEX "contact_companyId_idx" ON "contact"("companyId");

-- CreateIndex
CREATE INDEX "contact_ownerId_idx" ON "contact"("ownerId");

-- CreateIndex
CREATE INDEX "contact_lastActivityAt_idx" ON "contact"("lastActivityAt");

-- CreateIndex
CREATE INDEX "contact_archivedAt_idx" ON "contact"("archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "contact_email_active_key" ON "contact"("email") WHERE ("archivedAt" IS NULL);

-- CreateIndex
CREATE INDEX "contactFact_contactId_field_status_idx" ON "contactFact"("contactId", "field", "status");

-- CreateIndex
CREATE INDEX "contactFact_dealId_field_status_idx" ON "contactFact"("dealId", "field", "status");

-- CreateIndex
CREATE INDEX "contactFact_status_observedAt_idx" ON "contactFact"("status", "observedAt");

-- CreateIndex
CREATE INDEX "agentTask_dueAt_leasedUntil_idx" ON "agentTask"("dueAt", "leasedUntil");

-- CreateIndex
CREATE INDEX "agentTask_contactId_idx" ON "agentTask"("contactId");

-- CreateIndex
CREATE INDEX "agentTask_dealId_idx" ON "agentTask"("dealId");

-- CreateIndex
CREATE INDEX "agentTask_kind_subject_idx" ON "agentTask"("kind", "subject") WHERE ("finishedAt" IS NULL);

-- CreateIndex
CREATE INDEX "agentEvent_sessionId_emittedAt_idx" ON "agentEvent"("sessionId", "emittedAt");

-- CreateIndex
CREATE INDEX "agentEvent_contactId_emittedAt_idx" ON "agentEvent"("contactId", "emittedAt");

-- CreateIndex
CREATE INDEX "agentEvent_conversationId_emittedAt_idx" ON "agentEvent"("conversationId", "emittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "agentConversation_sessionId_key" ON "agentConversation"("sessionId");

-- CreateIndex
CREATE INDEX "agentConversation_contactId_lastMessageAt_idx" ON "agentConversation"("contactId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "agentConversation_companyId_lastMessageAt_idx" ON "agentConversation"("companyId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "agentConversation_dealId_lastMessageAt_idx" ON "agentConversation"("dealId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "agentConversation_userId_kind_lastMessageAt_idx" ON "agentConversation"("userId", "kind", "lastMessageAt");

-- CreateIndex
CREATE INDEX "agentConversation_agentId_lastMessageAt_idx" ON "agentConversation"("agentId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "agentConversationFeedback_conversationId_createdAt_idx" ON "agentConversationFeedback"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "agentConversationFeedback_conversationId_userId_messageId_key" ON "agentConversationFeedback"("conversationId", "userId", "messageId");

-- CreateIndex
CREATE UNIQUE INDEX "agentConversationShare_tokenHash_key" ON "agentConversationShare"("tokenHash");

-- CreateIndex
CREATE INDEX "agentConversationShare_conversationId_revokedAt_idx" ON "agentConversationShare"("conversationId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "agentConversationShare_one_active_per_conversation" ON "agentConversationShare"("conversationId") WHERE ("revokedAt" IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "agentConversationSubmission_clientRequestId_key" ON "agentConversationSubmission"("clientRequestId");

-- CreateIndex
CREATE INDEX "agentConversationSubmission_conversationId_createdAt_idx" ON "agentConversationSubmission"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "agentConversationSubmission_status_createdAt_idx" ON "agentConversationSubmission"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "agentConversationSubmission_conversationId_inputRequestId_key" ON "agentConversationSubmission"("conversationId", "inputRequestId");

-- CreateIndex
CREATE INDEX "agentConversationAttachment_submissionId_position_idx" ON "agentConversationAttachment"("submissionId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "agentDefinition_currentVersionId_key" ON "agentDefinition"("currentVersionId");

-- CreateIndex
CREATE INDEX "agentDefinition_status_updatedAt_idx" ON "agentDefinition"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "agentDefinition_createdById_createdAt_idx" ON "agentDefinition"("createdById", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "agentDefinition_currentVersionId_id_key" ON "agentDefinition"("currentVersionId", "id");

-- CreateIndex
CREATE INDEX "agentVersion_agentId_createdAt_idx" ON "agentVersion"("agentId", "createdAt");

-- CreateIndex
CREATE INDEX "agentVersion_status_createdAt_idx" ON "agentVersion"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "agentVersion_agentId_number_key" ON "agentVersion"("agentId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "agentVersion_id_agentId_key" ON "agentVersion"("id", "agentId");

-- CreateIndex
CREATE INDEX "agentBuilderArtifact_conversationId_createdAt_idx" ON "agentBuilderArtifact"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "agentBuilderArtifact_versionId_path_idx" ON "agentBuilderArtifact"("versionId", "path");

-- CreateIndex
CREATE UNIQUE INDEX "agentBuilderArtifact_conversation_path_revision_key" ON "agentBuilderArtifact"("conversationId", "path", "revision") WHERE ("conversationId" IS NOT NULL);

-- CreateIndex
CREATE UNIQUE INDEX "agentBuilderArtifact_version_path_revision_key" ON "agentBuilderArtifact"("versionId", "path", "revision") WHERE ("versionId" IS NOT NULL);

-- CreateIndex
CREATE INDEX "agentTrigger_agentId_enabled_idx" ON "agentTrigger"("agentId", "enabled");

-- CreateIndex
CREATE INDEX "agentTrigger_enabled_nextRunAt_idx" ON "agentTrigger"("enabled", "nextRunAt");

-- CreateIndex
CREATE INDEX "agentTrigger_versionId_idx" ON "agentTrigger"("versionId");

-- CreateIndex
CREATE UNIQUE INDEX "agentTrigger_id_agentId_key" ON "agentTrigger"("id", "agentId");

-- CreateIndex
CREATE UNIQUE INDEX "agentRun_sessionId_key" ON "agentRun"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "agentRun_idempotencyKey_key" ON "agentRun"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "agentRun_correlationId_key" ON "agentRun"("correlationId");

-- CreateIndex
CREATE INDEX "agentRun_agentId_createdAt_idx" ON "agentRun"("agentId", "createdAt");

-- CreateIndex
CREATE INDEX "agentRun_versionId_createdAt_idx" ON "agentRun"("versionId", "createdAt");

-- CreateIndex
CREATE INDEX "agentRun_status_createdAt_idx" ON "agentRun"("status", "createdAt");

-- CreateIndex
CREATE INDEX "agentRun_triggerId_createdAt_idx" ON "agentRun"("triggerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "agentRun_id_agentId_key" ON "agentRun"("id", "agentId");

-- CreateIndex
CREATE INDEX "agentRunEvent_runId_emittedAt_idx" ON "agentRunEvent"("runId", "emittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "agentRunEvent_runId_sequence_key" ON "agentRunEvent"("runId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "agentAction_idempotencyKey_key" ON "agentAction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "agentAction_agentId_plannedAt_idx" ON "agentAction"("agentId", "plannedAt");

-- CreateIndex
CREATE INDEX "agentAction_runId_plannedAt_idx" ON "agentAction"("runId", "plannedAt");

-- CreateIndex
CREATE INDEX "agentAction_provider_externalId_idx" ON "agentAction"("provider", "externalId");

-- CreateIndex
CREATE INDEX "agentAction_status_plannedAt_idx" ON "agentAction"("status", "plannedAt");

-- CreateIndex
CREATE INDEX "agentAuditEvent_agentId_emittedAt_idx" ON "agentAuditEvent"("agentId", "emittedAt");

-- CreateIndex
CREATE INDEX "agentAuditEvent_versionId_emittedAt_idx" ON "agentAuditEvent"("versionId", "emittedAt");

-- CreateIndex
CREATE INDEX "agentAuditEvent_actorUserId_emittedAt_idx" ON "agentAuditEvent"("actorUserId", "emittedAt");

-- CreateIndex
CREATE INDEX "agentAuditEvent_type_emittedAt_idx" ON "agentAuditEvent"("type", "emittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "agentAuditEvent_agentId_type_requestId_key" ON "agentAuditEvent"("agentId", "type", "requestId");

-- CreateIndex
CREATE INDEX "deal_companyId_idx" ON "deal"("companyId");

-- CreateIndex
CREATE INDEX "deal_ownerId_idx" ON "deal"("ownerId");

-- CreateIndex
CREATE INDEX "deal_stage_idx" ON "deal"("stage");

-- CreateIndex
CREATE INDEX "deal_expectedCloseDate_idx" ON "deal"("expectedCloseDate");

-- CreateIndex
CREATE INDEX "deal_leadScore_idx" ON "deal"("leadScore");

-- CreateIndex
CREATE INDEX "deal_lastActivityAt_idx" ON "deal"("lastActivityAt");

-- CreateIndex
CREATE INDEX "deal_baseAmount_idx" ON "deal"("baseAmount");

-- CreateIndex
CREATE INDEX "deal_currency_idx" ON "deal"("currency");

-- CreateIndex
CREATE INDEX "deal_archivedAt_idx" ON "deal"("archivedAt");

-- CreateIndex
CREATE INDEX "exchangeRate_baseCurrency_quoteCurrency_idx" ON "exchangeRate"("baseCurrency", "quoteCurrency");

-- CreateIndex
CREATE UNIQUE INDEX "exchangeRate_baseCurrency_quoteCurrency_source_key" ON "exchangeRate"("baseCurrency", "quoteCurrency", "source");

-- CreateIndex
CREATE INDEX "dealContact_contactId_idx" ON "dealContact"("contactId");

-- CreateIndex
CREATE INDEX "fieldDefinition_entity_position_idx" ON "fieldDefinition"("entity", "position");

-- CreateIndex
CREATE UNIQUE INDEX "fieldDefinition_entity_key_key" ON "fieldDefinition"("entity", "key");

-- CreateIndex
CREATE INDEX "fieldOption_fieldId_position_idx" ON "fieldOption"("fieldId", "position");

-- CreateIndex
CREATE INDEX "fieldValue_fieldId_text_idx" ON "fieldValue"("fieldId", "text");

-- CreateIndex
CREATE INDEX "fieldValue_fieldId_number_idx" ON "fieldValue"("fieldId", "number");

-- CreateIndex
CREATE INDEX "fieldValue_fieldId_date_idx" ON "fieldValue"("fieldId", "date");

-- CreateIndex
CREATE INDEX "fieldValue_companyId_idx" ON "fieldValue"("companyId");

-- CreateIndex
CREATE INDEX "fieldValue_contactId_idx" ON "fieldValue"("contactId");

-- CreateIndex
CREATE INDEX "fieldValue_dealId_idx" ON "fieldValue"("dealId");

-- CreateIndex
CREATE INDEX "fieldValue_optionId_idx" ON "fieldValue"("optionId");

-- CreateIndex
CREATE INDEX "fieldValue_userId_idx" ON "fieldValue"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "fieldValue_fieldId_companyId_key" ON "fieldValue"("fieldId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "fieldValue_fieldId_contactId_key" ON "fieldValue"("fieldId", "contactId");

-- CreateIndex
CREATE UNIQUE INDEX "fieldValue_fieldId_dealId_key" ON "fieldValue"("fieldId", "dealId");

-- CreateIndex
CREATE INDEX "savedView_entity_shared_idx" ON "savedView"("entity", "shared");

-- CreateIndex
CREATE UNIQUE INDEX "savedView_entity_ownerId_name_key" ON "savedView"("entity", "ownerId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "activity_emailThreadId_key" ON "activity"("emailThreadId");

-- CreateIndex
CREATE UNIQUE INDEX "activity_calendarEventId_key" ON "activity"("calendarEventId");

-- CreateIndex
CREATE INDEX "activity_companyId_createdAt_idx" ON "activity"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "activity_dealId_createdAt_idx" ON "activity"("dealId", "createdAt");

-- CreateIndex
CREATE INDEX "activity_contactId_createdAt_idx" ON "activity"("contactId", "createdAt");

-- CreateIndex
CREATE INDEX "activity_dueAt_idx" ON "activity"("dueAt");

-- CreateIndex
CREATE INDEX "activity_createdById_idx" ON "activity"("createdById");

-- CreateIndex
CREATE INDEX "mailboxSync_status_idx" ON "mailboxSync"("status");

-- CreateIndex
CREATE UNIQUE INDEX "mailboxSync_userId_source_key" ON "mailboxSync"("userId", "source");

-- CreateIndex
CREATE UNIQUE INDEX "emailThread_rootMessageId_key" ON "emailThread"("rootMessageId");

-- CreateIndex
CREATE INDEX "emailThread_companyId_lastMessageAt_idx" ON "emailThread"("companyId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "emailThread_contactId_lastMessageAt_idx" ON "emailThread"("contactId", "lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "emailMessage_rfcMessageId_key" ON "emailMessage"("rfcMessageId");

-- CreateIndex
CREATE INDEX "emailMessage_threadId_sentAt_idx" ON "emailMessage"("threadId", "sentAt");

-- CreateIndex
CREATE INDEX "calendarEvent_companyId_startsAt_idx" ON "calendarEvent"("companyId", "startsAt");

-- CreateIndex
CREATE INDEX "calendarEvent_contactId_startsAt_idx" ON "calendarEvent"("contactId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "calendarEvent_iCalUid_originalStartTime_key" ON "calendarEvent"("iCalUid", "originalStartTime");

-- CreateIndex
CREATE INDEX "calendarAttendee_contactId_idx" ON "calendarAttendee"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "calendarAttendee_eventId_email_key" ON "calendarAttendee"("eventId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "appSetting_trackingSiteId_key" ON "appSetting"("trackingSiteId");

-- CreateIndex
CREATE UNIQUE INDEX "trackedDomain_host_key" ON "trackedDomain"("host");

-- CreateIndex
CREATE INDEX "trackedVisitor_contactId_idx" ON "trackedVisitor"("contactId");

-- CreateIndex
CREATE INDEX "trackedVisitor_firstSource_idx" ON "trackedVisitor"("firstSource");

-- CreateIndex
CREATE INDEX "trackedEvent_visitorId_occurredAt_idx" ON "trackedEvent"("visitorId", "occurredAt");

-- CreateIndex
CREATE INDEX "trackedEvent_occurredAt_idx" ON "trackedEvent"("occurredAt");

-- CreateIndex
CREATE INDEX "trackedEvent_host_occurredAt_idx" ON "trackedEvent"("host", "occurredAt");

-- CreateIndex
CREATE INDEX "trackedEvent_source_occurredAt_idx" ON "trackedEvent"("source", "occurredAt");

-- CreateIndex
CREATE INDEX "trackingCounter_expiresAt_idx" ON "trackingCounter"("expiresAt");

-- CreateIndex
CREATE INDEX "trackedPageDaily_host_day_idx" ON "trackedPageDaily"("host", "day");

-- CreateIndex
CREATE UNIQUE INDEX "formSubmission_dedupeKey_key" ON "formSubmission"("dedupeKey");

-- CreateIndex
CREATE INDEX "formSubmission_contactId_idx" ON "formSubmission"("contactId");

-- CreateIndex
CREATE INDEX "formSubmission_createdAt_idx" ON "formSubmission"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "install_uuid_key" ON "install"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "organization_slug_key" ON "organization"("slug");

-- CreateIndex
CREATE INDEX "member_organizationId_idx" ON "member"("organizationId");

-- CreateIndex
CREATE INDEX "member_userId_idx" ON "member"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "member_organizationId_userId_key" ON "member"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "invitation_organizationId_idx" ON "invitation"("organizationId");

-- CreateIndex
CREATE INDEX "invitation_email_idx" ON "invitation"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ssoProvider_providerId_key" ON "ssoProvider"("providerId");

-- CreateIndex
CREATE INDEX "apikey_referenceId_idx" ON "apikey"("referenceId");

-- CreateIndex
CREATE INDEX "apikey_configId_idx" ON "apikey"("configId");

-- CreateIndex
CREATE INDEX "apikey_key_idx" ON "apikey"("key");

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
CREATE UNIQUE INDEX "intakeJob_externalId_key" ON "intakeJob"("externalId");

-- CreateIndex
CREATE INDEX "intakeJob_status_createdAt_idx" ON "intakeJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "intakeJob_userId_createdAt_idx" ON "intakeJob"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "notification_createdAt_idx" ON "notification"("createdAt");

-- CreateIndex
CREATE INDEX "notification_readAt_createdAt_idx" ON "notification"("readAt", "createdAt");

-- CreateIndex
CREATE INDEX "commitment_status_dueAt_idx" ON "commitment"("status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "commitment_dealId_text_key" ON "commitment"("dealId", "text");

-- AddForeignKey
ALTER TABLE "slackMemberMatch" ADD CONSTRAINT "slackMemberMatch_crmUserId_fkey" FOREIGN KEY ("crmUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company" ADD CONSTRAINT "company_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company" ADD CONSTRAINT "company_primaryContactId_fkey" FOREIGN KEY ("primaryContactId") REFERENCES "contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companyEnrichment" ADD CONSTRAINT "companyEnrichment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact" ADD CONSTRAINT "contact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact" ADD CONSTRAINT "contact_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contactFact" ADD CONSTRAINT "contactFact_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contactFact" ADD CONSTRAINT "contactFact_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contactFact" ADD CONSTRAINT "contactFact_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contactBrief" ADD CONSTRAINT "contactBrief_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agentEvent" ADD CONSTRAINT "agentEvent_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "agentConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agentConversation" ADD CONSTRAINT "agentConversation_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agentConversation" ADD CONSTRAINT "agentConversation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agentConversation" ADD CONSTRAINT "agentConversation_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agentConversation" ADD CONSTRAINT "agentConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agentConversation" ADD CONSTRAINT "agentConversation_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agentDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agentConversationFeedback" ADD CONSTRAINT "agentConversationFeedback_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "agentConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agentConversationFeedback" ADD CONSTRAINT "agentConversationFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agentConversationShare" ADD CONSTRAINT "agentConversationShare_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "agentConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agentConversationShare" ADD CONSTRAINT "agentConversationShare_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agentConversationSubmission" ADD CONSTRAINT "agentConversationSubmission_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "agentConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agentConversationSubmission" ADD CONSTRAINT "agentConversationSubmission_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agentConversationAttachment" ADD CONSTRAINT "agentConversationAttachment_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "agentConversationSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agentDefinition" ADD CONSTRAINT "agentDefinition_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agentDefinition" ADD CONSTRAINT "agentDefinition_currentVersionId_id_fkey" FOREIGN KEY ("currentVersionId", "id") REFERENCES "agentVersion"("id", "agentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agentVersion" ADD CONSTRAINT "agentVersion_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agentDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agentVersion" ADD CONSTRAINT "agentVersion_sourceConversationId_fkey" FOREIGN KEY ("sourceConversationId") REFERENCES "agentConversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agentVersion" ADD CONSTRAINT "agentVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agentBuilderArtifact" ADD CONSTRAINT "agentBuilderArtifact_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "agentConversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agentBuilderArtifact" ADD CONSTRAINT "agentBuilderArtifact_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "agentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agentTrigger" ADD CONSTRAINT "agentTrigger_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agentDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agentTrigger" ADD CONSTRAINT "agentTrigger_versionId_agentId_fkey" FOREIGN KEY ("versionId", "agentId") REFERENCES "agentVersion"("id", "agentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agentTrigger" ADD CONSTRAINT "agentTrigger_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agentRun" ADD CONSTRAINT "agentRun_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agentDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agentRun" ADD CONSTRAINT "agentRun_versionId_agentId_fkey" FOREIGN KEY ("versionId", "agentId") REFERENCES "agentVersion"("id", "agentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agentRun" ADD CONSTRAINT "agentRun_triggerId_agentId_fkey" FOREIGN KEY ("triggerId", "agentId") REFERENCES "agentTrigger"("id", "agentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agentRun" ADD CONSTRAINT "agentRun_initiatedById_fkey" FOREIGN KEY ("initiatedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agentRunEvent" ADD CONSTRAINT "agentRunEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "agentRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agentAction" ADD CONSTRAINT "agentAction_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agentDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agentAction" ADD CONSTRAINT "agentAction_runId_agentId_fkey" FOREIGN KEY ("runId", "agentId") REFERENCES "agentRun"("id", "agentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agentAuditEvent" ADD CONSTRAINT "agentAuditEvent_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agentDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agentAuditEvent" ADD CONSTRAINT "agentAuditEvent_versionId_agentId_fkey" FOREIGN KEY ("versionId", "agentId") REFERENCES "agentVersion"("id", "agentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agentAuditEvent" ADD CONSTRAINT "agentAuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal" ADD CONSTRAINT "deal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal" ADD CONSTRAINT "deal_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealContact" ADD CONSTRAINT "dealContact_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealContact" ADD CONSTRAINT "dealContact_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fieldOption" ADD CONSTRAINT "fieldOption_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "fieldDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fieldValue" ADD CONSTRAINT "fieldValue_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "fieldDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fieldValue" ADD CONSTRAINT "fieldValue_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fieldValue" ADD CONSTRAINT "fieldValue_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fieldValue" ADD CONSTRAINT "fieldValue_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fieldValue" ADD CONSTRAINT "fieldValue_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "fieldOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fieldValue" ADD CONSTRAINT "fieldValue_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "savedView" ADD CONSTRAINT "savedView_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity" ADD CONSTRAINT "activity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity" ADD CONSTRAINT "activity_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity" ADD CONSTRAINT "activity_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity" ADD CONSTRAINT "activity_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity" ADD CONSTRAINT "activity_emailThreadId_fkey" FOREIGN KEY ("emailThreadId") REFERENCES "emailThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity" ADD CONSTRAINT "activity_calendarEventId_fkey" FOREIGN KEY ("calendarEventId") REFERENCES "calendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mailboxSync" ADD CONSTRAINT "mailboxSync_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emailThread" ADD CONSTRAINT "emailThread_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emailThread" ADD CONSTRAINT "emailThread_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emailMessage" ADD CONSTRAINT "emailMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "emailThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendarEvent" ADD CONSTRAINT "calendarEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendarEvent" ADD CONSTRAINT "calendarEvent_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendarAttendee" ADD CONSTRAINT "calendarAttendee_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "calendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendarAttendee" ADD CONSTRAINT "calendarAttendee_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trackedVisitor" ADD CONSTRAINT "trackedVisitor_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "formSubmission" ADD CONSTRAINT "formSubmission_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member" ADD CONSTRAINT "member_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member" ADD CONSTRAINT "member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ssoProvider" ADD CONSTRAINT "ssoProvider_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apikey" ADD CONSTRAINT "apikey_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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

-- AddForeignKey
ALTER TABLE "commitment" ADD CONSTRAINT "commitment_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

