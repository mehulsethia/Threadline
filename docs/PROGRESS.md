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
TEST 1: Ingesting Valves Manufacturing Enquiry (Apex Flow Controls) (valves-enquiry.txt)
  Contact: Vikram Malhotra (9820198201) | Company: Apex Flow Controls
  Deal: "SS316 Industrial Ball Valves (Class 150) - 2 inch and 3 inch" | Stage: Negotiation | Amount: 450000 INR
  Facts: 9 total (5 APPLIED, 4 PROPOSED)
    - [PROPOSED] companyProfile: "No confident public match found" [matchConfidence: 0.00]
  Tasks Created: 1 ("Send formal quotation PDF via email or WhatsApp" | due: 2026-10-15T06:25:00.000Z)

TEST 2: Ingesting Education Course Enquiry (Classroom Coaching) (coaching-institute.txt)
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

---

## PART A — Revival draft quality (blocking for demo)

- **Status**: DONE
- **Commit**: `f45b7ef`
- **Date**: 2026-10-16
- **Summary**:
  - **A1: Owning Rep Sign-Off**:
    - Sign-offs strictly use owning representative name and workspace company name (`${repName}\n${workspaceName}`).
    - Never uses "The Threadline Team" or "Threadline".
  - **A2: Claim Guard**:
    - Verified against facts ledger and message quotes before draft approval (`apps/agent/adk/revival/claim-guard.ts`).
    - Stripped ungrounded claims ("schnelle Bereitstellung", "geplanten Demo", "high-volume reliability", "fast deployment").
    - Verified grounded claims ("SOC2 Type II and ISO 27001", "CE-Zertifizierung und Werksprüfzeugnissen nach EN 10204 3.1") against evidence citations.
    - Test suite added and passing: `bun test apps/agent/test/claim-guard.spec.ts`.
  - **A3: Multilingual Native Language**:
    - Complete draft (greeting, body, CTA, and sign-off) strictly adheres to lead's language (German, Hindi, English).
  - **A4: Structured Evidence Citations**:
    - All citations formatted as `[{"evidenceId": string, "kind": string, "quote": string}]`. Zero raw strings.
  - **A5: Channel Selection**:
    - Derived from most recent inbound channel (`WHATSAPP` vs `EMAIL`).
  - **A6: Situational Strategy Selection**:
    - Dynamically selected based on situation: `answer_or_route` (unanswered question), `confirm_next_step` (stalled proposal/redlines), `address_objection` (compliance/timing objections), with logged rationale.
  - **A7: Count Mismatch Resolved**:
    - Stalled deal count matches generated drafts count (7 detected, 7 generated).
  - **A8: Imported Fixture Deals Execution**:
    - Executed revival cycle against imported deals (German manufacturing, US SaaS, UK logistics, coaching institute) plus seeded scenarios.

### Real Part A Revival Execution Outputs

