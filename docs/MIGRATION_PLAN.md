# Architecture Analysis and Migration Plan

## 1. Repository Architecture Map

The repository is a Turborepo monorepo executed with the Bun runtime. It contains three applications and seven shared packages.

### 1.1 Applications

- **`apps/app` (Web Frontend)**:
  - **Framework**: Next.js 15 (App Router), React 19, Tailwind CSS, shadcn/ui.
  - **Port**: 3000.
  - **Entry Points**: [layout.tsx](file:///Users/mehul/Desktop/KAIZEN-VENTURES/SENSEIBLES/OPENSOURCE/crm/apps/app/app/layout.tsx), [proxy.ts](file:///Users/mehul/Desktop/KAIZEN-VENTURES/SENSEIBLES/OPENSOURCE/crm/apps/app/proxy.ts).
  - **Function**: Renders server-side pages and interactive client sheets. Serves CRM tables, records, Kanban boards, and settings. Proxies live agent sessions via [route.ts](file:///Users/mehul/Desktop/KAIZEN-VENTURES/SENSEIBLES/OPENSOURCE/crm/apps/app/app/eve/v1/%5B...path%5D/route.ts).
  - **API Client**: Consumes backend APIs via `@/lib/trpc/client`.

- **`apps/api` (Backend API)**:
  - **Framework**: NestJS 11 with `nestjs-trpc`.
  - **Port**: 3001.
  - **Entry Points**: [main.ts](file:///Users/mehul/Desktop/KAIZEN-VENTURES/SENSEIBLES/OPENSOURCE/crm/apps/api/src/main.ts), [create-app.ts](file:///Users/mehul/Desktop/KAIZEN-VENTURES/SENSEIBLES/OPENSOURCE/crm/apps/api/src/create-app.ts).
  - **Function**: Serves type-safe tRPC procedures (`apps/api/src/**/*.router.ts`). Serves Better Auth endpoints under `/api/auth/*`. Serves OpenAPI documentation at `/openapi.json` and Swagger UI at `/`. Handles cron routes (`/internal/sync/*`, `/internal/archive/*`). Enqueues agent tasks into PostgreSQL via [agent-trigger.service.ts](file:///Users/mehul/Desktop/KAIZEN-VENTURES/SENSEIBLES/OPENSOURCE/crm/apps/api/src/agent/agent-trigger.service.ts) and pokes the agent service over HTTP.

- **`apps/agent` (Agent Service)**:
  - **Framework**: eve framework runtime.
  - **Port**: 2000.
  - **Entry Points**: [agent.ts](file:///Users/mehul/Desktop/KAIZEN-VENTURES/SENSEIBLES/OPENSOURCE/crm/apps/agent/agent/agent.ts), [start.ts](file:///Users/mehul/Desktop/KAIZEN-VENTURES/SENSEIBLES/OPENSOURCE/crm/apps/agent/scripts/start.ts).
  - **Function**: Hosts the background research agent, custom agent builder, and agent runner. Claims tasks from PostgreSQL, executes LLM sessions, tools, and evidence recording. Serves internal dispatch routes on [channels/crm.ts](file:///Users/mehul/Desktop/KAIZEN-VENTURES/SENSEIBLES/OPENSOURCE/crm/apps/agent/agent/channels/crm.ts) and interactive chat on [channels/eve.ts](file:///Users/mehul/Desktop/KAIZEN-VENTURES/SENSEIBLES/OPENSOURCE/crm/apps/agent/agent/channels/eve.ts). Runs the dispatch schedule via [schedules/dispatch.ts](file:///Users/mehul/Desktop/KAIZEN-VENTURES/SENSEIBLES/OPENSOURCE/crm/apps/agent/agent/schedules/dispatch.ts).

### 1.2 Shared Packages

- **`packages/db`**: Prisma schema, generated client, and domain helpers ([agent-tasks.ts](file:///Users/mehul/Desktop/KAIZEN-VENTURES/SENSEIBLES/OPENSOURCE/crm/packages/db/src/agent-tasks.ts), [settings.ts](file:///Users/mehul/Desktop/KAIZEN-VENTURES/SENSEIBLES/OPENSOURCE/crm/packages/db/src/settings.ts), [blob.ts](file:///Users/mehul/Desktop/KAIZEN-VENTURES/SENSEIBLES/OPENSOURCE/crm/packages/db/src/blob.ts), [images.ts](file:///Users/mehul/Desktop/KAIZEN-VENTURES/SENSEIBLES/OPENSOURCE/crm/packages/db/src/images.ts), [currency.ts](file:///Users/mehul/Desktop/KAIZEN-VENTURES/SENSEIBLES/OPENSOURCE/crm/packages/db/src/currency.ts), [workspace.ts](file:///Users/mehul/Desktop/KAIZEN-VENTURES/SENSEIBLES/OPENSOURCE/crm/packages/db/src/workspace.ts)).
- **`packages/auth`**: Better Auth server configuration ([auth.ts](file:///Users/mehul/Desktop/KAIZEN-VENTURES/SENSEIBLES/OPENSOURCE/crm/packages/auth/src/auth.ts)), client export ([client.ts](file:///Users/mehul/Desktop/KAIZEN-VENTURES/SENSEIBLES/OPENSOURCE/crm/packages/auth/src/client.ts)), plugins (organization, sso, api-key, generic-oauth), cookie constants, and permission gates.
- **`packages/validation`**: Shared Zod schemas ([agent-manifest.ts](file:///Users/mehul/Desktop/KAIZEN-VENTURES/SENSEIBLES/OPENSOURCE/crm/packages/validation/src/agent-manifest.ts), [eve-stream.ts](file:///Users/mehul/Desktop/KAIZEN-VENTURES/SENSEIBLES/OPENSOURCE/crm/packages/validation/src/eve-stream.ts), [field-backfill.ts](file:///Users/mehul/Desktop/KAIZEN-VENTURES/SENSEIBLES/OPENSOURCE/crm/packages/validation/src/field-backfill.ts)).
- **`packages/env`**: Workspace environment loader reading root `.env` and `.env.local` ([load.ts](file:///Users/mehul/Desktop/KAIZEN-VENTURES/SENSEIBLES/OPENSOURCE/crm/packages/env/src/load.ts)).
- **`packages/telemetry`**: Telemetry abstraction sending non-sensitive operational metrics to PostHog.
- **`packages/ui`**: Shared UI component library using shadcn/ui and Radix primitives.
- **`packages/typescript-config`**: Shared `tsconfig.json` configurations.

### 1.3 Communication Matrix

```
[Browser Client]
       │
       ├─► (HTTP 3000) Next.js App Router (apps/app)
       │       │
       │       ├─► (Proxy /eve/v1/* + HS256 JWT) ──────────────────────────┐
       │       │                                                          │
       ├─► (HTTP 3001) tRPC & Auth (apps/api)                             │
               │                                                          ▼
               ├─► (Write AgentTask row) ─► [PostgreSQL] ◄─ (Read/Write) [apps/agent]
               │                                ▲                         ▲
               └─► (HTTP POST /internal/crm/dispatch) ────────────────────┘
```

1. **`apps/app` to `apps/api`**: Browser sends HTTP requests to `apps/api` for tRPC data queries and Better Auth endpoints. Authentication uses the `crm.session_token` HTTP-only cookie.
2. **`apps/app` to `apps/agent`**: Browser calls `/eve/v1/*` on the web app origin. Next.js route `apps/app/app/eve/v1/[...path]/route.ts` validates the session, creates a 2-minute HMAC SHA256 JWT using `AGENT_BRIDGE_SECRET`, and forwards the call to `AGENT_URL/eve/v1/*`.
3. **`apps/api` to `apps/agent`**: Communication is asynchronous through the PostgreSQL `AgentTask` table. `AgentTriggerService` creates an `AgentTask` row. Then `AgentTriggerService.poke()` sends an HTTP POST request to `AGENT_URL/internal/crm/dispatch` with Bearer `AGENT_BRIDGE_SECRET` to prompt execution.
4. **`apps/agent` to `apps/api` and Database**: The agent does not call the API for database operations. It imports `@crm/db` and accesses PostgreSQL directly through Prisma transactions.

---

## 2. The Agent Loop, Tools, Skills, and Evidence Ledger

### 2.1 Queue and Database Leases

- **Location**: Database table `agentTask` in PostgreSQL ([schema.prisma](file:///Users/mehul/Desktop/KAIZEN-VENTURES/SENSEIBLES/OPENSOURCE/crm/packages/db/prisma/schema.prisma#L466-L497)).
- **Claim Logic**: Implemented in [tasks.ts](file:///Users/mehul/Desktop/KAIZEN-VENTURES/SENSEIBLES/OPENSOURCE/crm/apps/agent/agent/lib/tasks.ts) (`claimDue()`).
- **Concurrency Control**: Executes raw SQL with `FOR UPDATE SKIP LOCKED`:
  ```sql
  UPDATE "agentTask" AS t
  SET "leasedUntil" = $until, "startedAt" = COALESCE(t."startedAt", $now), "attempts" = t."attempts" + 1
  FROM (
    SELECT t2.id FROM "agentTask" AS t2
    WHERE t2."finishedAt" IS NULL AND t2."dueAt" <= $now
      AND (t2."leasedUntil" IS NULL OR t2."leasedUntil" < $now)
      AND t2."attempts" < 3
    ORDER BY t2."priority" DESC, t2."dueAt" ASC
    LIMIT $limit
    FOR UPDATE SKIP LOCKED
  ) AS due WHERE t.id = due.id;
  ```
- **Two Execution Lanes** ([dispatch.ts](file:///Users/mehul/Desktop/KAIZEN-VENTURES/SENSEIBLES/OPENSOURCE/crm/apps/agent/agent/lib/dispatch.ts)):
  1. **Visible Lane**: Fast deterministic tasks (`brand`, `portrait`, `slack-people-match`, `slack-channel-join`, `agent-event`). Executes directly in process without an LLM session (batch size 60, concurrency 6).
  2. **Research Lane**: Cognitive tasks requiring LLM deliberation (`identify`, `companyProfile`, `meeting`, `sweep`, `recheck`). Dispatches one eve agent session per row (batch size 12).
- **Cleanup and Recovery**:
  - `reconcileStaleTasks()` in [stale-tasks.ts](file:///Users/mehul/Desktop/KAIZEN-VENTURES/SENSEIBLES/OPENSOURCE/crm/apps/agent/agent/lib/stale-tasks.ts) releases expired leases whose processes failed.
  - `retireExhausted()` in [tasks.ts](file:///Users/mehul/Desktop/KAIZEN-VENTURES/SENSEIBLES/OPENSOURCE/crm/apps/agent/agent/lib/tasks.ts) closes rows that exceed maximum attempts (3).

### 2.2 Tool and Skill Registration

Tools are discovered automatically from the filesystem by the eve framework.

#### Authored Root Tools (26 Active Tools)
1. [archive_field.ts](file:///Users/mehul/Desktop/KAIZEN-VENTURES/SENSEIBLES/OPENSOURCE/crm/apps/agent/agent/tools/archive_field.ts): Archives custom record fields.
2. [enrich_company.ts](file:///Users/mehul/Desktop/KAIZEN-VENTURES/SENSEIBLES/OPENSOURCE/crm/apps/agent/agent/tools/enrich_company.ts): Enriches company profile from Context.dev API.
3. [fetch_contact_photo.ts](file:///Users/mehul/Desktop/KAIZEN-VENTURES/SENSEIBLES/OPENSOURCE/crm/apps/agent/agent/tools/fetch_contact_photo.ts): Retrieves profile photographs from GitHub or LinkedIn.
4. [find_contact_socials.ts](file:///Users/mehul/Desktop/KAIZEN-VENTURES/SENSEIBLES/OPENSOURCE/crm/apps/agent/agent/tools/find_contact_socials.ts): Searches web sources for social profile handles.
5. [get_contact_work_history.ts](file:///Users/mehul/Desktop/KAIZEN-VENTURES/SENSEIBLES/OPENSOURCE/crm/apps/agent/agent/tools/get_contact_work_history.ts): Retrieves employment history from LinkedIn data.
6. [get_linkedin_profile.ts](file:///Users/mehul/Desktop/KAIZEN-VENTURES/SENSEIBLES/OPENSOURCE/crm/apps/agent/agent/tools/get_linkedin_profile.ts): Parses structured LinkedIn profile data.
7. [identify_contact.ts](file:///Users/mehul/Desktop/KAIZEN-VENTURES/SENSEIBLES/OPENSOURCE/crm/apps/agent/agent/tools/identify_contact.ts): Identifies person from email domain and signature.
8. [list_deals.ts](file:///Users/mehul/Desktop/KAIZEN-VENTURES/SENSEIBLES/OPENSOURCE/crm/apps/agent/agent/tools/list_deals.ts): Queries deals with pipeline filtering and stages.
9. [list_fields.ts](file:///Users/mehul/Desktop/KAIZEN-VENTURES/SENSEIBLES/OPENSOURCE/crm/apps/agent/agent/tools/list_fields.ts): Lists available custom field definitions.
10. [list_outstanding_work.ts](file:///Users/mehul/Desktop/KAIZEN-VENTURES/SENSEIBLES/OPENSOURCE/crm/apps/agent/agent/tools/list_outstanding_work.ts): Inspects pending agent tasks for a record.
11. [manage_fields.ts](file:///Users/mehul/Desktop/KAIZEN-VENTURES/SENSEIBLES/OPENSOURCE/crm/apps/agent/agent/tools/manage_fields.ts): Creates and modifies custom fields.
12. [read_company_history.ts](file:///Users/mehul/Desktop/KAIZEN-VENTURES/SENSEIBLES/OPENSOURCE/crm/apps/agent/agent/tools/read_company_history.ts): Reads company timeline, notes, deals, and contacts.
13. [read_crm_history.ts](file:///Users/mehul/Desktop/KAIZEN-VENTURES/SENSEIBLES/OPENSOURCE/crm/apps/agent/agent/tools/read_crm_history.ts): Reads contact correspondence history and calendar events.
14. [read_deal_history.ts](file:///Users/mehul/Desktop/KAIZEN-VENTURES/SENSEIBLES/OPENSOURCE/crm/apps/agent/agent/tools/read_deal_history.ts): Reads deal stage duration and linked contacts.
15. [record_fact.ts](file:///Users/mehul/Desktop/KAIZEN-VENTURES/SENSEIBLES/OPENSOURCE/crm/apps/agent/agent/tools/record_fact.ts): Records evidence-backed facts into the evidence ledger.
16. [record_job_change.ts](file:///Users/mehul/Desktop/KAIZEN-VENTURES/SENSEIBLES/OPENSOURCE/crm/apps/agent/agent/tools/record_job_change.ts): Records employer changes and updates contacts.
17. [research_company.ts](file:///Users/mehul/Desktop/KAIZEN-VENTURES/SENSEIBLES/OPENSOURCE/crm/apps/agent/agent/tools/research_company.ts): Conducts deep company research via Perplexity.
18. [research_person.ts](file:///Users/mehul/Desktop/KAIZEN-VENTURES/SENSEIBLES/OPENSOURCE/crm/apps/agent/agent/tools/research_person.ts): Researches background information for a contact.
19. [resolve_linkedin_profile.ts](file:///Users/mehul/Desktop/KAIZEN-VENTURES/SENSEIBLES/OPENSOURCE/crm/apps/agent/agent/tools/resolve_linkedin_profile.ts): Discovers LinkedIn URLs from name and company.
20. [schedule_recheck.ts](file:///Users/mehul/Desktop/KAIZEN-VENTURES/SENSEIBLES/OPENSOURCE/crm/apps/agent/agent/tools/schedule_recheck.ts): Schedules future re-evaluation in `agentTask`.
21. [search_crm.ts](file:///Users/mehul/Desktop/KAIZEN-VENTURES/SENSEIBLES/OPENSOURCE/crm/apps/agent/agent/tools/search_crm.ts): Exact string search across contacts, companies, and deals.
22. [set_chat_title.ts](file:///Users/mehul/Desktop/KAIZEN-VENTURES/SENSEIBLES/OPENSOURCE/crm/apps/agent/agent/tools/set_chat_title.ts): Renames the conversation title in `agentConversation`.
23. [set_contact_socials.ts](file:///Users/mehul/Desktop/KAIZEN-VENTURES/SENSEIBLES/OPENSOURCE/crm/apps/agent/agent/tools/set_contact_socials.ts): Sets validated social links on contact records.
24. [set_field_value.ts](file:///Users/mehul/Desktop/KAIZEN-VENTURES/SENSEIBLES/OPENSOURCE/crm/apps/agent/agent/tools/set_field_value.ts): Writes custom field values on records.
25. [write_brief.ts](file:///Users/mehul/Desktop/KAIZEN-VENTURES/SENSEIBLES/OPENSOURCE/crm/apps/agent/agent/tools/write_brief.ts): Writes synthesized executive narrative into `contactBrief`.
26. [write_workspace_profile.ts](file:///Users/mehul/Desktop/KAIZEN-VENTURES/SENSEIBLES/OPENSOURCE/crm/apps/agent/agent/tools/write_workspace_profile.ts): Writes company profile into `workspaceProfile`.

*(Note: [agent.ts](file:///Users/mehul/Desktop/KAIZEN-VENTURES/SENSEIBLES/OPENSOURCE/crm/apps/agent/agent/tools/agent.ts) disables eve's built-in subagent tool).*

#### Subagent Specialists
- **`agent_builder`** ([apps/agent/agent/subagents/agent_builder](file:///Users/mehul/Desktop/KAIZEN-VENTURES/SENSEIBLES/OPENSOURCE/crm/apps/agent/agent/subagents/agent_builder)): Authors team agents through structured conversation. Tools: `inspect_context`, `save_agent_draft`, `write_agent_file`.
- **`agent_runner`** ([apps/agent/agent/subagents/agent_runner](file:///Users/mehul/Desktop/KAIZEN-VENTURES/SENSEIBLES/OPENSOURCE/crm/apps/agent/agent/subagents/agent_runner)): Executes deployed custom team agents. Tools: `create_crm_activity`, `finish_run`, `inspect_run`, `post_slack_message`, `query_crm`, `read_crm_record`.

#### Markdown Skills (4 Skills)
- [data-boundaries.md](file:///Users/mehul/Desktop/KAIZEN-VENTURES/SENSEIBLES/OPENSOURCE/crm/apps/agent/agent/skills/data-boundaries.md): Directs egress filters and prevents sensitive data leakage.
- [evidence.md](file:///Users/mehul/Desktop/KAIZEN-VENTURES/SENSEIBLES/OPENSOURCE/crm/apps/agent/agent/skills/evidence.md): Instructs the model how to price evidence and avoid hallucinations.
- [identity-matching.md](file:///Users/mehul/Desktop/KAIZEN-VENTURES/SENSEIBLES/OPENSOURCE/crm/apps/agent/agent/skills/identity-matching.md): Enforces rules for identity resolution before linking profiles.
- [writing-a-brief.md](file:///Users/mehul/Desktop/KAIZEN-VENTURES/SENSEIBLES/OPENSOURCE/crm/apps/agent/agent/skills/writing-a-brief.md): Guides structure and tone for contact summary briefs.

### 2.3 The Evidence Ledger

- **Database Models**:
  - `ContactFact`: Stores individual field observations with scores, bands, evidence items, and status (`APPLIED`, `PROPOSED`, `DISMISSED`, `SUPERSEDED`).
  - `ContactBrief`: Stores synthesized prose summaries with section data and source links.
- **Evidence Weighting** ([evidence.ts](file:///Users/mehul/Desktop/KAIZEN-VENTURES/SENSEIBLES/OPENSOURCE/crm/apps/agent/agent/lib/evidence.ts)):
  - Assigns deterministic weights to source kinds (e.g. `profile.email-match` 0.95, `crm.thread-reply` 0.85, `crm.signature-block` 0.80, `web.cited-claim` 0.40).
  - Calculates score using probability combination: $\text{score} = 1 - \prod (1 - w_i)$.
  - Assigns bands:
    - `VERIFIED`: Score $\ge 0.85$ and contains at least one primary source.
    - `PROBABLE`: Score $\ge 0.55$.
    - `POSSIBLE`: Score $\ge 0.30$.
    - Any contradiction drops the score ceiling to 0.45.
- **Write Policy** ([facts.ts](file:///Users/mehul/Desktop/KAIZEN-VENTURES/SENSEIBLES/OPENSOURCE/crm/apps/agent/agent/lib/facts.ts)):
  1. Values entered by a human cannot be overwritten by agent findings.
  2. Previously dismissed values cannot be re-proposed.
  3. If a field is empty (`fillsBlank`), any valid observation applies directly.
  4. If a field contains an existing agent value, only `VERIFIED` evidence overwrites it.
  5. Weaker evidence becomes a `PROPOSED` suggestion for salesperson confirmation.
  6. Applying a fact supersedes earlier proposals and writes to the record column immediately.

### 2.4 How the Agent Tab Gets Its Data

1. **Thread List Loading**:
   - Component [agent-panel.tsx](file:///Users/mehul/Desktop/KAIZEN-VENTURES/SENSEIBLES/OPENSOURCE/crm/apps/app/components/crm/agent-panel.tsx) calls `useConversations()` via tRPC procedure `trpc.conversations.list`.
   - `ConversationsService` in `apps/api` queries `AgentConversation` rows filtered by `userId` and the record ID (`contactId`, `companyId`, or `dealId`).
2. **Transcript Streaming**:
   - [agent-panel.tsx](file:///Users/mehul/Desktop/KAIZEN-VENTURES/SENSEIBLES/OPENSOURCE/crm/apps/app/components/crm/agent-panel.tsx) invokes `useEveAgent()` from `eve/react`.
   - Connects to `/eve/v1/session/:id/stream` through Next.js proxy route [route.ts](file:///Users/mehul/Desktop/KAIZEN-VENTURES/SENSEIBLES/OPENSOURCE/crm/apps/app/app/eve/v1/%5B...path%5D/route.ts).
   - Retrieves the event snapshot via `session.snapshot()`. If the agent is offline, it falls back to tRPC procedure `trpc.conversations.events`, which reads archived events from `AgentEvent` in PostgreSQL.
3. **Cursor and Message Persistence**:
   - As messages stream, `useSavedConversation()` calls tRPC mutation `trpc.conversations.save`.
   - Writes updated `sessionId`, `continuationToken`, `streamIndex`, and `messageCount` to `AgentConversation`.

---

## 3. Inventory of Vendor and Platform Touchpoints

| Vendor / Platform | File Path | Usage & Purpose | Replacement / Action |
| --- | --- | --- | --- |
| **Vercel AI Gateway** | `apps/api/src/settings/model-catalog.service.ts` | Hardcoded `CATALOG_URL = "https://ai-gateway.vercel.sh/v1/models"` | Replace with Vertex AI Model Garden catalog endpoint or static Vertex catalog |
| **Vercel AI Gateway** | `apps/agent/agent/agent.ts` | Agent model configuration via `lib/model.ts` | Replace model target with Vertex AI Gemini models |
| **Vercel AI Gateway** | `packages/db/src/settings.ts` | `DEFAULT_AGENT_MODEL` set to `zai/glm-5.2-fast` | Change default model ID to `gemini-2.5-flash` |
| **Vercel AI Gateway** | `.env.example`, `docs/environment.md` | `AI_GATEWAY_API_KEY` configuration | Replace with `GOOGLE_GENAI_USE_VERTEXAI=1`, `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION` |
| **eve Framework** | `apps/agent/package.json` | Core dependency `"eve": "^0.29.4"` | Replace with Google Agent Development Kit (`@google/adk`) |
| **eve Framework** | `apps/agent/agent/*` | Complete agent codebase (channels, schedules, tools) | Migrate agent definitions, tools, and runners to Google ADK |
| **eve Framework** | `apps/app/package.json` | Dependency `"eve": "^0.29.4"` for `eve/react` | Replace `useEveAgent()` with standard streaming React hook |
| **eve Framework** | `apps/app/components/crm/agent-panel.tsx` | UI chat components using eve protocols | Adapt panel to stream responses from ADK backend |
| **eve Framework** | `apps/app/app/eve/v1/[...path]/route.ts` | Proxy route forwarding to eve runtime | Update or replace with proxy route to ADK service |
| **eve Framework** | `apps/api/src/agent/bridge.ts`, `agent-trigger.service.ts` | HTTP poke to `/internal/crm/dispatch` | Update dispatch target endpoint for Google ADK service |
| **Vercel Blob** | `packages/db/src/blob.ts` | Imports `put` from `@vercel/blob`, checks `BLOB_READ_WRITE_TOKEN` | Replace with `@google-cloud/storage` bucket upload |
| **Vercel Blob** | `packages/db/src/images.ts` | `BLOB_HOST_SUFFIX = ".blob.vercel-storage.com"` | Update image domain suffix to `storage.googleapis.com` |
| **Vercel Blob** | `apps/app/next.config.ts` | `remotePatterns` allow-lists `**.blob.vercel-storage.com` | Update to allow `storage.googleapis.com` |
| **Vercel Blob** | `packages/db/package.json` | Dependency `"@vercel/blob": "^0.27.3"` | Remove dependency and add `@google-cloud/storage` |
| **Vercel Blob** | `apps/agent/agent/lib/brand-images.ts`, `portrait.ts` | Calls `mirror()` from `@crm/db/blob` | Retain `mirror()` call site; redirect implementation to GCS |
| **Vercel Deployment** | `apps/api/vercel.json` | Defines cron schedules for sync and pruning | Replace with Google Cloud Scheduler tasks |
| **Vercel Deployment** | `apps/api/scripts/build-func.mjs` | Custom build script bundling API into `.vercel/output` | Replace with Dockerfile for Cloud Run |
| **Vercel Deployment** | `apps/api/api/index.ts` | Vercel serverless function entry point | Keep for compatibility or route entry to `src/main.ts` |
| **Vercel Deployment** | `.vercelignore` | Ignore rules for Vercel deployment | Add `.dockerignore` for Cloud Run container packaging |
| **Neon Database** | `docs/setup.md`, `README.md` | Mentions pooled connections on Neon | Deploy Cloud SQL for PostgreSQL; use direct connection string |
| **Upstash / Redis** | `apps/api/src/cache/cache.module.ts` | Optional Redis cache provider using `KeyvRedis` | Keep disabled; fallback to default in-memory cache |
| **Context.dev** | `apps/agent/package.json`, `context-dev.ts` | Company brand and person enrichment provider | Stub or replace with Gemini web research |
| **Perplexity** | `apps/agent/agent/lib/perplexity.ts` | External web search provider | Replace with Gemini Grounding with Google Search |
| **Microsoft Graph** | `packages/auth/src/auth.ts`, `apps/api/src/microsoft/*` | Outlook email and calendar sync | Cut completely for hackathon scope |
| **Slack Integration**| `packages/auth/src/slack-*.ts`, `apps/api/src/slack/*` | Slack OAuth and channel sync | Cut completely for hackathon scope |

---

## 4. Prisma Schema Analysis & Proposed Extensions

### 4.1 Relevant Existing Models

- **`Contact`**: Full personal profile (`id`, `firstName`, `lastName`, `email`, `phone`, `title`, `companyId`, `ownerId`). Connects to `ContactFact`, `ContactBrief`, `DealContact`, and `Activity`.
- **`Company`**: Organization profile (`id`, `name`, `domain`, `website`, `description`, `industry`).
- **`Deal`**: Opportunity pipeline (`id`, `name`, `companyId`, `ownerId`, `stage`, `amount`, `currency`).
- **`Activity`**: Timeline interactions (`NOTE`, `CALL`, `EMAIL`, `MEETING`, `TASK`, `STAGE_CHANGE`, `ENRICHMENT`).
- **`ContactFact`**: Structured evidence-backed field ledger (`field`, `value`, `score`, `band`, `evidence`, `status`).
- **`ContactBrief`**: Synthesized narrative summary.
- **`AgentTask`**: Durable task queue row (`kind`, `reason`, `payload`, `priority`, `budget`, `attempts`, `dueAt`, `leasedUntil`, `outcome`).

### 4.2 Proposed Schema Additions

Add the following additions to `packages/db/prisma/schema.prisma`:

```prisma
// 1. Extend ActivityType enum
enum ActivityType {
  NOTE
  CALL
  EMAIL
  MEETING
  TASK
  STAGE_CHANGE
  ENRICHMENT
  WHATSAPP      // Added
  VOICE_NOTE    // Added
}

// 2. WhatsApp message tracking
model WhatsAppMessage {
  id              String         @id @default(cuid())
  externalId      String?        @unique
  contactId       String?
  contact         Contact?       @relation(fields: [contactId], references: [id], onDelete: SetNull)
  dealId          String?
  deal            Deal?          @relation(fields: [dealId], references: [id], onDelete: SetNull)
  senderPhone     String
  senderName      String?
  recipientPhone  String?
  direction       EmailDirection // Reuse INBOUND / OUTBOUND
  body            String
  rawPayload      Json?
  timestamp       DateTime
  evidenceRef     String?
  createdAt       DateTime       @default(now())

  @@index([contactId, timestamp])
  @@index([dealId, timestamp])
  @@map("whatsAppMessage")
}

// 3. Audio recordings and voice notes
model VoiceRecording {
  id              String         @id @default(cuid())
  contactId       String?
  contact         Contact?       @relation(fields: [contactId], references: [id], onDelete: SetNull)
  dealId          String?
  deal            Deal?          @relation(fields: [dealId], references: [id], onDelete: SetNull)
  audioUrl        String         // Google Cloud Storage URL
  durationSeconds Int?
  transcript      String?        // Gemini Multimodal transcription
  language        String?        // Detected language: "hi-IN", "en-IN", "hinglish"
  summary         String?
  source          String         @default("WHATSAPP_VOICE_NOTE")
  recordedA// 4. Stalled deal outbound drafts with approval
enum OutboundDraftStatus {
  PENDING_APPROVAL
  APPROVED
  SENT
  REJECTED
}

model OutboundDraft {
  id                String              @id @default(cuid())
  dealId            String
  deal              Deal                @relation(fields: [dealId], references: [id], onDelete: Cascade)
  contactId         String
  contact           Contact             @relation(fields: [contactId], references: [id], onDelete: Cascade)
  channel           String              @default("WHATSAPP")
  recipientPhone    String
  language          String              @default("hi")
  contextRationale  String
  draftText         String
  status            OutboundDraftStatus @default(PENDING_APPROVAL)
  approvedById      String?
  approvedBy        User?               @relation(fields: [approvedById], references: [id], onDelete: SetNull)
  approvedAt        DateTime?
  sentAt            DateTime?
  waLink            String?             // Fallback wa.me link
  createdAt         DateTime            @default(now())
  updatedAt         DateTime            @updatedAt

  @@index([dealId, status])
  @@index([status, createdAt])
  @@map("outboundDraft")
}

// 5. Deal Evidence Ledger (DealFact)
model DealFact {
  id           String     @id @default(cuid())
  dealId       String
  deal         Deal       @relation(fields: [dealId], references: [id], onDelete: Cascade)
  field        String     // e.g. "budget", "stage", "timeline", "objection", "competitor", "language"
  value        String
  score        Float
  band         FactBand
  evidence     Json       // Array of Evidence items
  method       String
  sourceUrl    String?
  sessionId    String?
  status       FactStatus @default(PROPOSED)
  decidedById  String?
  decidedBy    User?      @relation("DealFactDecider", fields: [decidedById], references: [id], onDelete: SetNull)
  decidedAt    DateTime?
  observedAt   DateTime   @default(now())
  supersededAt DateTime?

  @@index([dealId, field, status])
  @@index([status, observedAt])
  @@map("dealFact")
}
```

### 4.3 Deal Evidence Ledger Recommendation
We evaluate two approaches to cover deals in the evidence ledger:
1. **Option A (Generalize `ContactFact`)**: Make `contactId` nullable and add optional `dealId`.
2. **Option B (Recommended — Dedicated `DealFact`)**: Add a distinct `DealFact` model mirroring `ContactFact`.

**Why Option B (`DealFact`) is recommended**:
- **Field Semantics Differ Completely**: Contacts track attributes like `title`, `seniority`, `function`, and `linkedinUrl`. Deals track deal variables like `budget`, `timeline`, `buyingStage`, `decisionMaker`, `objection`, and `competitor`.
- **Database Hygiene**: Option A forces mutually exclusive null foreign keys on every row, requiring complex checks and partial indexes. Option B preserves strict relational foreign key constraints and fast indexes.
- **TypeScript Safety**: Dedicated domain schemas prevent mixing deal mutations with contact mutations.

### 4.4 New Evidence Source Kinds and Weights
We add new first-hand conversation evidence kinds into `lib/evidence.ts`:
- **`whatsapp.message`** (weight: 0.90, primary: true): The lead wrote this directly in a WhatsApp chat.
- **`voice.transcript`** (weight: 0.85, primary: true): The lead spoke this in a voice note or call recording.
- **`voice.live-call`** (weight: 0.90, primary: true): The lead answered this live to the qualifying voice agent.
- **`agent.inference`** (weight: 0.35, primary: false): Inferred insight based on context or tone; always requires confirmation if conflicting.

---

## 5. Step-by-Step Migration Plan

### Step 1: Trim Unused Vendor Integrations
- **Files**: `packages/auth/src/auth.ts`, `apps/api/src/app.module.ts`, `apps/api/vercel.json`, `apps/agent/agent/lib/dispatch.ts`.
- **Action**: Disable Microsoft OAuth, Slack OAuth, Mailbox sync crons, and legacy third-party research tools (Context.dev, LinkedIn, Perplexity). Keep Better Auth Google provider.
- **Effort**: S (Small).
- **Risk**: Low.

### Step 2: Implement Google Cloud Storage Adapter
- **Files**: `packages/db/src/blob.ts`, `packages/db/src/images.ts`, `apps/app/next.config.ts`, `packages/db/package.json`.
- **Action**: Replace `@vercel/blob` with `@google-cloud/storage`. Upload bytes to a GCS bucket and return signed or public URLs. Add `storage.googleapis.com` to Next.js image domains.
- **Effort**: S (Small).
- **Risk**: Low.

### Step 3: Apply Prisma Schema Extensions
- **Files**: `packages/db/prisma/schema.prisma`.
- **Action**: Add `WhatsAppMessage`, `VoiceRecording`, `OutboundDraft`, `DealFact`, and new `ActivityType` enum values. Run `bun run db:migrate`.
- **Effort**: S (Small).
- **Risk**: Low.

### Step 4: Configure Gemini Models on Vertex AI
- **Files**: `packages/db/src/settings.ts`, `apps/api/src/settings/model-catalog.service.ts`, `.env.example`, `docs/environment.md`.
- **Action**: Read model names from environment variables:
  - `GEMINI_FAST_MODEL` (e.g. `gemini-2.5-flash` or `gemini-4-argon` / Vertex default).
  - `GEMINI_SMART_MODEL` (e.g. `gemini-2.5-pro`).
  - `GEMINI_LIVE_MODEL` (e.g. `gemini-2.0-flash-exp`).
  Replace Vercel AI Gateway model catalog with Vertex AI SDK configuration.
- **Effort**: M (Medium).
- **Risk**: Low.

### Step 5: Build Dedicated Google ADK Agents for Hero Flows (Do NOT Port 26 Eve Tools)
- **Files**: `apps/agent/adk/*`, `apps/agent/agent/lib/dispatch.ts`.
- **Action**:
  - Do NOT port the 26 existing eve tools or subagents.
  - Retain the plain TypeScript libraries: `evidence.ts`, `facts.ts`, `tasks.ts`, and `agentTask` queue.
  - Disable the legacy research lane and third-party lookups.
  - Build fresh, focused Google ADK agents (`@google/adk`) exclusively for the 3 hero flows.
- **Effort**: M (Medium).
- **Risk**: Medium.

### Step 6: Hero Flow 1 — Self-Filling Multimodal CRM
- **Files**:
  - `apps/api/src/intake/intake.controller.ts` (upload endpoint).
  - `apps/agent/adk/agents/self_filling_agent.ts` (ADK multimodal ingestion agent).
  - `apps/app/components/crm/whatsapp-upload-dialog.tsx` (UI modal).
- **Action**:
  - Support WhatsApp `.txt` exports and `.mp3`/`.m4a`/`.ogg` audio uploads.
  - Process text and audio using Gemini multimodal on Vertex AI.
  - Extract lead, budget, requirements, and next steps into `ContactFact` and `DealFact`.
  - Link every fact to exact chat timestamps or audio offsets.
- **Effort**: M (Medium).
- **Risk**: Medium.

### Step 7: Hero Flow 2 — Lead Revival Agent
- **Files**:
  - `apps/agent/adk/agents/lead_revival_agent.ts` (ADK revival agent).
  - `apps/api/src/deals/revival.service.ts`.
  - `apps/app/components/crm/lead-revival-card.tsx`.
- **Action**:
  - Scan stalled deals using database criteria.
  - Draft contextual follow-up messages in lead language using `GEMINI_SMART_MODEL`.
  - Record draft in `OutboundDraft` for one-tap rep approval.
  - Send via WhatsApp Business Cloud API or generate `wa.me` fallback link.
- **Effort**: M (Medium).
- **Risk**: Low.

### Step 8: Hero Flow 3 — Voice Qualifier via Gemini Live API
- **Files**:
  - `apps/app/components/crm/voice-qualifier-modal.tsx`.
  - `apps/api/src/voice/voice-qualifier.gateway.ts`.
- **Action**:
  - Establish bidirectional audio WebSocket with Gemini Live API (`GEMINI_LIVE_MODEL`).
  - Conduct bilingual voice qualification in Hindi and English.
  - Automatically update deal stage, budget, and summary notes upon call conclusion.
- **Effort**: L (Large).
- **Risk**: High.

### Step 9: Cloud Run Containerization and Cloud SQL
- **Files**: `apps/app/Dockerfile`, `apps/api/Dockerfile`, `apps/agent/Dockerfile`, `docker-compose.yml`.
- **Action**:
  - Package services in Docker containers for Cloud Run.
  - Connect to Cloud SQL for PostgreSQL using ADC.
- **Effort**: M (Medium).
- **Risk**: Medium.

### Step 10: Competition Demo Login Path
- **Files**: `packages/auth/src/auth.ts`, `packages/db/prisma/seed.ts`.
- **Action**:
  - Create a seeded demo workspace with test contacts, deals, and recordings.
  - Provide a one-click demo login route that allows judges to enter without `ALLOWED_SIGN_IN` restrictions.
  - Maintain Google OAuth for team members.
- **Effort**: S (Small).
- **Risk**: Low.

---

## 6. Local Execution Guide and Blockers

### 6.1 Exact Commands to Run Locally Right Now

```bash
# 1. Copy environment template
cp .env.example .env

# 2. Fill required minimum variables in .env:
# DATABASE_URL="postgresql://postgres:postgres@localhost:5432/crm?schema=public"
# TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/crm_test?schema=public"
# BETTER_AUTH_SECRET="f3b9c7e2a1d485061928374650192837"
# ALLOWED_SIGN_IN="mehulpersonal14@gmail.com,sethiamehul14@gmail.com"
# AGENT_BRIDGE_SECRET="a9b8c7d6e5f4132435465768798091a2"
# GOOGLE_GENAI_USE_VERTEXAI="1"
# GOOGLE_CLOUD_PROJECT="project-e705af63-271f-48bf-92f"
# GOOGLE_CLOUD_LOCATION="us-central1"
# GEMINI_FAST_MODEL="gemini-4-argon"
# GEMINI_SMART_MODEL="gemini-2.5-pro"
# GEMINI_LIVE_MODEL="gemini-2.0-flash-exp"

# 3. Start PostgreSQL container
docker compose up -d

# 4. Apply migrations and seed initial data
bun run db:migrate && bun run db:seed

# 5. Start all monorepo services
bun run dev
```

### 6.2 Current Potential Blockers

1. **OAuth Credentials**:
   - `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` must be set in `.env` to sign in.
2. **PostgreSQL Port Conflict**:
   - Port 5432 must be free for Docker.
3. **Google ADC**:
   - Local Google Cloud calls require `gcloud auth application-default login` (confirmed active on this machine).

---

## 7. Open Questions and Architectural Decisions

1. **Gemini Live API Endpoint & Model**:
   - Live native-audio bidirectional streaming requires a live-capable model (such as `gemini-2.0-flash-exp` or Gemini Live API preview endpoints).
   - Audio streaming will connect over WebSocket from the client or relay via API gateway.
2. **WhatsApp Dispatch Fallback**:
   - Meta Cloud API will be configured, with immediate fallback to `https://wa.me/<phone>?text=<encoded_text>` links for 100% demo safety.
