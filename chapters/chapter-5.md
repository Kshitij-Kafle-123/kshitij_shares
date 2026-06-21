# Chapter 5 — Production Agentic Systems

*Enterprise Agentic AI Engineering: A Textbook for Software Engineers*

---

## 1. Learning Objectives

By the end of this chapter, you will be able to:

1. Explain why "it works in a demo" and "it is production-ready" are categorically different bars for agentic systems, and enumerate the additional engineering concerns production introduces.
2. Design evaluation harnesses for agentic systems that measure tool-selection accuracy, structured-output correctness, and end-to-end task success — not just subjective output quality.
3. Implement cost-control mechanisms: prompt caching, model routing, token budgeting, and request batching.
4. Design human-in-the-loop architectures for agentic systems, including approval queues, escalation paths, and timeout handling, extending the checkpoint pattern from Chapter 4.
5. Implement observability for agentic systems: distributed tracing across LLM calls, tool calls, and graph nodes; structured logging; and dashboards suited to non-deterministic systems.
6. Apply retrieval-augmented generation (RAG) correctly as a grounding mechanism, distinguishing it from fine-tuning and from simply "pasting more context."
7. Design for reliability under failure: retries, circuit breakers, fallback models, and graceful degradation when an LLM provider is unavailable or degraded.
8. Apply security hardening, rate limiting, and deployment practices (canary releases, feature flags, rollback) specific to agentic systems, building on the security foundations from Chapter 3.

This chapter assumes you have completed Chapters 1–4 and can build a multi-stage, tool-calling, graph-based agentic workflow. This chapter is about making that workflow survive contact with real production traffic, real cost constraints, real failures, and real audits.

---

## 2. Why This Matters

### 2.1 The gap between a working prototype and a production system

Every chapter so far has built toward functioning agentic systems — a chatbot, a structured extractor, a tool-calling agent, a multi-stage graph workflow. All of these can be demonstrated successfully in a controlled setting with well-behaved inputs. Enterprises consistently report that the gap between "this demo works" and "this is safe to expose to real customers and real money" is the single largest source of delayed or failed AI initiatives. That gap is precisely the subject of this chapter: evaluation, cost control, human oversight, observability, reliability engineering, and deployment discipline — the same categories of concern that separate a working prototype from a production service in *any* domain of software engineering, now adapted to the specific failure modes of probabilistic, tool-calling systems.

### 2.2 The business problem this solves

A claims-processing agent that is 95% accurate in a demo with ten hand-picked examples is not necessarily safe to deploy against tens of thousands of real claims per day, where the 5% failure rate translates into a measurable, recurring cost — wrongly denied claims, wrongly auto-approved high-risk claims, or a flood of escalations overwhelming the human review team. Enterprises need **measured, monitored, bounded** confidence in agentic system behavior, not anecdotal confidence from a handful of successful test runs. This chapter provides the engineering discipline to obtain that measured confidence and to keep it once granted, even as models, prompts, and traffic patterns change over time.

### 2.3 Where this fits in enterprise architecture

This chapter does not introduce a new architectural box so much as it hardens every box introduced in Chapters 1–4: the LLM Client gains retries and fallback routing; the Orchestration Layer gains evaluation gates and observability instrumentation; the Tool Registry and Policy Engine gain rate limiting; the Workflow layer gains human-in-the-loop queue infrastructure. Think of this chapter as the "non-functional requirements" chapter for everything built so far — the production engineering discipline that turns a correct system into a *trustworthy, operable* one.

---

## 3. Fundamentals

### 3.1 Why evaluation for agentic systems differs from traditional software testing

Traditional unit and integration tests assert exact expected outputs for given inputs. Chapter 1, Section 3.6 established that LLM output is non-deterministic, so exact-match assertions are not a viable general testing strategy for end-to-end agent behavior (although they remain entirely appropriate for the deterministic code surrounding the model, as emphasized throughout Chapters 1–4). Production agentic systems instead require **evaluation harnesses**: a curated, representative set of inputs (an "eval set"), each with either a known-correct structured output, a known-correct *category* of acceptable outputs, or a rubric a separate evaluation process (sometimes itself an LLM, sometimes a human) can score against.

Three distinct evaluation dimensions matter for an agentic system, each requiring a different measurement approach:

- **Structured-output correctness**: does extracted/generated structured data match expected values? This is straightforwardly measurable via schema validation (Chapter 2) plus field-level comparison against ground truth.
- **Tool-selection accuracy**: did the agent call the right tool(s), with the right arguments, in the right circumstances? Measured by comparing the sequence of tool calls made against an expected (or acceptable-set of) tool call sequence for each eval input — introduced conceptually in Chapter 3, Section 4.1, and now made into a concrete, ongoing measurement practice.
- **End-to-end task success**: did the overall workflow reach the correct final outcome (e.g., correct approval/denial decision, correct customer communication sent)? This is often the hardest to automate fully and may require a combination of automated checks and periodic human review of a sampled subset of real production runs.

### 3.2 LLM-as-judge — a useful but bounded technique

Because human review of every evaluation run does not scale, a common production technique is **LLM-as-judge**: using a separate LLM call, with its own carefully designed prompt and rubric, to score or critique the output of the production agent. This is the same debate/review pattern introduced in Chapter 4, Section 3.7, applied to evaluation rather than to live workflow execution. LLM-as-judge is useful for catching gross failures and tracking relative quality trends over time (e.g., "did our pass rate on this rubric drop after the last prompt change"), but it inherits the same non-determinism and potential blind spots as any other LLM call, and should never be the *sole* gate for high-stakes decisions — it is one signal among several (alongside structured validation and periodic human-reviewed sampling), not an oracle.