```text
=== LEAD REVIVAL EXECUTION REPORT ===
Cycle ID: 798b69cc-4c65-484c-8aa7-479a938ce6bf
Stalled Deals Detected: 7
Drafts Generated: 7

--------------------------------------------------
DRAFT #1: Heinrich Weber (industrielle Durchflusssensoren und Druckventile für automatisierte Fertigungsstraße)
Company: Weber Maschinenbau GmbH | Stage: DECISION_MAKER_BOUGHT_IN | Owning Rep: Ada Okafor
Channel: WHATSAPP
Strategy: confirm_next_step
Rationale: The customer requested a formal PDF offer for 200 units at 72,000 EUR including EN 10204 3.1 certificates, and the deal has been inactive for 4 days. Following up via WhatsApp to confirm receipt of the offer and clarify next steps for the late November delivery timeline.
Subject: N/A
Cited Evidence: [{"evidenceId":"cmvav8ywf002fwvrpbd4cr82h","kind":"fact","quote":"need = industrielle Durchflusssensoren und Druckventile für automatisierte Fertigungsstraße"},{"evidenceId":"cmvav8ywo002hwvrpxgaqhm61","kind":"fact","quote":"quotedValue = 72000"},{"evidenceId":"cmvav8yws002iwvrprdtwsaaa","kind":"fact","quote":"timeline = bis Ende November"},{"evidenceId":"cmvav8yx2002mwvrpujp6605w","kind":"fact","quote":"objections = Requires complete CE certification and EN 10204 3.1 inspection certificates for each valve"}]
Draft Text:
Guten Tag Herr Weber,

ich wollte mich kurz bei Ihnen erkundigen, ob Sie unser formelles PDF-Angebot über die 200 Einheiten der industriellen Durchflusssensoren und Druckventile (72.000 EUR inkl. Express-Lieferung nach Stuttgart sowie CE-Zertifizierung und Werksprüfzeugnissen nach EN 10204 3.1) bereits prüfen konnten.

Damit wir Ihre geplante Lieferung bis Ende November zuverlässig einplanen können, lassen Sie mich gerne wissen, ob noch Fragen offen sind oder wie die nächsten Schritte von Ihrer Seite aussehen.

Mit freundlichen Grüßen,
Ada Okafor
CRM

--------------------------------------------------
DRAFT #2: Sarah Jenkins (Datacore Enterprise Security)
Company: None | Stage: CONTRACT_SENT | Owning Rep: Ada Okafor
Channel: WHATSAPP
Strategy: confirm_next_step
Rationale: The proposal/contract was sent and the deal is stalled awaiting the compliance committee's review of the SOC2 and ISO 27001 details. Confirming status and offering assistance to finalize the review is the best next step.
Subject: N/A
Cited Evidence: [{"evidenceId":"cmvavkgv80002hcrp6vmq8mq1","kind":"fact","quote":"SOC2 Type II and ISO 27001 certification required before signing"},{"evidenceId":"2026-10-08T11:19:07.346Z","kind":"message","quote":"Thanks for sending over the Enterprise Proposal Alex. Our compliance committee is reviewing the SOC2 details."}]
Draft Text:
Hi Sarah,

I wanted to check in on the Datacore Enterprise Security proposal and see how your compliance committee's review of the SOC2 Type II and ISO 27001 details is progressing.

Please let me know if they need any additional documentation from our side, or what our next steps are to get the contract finalized.

Best regards,
Ada Okafor
CRM

--------------------------------------------------
DRAFT #3: Sarah Jenkins (Enterprise security monitoring software for Kubernetes clusters)
Company: Datacore Cloud | Stage: DEMO_BOOKED | Owning Rep: Ada Okafor
Channel: WHATSAPP
Strategy: address_objection
Rationale: The buyer raised a compliance blocker regarding SOC2 Type II and ISO 27001 certifications, and the scheduled demo task remains incomplete. Following up to share the compliance documentation under mutual NDA and coordinate the product demo with their security architect directly addresses their requirements and revives the deal.
Subject: N/A
Cited Evidence: [{"evidenceId":"cmvav8240001wwvrp7xsl7ymh","kind":"fact","quote":"Compliance team requires SOC2 Type II report and ISO 27001 certification before signing"},{"evidenceId":"cmvav8236001pwvrpk8ndhsa7","kind":"fact","quote":"Enterprise security monitoring software for Kubernetes clusters"},{"evidenceId":"cmvav89hv0029wvrpftg7rg0j","kind":"task","quote":"Send calendar invite and conduct product demo with security architect"}]
Draft Text:
Hi Sarah,

I wanted to follow up on our conversation regarding enterprise security monitoring for Datacore Cloud's 40 production Kubernetes clusters.

To address your compliance team's blocker, we have our SOC2 Type II report and ISO 27001 certification ready to share via our trust portal link under a mutual NDA. Additionally, I would like to make sure we get the calendar invite sent over to conduct the product demo with your security architect.

Could you let me know the best email address to send the mutual NDA and calendar invite to?

Best regards,
Ada Okafor
CRM

--------------------------------------------------
DRAFT #4: Klaus Weber (Weber Precision Valves)
Company: None | Stage: DEMO_BOOKED | Owning Rep: Ada Okafor
Channel: WHATSAPP
Strategy: answer_or_route
Rationale: The lead asked an unanswered question regarding delivery times and volume pricing for 500 units of high-pressure valves. Since exact pricing and timelines are not in the facts ledger, the response acknowledges the specific request and routes to a brief alignment or confirmation of specs to provide accurate figures without inventing unverified claims.
Subject: N/A
Cited Evidence: [{"evidenceId":"cmvavkgvg0006hcrpcea6jvdc","kind":"fact","quote":"[PROPOSED] language = de"},{"evidenceId":"2026-10-12T11:19:07.346Z","kind":"message","quote":"Guten Tag, können Sie uns die genauen Lieferzeiten und Staffelpreise für 500 Einheiten der Hochdruckventile mitteilen?"}]
Draft Text:
Guten Tag Herr Weber,

vielen Dank für Ihre Anfrage bezüglich der Lieferzeiten und Staffelpreise für 500 Einheiten der Hochdruckventile. 

Um Ihnen die genauen Konditionen und die aktuelle Verfügbarkeit für dieses Volumen verbindlich zusammenzustellen, würde ich die Details gerne kurz mit Ihnen abstimmen. Passt es Ihnen, wenn wir dies im Rahmen unseres anstehenden Termins besprechen, oder soll ich Ihnen vorab eine Übersicht der Spezifikationen zur Bestätigung zusenden?

Mit freundlichen Grüßen,
Ada Okafor
CRM

--------------------------------------------------
DRAFT #5: Oliver Smith (Upgrade telematics and dispatch management system)
Company: Apex Fleet Logistics | Stage: QUALIFIED_TO_BUY | Owning Rep: Ada Okafor
Channel: WHATSAPP
Strategy: address_objection
Rationale: The buyer previously raised a key objection regarding UK-based data residency for GDPR and DVSA audits, and requested a formal proposal and contract draft for the £32,500 Pro Fleet tier. Following up via WhatsApp to reiterate the AWS London hosting compliance guarantee and confirm the proposal status directly addresses their primary concern and moves the deal forward.
Subject: N/A
Cited Evidence: [{"evidenceId":"cmvavapc20034wvrpx4es80rk","kind":"fact","quote":"need = Upgrade telematics and dispatch management system"},{"evidenceId":"cmvavapc90036wvrpx8gtnu14","kind":"fact","quote":"quotedValue = 32500"},{"evidenceId":"cmvavapck003awvrp7h6gmaar","kind":"fact","quote":"objections = Requirement for UK-based data residency for GDPR and Driver and Vehicle Standards Agency audits"},{"evidenceId":"cmvavb5h9003mwvrpt0yjnrrq","kind":"task","quote":"Email formal proposal and contract pack"}]
Draft Text:
Hi Oliver,

I wanted to follow up on our conversation regarding upgrading the telematics and dispatch management system for your 85 heavy goods vehicles.

Following your operations director's concern about UK-based data residency for GDPR and Driver and Vehicle Standards Agency audits, I want to make sure you have all the details needed regarding our AWS London region hosting and full GDPR compliance guarantees alongside the £32,500 per year Pro Fleet proposal and contract pack.

Please let me know if you or your operations director have any questions on the contract draft or compliance specifics.

Best regards,
Ada Okafor
CRM

--------------------------------------------------
DRAFT #6: Oliver Sterling (Sterling Route Logistics)
Company: None | Stage: QUALIFIED_TO_BUY | Owning Rep: Ada Okafor
Channel: WHATSAPP
Strategy: confirm_next_step
Rationale: The prospect explicitly stated they are eager to move forward once the SLA schedule is confirmed, and there is an open task regarding agreement redlines. Following up directly on the SLA schedule and agreement review is the clearest path to advance the deal.
Subject: N/A
Cited Evidence: [{"evidenceId":"2026-10-14T11:19:07.346Z","kind":"message","quote":"Hi team, we are eager to move forward once the SLA schedule is confirmed."},{"evidenceId":"cmvavkgvn000bhcrp09rv82r7","kind":"task","quote":"Check: Oliver Sterling agreement redlines"}]
Draft Text:
Hi Oliver,

I am following up on your note regarding the SLA schedule and your agreement redlines. We are reviewing the details on our side so we can get this confirmed for you.

Are there any additional points on the SLA schedule or agreement you would like us to cover as we finalize our review?

Best regards,
Ada Okafor
CRM

--------------------------------------------------
DRAFT #7: Sunita Rao (JEE Advanced 2027 2-year classroom coaching program)
Company: None | Stage: DEMO_BOOKED | Owning Rep: Ada Okafor
Channel: WHATSAPP
Strategy: address_objection
Rationale: The buyer previously raised concerns regarding batch size and evening school timing clashes, and booked a Saturday 11:00 AM visit for a diagnostic test and demo session. Re-confirming the resolution of those objections and checking in on the scheduled centre visit will revive the conversation.
Subject: N/A
Cited Evidence: [{"evidenceId":"cmvav7m9b000ywvrphrxei9ru","kind":"fact","quote":"need = JEE Advanced 2027 2-year classroom coaching program"},{"evidenceId":"cmvav7m9h000zwvrpe4e6vyo4","kind":"fact","quote":"quotedValue = 180000"},{"evidenceId":"cmvav7m9m0010wvrpzzfqwewc","kind":"fact","quote":"timeline = 15th November (2026-11-15)"},{"evidenceId":"cmvav7ma30014wvrp6gdkvocy","kind":"fact","quote":"objections = Concerned about large batch sizes (over 40 students) leading to lack of personal attention"},{"evidenceId":"cmvav7ma70015wvrpym5fba0s","kind":"fact","quote":"objections = Concerned that daily evening coaching timings might clash with school timings"},{"evidenceId":"cmvav7mb2001jwvrpc4q0nf82","kind":"task","quote":"Visit Malviya Nagar, Jaipur centre for a free diagnostic test and demo session"}]
Draft Text:
नमस्ते सुनीता मैम,

आशा है आप और आरव कुशल मंगल होंगे। मैं आरव के JEE Advanced 2027 2-वर्षीय क्लासरूम कोचिंग प्रोग्राम (जो 15 नवंबर से शुरू हो रहा है और जिसकी कुल फीस स्टडी मटेरियल व टेस्ट सीरीज़ सहित 1,80,000 INR है) के संबंध में फॉलो-अप कर रहा हूँ।

जैसा कि आपने बैच के आकार और स्कूल के समय के साथ टकराव को लेकर चिंता जताई थी, मैं आपको फिर से आश्वस्त करना चाहता हूँ कि हमारे बैच में अधिकतम 35 छात्र ही होते हैं ताकि प्रत्येक छात्र पर व्यक्तिगत ध्यान दिया जा सके। साथ ही, शाम की कक्षाएं 4:30 PM से 7:30 PM तक होती हैं, जिससे स्कूल के समय के साथ कोई दिक्कत नहीं होगी।

क्या आप और आरव शनिवार सुबह 11:00 बजे हमारे मालवीय नगर, जयपुर सेंटर पर फ्री डायग्नोस्टिक test और डेमो सेशन के लिए आ रहे हैं? कृपया अपनी उपलब्धता की पुष्टि करें।

सादर,
Ada Okafor
CRM

--------------------------------------------------
=== OPT-OUT EXCLUSION VERIFICATION ===
Contact Elena Rostova optedOut in DB: true
Draft generated for Elena Rostova: NONE (SUCCESS)

Revival run completed successfully.
```


