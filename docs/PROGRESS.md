# Threadline Implementation Progress

Running log tracking all parts, steps, execution status, commit hashes, and verified outputs.

---

## PART 1 — Positioning correction (docs + defaults)

- **Status**: DONE
- **Commit**: `095e74e`
- **Date**: 2026-10-16
- **Summary**:
  - Repositioned Threadline in `docs/HACKATHON_BRIEF.md` as a global B2B product for mid-market and enterprise sales teams worldwide.
  - Neutralized defaults: Deal currency defaults to ISO 4217 detected code or workspace reporting currency (default USD); timezone defaults to UTC; language auto-detection for all global languages; neutral multilingual extraction prompts.
  - Pipeline stages updated to standard B2B labels:
    - `UNQUALIFIED_TO_BUY` -> `Lead`
    - `QUALIFIED_TO_BUY` -> `Qualified`
    - `DEMO_BOOKED` -> `Meeting/Demo`
    - `CONTRACT_SENT` -> `Proposal`
    - `DECISION_MAKER_BOUGHT_IN` -> `Negotiation`
    - `CLOSED_WON` -> `Won`
    - `CLOSED_LOST` -> `Lost`
  - Added 3 realistic global B2B fixtures:
    - `fixtures/saas-pipeline-us.txt`: US B2B SaaS security monitoring ($48,000 USD).
    - `fixtures/manufacturing-de-whatsapp.txt`: German manufacturing valves & flow sensors (72,000 EUR).
    - `fixtures/call-recording-uk.txt`: UK fleet logistics telematics call transcript (£32,500 GBP).
  - Executed autonomous intake pipeline test (`scripts/test-intake-flow.ts`) against all 5 fixtures.

### Real Intake Verification Outputs (Post-Fix B1, B2, B3)

```
TEST 1: Ingesting Valves Manufacturing Enquiry (India/B2B) (valves-enquiry.txt)
  Contact: Vikram Malhotra (9820198201) | Company: Apex Flow Controls
  Deal: "SS316 Industrial Ball Valves (Class 150) - 2 inch and 3 inch" | Stage: Negotiation | Amount: 450000 INR
  Facts: 9 total (5 APPLIED, 4 PROPOSED)
    - [PROPOSED] companyProfile: "No confident public match found" [matchConfidence: 0.00]
  Tasks Created: 1 ("Send formal quotation PDF via email or WhatsApp" | due: 2026-10-15T06:25:00.000Z)

TEST 2: Ingesting Education Course Enquiry (India/SMB) (coaching-institute.txt)
  Contact: Sunita Rao (No phone) | Company: None (B2 Fixed: seller organisation "Apex IIT Academy" cleared)
  Deal: "Class 11 & 12 JEE (Advanced) Two-Year Classroom Coaching Program" | Stage: Meeting/Demo | Amount: 180000 INR (B3 Fixed: 180,000 INR deterministic extraction)
  Facts: 7 total (4 APPLIED, 3 PROPOSED)
  Tasks Created: 1 ("Schedule JEE diagnostic test and visit centre" | due: 2026-10-17T05:30:00.000Z)

TEST 3: Ingesting English B2B SaaS Enterprise Deal (US) (saas-pipeline-us.txt)
  Contact: Sarah Jenkins (+15125550199) | Company: Datacore Cloud
  Deal: "Enterprise Security Monitoring Software for Kubernetes Clusters" | Stage: Negotiation | Amount: 48000 USD
  Facts: 9 total (5 APPLIED, 4 PROPOSED)
    - [PROPOSED] companyProfile: "No confident public match found" [matchConfidence: 0.10] (B1 Fixed: rejected DataCore Software match)
  Tasks Created: 1 ("Schedule product demo with security architect" | due: 2026-10-15T14:00:00.000Z)

TEST 4: Ingesting German Manufacturing Enquiry (EU/Germany) (manufacturing-de-whatsapp.txt)
  Contact: Heinrich Weber (+491715550144) | Company: Weber Maschinenbau GmbH
  Deal: "industrielle Durchflusssensoren und Druckventile für unsere automatisierte Fertigungsstraße" | Stage: Negotiation | Amount: 72000 EUR
  Facts: 9 total (5 APPLIED, 4 PROPOSED)
    - [PROPOSED] companyProfile: "No confident public match found" [matchConfidence: 0.25]
  Tasks Created: 1 ("Create and send the formal offer as a PDF via email" | due: 2026-10-12T11:20:00.000Z)

TEST 5: Ingesting English Call-Recording Style Transcript (UK) (call-recording-uk.txt)
  Contact: Oliver Smith (+447700900123) | Company: Apex Fleet Logistics
  Deal: "Upgrade telematics and dispatch management system" | Stage: Negotiation | Amount: 32500 GBP
  Facts: 7 total (4 APPLIED, 3 PROPOSED)
  Tasks Created: 1 ("Email the formal proposal and contract pack" | due: 2026-10-15T17:00:00.000Z)

IDEMPOTENCY VERIFICATION (Re-importing US SaaS fixture):
  - Messages diff: 0
  - Contacts diff: 0
  - Tasks diff: 0
  - 0 duplicate messages, contacts, or tasks created.
```