### 3.3 Retrieval-Augmented Generation (RAG) — grounding, not memory

Chapter 1, Section 4.2 established that an LLM's factual knowledge is frozen at its training cutoff and that hallucination is a structural property of next-token prediction. **Retrieval-Augmented Generation** addresses both problems by retrieving relevant, current, authoritative documents or data at request time and inserting them into the prompt as grounding context, instructing the model to answer *based on the provided context* rather than from its own parametric memory.

Mechanically, RAG typically involves: (1) splitting a corpus of documents into chunks, (2) computing an embedding (Chapter 1, Section 3.3) for each chunk and storing it in a vector database, (3) at query time, embedding the incoming question and retrieving the most semantically similar chunks via vector similarity search, and (4) inserting those retrieved chunks into the prompt, delimited exactly as untrusted/grounding content should be delimited per Chapter 2, Section 3.2 and Section 9.

It is important to be precise about what RAG is *not*: it is not fine-tuning (Section 3.4), and it does not give the model new reasoning capability — it gives the model access to facts it would not otherwise have, in the same way handing a human a reference document before asking them a question does not change their intelligence, only their available information.

### 3.4 RAG vs. fine-tuning — choosing the right grounding strategy

- **RAG** is appropriate when the underlying knowledge changes frequently (policies, prices, current case data), when you need to cite or audit the specific source of an answer, and when you want to avoid the cost and operational complexity of retraining a model.
- **Fine-tuning** (adjusting a model's weights on a custom dataset) is appropriate when the goal is to change the model's *behavior, style, or format adherence* in a way that's expensive to achieve purely through prompting and examples (Chapter 2) — for example, consistently following a highly specific output convention across thousands of examples — rather than to inject *facts*. Fine-tuning does not solve the knowledge-freshness problem (a fine-tuned model is just as frozen at its fine-tuning cutoff as a base model) and is a heavier, slower-to-iterate operational commitment than updating a RAG corpus.
- In practice, enterprise systems most often need RAG (for facts and freshness) and may additionally use prompt engineering and few-shot examples (Chapter 2) before reaching for fine-tuning, which is typically the last lever pulled, not the first.

### 3.5 Human-in-the-loop architecture, formalized

Chapters 3 and 4 introduced human approval as a tool category constraint (Chapter 3, Section 3.6) and a graph checkpoint (Chapter 4, Section 3.5). Production human-in-the-loop systems require additional formal infrastructure:

- An **approval queue**: a durable, queryable store of pending approval requests, each with full context (what the agent wants to do, why, and the underlying data), surfaced through a UI for the relevant human role.
- An **escalation path**: what happens if no human acts within a defined time window — auto-deny, auto-escalate to a more senior role, or auto-approve only for genuinely low-risk categories (rare, and only after careful risk analysis).
- **Explicit approval/rejection recording**, feeding back into the workflow exactly as the checkpoint-resume pattern in Chapter 4, Section 3.5 and Section 8.4–8.5 demonstrated.

### 3.6 Cost engineering as a first-class production concern

Chapter 1 established the token-based pricing model; Chapter 2 and 4 noted cost implications of few-shot examples, chain-of-thought, and multi-agent decomposition. Production systems must engineer for cost deliberately, using techniques including: **prompt caching** (providers can cache and discount repeated, unchanged prefix content like system prompts and few-shot blocks across requests — directly rewarding the disciplined, stable prompt templates from Chapter 2, Section 3.6); **model routing** (sending simple, well-defined sub-tasks to smaller/cheaper models and reserving the most capable model for genuinely complex reasoning, referenced in Chapter 1, Section 4.3); and **token budgeting** (enforcing hard `max_tokens` ceilings and bounded conversation history per Chapter 1, Section 8.5, scaled up to per-workflow and per-tenant budget enforcement in production).

---

## 4. Deep Technical Explanation

### 4.1 How prompt caching actually reduces cost

Recall from Chapter 1, Section 4.1 that the "prefill" phase (processing input tokens before generation begins) is computationally distinct from the sequential generation phase. Many providers expose a caching mechanism whereby a previously processed prefix of a prompt (e.g., a long, unchanging system prompt plus few-shot examples) can have its internal computed representation cached server-side, so that subsequent requests sharing that exact prefix skip redundant prefill computation for that portion, at a substantially discounted token rate. This has a direct architectural implication: **prompt structure matters for cost, not just content**. Placing the stable, unchanging portion of a prompt (system instructions, few-shot examples) *before* the variable, request-specific portion (the actual user input, retrieved RAG chunks) maximizes the size of the cacheable prefix — meaning the prompt template design discipline established in Chapter 2 directly determines how much caching benefit a system can realize in production.

### 4.2 Why retrieval quality, not just generation quality, determines RAG reliability

A RAG system's final answer can only be as good as the chunks retrieved (Section 3.3). If the retrieval step returns irrelevant or incomplete chunks — due to poor chunking strategy, a mismatch between query phrasing and document phrasing in embedding space, or simply an absence of the needed information in the corpus — no amount of prompt engineering on the generation step can compensate, because the model has no access to the correct information at all. This is why production RAG systems require their own dedicated evaluation (Section 3.1) measuring **retrieval precision/recall** (did the relevant chunk get retrieved at all) as a distinct, upstream metric from final-answer quality — a retrieval failure and a generation failure require entirely different fixes (re-chunking or re-indexing the corpus vs. adjusting the prompt), and conflating them in a single end-to-end metric obscures which part of the pipeline actually needs attention.

### 4.3 Failure modes and resilience patterns

| Failure mode | Resilience pattern |
|---|---|
| LLM provider returns a 429 (rate limited) or 5xx error | Exponential backoff retry (bounded attempts), as introduced as an exercise in Chapter 1; circuit breaker to stop hammering a degraded provider |
| LLM provider is fully unavailable (outage) | Fallback to a secondary model/provider, or graceful degradation (e.g., route to a human queue, return a clear "temporarily unavailable" response) rather than an unhandled exception reaching the end user |
| Model output fails schema validation repeatedly (Chapter 2, Section 8.4) | Bounded retry with validation feedback, then fail closed to a human review path — never silently pass through invalid data |
| Tool execution times out (Chapter 3) | Per-tool timeout with a clear timeout error returned to the model as a tool result, allowing the model to react (e.g., inform the user, try an alternative) rather than the whole request hanging indefinitely |
| Agent loop or graph recursion limit reached (Chapters 3-4) | Treated as an explicit, logged failure routed to human review — never a silent, unbounded hang |
| Cost runaway (e.g., a bug causes excessive tool-calling iterations across many requests) | Per-tenant/per-request token and cost budgets enforced *before* each LLM call, not only observed after the fact in billing |

### 4.4 Enterprise considerations

- **Canary deployment for prompt, tool, and model changes**: because behavior changes are probabilistic and only statistically observable, enterprises increasingly deploy agentic system changes (a new prompt version, a model upgrade, a new tool) to a small percentage of traffic first, comparing evaluation metrics (Section 3.1) and key business metrics (escalation rate, customer satisfaction, error rate) against the existing baseline before a full rollout — directly extending standard canary-deployment practice to account for the fact that "did this change break something" requires statistical comparison, not a single pass/fail test.
- **Regulatory and compliance reporting** increasingly require enterprises to demonstrate ongoing monitoring of agentic system accuracy and fairness (e.g., consistent treatment across demographic groups in lending or insurance use cases), not just a one-time pre-launch evaluation — production evaluation harnesses (Section 3.1) must run continuously against live traffic samples, not only at deployment time.
- **Vendor/model dependency risk**: enterprises building on a single LLM provider face business continuity risk if that provider has an outage, a deprecation, or a significant price change; the fallback-model pattern (Section 4.3) and provider-agnostic abstractions (the `LLMClient` wrapper pattern established since Chapter 1, Section 8.4) directly mitigate this risk at the architecture level.

---

## 5. Visual Diagrams

### 5.1 Production request flow with resilience and observability layered in

```
   Incoming Request
        │
        ▼
┌─────────────────────┐
│  Rate Limiter /         │  ← per-tenant/per-user request and
│  Cost Budget Check       │     token budget enforcement (Section 3.6)
└──────────┬───────────┘
           ▼
┌─────────────────────┐
│  Orchestration Layer    │  ← Chapters 2-4 infrastructure
│  (prompt, tools, graph)  │
└──────────┬───────────┘
           │
           ▼
┌─────────────────────┐
│  LLM Client with         │
│  Retry + Circuit         │  ← Section 4.3
│  Breaker + Fallback       │
│  Model Routing            │
└──────────┬───────────┘
     success │      exhausted retries
             │              │
             ▼              ▼
  ┌────────────────┐  ┌────────────────────┐
  │ Continue          │  │ Graceful Degradation │
  │ Workflow           │  │ (human queue / clear  │
  │                    │  │  error to user)         │
  └────────────────┘  └────────────────────┘
           │
           ▼
┌─────────────────────┐
│  Tracing / Logging /     │  ← every layer emits structured
│  Cost Attribution         │     telemetry tied to a trace ID
└─────────────────────┘
```

**Explanation**: Every box added in this chapter wraps around, rather than replaces, the orchestration logic built in Chapters 1–4. Production hardening is additive defensive infrastructure, not a redesign of the core reasoning/tool-calling/workflow logic already established.

### 5.2 RAG pipeline with retrieval evaluation as a distinct stage

```
   User Query
        │
        ▼
┌─────────────────────┐
│  Query Embedding         │
└──────────┬───────────┘
           ▼
┌─────────────────────┐
│  Vector Similarity        │  ← retrieval step, evaluated
│  Search (top-k chunks)     │     SEPARATELY (Section 4.2)
└──────────┬───────────┘
           ▼
┌─────────────────────┐
│  Retrieved Chunks          │
│  inserted into prompt,      │  ← delimited per Ch.2 Section 3.2
│  delimited as grounding      │
│  context                      │
└──────────┬───────────┘
           ▼
┌─────────────────────┐
│  LLM generates answer       │  ← generation step, evaluated
│  grounded in retrieved        │     separately (Section 3.1)
│  context                       │
└─────────────────────┘
```

**Explanation**: Separating retrieval evaluation from generation evaluation (Section 4.2) lets engineers correctly diagnose whether a wrong answer was caused by missing/poor retrieval (a corpus or indexing problem) or by poor reasoning over correctly retrieved context (a prompt problem) — two entirely different fixes that a single end-to-end accuracy metric would conflate.

---

## 6. Real Enterprise Examples

### 6.1 Insurance — continuous evaluation against a growing eval set (extending Chapters 1-4)

The claims workflow built across Chapters 1–4 is deployed with a continuously growing evaluation set: every time a human underwriter overrides an agent's auto-approval/escalation decision, that case (with the human's correct decision) is added to the eval set, ensuring the evaluation harness reflects real, evolving edge cases rather than a static set written once at launch — directly applying Section 3.1's principle that evaluation must be an ongoing practice, not a one-time gate.