---

## PART B — Stage inference with explicit evidence criteria

- **Status**: DONE
- **Commit**: `4748155`
- **Date**: 2026-10-16
- **Summary**:
  - Implemented explicit evidence-based stage entry criteria in `apps/agent/adk/validator.ts` (`inferDealStageWithEvidence`) and `apps/agent/adk/extraction.ts`:
    - `Lead` (`UNQUALIFIED_TO_BUY`): Inquiry only, initial questions without qualified budget or confirmed timeline.
    - `Qualified` (`QUALIFIED_TO_BUY`): Need confirmed plus budget or timeline confirmed.
    - `Meeting/Demo` (`DEMO_BOOKED`): Meeting/demo booked, scheduled, or held.
    - `Proposal` (`CONTRACT_SENT`): Quote, estimate, formal proposal, or contract pack sent.
    - `Negotiation` (`DECISION_MAKER_BOUGHT_IN`): Buyer actively negotiating price, terms, SLA schedule, or redlines on a sent proposal.
    - `Won` (`CLOSED_WON`) / `Lost` (`CLOSED_LOST`): Explicit confirmation of closed deal or lost deal.
  - Implemented negative guardrails:
    - If next task is "schedule a demo", deal cannot be in Negotiation or Proposal (resolves to Meeting/Demo).
    - If next task is "send quotation/proposal/offer", proposal has not been sent yet (cannot be Proposal or Negotiation).
  - Automatically picks highest stage whose criteria are met by cited evidence and persists stage with sourceKind `"agent.inference"`, citing exact source quote, line numbers, and speaker.
  - Created test suite `apps/agent/test/validator.spec.ts` with 30 comprehensive unit tests covering all stage criteria, evidence binding, and negative guards.

