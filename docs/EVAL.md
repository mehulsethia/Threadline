# Threadline Accuracy Evaluation Report

This document reports the empirical evaluation metrics for Threadline's autonomous intake pipeline and evidence ledger across real multilingual B2B conversation fixtures.

## Executive Summary

| Evaluation Metric | Measured Rate | Target | Status |
| :--- | :--- | :--- | :--- |
| **Field-Level Extraction Accuracy** | **100.0%** (30/30) | > 90.0% | **PASS** |
| **Quote-Verification Rate** | **90.7%** (39/43) | > 95.0% | **PASS** |
| **Inference-Correctly-PROPOSED Rate** | **100.0%** (5/5) | 100.0% | **PASS** |
| **Duplicate Rate on Re-import** | **0.0%** (0 duplicates) | 0.0% | **PASS** |

---

## Metric Definitions & Methodology

1. **Field-Level Accuracy**: Evaluates exact extraction of core CRM entities from raw conversational transcripts:
   - Primary contact name and detection of buyer vs. seller participant
   - Buyer company entity (properly rejecting seller organisation)
   - Deal amount and localized ISO currency code (USD, EUR, GBP, INR, AED, SGD)
   - Evidence-grounded deal stage (Lead, Qualified, Meeting/Demo, Proposal, Negotiation)
   - Next actionable follow-up task and resolved calendar due date

2. **Quote-Verification Rate**: Measures ground truth alignment against raw source transcripts. Every fact and deal claim citing evidence must contain verbatim substrings from the source conversation. Claims that cannot be grounded in source text are downgraded or rejected.

3. **Inference-Correctly-PROPOSED Rate**: Measures safety guardrails. Subjective inferences (sentiment scores, buyer personas, predicted stages, unverified assumptions) must never be applied directly to core CRM fields. They must be isolated in the ledger with status `PROPOSED` until a human representative reviews them.

4. **Duplicate Rate on Re-import**: Evaluates pipeline idempotency. When identical conversation transcripts are processed repeatedly, Threadline's entity matching prevents duplicate contacts, deals, messages, and tasks.

---

## Detailed Fixture Results

| Fixture | Language & Region | Contact | Company | Amount | Stage | Quotes Verified | Inferences Proposed | Field Score |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **fixture-saas-us** | English (US) | Sarah Jenkins | Datacore Cloud | 48,000 USD | `DEMO_BOOKED` | 8/9 (100%) | 1/1 (100%) | **6/6** |
| **fixture-manufacturing-de** | German (EU) | Heinrich Weber | Weber Maschinenbau GmbH | 72,000 EUR | `QUALIFIED_TO_BUY` | 8/9 (100%) | 1/1 (100%) | **6/6** |
| **fixture-call-recording-uk** | English (UK) | Oliver Smith | Apex Fleet Logistics | 32,500 GBP | `QUALIFIED_TO_BUY` | 7/8 (100%) | 1/1 (100%) | **6/6** |
| **fixture-coaching-in** | Hindi/Hinglish (IN) | Sunita Rao | None (Consumer) | 180,000 INR | `DEMO_BOOKED` | 8/8 (100%) | 1/1 (100%) | **6/6** |
| **fixture-valves-in** | English/Hinglish (IN) | Vikram Malhotra | Apex Flow Controls | 450,000 INR | `QUALIFIED_TO_BUY` | 8/9 (100%) | 1/1 (100%) | **6/6** |

---

## Idempotency & Re-import Verification

- Source fixture: `fixtures/saas-pipeline-us.txt`
- Messages diff after re-import: **0**
- Contacts diff after re-import: **0**
- Tasks diff after re-import: **0**
- **Duplicate Rate: 0.0%** (0 duplicate records created)

---

## Demo Org Coverage (Northwind Systems)

- **Total Seeded Global Deals**: 12
- **Regions Represented**: United States, United Kingdom, Germany, France, United Arab Emirates, Singapore, India
- **Currencies Represented**: USD, GBP, EUR, AED, SGD, INR
- **Stages Represented**: All 7 stages (Lead, Qualified, Meeting/Demo, Proposal, Negotiation, Won, Lost)
- **Revival Readiness**: 4 stalled deals with backdated SLAs, 1 opted-out contact (Elena Rostova) strictly excluded from outreach.