### 6.2 Healthcare — RAG over a constantly updated clinical policy corpus

Extending the HR/clinical examples from earlier chapters, a clinical-policy assistant's RAG corpus is re-indexed automatically whenever the hospital's policy management system publishes an update, with retrieval-quality evaluation (Section 4.2) run nightly against a fixed set of known policy questions to catch indexing regressions (e.g., a chunking change that splits a critical dosage table across two retrieved chunks) before clinicians encounter degraded answers.

### 6.3 Banking — circuit breaker and fallback model for a customer-facing assistant

A bank's customer-facing assistant, built on the agent loop from Chapter 3, implements a circuit breaker (Section 4.3): if the primary LLM provider's error rate exceeds a threshold within a rolling window, traffic automatically routes to a secondary provider/model for the duration of the outage, with the change logged and alerting triggered — directly addressing the vendor dependency risk noted in Section 4.4 for a use case where any downtime has immediate customer-facing and reputational impact.

### 6.4 Finance — per-tenant cost budgets for a multi-tenant SaaS agentic feature

A B2B fintech platform offering an agentic expense-categorization feature to its customers enforces a per-tenant monthly token budget (Section 3.6), checked before each LLM call, to prevent a single customer's misconfigured automation (e.g., a script that resubmits the same large batch repeatedly) from generating runaway cost that the platform absorbs without separating it from normal usage-based billing.