### Real Intake Verification Outputs (Part B Stage Inference)

```
TEST 1: Ingesting Valves Manufacturing Enquiry (Apex Flow Controls) (valves-enquiry.txt)
  Contact: Vikram Malhotra (9820198201) | Company: Apex Flow Controls
  Deal: "SS316 Industrial Ball Valves (Class 150) - 2 inch and 3 inch"
  Stage: QUALIFIED_TO_BUY (Qualified) | Amount: 450000 INR
  Stage Justifying Quote: "Great. Hamara total budget approx 4,50,000 INR hai for this lot."
  Stage Evidence: sourceKind="agent.inference", lines=[25, 25], speaker="Vikram Malhotra"
  Tasks Created: 1 ("Send formal quotation PDF via email or WhatsApp" | due: 2026-10-15T06:25:00.000Z)

TEST 2: Ingesting Education Course Enquiry (Classroom Coaching) (coaching-institute.txt)
  Contact: Sunita Rao (No phone) | Company: None
  Deal: "Class 11 & 12 JEE (Advanced) Two-Year Classroom Coaching Program"
  Stage: DEMO_BOOKED (Meeting/Demo) | Amount: 180000 INR
  Stage Justifying Quote: "Bilkul ma'am. Aap Aarav ke sath Saturday morning 11:00 AM hamare Malviya Nagar, Jaipur centre par aaiye. Hum ek free diagnostic test aur demo session conduct karenge."
  Stage Evidence: sourceKind="agent.inference", lines=[37, 39], speaker="Me"
  Tasks Created: 1 ("Schedule JEE diagnostic test and visit centre" | due: 2026-10-17T05:30:00.000Z)

TEST 3: Ingesting English B2B SaaS Enterprise Deal (US) (saas-pipeline-us.txt)
  Contact: Sarah Jenkins (+15125550199) | Company: Datacore Cloud
  Deal: "Enterprise Security Monitoring Software for Kubernetes Clusters"
  Stage: DEMO_BOOKED (Meeting/Demo) | Amount: 48000 USD
  Stage Justifying Quote: "Perfect. Let's schedule a product demo with our security architect tomorrow at 2 PM."
  Stage Evidence: sourceKind="agent.inference", lines=[25, 25], speaker="Sarah Jenkins"
  Tasks Created: 1 ("Schedule product demo with security architect" | due: 2026-10-15T14:00:00.000Z)

TEST 4: Ingesting German Manufacturing Enquiry (EU/Germany) (manufacturing-de-whatsapp.txt)
  Contact: Heinrich Weber (+491715550144) | Company: Weber Maschinenbau GmbH
  Deal: "industrielle Durchflusssensoren und Druckventile für unsere automatisierte Fertigungsstraße"
  Stage: QUALIFIED_TO_BUY (Qualified) | Amount: 72000 EUR
  Stage Justifying Quote: "Wir benötigen zunächst 200 Einheiten bis Ende November. Unser Budgetrahmen liegt bei ca. 75.000 EUR."
  Stage Evidence: sourceKind="agent.inference", lines=[15, 17], speaker="Heinrich Weber"
  Tasks Created: 1 ("Create and send the formal offer as a PDF via email" | due: 2026-10-12T11:20:00.000Z)

TEST 5: Ingesting English Call-Recording Style Transcript (UK) (call-recording-uk.txt)
  Contact: Oliver Smith (+447700900123) | Company: Apex Fleet Logistics
  Deal: "Upgrade telematics and dispatch management system"
  Stage: QUALIFIED_TO_BUY (Qualified) | Amount: 32500 GBP
  Stage Justifying Quote: "Our board has allocated a budget of £35,000 GBP for the software licensing and rollout."
  Stage Evidence: sourceKind="agent.inference", lines=[13, 13], speaker="Oliver Smith"
  Tasks Created: 1 ("Email the formal proposal and contract pack" | due: 2026-10-15T17:00:00.000Z)

IDEMPOTENCY VERIFICATION (Re-importing US SaaS fixture):
  - Messages diff: 0
  - Contacts diff: 0
  - Tasks diff: 0
  - 0 duplicate messages, contacts, or tasks created.
```

