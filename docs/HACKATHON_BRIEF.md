# Threadline — Google Cloud AI Builder Cup 2026

**Product**: Threadline  
**Tagline**: "Your conversations, turned into closed deals."

## 1. The Competition
- **Event**: Google Cloud AI Builder Cup 2026, organized by Hack2skill.
- **Submission deadline**: October 18, 2026.
- **Hard requirement**: The solution must run on Google Cloud AI. This includes Gemini on Vertex AI, Google Agent Development Kit (ADK), Gemini Live API, and Cloud Run.
- **Judging weights**:
  - Technical merit & GenAI implementation: 40%
  - Problem alignment & impact: 25%
  - Innovation & creativity: 25%
  - UX & solution design: 10%
- **Vertical**: Future of Work & Enterprise Productivity.
- **Deliverables**:
  1. Deployed working prototype.
  2. 3-minute demonstration video.
  3. Solution write-up explaining our additions.

## 2. Starting Point
- **Base repository**: Fork of Comp AI open-source MIT-licensed agentic CRM (`trycompai/crm`).
- **Core capabilities**:
  - Autonomous background agent with work queue and database leases.
  - Authorised tools and skills.
  - Evidence ledger separating verified writes from proposed human suggestions.
  - Agent conversation tab on records.
- **Current architecture**:
  - Monorepo using Turborepo and Bun.
  - Web application using Next.js App Router and shadcn/ui.
  - API service using NestJS and nestjs-trpc.
  - Database using Prisma ORM and PostgreSQL.
  - Auth using Better Auth.
  - Agent runtime using the eve framework.
  - Storage using Vercel Blob.
- **Licensing requirement**: Keep the MIT LICENSE. Credit Comp AI in the README. Disclose reused components and newly authored components.

## 3. What We Are Building
A WhatsApp-native and voice-native CRM for Indian SMB and field sales teams. These teams operate in Hinglish, Hindi, and regional languages over WhatsApp and phone calls.

### Hero Flows
1. **Self-filling CRM**:
   - The user uploads a WhatsApp chat export (.txt/.zip), voice note, or call recording.
   - Multimodal Gemini extracts lead identity, need, budget, language, objections, and next steps.
   - The system creates or updates contact and deal records.
   - Every extracted field links to exact message quotes or audio timestamps in the evidence ledger.
   - Strong evidence writes directly. Weak evidence creates suggestions for salesperson approval.
2. **Lead Revival Agent**:
   - The agent detects stalled deals and ranks them by recovery potential.
   - It drafts context-aware follow-up messages in the lead's preferred language.
   - The salesperson approves with one tap.
   - The system sends the message through WhatsApp Business Cloud API with `wa.me` link fallback.
3. **Voice Qualifier**:
   - A Gemini Live API voice agent conducts bilingual qualifying calls in Hindi and English.
   - The agent asks qualifying questions and records responses.
   - The system updates deal stage, budget, and notes immediately from the conversation.

## 4. Target Google Cloud Architecture & Key Decisions
- **Models**: Configured entirely via environment variables:
  - `GEMINI_FAST_MODEL` (e.g. `gemini-2.5-flash` or `gemini-4-argon` / Vertex chat default): Fast entity extraction and classification.
  - `GEMINI_SMART_MODEL` (e.g. `gemini-2.5-pro`): Complex reasoning and contextual message drafting.
  - `GEMINI_LIVE_MODEL` (e.g. `gemini-2.0-flash-exp` / live bidirectional audio model): Voice qualifier agent.
- **Agents**: Build NEW agents on Google ADK (`@google/adk`) for our 3 hero flows. Do NOT port the 26 existing eve tools. Reusable assets are TypeScript domain libraries (`evidence.ts`, `facts.ts`, `tasks.ts`), Prisma schema, `AgentTask` database queue, and the UI.
- **Evidence Ledger**: Extends to both Contacts and Deals with first-hand evidence kinds (`whatsapp.message`, `voice.transcript`, `voice.live-call`) as primary sources, and `agent.inference` as a lower-weighted suggestion.
- **Compute**: Cloud Run for Web, API, and Agent services.
- **Database**: Cloud SQL for PostgreSQL using Prisma ORM. Local Docker PostgreSQL for development.
- **Object Storage**: Google Cloud Storage (replacing Vercel Blob).
- **Task Scheduling**: PostgreSQL database lease queue (`agentTask`) with Cloud Tasks / Cloud Scheduler trigger.
- **Caching**: In-memory cache by default. Remove Redis requirement.
- **Authentication**: Better Auth with Google OAuth for team members, plus a planned demo-login path for competition judges.
- **Voice**: Gemini Live API for real-time audio interaction.
- **Analytics**: Optional BigQuery export.

## 5. Scope Boundaries
- Speed takes priority over non-essential completeness.
- Cut Microsoft authentication, Outlook mail sync, Gmail inbox sync, Slack integrations, and legacy research lane tools (Context.dev, LinkedIn, Perplexity).
- Redesign of the visual system happens in a future step. Do not modify styles now.
- Never commit secrets. Document all variables in `.env.example`.