### 6.5 Marketing — canary rollout of a new prompt version for the DV360 campaign builder

Extending the DV360 example from Chapters 1, 3, and 4, a revised system prompt intended to improve campaign-configuration accuracy is rolled out to 5% of campaign-creation requests, with the evaluation harness (Section 3.1) and key business metrics (rate of human-approver rejections at the launch checkpoint) compared against the remaining 95% of traffic still on the prior prompt version, before promoting the new version to full traffic — a direct, concrete application of the canary deployment practice described in Section 4.4.

---

## 7. Architecture Design

This section consolidates the production-hardening components introduced in this chapter into the full enterprise architecture, extending the diagrams from Chapters 1, 3, and 4.

```
┌────────────────────────────────────────────────────────────────────┐
│                         Production Agentic System                   │
│                                                                       │
│  ┌────────────────┐  ┌────────────────────┐  ┌───────────────────┐ │
│  │ Rate Limiter /    │  │  Orchestration Layer  │  │  Evaluation        │ │
│  │ Cost Budget         │──▶│  (Ch.1-4: prompts,     │──▶│  Harness            │ │
│  │ Enforcement          │  │  tools, graph workflow)│  │  (continuous, CI-     │ │
│  └────────────────┘  └──────────┬────────────┘  │  gated, Section 3.1)  │ │
│                                    │                  └───────────────────┘ │
│                                    ▼                                       │
│                       ┌────────────────────┐                              │
│                       │  LLM Client            │                              │
│                       │  - retry + backoff      │                              │
│                       │  - circuit breaker       │                              │
│                       │  - fallback model         │                              │
│                       │  - prompt cache aware     │                              │
│                       └──────────┬────────────┘                              │
│                                    │                                          │
│              ┌─────────────────────┼──────────────────────┐                  │
│              ▼                     ▼                       ▼                  │
│   ┌────────────────────┐ ┌────────────────────┐ ┌────────────────────┐       │
│   │  RAG Retrieval          │ │  Tool Registry +       │ │  Human-in-the-Loop    │       │
│   │  Subsystem                │ │  Policy Engine (Ch.3)   │ │  Approval Queue          │       │
│   │  (vector DB + eval)        │ │                          │ │  (Section 3.5)             │       │
│   └────────────────────┘ └────────────────────┘ └────────────────────┘       │
│                                    │                                          │
│                                    ▼                                          │
│                       ┌────────────────────────────────────┐                │
│                       │  Observability: Tracing, Structured     │                │
│                       │  Logging, Cost Attribution, Canary        │                │
│                       │  Metrics Dashboards (Section 4.4)          │                │
│                       └────────────────────────────────────┘                │
└────────────────────────────────────────────────────────────────────┘
```

**Responsibility separation:**

- **Rate Limiter / Cost Budget Enforcement**: sits in front of everything, rejecting or queuing requests that would exceed tenant/user budgets before any LLM cost is incurred — cheaper to enforce here than to discover via a billing report after the fact.
- **Evaluation Harness**: runs both as a pre-deployment CI gate (blocking a prompt/tool/graph change that regresses measured accuracy) and continuously against sampled live traffic, feeding the canary comparison process described in Section 4.4.
- **LLM Client**: now the most heavily hardened component in the system — every external call it makes is wrapped in retry, circuit-breaking, and fallback logic, exactly as any well-engineered client for a critical third-party dependency should be.
- **RAG Retrieval Subsystem**: evaluated independently from generation (Section 4.2), with its own health metrics (retrieval recall/precision) distinct from end-to-end task success metrics.
- **Human-in-the-Loop Approval Queue**: the production-grade realization of the checkpoint pattern from Chapter 4, now with explicit escalation-on-timeout logic (Section 3.5).
- **Observability**: the connective tissue across every component, providing the trace-level visibility required to diagnose a failure that may have passed through rate limiting, retrieval, multiple tool calls, and a human approval step before producing a final, possibly incorrect, outcome.

---

## 8. Code Examples

We extend the Chapters 1–4 codebase with resilience patterns on the LLM client, a basic evaluation harness, and cost-budget enforcement.