- **Open Issues**: None.

---

## PART 2 — Fixes from browser test

- **Status**: DONE
- **Commit**: `fff4a15`
- **Date**: 2026-10-16
- **Summary**:
  - **Hydration error resolved**:
    - Identified root cause of `StatCard` hydration error: Node SSR environment defaults to `en-US` (`$0`), whereas client browsers in other regions (e.g. `en-GB`, `en-CA`) default to regional symbol (`US$0`).
    - Standardized `formatMoney(cents, currency, locale = "en-US")`, `formatMoneyCompact(cents, currency, locale = "en-US")`, and `formatDate(date, locale = "en-US", timeZone = "UTC")` in `@crm/ui/lib/format` with explicit default locale and timezone so server and client always render identical strings.
  - **Import dialog participant step**:
    - Replaced free-text field with interactive radio list from `intake.previewParticipants`.
    - Auto-detected "me" participant pre-selected with confidence percentage badge.
    - Added "Someone else" radio option with expandable text input as a seamless fallback.
  - **Result card enhancements**:
    - Expanded import result card to display breakdown of: Contacts created, Deals created, Tasks created, Facts Applied (verified to ledger), and Facts Suggested (pending review).
    - Kept agent step timeline visible via a collapsible accordion detail view showing full sequence of executed agent tools and timestamps.
  - **Rebrand to Threadline**:
    - Updated web application metadata, page titles (`Threadline — Your conversations, turned into closed deals`), favicon links, header branding, and sign-in page copy.
    - Preserved MIT license and Comp AI attribution in `README.md` and footer.

- **Open Issues**: None.

---

## PART 3 — Company research via Gemini Grounding with Google Search

- **Status**: DONE
- **Commits**: `a96daf1`, `1b2168d`
- **Date**: 2026-10-16
- **Summary**:
  - Implemented `researchCompany` in `apps/agent/adk/research/company.ts` utilizing `GEMINI_SMART_MODEL` (`gemini-4-argon`) with Google Search Grounding (`config: { tools: [{ googleSearch: {} }] }`) on Google Cloud Vertex AI.
  - **Bug Fix B1 (Entity-Match Verification)**:
    - Added `industryContext` to research input and prompt.
    - Model must confirm match using domain (if known), location, and industry/product context from the conversation.
    - Emits `matchConfidence` (0–1), `matchReasons` (string[]), and `entityMatched`.
    - Threshold guard: If `matchConfidence < 0.70`, store nothing except a single `PROPOSED` fact `companyProfile = "No confident public match found"`, suppressing false profile/size/location/news facts.
    - Added UI badge `Match: XX%` in `apps/app/components/crm/facts.tsx` next to grounded facts.
  - Returns structured business profile when `matchConfidence >= 0.70`:
    - `overview`: Concise 1-2 sentence description of products, services, and target buyers.
    - `sizeSignals`: Headcount, customer deployment count, and revenue/funding scale signals.
    - `location`: Headquarters and operational offices.
    - `recentNews`: Recent product launches, acquisitions, and press updates.
    - `sourceUrls`: Real cited URLs extracted from Vertex Search Grounding chunks.
    - Real-time latency tracking (ms) and cost estimation ($0.035 base search grounding + token pricing).
  - Added `web.grounded` evidence kind in `apps/agent/agent/lib/evidence.ts` with weight `0.5`, `primary: false`, and label `grounded web search via Google Grounding on Vertex`.
  - Added new fact fields: `companyProfile`, `companySize`, `companyNews` in `apps/agent/agent/lib/facts.ts`.
  - Enforced guardrail: uncorroborated `web.grounded` facts store with score `0.5`, band `POSSIBLE`, and status `PROPOSED`.
  - Replaced legacy disabled Perplexity tool with grounded research tool.
  - Registered `researchCompanyTool` into `INTAKE_TOOLS` and wired `runCompanyResearchStep` into autonomous intake pipeline with idempotency check.

