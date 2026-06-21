# Chapter 6 — Enterprise Agentic Projects

*Enterprise Agentic AI Engineering: A Textbook for Software Engineers*

---

## 1. Learning Objectives

By the end of this chapter, you will be able to:

1. Synthesize the concepts from Chapters 1–5 (fundamentals, prompting, tool calling, graph workflows, production hardening) into complete, end-to-end enterprise system designs.
2. Translate a vague business request ("help our support team handle tickets faster") into a precise agentic system specification: state schema, node breakdown, tool inventory, guardrails, and evaluation plan.
3. Design and justify the human-in-the-loop boundary for a given enterprise domain, correctly distinguishing what an agent may decide autonomously from what must remain a human decision.
4. Build complete reference implementations for four distinct enterprise verticals: customer support, insurance claims, financial operations, and marketing/advertising operations.
5. Identify domain-specific risks and compliance constraints (HIPAA-adjacent handling in healthcare-flavored support, financial reconciliation accuracy, fair-lending-style fairness concerns, ad-spend governance) and map them to the specific architectural mitigations introduced in prior chapters.
6. Conduct a structured project review of an agentic system design, using a checklist that spans every chapter's concerns (architecture, security, cost, evaluation, human oversight) — the same checklist a senior architect would apply in an enterprise design review.

This chapter is integrative rather than introducing fundamentally new mechanisms. Each project below is built entirely from techniques already established in Chapters 1–5; the chapter's purpose is to demonstrate fluent, end-to-end synthesis, the way a senior engineer is expected to combine known patterns into a coherent system design when given a new but familiar-shaped business problem.

---

## 2. Why This Matters

### 2.1 Why integration is its own skill

A software engineer can understand every individual technique in this book — tokenization, prompting, tool calling, graph workflows, evaluation — and still struggle to assemble them correctly into a coherent system for a specific business problem, because the assembly itself requires judgment calls that no single chapter fully specifies: how granular should the tools be for *this* domain, where exactly does the human boundary belong for *this* risk profile, how big does the eval set need to be before *this* system is trustworthy. This is precisely the skill enterprises hire senior AI/agentic engineers for, and precisely the skill this chapter is designed to build through worked, complete examples across genuinely different domains.

### 2.2 The business problem this solves

Enterprises evaluating whether to invest in agentic AI engineering capability need to see complete, credible system designs for their actual business domains — not isolated code snippets. This chapter provides four such designs, each chosen to represent a distinct combination of constraints (real-time customer interaction vs. asynchronous batch processing; financial precision requirements vs. creative/judgment-based tasks; heavily regulated vs. moderately regulated), so that the reasoning behind each design choice can be mapped onto whatever domain you encounter in your own career.

### 2.3 Where this fits

This chapter does not introduce a new box in the architecture diagrams built across Chapters 1–5. It demonstrates how to populate every box — Reasoning Tier, Tool Registry, Policy Engine, Workflow Graph, Evaluation Harness, Human-in-the-Loop Queue — correctly and coherently for four different real businesses, which is the actual deliverable expected of an enterprise agentic AI engineer in practice.

---

## 3. Fundamentals — A Repeatable Design Process

Before presenting the four projects, this section establishes the repeatable design process applied to each — itself a reusable engineering skill, analogous to a standard architecture decision process used for any new system design.

### 3.1 Step 1 — Decompose the business request into discrete decisions and actions

Every vague business request ("help X team do Y faster") decomposes into a sequence of discrete decisions (does this case meet criterion A? which category does this fall into?) and discrete actions (look up data, write data, notify someone). This decomposition is exactly the node/edge breakdown from Chapter 4 — the design process starts here, before any prompt or tool schema is written.

### 3.2 Step 2 — Classify each decision/action by required reasoning type

For each discrete decision or action identified in Step 1, classify it: is this **purely deterministic** (expressible as a rule over structured data — no LLM needed at all, per Chapter 4, Section 3.3), does it require **language understanding over unstructured input** (a strong candidate for an LLM node), or does it require **judgment with material consequence** (a strong candidate for mandatory human-in-the-loop, per Chapter 3, Section 3.6)? Misclassifying a decision in this step is the root cause of most poorly designed agentic systems — either over-automating a judgment call that needed a human, or under-automating a decision that was actually a simple deterministic rule dressed up in natural language.