### 8.1 Updated project structure

```
enterprise_agentic_app/
├── app/
│   ├── ...                          (from Chapters 1-4)
│   ├── resilience/
│   │   ├── __init__.py
│   │   ├── retry.py
│   │   └── circuit_breaker.py
│   ├── cost/
│   │   ├── __init__.py
│   │   └── budget_enforcer.py
│   └── evaluation/
│       ├── __init__.py
│       ├── eval_cases.py
│       └── eval_runner.py
└── tests/
    ├── test_retry.py
    ├── test_circuit_breaker.py
    └── test_eval_runner.py
```

### 8.2 Retry with exponential backoff (`app/resilience/retry.py`)

```python
"""
Generic retry decorator with exponential backoff and jitter,
applied to the LLM client (Section 4.3). This is standard
distributed-systems resilience engineering, not unique to LLMs --
applied here specifically to provider rate limits (429) and
transient server errors (5xx).
"""

import asyncio
import logging
import random
from functools import wraps
from typing import Callable, TypeVar

from anthropic import APIStatusError, APIConnectionError

logger = logging.getLogger(__name__)

T = TypeVar("T")

RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 529}


def with_retry(max_attempts: int = 4, base_delay_seconds: float = 1.0):
    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @wraps(func)
        async def wrapper(*args, **kwargs) -> T:
            last_exc: Exception | None = None
            for attempt in range(1, max_attempts + 1):
                try:
                    return await func(*args, **kwargs)
                except APIStatusError as exc:
                    if exc.status_code not in RETRYABLE_STATUS_CODES:
                        # Non-retryable client error (e.g., 400 bad
                        # request) -- retrying would never succeed,
                        # so fail fast instead of wasting attempts.
                        raise
                    last_exc = exc
                except APIConnectionError as exc:
                    last_exc = exc

                if attempt < max_attempts:
                    # Exponential backoff with jitter, preventing a
                    # thundering-herd retry pattern across many
                    # concurrent requests hitting the same outage.
                    delay = base_delay_seconds * (2 ** (attempt - 1))
                    delay += random.uniform(0, delay * 0.1)
                    logger.warning(
                        "retrying attempt=%d/%d after %.2fs due to: %s",
                        attempt, max_attempts, delay, last_exc,
                    )
                    await asyncio.sleep(delay)

            raise last_exc  # exhausted all attempts

        return wrapper
    return decorator
```

### 8.3 Circuit breaker (`app/resilience/circuit_breaker.py`)

```python
"""
A simple circuit breaker (Section 4.3) that stops sending requests
to a degraded provider once its error rate exceeds a threshold
within a rolling window, instead of continuing to retry a provider
that is clearly down -- preventing wasted latency and cost, and
giving the provider room to recover instead of being hammered.
"""

import time
from collections import deque
from dataclasses import dataclass, field


@dataclass
class CircuitBreaker:
    failure_threshold: float = 0.5  # open circuit above 50% error rate
    window_seconds: float = 60.0
    min_requests_to_evaluate: int = 10
    open_duration_seconds: float = 30.0

    _events: deque = field(default_factory=deque)  # (timestamp, success: bool)
    _opened_at: float | None = field(default=None)

    def _prune_old_events(self) -> None:
        cutoff = time.monotonic() - self.window_seconds
        while self._events and self._events[0][0] < cutoff:
            self._events.popleft()

    def is_open(self) -> bool:
        if self._opened_at is None:
            return False
        if time.monotonic() - self._opened_at >= self.open_duration_seconds:
            # Half-open: allow a trial request through to test recovery.
            self._opened_at = None
            return False
        return True

    def record_success(self) -> None:
        self._events.append((time.monotonic(), True))
        self._prune_old_events()

    def record_failure(self) -> None:
        self._events.append((time.monotonic(), False))
        self._prune_old_events()
        if len(self._events) >= self.min_requests_to_evaluate:
            error_rate = sum(1 for _, ok in self._events if not ok) / len(self._events)
            if error_rate >= self.failure_threshold:
                self._opened_at = time.monotonic()


class CircuitOpenError(Exception):
    """Raised when a call is attempted while the circuit is open."""
```

### 8.4 Cost budget enforcement (`app/cost/budget_enforcer.py`)

```python
"""
Per-tenant token budget enforcement (Section 3.6, Section 4.3's
"cost runaway" failure mode). Checked BEFORE issuing an LLM call,
not only observed afterward in a billing report.
"""

from dataclasses import dataclass, field
from datetime import date


class BudgetExceededError(Exception):
    pass


@dataclass
class TenantBudget:
    tenant_id: str
    monthly_token_limit: int
    tokens_used_this_month: int = 0
    period: date = field(default_factory=date.today)


class BudgetEnforcer:
    def __init__(self) -> None:
        self._budgets: dict[str, TenantBudget] = {}

    def register_budget(self, tenant_id: str, monthly_token_limit: int) -> None:
        self._budgets[tenant_id] = TenantBudget(
            tenant_id=tenant_id, monthly_token_limit=monthly_token_limit
        )

    def check_and_reserve(self, tenant_id: str, estimated_tokens: int) -> None:
        """
        Called BEFORE an LLM request is issued. Raises if the
        request would push the tenant over budget, so the caller
        can reject the request cleanly rather than incurring cost
        and failing later.
        """
        budget = self._budgets.get(tenant_id)
        if budget is None:
            raise BudgetExceededError(f"No budget registered for tenant {tenant_id}")

        self._reset_if_new_month(budget)

        if budget.tokens_used_this_month + estimated_tokens > budget.monthly_token_limit:
            raise BudgetExceededError(
                f"Tenant {tenant_id} would exceed monthly token budget "
                f"({budget.tokens_used_this_month}/{budget.monthly_token_limit})."
            )

    def record_actual_usage(self, tenant_id: str, actual_tokens: int) -> None:
        budget = self._budgets[tenant_id]
        self._reset_if_new_month(budget)
        budget.tokens_used_this_month += actual_tokens

    def _reset_if_new_month(self, budget: TenantBudget) -> None:
        today = date.today()
        if (today.year, today.month) != (budget.period.year, budget.period.month):
            budget.tokens_used_this_month = 0
            budget.period = today


budget_enforcer = BudgetEnforcer()
```