- **Open Issues**: None.

---

## PART 4 — Hero Flow 2: Lead Revival

- **Status**: DONE
- **Commits**: `d1f367f`, `1b2168d`
- **Date**: 2026-10-16
- **Summary**:
  - **R1: Stalled Deal Detection Engine** (`apps/agent/adk/revival/detector.ts`):
    - Deterministic evaluation using configurable workspace stage SLAs (`UNQUALIFIED_TO_BUY`: 3d, `QUALIFIED_TO_BUY`: 5d, `DEMO_BOOKED`: 4d, `CONTRACT_SENT`: 5d, `DECISION_MAKER_BOUGHT_IN`: 3d).
    - Detects stall condition if: (1) no inbound message exceeds stage SLA, (2) an overdue "Check: ..." task exists, OR (3) the lead's last message contains an unanswered pricing/timeline question.
    - Currency-normalized priority ranking: deal amount converted via static FX table (`FX_RATES_TO_USD`) × stage weight × staleness factor.
    - Excludes `CLOSED_WON` and `CLOSED_LOST` deals.
  - **R2: ADK Revival Agent** (`apps/agent/adk/revival/agent.ts`):
    - Powered by `GEMINI_SMART_MODEL` (`gemini-4-argon`).
    - Considers full context: messages, facts ledger + evidence, objections, open tasks, previous drafts, and workspace Playbook guidance.
    - Chooses exactly 1 of 5 strategies: `nudge`, `address_objection`, `new_value`, `confirm_next_step`, `polite_close_out`.
    - Generates 1 cited draft in the contact's native language and preferred channel (WhatsApp or Email with subject).
    - Adheres to workspace Playbook notes (tone, compliance, zero hallucinated pricing/commitments).
    - Saves record as `OutboundDraft` with status `PENDING_APPROVAL`, priority score, and pre-computed `waLink`.
  - **R3: Guardrails**:
    - Enforced 3-day quiet period: deals with a draft created in the past 3 days are excluded.
    - Contact timezone respect for message scheduling.
    - Multilingual opt-out detection (e.g. "not interested", "unsubscribe", "stop", "kein interesse", "no me interesa") marks `contact.optedOut = true` and permanently excludes the lead from revival outreach.
  - **R4: Frontend Lead Revival Dashboard** (`apps/app/app/(app)/[slug]/revival/`):
    - Priority-sorted queue with status tabs (Pending Approval, Sent, Skipped).
    - Displays: Deal name, stage indicator, company, contact handle, normalized deal value, priority score badge.
    - "Why stalled" alert banner with exact detection cause.
    - Strategy badge, confidence score, and agent rationale explanation.
    - Grounded citation badges with interactive popovers showing cited evidence.
    - Editable draft textarea and email subject editor.
    - Action buttons: "Approve & Send" (opens `wa.me` for WhatsApp or `mailto:` for email, marks `SENT`, logs activity, creates follow-up task), "Edit draft", and "Skip".
    - Revival Settings Dialog to tune stage SLAs and sales playbook guidance.
    - Added "Revival" navigation item with `Renew` icon in `AppIconRail`.
  - **R5: Task Queue Integration & AgentEvents**:
    - Added `revival` kind to `agent-tasks.ts` and dispatch runner in `apps/agent/agent/lib/dispatch.ts`.
    - "Run revival now" button triggers `trpc.revival.runNow`.
    - Emits `revival.cycle_started`, `revival.draft_created`, and `revival.cycle_completed` `AgentEvents`.
  - **R6: Verification Against 4 Test Scenarios**:
    - Executed test script `scripts/test-revival-flow.ts` simulating 4 stalled deals with backdated timestamps.

### Real R6 Revival Execution Outputs

