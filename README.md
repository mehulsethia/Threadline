# Threadline

**Your conversations, turned into closed deals.**

Threadline is an agentic CRM for sales teams. It reads the WhatsApp chats, emails,
calls and voice notes your team already has, in any language. It fills in the CRM,
links every field to the message it came from, and follows up on deals before they go
cold. It runs on Gemini, Google ADK and Cloud Run.

[Live app](https://threadline-app-358743112898.us-central1.run.app) ·
[What it does](#what-it-does) · [How it works](#how-it-works) ·
[Quick start](#quick-start) · [Configuration](#configuration) ·
[Deploying](#deploying-to-google-cloud) · [Roadmap](#roadmap)

---

## The problem

Sales happens in WhatsApp, email, Slack and on calls, not in the CRM. So the CRM stays
empty, deals stall without anyone noticing, and follow-ups are missed. AI tools that
"auto-fill" a CRM guess, and a confident wrong fact about a customer is worse than a
blank field, because nobody can tell it is wrong.

Threadline fills the CRM from the conversations themselves, and **every field links to
the exact quote or audio moment it came from**. Strong evidence writes to the record.
Weak evidence becomes a suggestion that a rep accepts or dismisses. No message leaves
without a person approving it.

## What it does

| Feature | What happens | Google Cloud AI |
| --- | --- | --- |
| **Self-filling CRM** | Import a WhatsApp export, email thread, call recording, voice note or transcript, or let Gmail capture it. Gemini extracts the contact, company, need, budget, currency, language, objections, next steps and promises. Each value cites its source in the evidence ledger. Importing the same file twice creates no duplicates. | Gemini on Vertex AI, Google ADK intake agent |
| **Inbound lead review** | Gmail captures new inbound leads, including senders you have not answered yet and senders on free mail such as gmail.com. These leads show a **To review** badge. **Keep** makes them normal records. **Remove** takes them out of the CRM. | Gemini extraction on capture |
| **Lead revival agent** | Finds stalled deals, ranks them by value, and drafts one follow-up in the lead's language and channel. A claim guard removes anything the evidence does not support. The rep approves in the app or in Slack. | Google ADK agent |
| **Voice qualifier** | A live voice agent runs a short qualifying call (budget, authority, need, timeline, competitors, decision process) in the lead's language. It greets the lead, asks one question at a time, records each answer as a cited fact, and proposes a stage and a 0–100 score. | Gemini Live API, native audio |
| **Ask your CRM** | Ask about deals, conversations, promises, tasks and the forecast in plain language. Answers link to the records. | Google ADK agent with CRM tools |
| **AI assist** | A lead score with written reasons, deal health, win probability, personalised message drafts and meeting briefs for each deal. | Gemini on Vertex AI |
| **Forecast and promises** | A weighted forecast by stage and month in one reporting currency, and a tracker for every promise made by you or the lead. | Gemini on Vertex AI |
| **Enquiry forms** | A form on your site creates the contact and the deal, scores the lead and alerts the owner. | Gemini on Vertex AI |

Deals keep their own currency (ISO 4217, detected from the conversation) and report in
one workspace currency. Pipeline stages follow standard B2B: Lead, Qualified,
Meeting/Demo, Proposal, Negotiation, Won, Lost.

### Connections

| Source | What it brings in |
| --- | --- |
| **Gmail and Google Calendar** | Email threads and meetings, checked every 15 minutes. **Fetch last 7 days** re-reads a week of mail at any time and skips what is already filed. |
| **Google Meet** | Meeting transcripts. |
| **Slack** | Channel messages. It also posts revival drafts for one-tap approval. |
| **Fireflies and Fathom** | Call transcripts. |
| **Microsoft 365** | Outlook mail. |
| **Import** | WhatsApp exports, email files, audio recordings, voice notes, PDFs and pasted text. |

### Signing in

- **Email and password**: sign up and sign in without any third-party account.
- **Google**: one click. The same Google connection can later read Gmail and Calendar.
- **Demo workspace**: one click opens a sample team with 12 deals. No sign-up.

Every new account gets its own workspace and a short onboarding: name, website, profile,
then connections.

## How it works

```
Browser ──▶ Web app (Next.js) ──/api/*──▶ API (NestJS, tRPC, Better Auth)
                                             │
                                             │ writes an AgentTask row, or calls
                                             ▼ the agent with an IAM ID token
                                          Agent worker (Google ADK + Gemini)
                                             │
                              Cloud SQL for PostgreSQL (one schema per workspace)
```

- **The web app** serves every page and proxies `/api/*` to the API, so sign-in
  cookies and OAuth callbacks live on one origin.
- **The API** handles HTTP, sign-in, tRPC and mailbox sync. It decides nothing about a
  person or a company. It records that something happened and passes the work to the
  agent.
- **The agent worker** owns every model call: the intake, revival, Ask, scoring and
  writer agents, and the Gemini Live voice session. The API relays the voice call's
  WebSocket to it, so no Google credential reaches the browser.
- **Each workspace is its own Postgres schema.** A query with no workspace in context
  throws instead of guessing, so one workspace cannot read another's rows.

### On Google Cloud

| Service | Use |
| --- | --- |
| **Vertex AI** | Gemini for extraction, drafting, scoring and Ask; the Gemini Live API for voice |
| **Cloud Run** | Three services: the web app, the API and the agent worker. Only the API can call the agent (IAM-only). |
| **Cloud SQL for PostgreSQL** | All data, one schema per workspace |
| **Cloud Storage** | Uploaded files and recordings |
| **Cloud Scheduler** | Hourly revival, 15-minute mail capture, daily exchange rates, nightly demo reset |
| **Cloud Build and Artifact Registry** | Builds and stores the three images |
| **Secret Manager** | OAuth clients, database URL and signing secrets |

Models are set by environment variable:

| Variable | Default | Used for |
| --- | --- | --- |
| `GEMINI_FAST_MODEL` | `gemini-4-argon` | Extraction and classification |
| `GEMINI_SMART_MODEL` | `gemini-4-argon` | Drafting and reasoning |
| `GEMINI_ASK_MODEL` | `gemini-2.5-flash` | Ask your CRM |
| `GEMINI_LIVE_MODEL` | `gemini-live-2.5-flash-native-audio` | Voice qualifier |

## The stack

A [Turborepo](https://turborepo.dev) monorepo on [Bun](https://bun.com).

| | |
| --- | --- |
| **Models** | Gemini on Vertex AI through `@google/genai` |
| **Agents** | [Google Agent Development Kit](https://google.github.io/adk-docs/) (`@google/adk`) |
| **Front end** | [Next.js](https://nextjs.org) App Router, [shadcn/ui](https://ui.shadcn.com), [nuqs](https://nuqs.dev) for URL state |
| **API** | [NestJS](https://nestjs.com) with [nestjs-trpc](https://nestjs-trpc.io) |
| **Auth** | [Better Auth](https://better-auth.com): email and password, Google, Microsoft, SSO, workspaces |
| **Data** | [Prisma](https://prisma.io) on PostgreSQL |
| **Tooling** | TypeScript, [Zod](https://zod.dev) at every boundary, [Biome](https://biomejs.dev) |

The app calls the API over tRPC with a generated router type, so the front end is
type-safe from the database row to the table cell. List filters, sorting and paging
live in the URL.

### Layout

| Path | |
| --- | --- |
| `apps/app` | Next.js web app, port 3000 |
| `apps/api` | NestJS API: HTTP, auth, tRPC, mailbox sync. Port 3001 |
| `apps/agent` | Agent worker (`adk/`): intake, revival, Ask, scoring, writer, voice. Port 2000 |
| `packages/db` | Prisma schema, migrations, workspace schemas, shared client |
| `packages/auth` | Better Auth configuration |
| `packages/validation` | Zod schemas for every shape that crosses a package boundary |
| `packages/ui` | Shared shadcn/ui components and the theme |
| `packages/env` | Loads the one root `.env` |
| `deploy/` | Cloud Build config and the Cloud Run deploy script |
| `docs/` | Rules for each area of the code |

## Quick start

You need [Bun](https://bun.com) and Docker.

```sh
git clone https://github.com/mehulsethia/Threadline.git && cd Threadline
cp .env.example .env          # then set the values below
bun install

docker compose up -d          # Postgres on :5432
bun run db:deploy             # apply migrations
bun run db:seed               # optional: a sample pipeline
bun run dev                   # app :3000, API :3001, agent :2000
```

Open [localhost:3000](http://localhost:3000) and create an account with email and
password, or open the demo workspace.

### The values to set

| Variable | What to put in it |
| --- | --- |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` |
| `ALLOWED_SIGN_IN` | Your team's email domain, e.g. `acme.com`. Mail from these addresses is never filed as a lead. |
| `AGENT_BRIDGE_SECRET` | `openssl rand -base64 32`. Connects the API to the agent for Ask, AI assist, imports and voice. |
| `GOOGLE_CLOUD_PROJECT` | Your Google Cloud project with Vertex AI enabled |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Optional. Google sign-in, Gmail and Calendar. Set both or neither. |

Gemini calls use [Application Default Credentials](https://cloud.google.com/docs/authentication/application-default-credentials).
Run `gcloud auth application-default login` once on your machine.

`DATABASE_URL` already matches the `docker compose` Postgres.

<details>
<summary><strong>Setting up the Google OAuth client</strong></summary>

1. [Google Cloud console](https://console.cloud.google.com/apis/credentials) →
   **Credentials** → **Create credentials** → **OAuth client ID** → **Web application**.
2. Under **Authorised redirect URIs**, add
   `http://localhost:3001/api/auth/callback/google`. In production, add
   `https://<your-app-host>/api/auth/callback/google`.
3. Enable the [Gmail API](https://console.cloud.google.com/apis/library/gmail.googleapis.com)
   and the [Calendar API](https://console.cloud.google.com/apis/library/calendar-json.googleapis.com).
4. Copy the client ID and secret into `.env`, then restart `bun run dev`.

</details>

## Configuration

There is **one `.env`, at the root of the repo**, read by all three processes. Real
environment variables always win. [`.env.example`](./.env.example) lists every
variable with a note on what it does. Anything a self-hoster may not have is optional:
a missing key turns off that one feature and never stops the app.

| | |
| --- | --- |
| `GCS_BUCKET` | Cloud Storage bucket for uploads. |
| `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` | Microsoft sign-in and Outlook mail. |
| `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` / `SLACK_SIGNING_SECRET` | The Slack connection. |
| `CRON_SECRET` | Guards the scheduled routes (mail capture, revival, rates). |
| `API_URL` / `APP_URL` | Public origins. Only needed off localhost. |
| `CRM_TELEMETRY_DISABLED` | Set to `1` to report nothing. |

## Commands

| Command | |
| --- | --- |
| `bun run dev` | Prepare the local database, then run the app, API and agent in watch mode |
| `bun run build` | Build every app and package |
| `bun run test` | Run the test suites |
| `bun run check-types` | Typecheck everything |
| `bun run lint` / `bun run format` | Biome |
| `bun run db:migrate` | Create and apply a migration |
| `bun run db:seed` | Top up the sample pipeline |
| `bun run db:studio` | Prisma Studio |
| `bun run --filter=api trpc:generate` | Regenerate the tRPC router type |

## Deploying to Google Cloud

The three images are built by Cloud Build and deployed to Cloud Run by one script:

```sh
TAG=$(git rev-parse --short HEAD)
gcloud builds submit --config deploy/cloudbuild.yaml --substitutions=_TAG=$TAG .
TAG=$TAG deploy/deploy.sh all
```

`deploy.sh all` does three things in order:

1. **Migrate.** It runs a Cloud Run job that applies the Prisma migrations to the public
   schema and to every workspace schema, then refreshes the demo workspace.
2. **Services.** It deploys the agent, the API and the web app, and gives the API
   permission to call the agent.
3. **Scheduler.** It creates or updates the four Cloud Scheduler jobs.

Secrets come from Secret Manager. See [`deploy/deploy.sh`](./deploy/deploy.sh) for the
full list.

## Roadmap

- WhatsApp Business API: two-way capture and sending, with no exports
- Outlook and Teams capture for Microsoft 365 sales teams
- Outbound qualifying calls over phone lines with Gemini Live
- Meetings booked straight from a qualifying call
- Approved write-back to Salesforce, HubSpot and other CRMs
- Roles and a workspace switcher for larger teams
- A benchmark of 100+ labelled conversations in 10+ languages
- More data sources and enrichment providers
- BigQuery export for revenue analytics
- MCP connections to major LLMs and AI agents
- A log of every data fetch, enrichment and scheduled job

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Report security issues privately through
[SECURITY.md](./SECURITY.md), not in a public issue.

## Licence

[MIT](./LICENSE).