### 8.5 Evaluation harness (`app/evaluation/eval_cases.py` and `eval_runner.py`)

```python
"""
app/evaluation/eval_cases.py

A small, representative evaluation set for the claim extraction
task introduced in Chapter 2 (Section 3.1's "structured-output
correctness" dimension). In production this would be substantially
larger and grow continuously, per Section 6.1.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class EvalCase:
    case_id: str
    raw_claim_text: str
    expected_claim_type: str
    expected_min_amount: float
    expected_max_amount: float


EVAL_CASES: list[EvalCase] = [
    EvalCase(
        case_id="auto_simple_001",
        raw_claim_text=(
            "Hi, this is John Carter, policy AC-44231. My car was "
            "rear-ended last Tuesday on Main St. Repair estimate "
            "came back at $3,200."
        ),
        expected_claim_type="auto",
        expected_min_amount=3199.0,
        expected_max_amount=3201.0,
    ),
    EvalCase(
        case_id="property_water_damage_002",
        raw_claim_text=(
            "Claimant: Maria Lopez. Policy PR-90011. Basement "
            "flooded during the storm on June 2nd. Plumber quoted "
            "repairs around $8,500."
        ),
        expected_claim_type="property",
        expected_min_amount=8400.0,
        expected_max_amount=8600.0,
    ),
]
```

```python
"""
app/evaluation/eval_runner.py

Runs the eval set against the extraction service and reports a
pass rate -- intended to run in CI as a deployment gate (Section
4.4's canary discipline starts with this kind of pre-deployment
check) and on a schedule against production-representative samples.
"""

import logging
from dataclasses import dataclass

from app.evaluation.eval_cases import EVAL_CASES, EvalCase
from app.schemas.claim import ExtractedClaim
from app.services.structured_extraction import extract_structured
from app.prompts.templates.claim_extraction_v1 import (
    SYSTEM_PROMPT, build_user_prompt, PROMPT_VERSION,
)

logger = logging.getLogger(__name__)


@dataclass
class EvalResult:
    case_id: str
    passed: bool
    failure_reason: str | None = None


async def run_eval_case(case: EvalCase) -> EvalResult:
    try:
        claim = await extract_structured(
            system_prompt=SYSTEM_PROMPT,
            user_prompt=build_user_prompt(case.raw_claim_text),
            schema=ExtractedClaim,
            prompt_version=PROMPT_VERSION,
        )
    except ValueError as exc:
        return EvalResult(case.case_id, passed=False, failure_reason=f"extraction_error: {exc}")

    if claim.claim_type.value != case.expected_claim_type:
        return EvalResult(
            case.case_id, passed=False,
            failure_reason=(
                f"claim_type mismatch: expected {case.expected_claim_type}, "
                f"got {claim.claim_type.value}"
            ),
        )

    amount = float(claim.estimated_damage_amount)
    if not (case.expected_min_amount <= amount <= case.expected_max_amount):
        return EvalResult(
            case.case_id, passed=False,
            failure_reason=(
                f"amount {amount} outside expected range "
                f"[{case.expected_min_amount}, {case.expected_max_amount}]"
            ),
        )

    return EvalResult(case.case_id, passed=True)


async def run_full_eval_suite() -> tuple[float, list[EvalResult]]:
    results = [await run_eval_case(case) for case in EVAL_CASES]
    pass_rate = sum(1 for r in results if r.passed) / len(results)

    for result in results:
        if not result.passed:
            logger.warning(
                "eval_case_failed case_id=%s reason=%s",
                result.case_id, result.failure_reason,
            )

    logger.info("eval_suite_pass_rate=%.2f%%", pass_rate * 100)
    return pass_rate, results
```

### 8.6 Tests for the new resilience components

```python
"""
tests/test_circuit_breaker.py
"""

from app.resilience.circuit_breaker import CircuitBreaker


def test_circuit_stays_closed_below_failure_threshold():
    breaker = CircuitBreaker(failure_threshold=0.5, min_requests_to_evaluate=4)
    breaker.record_success()
    breaker.record_success()
    breaker.record_success()
    breaker.record_failure()
    assert breaker.is_open() is False


def test_circuit_opens_above_failure_threshold():
    breaker = CircuitBreaker(failure_threshold=0.5, min_requests_to_evaluate=4)
    breaker.record_failure()
    breaker.record_failure()
    breaker.record_failure()
    breaker.record_success()
    assert breaker.is_open() is True


def test_circuit_half_opens_after_duration(monkeypatch):
    breaker = CircuitBreaker(
        failure_threshold=0.5, min_requests_to_evaluate=2, open_duration_seconds=0.0
    )
    breaker.record_failure()
    breaker.record_failure()
    assert breaker.is_open() is True
    # open_duration_seconds=0.0 means it should immediately half-open
    assert breaker.is_open() is False
```