### 3.3 Step 3 — Inventory required tools and their categories

For every action identified, define the tool (Chapter 3, Section 3.3) and classify it as read, write, or irreversible (Chapter 3, Section 3.6), which directly determines the guardrail tier it requires.

### 3.4 Step 4 — Design the state schema and graph

Translate the decomposition into a typed state schema and graph (Chapter 4, Section 3.2–3.3), identifying checkpoints for human-in-the-loop steps (Chapter 4, Section 3.5) and cycles for retry/validation logic (Chapter 4, Section 3.4).

### 3.5 Step 5 — Define the evaluation plan and guardrails

Before writing significant code, define what "correct" means for this system (Chapter 5, Section 3.1) and what the cost, security, and compliance guardrails must be (Chapter 5, throughout) — exactly as a senior architect would require a test plan and a non-functional-requirements review before approving a design, not after building it.

---

## 4. Deep Technical Explanation — Worked Decomposition Example

To make Section 3's process concrete before applying it four times in Section 6–8, here is a fully worked decomposition for a request that has not yet appeared in this book: "Help our legal team triage incoming vendor contracts for risky clauses before a lawyer reviews them."

**Step 1 — Decompose**: (a) receive a contract document, (b) extract its key terms (parties, term length, payment terms, termination clauses), (c) identify clauses matching known risk patterns (e.g., unusual indemnification language, auto-renewal without notice), (d) produce a risk-flagged summary, (e) route to the appropriate lawyer based on contract value/category, (f) lawyer reviews and either approves, requests changes, or escalates.

**Step 2 — Classify**: (b) is language understanding over unstructured input → LLM extraction node (Chapter 2 pattern). (c) is also language understanding, but benefits from a curated, versioned list of known risk patterns provided as grounding context → an LLM node using a RAG-like pattern (Chapter 5, Section 3.3) over a "risk clause library" rather than open-ended judgment. (e) is purely deterministic (a routing rule based on contract value and category, both already structured by this point) → deterministic node, no LLM. (f) is a human decision with material legal consequence → mandatory human-in-the-loop, never automated.