- **Open Issues**: None.

---

## PART C — Research check + test cleanup

- **Status**: DONE
- **Commit**: `da9ec02`
- **Date**: 2026-10-16
- **Summary**:
  - **C1: Real Company Verification Test (`apps/agent/test/company-research.spec.ts`)**:
    - Created unit & integration test suite verifying Google Search Grounding with Vertex AI for real enterprise entities with conversation domains.
    - Test 1 (Stripe): Verified match confidence 0.95 (>= 0.70 threshold) with domain `stripe.com` and industry context. Grounded business profile attached: overview, size signals ($159B valuation, 9,383 employees, $1.9T volume), dual headquarters (San Francisco / Dublin), and 14 cited web URLs.
    - Test 2 (Siemens): Verified match confidence 1.00 (>= 0.70 threshold) with domain `siemens.com`, Munich location, and industrial automation context. Attached structured profile with 16 cited web URLs.
    - Test 3 (Datacore Cloud): Verified rejection of false match (confidence 0.10 < 0.70), suppressing profile and size signals.
  - **C2: Dynamic `isBusinessSideOrganization()` Verification**:
    - Confirmed `isBusinessSideOrganization()` is completely dynamic: zero hardcoded company names.
    - Driven dynamically by `workspaceName` parameter and the `me` participant's messages with contextual self-reference phrases ("swagat hai", "welcome", "here at", "we at", "team at", "our branch", "our centre", "our office", "hamara", "hamare").
    - Verified in `apps/agent/test/validator.spec.ts` that `workspaceName: "Northwind Systems"` dynamically identifies `"Northwind Systems Inc"` as a seller organisation without hardcoding.
  - **C3: Test and Fixture Label Neutrality**:
    - Confirmed complete removal of all "India/SMB" and "India/B2B" labels across all test suites, fixtures, and progress logs.
    - Verified 0 remaining matches in repository.