```text
=== LEAD REVIVAL EXECUTION REPORT ===
Cycle ID: 835bc80f-782f-4ef8-86ae-672f88e97dc4
Stalled Deals Detected: 4
Drafts Generated: 4

--------------------------------------------------
SCENARIO 1: US SaaS Deal Stuck at Proposal 8 Days (Datacore Enterprise Security)
Deal ID: cmvaron6500019vrp8vraovr6
Channel: WHATSAPP
Strategy: confirm_next_step
Rationale: The deal is in the CONTRACT_SENT stage and has been stalled for 8 days while the compliance committee reviews SOC2 details. Proactively offering support for both their SOC2 Type II and ISO 27001 requirements aligns with the consultative playbook and helps move the contract toward signature.
Subject: N/A
Cited Evidence: ["cmvaron6800029vrpqf17bkx7","[2026-10-08T09:30:23.685Z] (Sarah Jenkins): Thanks for sending over the Enterprise Proposal Alex. Our compliance committee is reviewing the SOC2 details."]
Text:
Hi Sarah, I wanted to check in and see how the compliance committee's review of our SOC2 details is progressing. Since ISO 27001 and SOC2 Type II certifications are required before signing, please let me know if your team needs any additional documentation or a quick call to help finalize the review. Best regards, The Threadline Team.

--------------------------------------------------
SCENARIO 2: German Manufacturing Enquiry with Unanswered Pricing Question (Weber Precision Valves)
Deal ID: cmvaron6c00059vrpsdvvs4k5
Channel: WHATSAPP
Strategy: confirm_next_step
Rationale: The lead asked a specific question about delivery times and volume pricing for 500 high-pressure valves 4 days ago. Since we cannot invent prices or timelines not in the ledger, the best approach is to acknowledge the unanswered question and confirm the upcoming demo/call to walk through the exact volume pricing and delivery schedules together.
Subject: N/A
Cited Evidence: ["cmvaron6e00069vrpg00tjm5o","[2026-10-12T09:30:23.685Z] (Klaus Weber): Guten Tag, können Sie uns die genauen Lieferzeiten und Staffelpreise für 500 Einheiten der Hochdruckventile mitteilen?"]
Text:
Guten Tag Herr Weber, vielen Dank für Ihre Nachricht bezüglich der Lieferzeiten und Staffelpreise für die 500 Einheiten der Hochdruckventile. Da diese Details von Ihren spezifischen Anforderungen abhängen, würde ich Ihnen die genauen Konditionen und unsere schnelle Bereitstellung gerne direkt in unserer geplanten Demo vorstellen. Passt der vereinbarte Termin noch für Sie? Best regards, The Threadline Team.

--------------------------------------------------
SCENARIO 3: UK Deal with Overdue "Check:" Task (Sterling Route Logistics)
Deal ID: cmvaron6h00099vrphm0wt9f5
Channel: WHATSAPP
Strategy: confirm_next_step
Rationale: The lead is eager to move forward pending confirmation of the SLA schedule and agreement redlines. Confirming the next step directly addresses the final blocker to close the deal while emphasizing our high-volume reliability.
Subject: N/A
Cited Evidence: ["[2026-10-14T09:30:23.685Z] (Oliver Sterling): Hi team, we are eager to move forward once the SLA schedule is confirmed.","Task: Check: Oliver Sterling agreement redlines"]
Text:
Hi Oliver, thank you for your patience. We are reviewing the agreement redlines and finalizing the SLA schedule to ensure it fully supports your high-volume reliability requirements. Would you have a few minutes for a quick call to confirm these final details so we can get you ready for fast deployment? Best regards, The Threadline Team.

--------------------------------------------------
SCENARIO 4: Opt-Out Exclusion Verification (Elena Rostova - Nordic Supply Deal)
Contact Elena Rostova optedOut in DB: true
Draft generated for Elena Rostova: NONE (SUCCESS - Excluded from revival)
```

- **Open Issues**: None.

---

## PART 5 — Slack notifications for revival alerts

- **Status**: SKIPPED
- **Date**: 2026-10-16
- **Summary**:
  - `SLACK_CLIENT_ID` and `SLACK_CLIENT_SECRET` are not configured in `.env`.
  - Revival flow gracefully skips Slack channel notifications when credentials are not configured, as per the optional integration rule.
  - All revival drafts and cycle metrics remain fully accessible in the UI dashboard and through tRPC endpoints.

- **Open Issues**: None.