**Step 3 — Tool inventory**: `extract_contract_terms` (no real external system call — an LLM-only "tool" in the loose sense, or simply a workflow node); `search_risk_clause_library` (read tool, RAG retrieval); `route_to_assigned_lawyer` (write tool, low blast radius — it only assigns a review task, doesn't take any legal action); no irreversible tools exist in this entire workflow, because *nothing* in this domain should ever be automated past the "flag for human review" stage.

**Step 4 — State and graph**: `ContractTriageState` with fields for `raw_contract_text`, `extracted_terms`, `flagged_risks: list[str]`, `assigned_lawyer_id`, `lawyer_decision`. Graph: `extract_terms` → `identify_risks` → `route_to_lawyer` → checkpoint at `lawyer_review` → `END`.

**Step 5 — Evaluation and guardrails**: eval set of historical contracts with known, lawyer-confirmed risk flags (structured-output correctness, Chapter 5 Section 3.1); zero auto-approval capability by design (Step 2's classification of (f) already enforces this at the architecture level, not just as a policy); audit log of every flagged risk and every lawyer decision for future eval-set growth (Chapter 5, Section 6.1's continuous-evaluation pattern).

This worked example is the template applied, at greater length, to each of the four projects below.

---

## 5. Visual Diagrams

### 5.1 The repeatable design process from Section 3

```
  Vague Business Request
        │
        ▼
┌─────────────────────────┐
│ Step 1: Decompose into     │
│ discrete decisions/actions  │
└───────────┬─────────────┘
            ▼
┌─────────────────────────┐
│ Step 2: Classify each --     │
│ deterministic / LLM /         │
│ human-required                 │
└───────────┬─────────────┘
            ▼
┌─────────────────────────┐
│ Step 3: Inventory tools,     │
│ classify read/write/           │
│ irreversible                    │
└───────────┬─────────────┘
            ▼
┌─────────────────────────┐
│ Step 4: Design state          │
│ schema + graph + checkpoints   │
└───────────┬─────────────┘
            ▼
┌─────────────────────────┐
│ Step 5: Define eval plan      │
│ + cost/security/compliance      │
│ guardrails                        │
└───────────┬─────────────┘
            ▼
     Implementation (Ch.1-5 patterns)
```

**Explanation**: This is the process every project in Section 6–8 follows. Notice it mirrors standard software architecture practice — requirements decomposition, component classification, interface design, data modeling, and a test/non-functional plan — applied specifically to the additional vocabulary (tool categories, human-in-the-loop boundaries, evaluation harnesses) this book has built since Chapter 1.

---

## 6. Real Enterprise Examples — Project 1: Customer Support Resolution Agent

### 6.1 Business context

A SaaS company wants to reduce average ticket resolution time by having an agent handle common, well-defined issues (password resets, billing status questions, basic plan changes) end-to-end, while reliably escalating anything outside that scope to a human agent — directly extending the customer support and CRM examples threaded through Chapters 1–5.

### 6.2 Decomposition (Section 3 process applied)

- **Decisions**: classify ticket intent; determine if intent is in the "safe to automate" set; determine if the requested action is permitted for this specific customer (e.g., a plan downgrade might be blocked during an active contract term).
- **Actions**: look up customer account (read); look up subscription/billing status (read); apply a plan change (write, moderate blast radius); issue a small goodwill credit (write, bounded by Chapter 3-style amount caps); escalate to human (always available as an explicit, first-class action, never a fallback-by-failure).
- **Classification**: intent classification is LLM (language understanding); "is this customer eligible for self-service plan change" is deterministic once the necessary data is fetched; "should we escalate" combines both — deterministic for clear-cut policy reasons, LLM-judgment-informed for ambiguous, multi-issue tickets.
- **Tools**: `get_customer_account` (read), `get_billing_status` (read, reusing the Chapter 3 example directly), `apply_plan_change` (write, idempotent, amount/scope-capped), `issue_goodwill_credit` (write, capped per Chapter 3's `issue_account_credit` pattern), `escalate_to_human` (always available, zero risk by definition).
- **State/graph**: `SupportTicketState` with `ticket_text`, `classified_intent`, `customer_record`, `resolution_action`, `escalated: bool`. Graph: `classify_intent` → conditional edge → either a direct-resolution branch (calling the relevant tool) or an `escalate_to_human` node — no checkpoint/pause needed here because escalation is itself the terminal action, not a pause-and-resume.
- **Evaluation**: eval set of historical tickets with known correct resolution category (including a meaningful fraction of "should have escalated" cases, since under-escalation is the costlier failure mode here) (Chapter 5, Section 3.1); cost budget per ticket given high ticket volume (Chapter 5, Section 3.6).

### 6.3 Key design decision worth highlighting

The most important judgment call in this project is calibrating the "safe to automate" boundary precisely (Step 2 of Section 3). Too narrow, and the system delivers little value; too broad, and it auto-resolves tickets it shouldn't. This is exactly why the evaluation set must be weighted to include realistic *ambiguous* and *edge-case* tickets, not only clear-cut examples, and why the escalation path must be a first-class, easy, zero-penalty action rather than something the agent reaches only after repeated tool failures — an agent that is reluctant to escalate is more dangerous than one that escalates too eagerly.

---

## 7. Architecture Design — Project 2: Insurance Claims Processing (Full Synthesis)

This project directly completes the insurance claims example built incrementally across Chapters 1–5, now presented as a single, coherent end-to-end architecture.

```
┌─────────────────────────────────────────────────────────────────────┐
│                  Insurance Claims Processing System                   │
│                                                                         │
│  Intake → [extract_claim_data] (Ch.2 LLM node, retry cycle, Ch.4)       │
│              │                                                          │
│              ▼                                                          │
│         [validate_schema] (deterministic, Ch.2/4)                       │
│              │                                                          │
│              ▼                                                          │
│    [check_policy_rules] (tool call to policy DB, Ch.3; deterministic     │
│      rule evaluation, Ch.4)                                              │
│              │                                                          │
│      ┌───────┴────────┐                                                 │
│      ▼                  ▼                                               │
│ [auto_approve]    [human_review_required] ◄── CHECKPOINT (Ch.4)          │
│ (deterministic,        │  durable, resumable after analyst review        │
│  capped amount only)    │  (Ch.4 Section 3.5; Ch.5 Section 3.5)            │
│      │                  ▼                                               │
│      │            [fraud_risk_check] (optional 2nd-pass agent,            │
│      │              debate/review pattern, Ch.4 Section 3.7)               │
│      │                  │                                                │
│      └──────────────────┴─────────► [notify_claimant]                    │
│                                            │                              │
│                                            ▼                              │
│                                          END                              │
│                                                                            │
│  Cross-cutting: Evaluation harness (Ch.5) growing from every human         │
│  override; Cost budget per claim category (Ch.5); Circuit breaker +        │
│  fallback model for the LLM provider (Ch.5); full audit trail per claim    │
│  (Ch.3/4/5) sufficient for insurance regulatory review.                    │
└─────────────────────────────────────────────────────────────────────┘
```

**Design rationale, synthesizing prior chapters**: Auto-approval is deliberately capped to low-value, policy-clean claims only (Step 2 classification: clear-cut deterministic eligibility, not LLM judgment, governs the auto-approve path) — the LLM's role is confined to *extraction* (turning unstructured claimant text into structured data) and *optional fraud-risk flagging* as a second opinion, never to the final approval decision itself for anything above a conservative, explicitly configured threshold. This mirrors the irreversible-action gating principle from Chapter 3, Section 3.6, applied at the level of an entire claims category rather than a single tool call.

---

## 8. Code Examples — Project 3 and Project 4 Reference Implementations

### 8.1 Project 3: Financial Operations — Invoice Reconciliation Agent

**Business context**: A finance team manually matches incoming vendor invoices against purchase orders and receipts, flagging mismatches for review. This is a strong agentic-automation candidate because the matching logic benefits from language understanding (vendor names, line-item descriptions vary in phrasing across documents) but the actual financial posting must remain a deterministic, audited, human-approved action — directly extending the supply-chain and finance examples from Chapters 1–5.

```python
"""
app/projects/invoice_reconciliation/state.py

State schema following the Section 3.4 design step. Notice the
explicit `match_confidence` and `discrepancies` fields -- these
exist specifically so the routing logic (below) can be deterministic
over already-computed values, per Chapter 4 Section 3.3, rather than
asking the model to "decide" whether to escalate via free text.
"""

from typing import Optional, TypedDict
from decimal import Decimal


class InvoiceReconciliationState(TypedDict):
    invoice_text: str
    purchase_order_id: Optional[str]
    extracted_invoice_amount: Optional[Decimal]
    po_amount_on_record: Optional[Decimal]
    discrepancies: list[str]
    match_confidence: float  # 0.0-1.0, computed deterministically, not self-reported by the LLM
    requires_human_review: bool
    final_status: Optional[str]
```

```python
"""
app/projects/invoice_reconciliation/nodes.py

Demonstrates Step 2's classification discipline directly in code:
extraction is an LLM node; matching and confidence scoring are pure
deterministic logic, even though they consume LLM-extracted fields,
because the actual comparison rule does not require language
understanding once both amounts are structured numbers.
"""

from decimal import Decimal

from app.projects.invoice_reconciliation.state import InvoiceReconciliationState
from app.services.structured_extraction import extract_structured
from app.schemas.invoice import ExtractedInvoice  # Pydantic schema, Ch.2 pattern
from app.tools.handlers.erp_tools import get_purchase_order_amount  # Ch.3 pattern

DISCREPANCY_TOLERANCE = Decimal("1.00")  # allow trivial rounding differences


async def extract_invoice_data(state: InvoiceReconciliationState) -> dict:
    invoice = await extract_structured(
        system_prompt="Extract invoice fields...",  # full prompt per Ch.2 templates
        user_prompt=f"<invoice>{state['invoice_text']}</invoice>",
        schema=ExtractedInvoice,
        prompt_version="invoice_extraction_v1",
    )
    return {
        "purchase_order_id": invoice.purchase_order_id,
        "extracted_invoice_amount": invoice.total_amount,
    }


async def fetch_po_and_compare(state: InvoiceReconciliationState) -> dict:
    """
    Deterministic node (no LLM call) reusing the Ch.3 tool pattern
    to fetch the system-of-record PO amount, then applying a plain
    numeric comparison -- this is exactly the kind of node that
    should NOT involve the model, per Section 3.2's classification step.
    """
    po_amount = await get_purchase_order_amount(state["purchase_order_id"])
    invoice_amount = state["extracted_invoice_amount"]

    discrepancies = []
    diff = abs(po_amount - invoice_amount)
    if diff > DISCREPANCY_TOLERANCE:
        discrepancies.append(
            f"Invoice amount {invoice_amount} differs from PO amount "
            f"{po_amount} by {diff}, exceeding tolerance."
        )

    # Confidence is COMPUTED, not asked of the model -- consistent
    # with Chapter 5 Section 3.2's caution against treating
    # self-reported model confidence as a reliable signal.
    confidence = 1.0 if not discrepancies else max(0.0, 1.0 - float(diff) / float(po_amount))

    return {
        "po_amount_on_record": po_amount,
        "discrepancies": discrepancies,
        "match_confidence": confidence,
        "requires_human_review": bool(discrepancies) or confidence < 0.95,
    }


def route_after_comparison(state: InvoiceReconciliationState) -> str:
    return "human_review" if state["requires_human_review"] else "auto_post"
```

### 8.2 Project 4: Marketing/Advertising Operations — Campaign QA Agent

**Business context**: Extending the DV360 campaign-builder example from Chapters 1, 3, 4, and 5, this project focuses specifically on the **QA/validation** stage: before a human-drafted or agent-drafted campaign configuration is submitted for launch, an agent reviews it against a checklist of platform constraints and brand-safety rules, flagging issues for the campaign manager rather than auto-correcting them — a deliberately conservative design choice, justified below.

```python
"""
app/projects/campaign_qa/schemas.py

Structured QA findings schema (Ch.2 pattern), designed so the
agent's output is a list of discrete, actionable findings rather
than free-text "feedback" that a human would have to re-parse.
"""

from enum import Enum
from pydantic import BaseModel, Field


class FindingSeverity(str, Enum):
    BLOCKING = "blocking"      # must be fixed before launch
    WARNING = "warning"        # should be reviewed, not necessarily blocking
    INFO = "info"


class QAFinding(BaseModel):
    severity: FindingSeverity
    field: str = Field(..., description="The campaign config field this finding relates to.")
    description: str = Field(..., max_length=400)


class CampaignQAReport(BaseModel):
    campaign_id: str
    findings: list[QAFinding]
    overall_recommendation: str = Field(
        ..., description="One of: 'ready_to_launch', 'needs_changes', 'needs_review'."
    )
```

```python
"""
app/projects/campaign_qa/qa_agent.py

Demonstrates the design rationale: this agent NEVER calls a
launch_campaign tool itself (Ch.3 Section 3.6's irreversible-action
gating, applied here at the level of "this agent simply has no such
tool at all," the strongest possible guardrail). It only produces a
structured report for a human campaign manager to act on.
"""

from app.projects.campaign_qa.schemas import CampaignQAReport
from app.services.structured_extraction import extract_structured

QA_SYSTEM_PROMPT = """\
You are a campaign QA reviewer for a digital advertising platform.
Review the campaign configuration provided and identify any issues:
budget caps that seem implausibly low or high for the stated goal,
missing required targeting fields, brand-safety concerns in creative
copy, or inconsistencies between stated objective and configured
bid strategy. You do not have the ability to launch, modify, or
approve campaigns -- you only produce findings for human review.
"""


async def run_campaign_qa(campaign_config_json: str, campaign_id: str) -> CampaignQAReport:
    user_prompt = f"""\
Review this campaign configuration:

<campaign_config>
{campaign_config_json}
</campaign_config>

Respond with a structured QA report only.
"""
    return await extract_structured(
        system_prompt=QA_SYSTEM_PROMPT,
        user_prompt=user_prompt,
        schema=CampaignQAReport,
        prompt_version="campaign_qa_v1",
    )
```

### 8.3 Project review checklist (Section 1, Learning Objective 6)

```python
"""
app/review/project_checklist.py

A structured, code-expressible version of the senior-architect
review checklist referenced in this chapter's learning objectives.
Not meant to be a runtime gate -- meant to be walked through, item
by item, in a design review meeting before a project is approved
for production deployment.
"""

PROJECT_REVIEW_CHECKLIST = [
    "Has every decision/action been classified as deterministic, "
    "LLM-judgment, or human-required (Section 3.2)? Is the "
    "classification justified in writing, not just assumed?",

    "Does every write or irreversible tool have an explicit category "
    "(Ch.3 Section 3.6) and a corresponding guardrail tier?",

    "Is there at least one tool category in this system that the "
    "agent simply does NOT have access to, for the highest-risk "
    "action in this domain (the 'no such tool exists' guardrail, "
    "Section 8.2's campaign QA example)?",

    "Does the state schema (Ch.4 Section 3.2) avoid burying "
    "structured business data inside an unstructured message list?",

    "Is there a bounded recursion/iteration limit on every cycle in "
    "the graph (Ch.3 Section 9, Ch.4 Section 9)?",

    "Does the evaluation plan (Ch.5 Section 3.1) include "
    "tool-selection accuracy, not just final-output correctness, "
    "where tools are involved?",

    "Is there a cost budget enforced BEFORE LLM calls, not just "
    "observed after billing (Ch.5 Section 3.6, Section 8.4)?",

    "Is there a circuit breaker / fallback plan for LLM provider "
    "outage (Ch.5 Section 4.3)?",

    "Is every tool call, human approval, and final decision logged "
    "with enough detail to reconstruct 'why did the system do that' "
    "for an auditor six months later (Ch.3 Section 4.5, Ch.5 Section 4.4)?",

    "Has a canary/gradual rollout plan been defined for the first "
    "production deployment and for future prompt/tool/model changes "
    "(Ch.5 Section 4.4)?",
]
```

---

## 9. Common Mistakes

1. **Skipping the decomposition step and prompting a single generalist agent to "handle the whole process."** Without Section 3's explicit decomposition and classification, teams default to one large agent loop covering extraction, decision-making, and action — re-creating exactly the maintainability and predictability problems Chapter 4 was written to solve. *Correct approach*: always decompose first, classify each piece, and only then decide whether a single agent loop or a full graph workflow is warranted (Chapter 4, Section 3.6).

2. **Automating the judgment call instead of the data-gathering.** In the invoice reconciliation project (Section 8.1), a tempting shortcut is to ask the LLM directly "does this invoice match the PO, yes or no" rather than extracting structured amounts and applying a deterministic comparison. This reintroduces exactly the unreliable-structured-decision problem Chapter 2 addressed. *Correct approach*: push every decision that *can* be deterministic once data is structured, into deterministic code (Section 8.1's `fetch_po_and_compare`), reserving the LLM for the genuinely unstructured-language parts.

3. **Giving the QA/review agent the same tool access as the action-taking agent "for convenience."** In the campaign QA project (Section 8.2), giving the QA agent a `launch_campaign` tool "in case it's useful later" defeats the entire purpose of a conservative, review-only design. *Correct approach*: the strongest guardrail for a review-only role is the complete absence of the corresponding action tool, not a permission check that could be misconfigured (Chapter 3, Section 3.6, applied at the strongest possible level here).

4. **Building the eval set only from "nice" examples.** All four projects in this chapter are weakened if their evaluation sets only contain clean, unambiguous cases (Chapter 5, Section 3.1) — the support agent's escalation boundary, the claims auto-approval threshold, and the invoice-matching tolerance all depend on edge cases being represented in evaluation, not just clear-cut successes.

5. **Treating this chapter's four projects as templates to copy verbatim rather than as worked applications of the Section 3 process.** A different company's support ticket taxonomy, claims policy rules, invoice formats, or ad platform constraints will differ in specifics; the value of this chapter is the repeatable decomposition process (Section 3), not the specific field names in the example schemas.

---

## 10. Best Practices

- **Scalability**: design each project's tool inventory (Section 8) to scale independently — a read-heavy support agent and a write-cautious invoice reconciliation system have very different load and latency profiles, and should be capacity-planned separately rather than assuming one infrastructure sizing fits all four projects.
- **Maintainability**: keep every project's Section 3 decomposition document (decisions, classifications, tool inventory) as a living design artifact in source control alongside the code, so future engineers can see *why* a given node is deterministic vs. LLM-driven vs. human-gated, not just *that* it is.
- **Testing**: apply the full Chapter 5 evaluation discipline per project, but tailor the eval set's composition to each domain's specific costliest failure mode (under-escalation for support, false auto-approval for claims, missed discrepancies for invoices, missed brand-safety issues for campaign QA).
- **Security**: apply the Section 8.3 checklist's "no such tool exists" principle as the default for any action where the cost of a wrong automated decision is asymmetbetically high relative to the cost of requiring human review.
- **Cost optimization**: route the deterministic portions of each workflow (PO amount comparison, eligibility rule checks) through plain code with zero LLM cost, reserving LLM calls strictly for the genuinely language-understanding steps identified in Section 3.2 — this is often the single largest cost-optimization lever available, more impactful than model selection or prompt tuning.
- **Observability**: ensure the audit trail for every project answers the same fundamental question an auditor, regulator, or incident responder will eventually ask: which decisions were made by deterministic code, which were made by the model, and which were made by a human — and why each fell into its category.
- **Deployment & versioning**: roll out each of these four projects incrementally, starting with the lowest-risk slice (e.g., support ticket classification alone, before enabling auto-resolution actions), exactly mirroring the canary discipline from Chapter 5 applied at the level of *feature scope*, not just prompt version.

---

## 11. Exercises

**Easy**

1. Apply Section 3's five-step process, at a high level (a few sentences per step, no code), to a new business request: "Help our HR team screen incoming job applications and flag the top candidates for a recruiter to review."
2. For the customer support project in Section 6, list two ticket types that should clearly remain human-only, and justify why using the Step 2 classification framework.

**Intermediate**

3. Extend the invoice reconciliation state and node design in Section 8.1 to add a `vendor_history_check` deterministic node that flags any invoice from a vendor with more than two prior discrepancies in the last quarter as `requires_human_review = True`, regardless of the current invoice's match confidence.
4. For the campaign QA project in Section 8.2, design a structured eval set of 10 cases (description only, no need to write the full JSON) covering both clean configurations and at least three distinct categories of issues the QA agent should catch.

**Advanced**

5. Design (full Section 3 decomposition, in writing) a fifth enterprise project of your choosing, from a vertical not covered in this chapter (e.g., logistics/supply chain dispatch, retail inventory replenishment, telecom customer churn outreach). Include the state schema, tool inventory with categories, and a description of where the human-in-the-loop boundary sits and why.
6. Using the project review checklist in Section 8.3, conduct a written review of the customer support project from Section 6 as if you were a senior architect approving it for production. Identify at least two checklist items that the design as described does not yet fully satisfy, and propose the specific change needed to satisfy each.

---

## 12. Mini Project

**Project: Full-Stack Implementation of One Chapter-6 Project**

Choose one of the four projects presented in this chapter (customer support resolution, insurance claims, invoice reconciliation, or campaign QA) and build a complete, working implementation:

1. Write the full Section 3 decomposition document for your chosen project as a markdown file, including the decision/action table, tool inventory with categories, and human-in-the-loop boundary justification.
2. Implement the state schema, nodes, and graph (Chapter 4 patterns), reusing the Chapters 1–3 LLM client, structured extraction service, and tool registry/policy engine infrastructure.
3. Implement at least one deterministic node and justify, in a code comment, why it does not require an LLM call (per Section 3.2's classification discipline).
4. Build an evaluation harness with at least 10 cases, including at least 3 deliberately ambiguous or edge-case inputs targeting your domain's costliest failure mode (per Section 10's guidance).
5. Apply the full project review checklist from Section 8.3 to your own implementation and document, in writing, how each item is satisfied or what remains outstanding.

---

## 13. Chapter Summary

- Enterprise agentic system design is a repeatable process: decompose the business request into discrete decisions and actions, classify each as deterministic/LLM/human-required, inventory and categorize tools, design the state and graph, and define the evaluation and guardrail plan before significant implementation begins.
- Misclassifying a decision — automating a judgment call that needed a human, or routing a simple deterministic rule through unreliable LLM judgment — is the most common root cause of poorly designed agentic systems.
- The customer support project illustrates calibrating an automation boundary where under-escalation is the costliest failure mode, requiring an evaluation set deliberately weighted toward ambiguous cases.
- The insurance claims project synthesizes every infrastructure component from Chapters 1–5 into a single coherent pipeline, with auto-approval deliberately confined to a conservative, deterministic-eligibility subset of cases.
- The invoice reconciliation project demonstrates pushing matching/comparison logic into deterministic code once fields are structured, reserving the LLM strictly for language-understanding extraction.
- The campaign QA project demonstrates the strongest possible guardrail for a review-only role: the complete absence of the corresponding action-taking tool, rather than relying on a permission check alone.
- A structured project review checklist, spanning architecture, security, cost, evaluation, and observability concerns from every prior chapter, is the appropriate tool for a senior-level design review before production approval.
- The specific schemas and tools in this chapter's four projects are illustrative; the durable, transferable skill is the five-step decomposition process applied to whatever new business domain you encounter.

---

## 14. Interview Questions

**Conceptual**

1. Walk through the five-step design process from Section 3 using a business request of the interviewer's choosing, narrating your reasoning at each step.
2. Why is "the model decided this invoice doesn't match" a weaker design than "the model extracted structured amounts, and deterministic code decided they don't match"?

**Architecture**

3. For the customer support project (Section 6), design the specific data needed in the escalation payload handed to a human agent so they don't have to re-discover context the AI agent already gathered.
4. Compare the human-in-the-loop boundary design across the insurance claims project (Section 7) and the campaign QA project (Section 8.2). Why does one use a resumable checkpoint while the other simply never has the action-taking tool at all? When would you choose each pattern?

**Coding**

5. Implement a deterministic `route_after_comparison`-style function (Section 8.1) for the customer support project that decides, from already-known structured state, whether a ticket should auto-resolve, escalate immediately, or attempt one clarifying question to the customer first.
6. Extend the `CampaignQAReport` schema (Section 8.2) to include a `confidence_in_findings` field, and explain — referencing Chapter 5, Section 3.2 — why you would or would not trust this field as a gating signal for anything more consequential than ordering the findings shown to a human reviewer.

**Scenario-based**

7. Six months after launching the invoice reconciliation agent, finance reports a rise in invoices that passed auto-posting but turned out to have subtly incorrect line-item allocations the amount-matching check didn't catch. Using the Section 3 process, diagnose what was likely misclassified in the original design and propose a fix.
8. The customer support agent's escalation rate has crept up significantly since launch, increasing human workload rather than reducing it. Walk through how you would determine whether this is a model regression, a prompt issue, a shifting ticket mix, or a sign the original automation boundary was miscalibrated.

**System Design**

9. A retail company asks you to design an agentic system to handle return/refund requests across both a website chatbot and a phone-based voice agent, sharing the same underlying business logic and tools. Apply the Section 3 process and explain how you would structure shared infrastructure (tools, policy engine, evaluation) across the two channels while accounting for their different latency and interaction-pattern constraints.
10. Using the full project review checklist from Section 8.3, design and defend an enterprise agentic system for a domain of your choosing that you believe is currently UNSUITABLE for agentic automation given today's technology and guardrail patterns, and explain precisely which checklist items cannot currently be satisfied to an acceptable risk level, and why.