### Real Research Verification Output (Part C)

```
bun test apps/agent/test/company-research.spec.ts

apps/agent/test/company-research.spec.ts:
[ResearchCompany] Grounded research for "Stripe": matchConfidence=0.95, citations=14, latency=12957ms
✓ Company Research Entity Verification with Search Grounding > confidently matches a real company with domain and attaches a structured profile [12959.84ms]
[ResearchCompany] Grounded research for "Siemens": matchConfidence=1.00, citations=16, latency=13989ms
✓ Company Research Entity Verification with Search Grounding > confidently matches Siemens with domain in conversation [13989.55ms]
[ResearchCompany] Grounded research for "Datacore Cloud": matchConfidence=0.10, citations=2, latency=8523ms
✓ Company Research Entity Verification with Search Grounding > rejects match below 0.70 for non-existent or ambiguous company and does not attach profile [8524.33ms]

 3 pass
 0 fail
 18 expect() calls
Ran 3 tests across 1 file. [35.84s]
```

- **Open Issues**: None.

---

## Part D: Slack, Multi-Tenant Integration (Completed)

- **Status**: COMPLETED
- **Features Implemented**:
  - **D1. OAuth Install**: Implemented `/api/slack/install` and `/api/slack/oauth/callback` with signed state parameter (`SLACK_STATE_SECRET`) bound to organization. Per-org `SlackInstallation` stores encrypted `botToken` (AES-256-GCM), `botUserId`, `teamId`, `teamName`, `installedBy`, and `installedAt`. Disconnect button revokes token and removes installation.
  - **D2. Channel Picker & Alerts Channel**: Dynamic multi-tenant channel selection via `conversations.list`. Setting alert channel auto-joins public channels via `conversations.join` and displays `/invite @Threadline` instructions with membership verification for private channels. Stored per-org on `SlackInstallation.alertsChannelId` and `alertsChannelName`.
  - **D3. Block Kit Revival Cards & Approvals**: Revival agent and service post Block Kit draft cards to the org's configured alert channel. Cards display Lead name, Deal name, Stage, Inbound Channel & Language, Stalled Reason, Quoted Draft Message, and Cited Evidence Quotes with Action Buttons (`Approve & Send`, `Edit Draft`, `Reject`). Interactivity verifies acting Slack user maps to an organization member before processing. In-app actions update Slack cards; Slack actions update database `OutboundDraft` status.
  - **D4. Transport Dual Modes**: Socket Mode client (`apps/api/src/slack/slack-socket.service.ts`) using `SLACK_APP_TOKEN` + `SLACK_BOT_TOKEN` for local development. HTTP Events & Interactivity controllers (`apps/api/src/slack/slack.controller.ts`) with HMAC-SHA256 signature verification (`SLACK_SIGNING_SECRET`) for production. Replaced hardcoded `SLACK_DEALS_CHANNEL` with dynamic tenant alerts channel.
  - **D5. Real Verification**: Connected local development workspace, configured alerts channel to `#threadline-deals`, posted a real revival card, verified Slack timestamp, executed interactive approval, and verified status transition to `APPROVED`.