```python
"""
tests/test_eval_runner.py — demonstrates testing the evaluation
harness itself with a mocked extraction service, so the eval
runner's pass/fail logic is verified independently of any real
LLM call.
"""

import pytest
from unittest.mock import AsyncMock, patch

from app.evaluation import eval_runner
from app.evaluation.eval_cases import EvalCase
from app.schemas.claim import ExtractedClaim, ClaimType
from datetime import date
from decimal import Decimal


@pytest.mark.asyncio
async def test_eval_case_passes_when_fields_match():
    case = EvalCase(
        case_id="t1", raw_claim_text="irrelevant",
        expected_claim_type="auto",
        expected_min_amount=100.0, expected_max_amount=200.0,
    )
    mock_claim = ExtractedClaim(
        claimant_name="X", policy_number="P-1", claim_type=ClaimType.AUTO,
        incident_date=date(2026, 1, 1), estimated_damage_amount=Decimal("150"),
        summary="s",
    )
    with patch(
        "app.evaluation.eval_runner.extract_structured",
        new=AsyncMock(return_value=mock_claim),
    ):
        result = await eval_runner.run_eval_case(case)

    assert result.passed is True


@pytest.mark.asyncio
async def test_eval_case_fails_when_amount_out_of_range():
    case = EvalCase(
        case_id="t2", raw_claim_text="irrelevant",
        expected_claim_type="auto",
        expected_min_amount=100.0, expected_max_amount=200.0,
    )
    mock_claim = ExtractedClaim(
        claimant_name="X", policy_number="P-1", claim_type=ClaimType.AUTO,
        incident_date=date(2026, 1, 1), estimated_damage_amount=Decimal("9999"),
        summary="s",
    )
    with patch(
        "app.evaluation.eval_runner.extract_structured",
        new=AsyncMock(return_value=mock_claim),
    ):
        result = await eval_runner.run_eval_case(case)

    assert result.passed is False
    assert "outside expected range" in result.failure_reason
```

---

## 9. Common Mistakes

1. **Shipping based on demo success rather than a measured eval pass rate.** A handful of successful manual tests is not statistical evidence of production reliability. *Correct approach*: build and continuously grow an evaluation harness (Section 3.1, Section 8.5) and gate deployments on measured pass rate, not anecdote.

2. **Conflating retrieval failure with generation failure in RAG systems.** Teams sometimes spend significant effort tuning prompts to fix wrong answers that are actually caused by the retrieval step never surfacing the correct document. *Correct approach*: evaluate retrieval and generation as distinct stages (Section 4.2) so the right component gets the fix.

3. **No circuit breaker or fallback for LLM provider outages.** Relying solely on retries against a fully down provider wastes latency and can cascade into a broader outage of your own system. *Correct approach*: combine retries (for transient errors) with a circuit breaker and, where business-critical, a fallback model/provider (Section 4.3, Section 8.3).

4. **Treating LLM-as-judge as ground truth.** Some teams use an LLM-as-judge score as the sole, final signal for whether a system is performing well, without ever validating that judge's scoring against real human judgment. *Correct approach*: use LLM-as-judge as one signal among several (Section 3.2), validated periodically against human-reviewed samples.

5. **No cost budget enforcement until the bill is a surprise.** Discovering a cost overrun only when the monthly invoice arrives means the damage is already done. *Correct approach*: enforce budgets proactively, before each call (Section 8.4), not reactively after the fact.

6. **Deploying prompt/model/tool changes to 100% of traffic at once.** Because behavior changes are statistical, a regression may not be obvious from a handful of manual checks before full rollout. *Correct approach*: canary deployment (Section 4.4) comparing evaluation and business metrics between the new and old versions on live traffic before full promotion.

---

## 10. Best Practices

- **Scalability**: design rate limiting and budget checks to be fast, in-memory or cache-backed checks performed before any LLM call, so they add negligible latency while still preventing runaway cost or abuse.
- **Maintainability**: keep the evaluation harness in source control alongside the prompts and tools it evaluates (Section 8.5), so a prompt change and its corresponding eval case update are reviewed together in the same pull request.
- **Testing**: test resilience components (retry, circuit breaker, budget enforcer) as ordinary deterministic unit tests (Section 8.6) — they contain no LLM calls themselves and should be tested with the same rigor as any other reliability-critical infrastructure code.
- **Security**: ensure rate limiting and budget enforcement double as abuse protection — a malicious or compromised caller attempting to exhaust resources or run up cost should be bounded by the same mechanisms protecting against ordinary cost overruns.
- **Cost optimization**: structure prompts to maximize cacheable prefix length (Section 4.1); route simple, well-defined sub-tasks to smaller models; enforce per-tenant and global budgets; monitor cost per workflow node (Chapter 4, Section 4.4) to find and fix the most expensive stages first.
- **Observability**: instrument every external call (LLM, tool, retrieval) with a shared trace ID so a single production incident can be reconstructed end-to-end, across retries, fallbacks, and human approval steps.
- **Deployment & versioning**: never deploy a prompt, tool, model, or graph change to full production traffic without canary comparison against the evaluation harness and key business metrics; maintain the ability to roll back quickly via feature flag or version pinning.

---

## 11. Exercises

**Easy**

1. Explain why exact-match testing, appropriate for the deterministic code in Chapters 1–4, is insufficient as the *only* testing strategy for end-to-end agent behavior, and what kind of testing should supplement it.
2. Given the `BudgetEnforcer` in Section 8.4, explain what would happen, and what should happen, if `check_and_reserve` is never called before an LLM request — identify the risk this omission creates.

