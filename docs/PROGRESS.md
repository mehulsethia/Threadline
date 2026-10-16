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

### Real Intake Verification Outputs

```
TEST 1: Ingesting Valves Manufacturing Enquiry (India/B2B) (valves-enquiry.txt)
  Contact: Vikram Malhotra | Company: Apex Flow Controls
  Deal: "SS316 Industrial Ball Valves (Class 150) - 2 inch and 3 inch" | Stage: Negotiation | Amount: 450000 INR
  Facts: 8 total (5 APPLIED, 3 PROPOSED)
  Tasks Created: 1 ("Send formal quotation PDF via email or WhatsApp" | due: 2026-10-15T06:25:00.000Z)

TEST 2: Ingesting Education Course Enquiry (India/SMB) (coaching-institute.txt)
  Contact: Sunita Rao | Company: Apex IIT Academy
  Deal: "Class 11 & 12 JEE (Advanced) Two-Year Classroom Coaching Program" | Stage: Meeting/Demo | Amount: 45000 INR
  Facts: 7 total (4 APPLIED, 3 PROPOSED)
  Tasks Created: 1 ("Schedule JEE diagnostic test and visit centre" | due: 2026-10-17T05:30:00.000Z)

TEST 3: Ingesting English B2B SaaS Enterprise Deal (US) (saas-pipeline-us.txt)
  Contact: Sarah Jenkins | Company: Datacore Cloud
  Deal: "Enterprise Security Monitoring Software for Kubernetes Clusters" | Stage: Negotiation | Amount: 48000 USD
  Facts: 8 total (5 APPLIED, 3 PROPOSED)
  Tasks Created: 1 ("Schedule product demo with security architect" | due: 2026-10-15T14:00:00.000Z)

TEST 4: Ingesting German Manufacturing Enquiry (EU/Germany) (manufacturing-de-whatsapp.txt)
  Contact: Heinrich Weber | Company: Weber Maschinenbau GmbH
  Deal: "industrielle Durchflusssensoren und Druckventile für unsere automatisierte Fertigungsstraße" | Stage: Negotiation | Amount: 72000 EUR
  Facts: 8 total (5 APPLIED, 3 PROPOSED)
  Tasks Created: 1 ("Create and send the formal offer as a PDF via email" | due: 2026-10-12T11:20:00.000Z)

TEST 5: Ingesting English Call-Recording Style Transcript (UK) (call-recording-uk.txt)
  Contact: Oliver Smith | Company: Apex Fleet Logistics
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