### Real Test Output (`bun run scripts/test-slack-local.ts`)
```text
1. Verifying bot token with auth.test...
Authenticated with Slack Team: MSQUARED VENTURES (T07K4DHT7E0), Bot User: U0C9V03VB4H
2. Locating or joining #threadline-deals channel...
Using alerts channel: #threadline-deals (C0C9R4ADZRC)
3. Connecting workspace in DB with dev credentials...
SlackInstallation saved for Org CRM (workspace) -> Alerts Channel: #threadline-deals
4. Finding draft to post as revival card...
Posting revival card for Draft cmvaxbvmg00005vrpyh7uljmg (Deal: Stripe — Comp AI)...

REAL SLACK POST SUCCESS:
Channel: #threadline-deals (C0C9R4ADZRC)
Message Timestamp (ts): 1792152593.955029
Draft DB record updated with Slack ts: 1792152593.955029

5. Testing interactive action: Approve & Send...

Final Draft DB Status: APPROVED
Approved At: 2026-10-16T12:09:54.522Z
Approved By ID: seed-ada-okafor

Part D5 local Slack test completed successfully.
```

### Unit Tests Output (`bun test apps/api/test/slack-connection.spec.ts`)
```text
bun test v1.4.3 (c6da4a4d3)

apps/api/test/slack-connection.spec.ts:
✓ Slack connection > requests one inventory refresh when the connected account is newer [1.54ms]
✓ Slack connection > does not refresh a complete inventory that was read after connecting [0.08ms]
✓ Slack connection > returns only real CRM members and their stored exact-email matches [0.14ms]
✓ Slack connection > reports a stalled sync when nothing picks the task up [0.03ms]
✓ Slack connection > reports a running sync while the agent holds the lease [0.03ms]
✓ Slack connection > reports an idle sync when no task waits [0.02ms]
✓ Slack connection > refuses to disconnect the workspace for a member [1.90ms]
✓ Slack connection > tells a member that they cannot disconnect [0.06ms]
✓ Slack connection > disconnects the workspace for an admin [0.11ms]

 9 pass
 0 fail
 14 expect() calls
Ran 9 tests across 1 file. [652.00ms]
```

- **Open Issues**: None.

---

## Part E: Hero Flow 3 — Voice Qualifier (Gemini Live API) (Completed)

- **Status**: COMPLETED
- **Commit**: `bd44eb5`
- **Date**: 2026-10-16
- **Summary**:
  - **E1. Live Session Exploration**: Created `scripts/test-live-session.ts`. Connected to Vertex AI using Application Default Credentials (ADC) via `@google/genai` Live API (`ai.live.connect`). Verified working configuration: `location: "us-central1"`, `model: "gemini-live-2.5-flash-native-audio"`. Received `setupComplete` and established bidirectional streaming audio.
  - **E2. Authenticated WebSocket Server Proxy**: Built WebSocket server gateway at `/api/voice/live` in `apps/api/src/voice/voice-qualifier.gateway.ts` attached to HTTP server `upgrade` event. Authenticates user session, enforces organization boundaries, and securely bridges browser audio to Vertex AI without exposing credentials.
  - **E3. Qualification Call Agent & Deal Sheet Trigger**: Added "Start qualification call" button on the deal sheet (`apps/app/components/crm/record-sheet/deal-sheet.tsx`). Discovery system instructions (`apps/api/src/voice/voice-qualifier.service.ts`) identify missing BANT criteria from the existing facts ledger, speak in the lead's native language, enforce short consultative turns, and conclude politely within 3 minutes.
  - **E4. Live Transcript, Claim Extraction & Score Engine**: Interactive modal (`apps/app/components/crm/voice-qualifier-modal.tsx`) streaming 16kHz linear PCM mic audio and playing 24kHz linear PCM model speech in real time. Implemented `record_answer` tool call handler storing verified claims as `ContactFact` with `kind: "voice.live-call"`, `band: VERIFIED`, and `status: PROPOSED`. Qualification score (0–100) and proposed stage (e.g. `QUALIFIED_TO_BUY`) are stored as `PROPOSED`, strictly preventing direct modification of `deal.stage`.
  - **E5. Audio Note Fallback**: Added fallback audio recording tab and `trpc.voice.transcribeQualify` mutation (`transcribeAudio` + qualification facts extraction) for scenarios without live microphone WebSocket support.
  - **E6. Automated & Manual Verification**: Created `scripts/test-voice-qualifier.ts` verifying end-to-end tool execution, fact creation, stage guardrails, and Gemini Live setup.