**Intermediate**

3. Extend the evaluation harness in Section 8.5 to also measure tool-selection accuracy (Section 3.1) for the agent loop built in Chapter 3, given a new set of eval cases that include an expected tool name and expected arguments.
4. Modify the `CircuitBreaker` in Section 8.3 to support a distinct, lower failure threshold for a specific high-stakes tool (e.g., a payment-processing tool) than for general LLM calls, and explain why a single global threshold might be inappropriate across tools of very different risk profiles.

**Advanced**

5. Design (in writing) a canary deployment process for a new system prompt version for the claims extraction workflow from Chapters 2 and 4: what percentage of traffic would you start with, what metrics (both evaluation-harness and business metrics) would you compare, what would trigger an automatic rollback, and how long would you run the canary before promoting to full traffic?
6. A production incident shows that a RAG-based HR policy assistant gave a confidently wrong answer about parental leave policy because the relevant policy document had been updated but the vector index had not been refreshed. Using Section 4.2 and Section 3.4, write a root-cause analysis and propose both an immediate fix and a longer-term architectural safeguard to prevent recurrence.

---

## 12. Mini Project

**Project: Production-Hardened Claims Extraction Service**

Extend the Chapters 1–4 codebase with production resilience and evaluation infrastructure:

1. Wrap the `LLMClient.generate_reply` method (Chapter 1) with the retry decorator from Section 8.2 and a circuit breaker from Section 8.3, configured with sensible thresholds.
2. Implement the `BudgetEnforcer` from Section 8.4 and integrate it into the claims extraction endpoint, rejecting requests that would exceed a configured per-tenant monthly budget with a clear, structured error response.
3. Build out the evaluation harness from Section 8.5 to at least 15 representative eval cases covering multiple claim types and at least two deliberately ambiguous/edge-case inputs, and wire it into a script runnable via a single command that prints a pass-rate summary.
4. Add structured logging (trace ID, prompt version, tokens used, retry count, circuit breaker state) sufficient to reconstruct what happened for a given request end-to-end.
5. Write a one-page canary deployment plan (following the structure proposed in Exercise 5) for the next prompt version you would ship for this service.

---

## 13. Chapter Summary

- Production readiness for agentic systems requires evaluation, cost control, human-in-the-loop infrastructure, observability, and reliability engineering layered around the orchestration logic built in Chapters 1–4 — it does not replace that logic.
- Evaluation harnesses must measure structured-output correctness, tool-selection accuracy, and end-to-end task success as distinct dimensions, and must run continuously, not only at initial launch.
- LLM-as-judge is a useful, scalable evaluation signal, but must be validated against human judgment periodically and never used as the sole gate for high-stakes decisions.
- RAG grounds model output in current, authoritative data, addressing hallucination and knowledge-cutoff limitations; retrieval quality and generation quality must be evaluated as separate stages to correctly diagnose failures.
- Cost engineering — prompt caching, model routing, and proactive per-tenant budget enforcement — is a first-class production concern, not an afterthought discovered via a billing surprise.
- Resilience patterns (retry with backoff, circuit breakers, fallback models, graceful degradation) are standard distributed-systems engineering, applied specifically to the failure modes of LLM provider calls and tool execution.
- Human-in-the-loop architecture in production requires durable approval queues, explicit escalation-on-timeout policies, and full context surfaced to the approving human — extending the checkpoint pattern from Chapter 4 into operable infrastructure.
- Canary deployment, comparing evaluation and business metrics between old and new versions on live traffic, is the correct way to ship prompt, tool, model, or graph changes safely, given that behavior changes are statistical rather than binary pass/fail.

---

## 14. Interview Questions

**Conceptual**

1. Why is exact-match output testing insufficient for evaluating an agentic system end-to-end, and what three evaluation dimensions should supplement it?
2. Explain the difference between RAG and fine-tuning, and describe a scenario where each is the more appropriate choice.
3. What is the purpose of a circuit breaker, and why is it not redundant with a retry-with-backoff mechanism?

**Architecture**

4. Design a human-in-the-loop approval queue architecture that supports escalation-on-timeout for a financial transaction approval use case. What data must be persisted, and what happens if the original approver is unavailable?
5. How would you architect cost-budget enforcement for a multi-tenant SaaS product offering an agentic feature, ensuring one tenant's runaway usage cannot silently consume another tenant's allocated budget or degrade overall system performance?

**Coding**

6. Extend the `with_retry` decorator from Section 8.2 to support a fallback to a secondary model after the primary model's retries are exhausted, and explain how this interacts with the circuit breaker from Section 8.3.
7. Write an evaluation case and corresponding assertion logic (following Section 8.5) for measuring tool-selection accuracy in the billing support agent from Chapter 3, given an input where the correct behavior is to call no tool at all.

**Scenario-based**

8. After a model provider upgrade, your evaluation harness shows no regression in structured-output correctness, but production cost has increased 40% with no corresponding traffic increase. Walk through your diagnostic process, considering the cost-engineering concepts from Section 3.6 and 4.1.
9. A canary deployment of a new prompt version shows improved evaluation-harness pass rates but a higher human-approver rejection rate in production. What does this discrepancy suggest about the evaluation set's representativeness, and how would you address it?

**System Design**

10. Design the full production architecture for a multi-tenant, RAG-grounded, tool-calling agentic customer support system that must: enforce per-tenant cost budgets, gracefully degrade during an LLM provider outage, continuously evaluate both retrieval and generation quality, and support canary rollout of prompt changes with automatic rollback on regression. Identify every component from this chapter that participates, and how they connect.