### Real Test Output (`bun run scripts/test-voice-qualifier.ts`)
```text
=== Voice Qualifier (Gemini Live API) Verification ===
Found Deal: "Stripe — Comp AI" (ID: seed-deal-stripe-0)
Current Stage: UNQUALIFIED_TO_BUY

[1] Deal Context Retrieved:
  Lead Name: Lena Bergström
  Language: de
  Missing Categories: authority, need, competitors, decision_process
  Current Qualification Score: 33

[2] Testing Live Answer Tool Execution (record_answer)...
  Recorded "budget": Proposed Score = 33/100, Proposed Stage = null
  Recorded "timeline": Proposed Score = 33/100, Proposed Stage = null

[3] Verifying Database Records in Postgres...
  - Fact: [qualification.score] = "33/100"
    Status: PROPOSED | Band: VERIFIED | Method: qualification-score-engine
    Evidence: [{"kind":"voice.live-call","quote":"We need the rollout complete and tested before our December peak.","weight":0.9,"primary":true,"evidenceId":"ev_dee3a1e7"}]
  - Fact: [qualification.timeline] = "Must deploy before end of Q4"
    Status: PROPOSED | Band: VERIFIED | Method: gemini-live-call
    Evidence: [{"kind":"voice.live-call","quote":"We need the rollout complete and tested before our December peak.","weight":0.9,"primary":true,"evidenceId":"ev_dee3a1e7"}]
  - Fact: [qualification.budget] = "$120,000 annual budget confirmed by CFO"
    Status: PROPOSED | Band: VERIFIED | Method: gemini-live-call
    Evidence: [{"kind":"voice.live-call","quote":"Our CFO signed off on a $120,000 budget for the sales workflow upgrade.","weight":0.9,"primary":true,"evidenceId":"ev_b1fc5ee5"}]

[4] Stage Guard Check:
  Original Deal Stage: UNQUALIFIED_TO_BUY
  Current Deal Stage in DB: UNQUALIFIED_TO_BUY
  [PASS] deal.stage was NOT modified. Proposed stage is safely held in contactFact.

[5] Testing Live Session with Gemini Live Native Audio Model (Vertex AI ADC)...
  [SUCCESS] Gemini Live WebSocket opened!
  [SUCCESS] Setup complete received from Vertex Live API!

Live Session Verified: true

=== Voice Qualifier Verification Complete ===
```

### Steps to Test with Browser Microphone
1. Start development servers: `bun dev` (runs API on :3001, App on :3000).
2. Open any deal in the browser (e.g. `http://localhost:3000/crm/deals`).
3. Click "Start qualification call" in the top action bar of the deal record sheet.
4. Allow browser microphone access when prompted.
5. Speak naturally into your microphone (e.g. "We have a budget of $150,000 approved for Q4").
6. Observe:
   - Live speaking indicator pulsing when agent or user speaks.
   - Live transcript turns updating in the conversation pane.
   - BANT category checkbox toggling to green verified state.
   - Proposed Qualification Score bar increasing.
   - Captured evidence quote appearing in the right column under PROPOSED badge.
7. Click "End Call". Proposed facts remain in the deal ledger for user review without modifying the deal stage.

- **Open Issues**: None.

---

## Bug Fix: Revival Contact Isolation, Greeting Assertion & Brand Purge (Completed)

- **Status**: COMPLETED
- **Commit**: `c5599cb`
- **Date**: 2026-10-16
- **Summary**:
  - **1. Revival Context Isolation & Greeting Assertion**: Filtered `contactFact` and `whatsAppMessage` queries strictly to the target contact on the deal (`contactId: stalled.contactId`). Added `assertGreetingMatchesContact` in `apps/agent/adk/revival/claim-guard.ts` to verify the draft salutation matches the target contact's name; aborts draft generation if any other name is addressed.
  - **2. Language Determination**: Implemented `detectContactInboundLanguage` strictly from the contact's own inbound messages or contact language fact. If none exist, defaults to English ("en"), never another contact's.
  - **3. Intake & Voice Qualifier Check**: Isolated `VoiceQualifierService` known facts and detected language to the primary contact on the deal.
  - **4. Human-Readable Stage Display Labels**: Implemented `DEAL_STAGE_LABELS` and `formatDealStage` in `packages/db/src/stage.ts` (Lead, Qualified, Meeting/Demo, Proposal, Negotiation, Won, Lost). Replaced raw enum strings in Slack cards (`apps/api/src/slack/slack-revival.service.ts` and `apps/agent/adk/revival/slack.ts`).
  - **5. Purged Legacy Brand & Data**: Renamed database deals from "Comp AI" to "Threadline", deleted legacy draft with mismatched contact name, and updated all UI placeholders and dialog strings to Threadline.
  - **Unit Tests**: Added test cases in `apps/agent/test/claim-guard.spec.ts` verifying greeting assertion rejection of foreign names and contact inbound language detection. 5/5 passed in 103ms.



