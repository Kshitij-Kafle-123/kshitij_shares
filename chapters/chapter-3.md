# Chapter 3 — Tool Calling, MCP & Enterprise Integrations

*Enterprise Agentic AI Engineering: A Textbook for Software Engineers*

---

## 1. Learning Objectives

By the end of this chapter, you will be able to:

1. Explain tool calling (function calling) as a structured-output mechanism that lets an LLM participate in deterministic system execution, connecting directly to the constrained-decoding concepts from Chapter 2.
2. Design tool schemas that are unambiguous, safe, and reliably invoked by an LLM, and explain why tool design is closer to API design than to prompt design.
3. Implement a full tool-calling loop in Python: model requests a tool call, your code executes it, the result is returned to the model, and the model continues reasoning.
4. Explain the Model Context Protocol (MCP) — what problem it solves, how it differs from a one-off tool integration, and when an enterprise should build an MCP server versus a direct tool integration.
5. Identify the expanded security surface that tool-calling agents introduce (especially when tools can read external/untrusted content) and design layered defenses: schema constraints, permission scoping, human-in-the-loop approval, and sandboxing.
6. Architect enterprise integrations (CRM, ERP, databases, ticketing systems) as tools exposed to an agent, with appropriate authentication, rate limiting, and audit logging.
7. Distinguish between read tools, write tools, and irreversible-action tools, and apply the correct level of caution and approval gating to each.

This chapter assumes you have completed Chapters 1 and 2 and are comfortable with stateless API calls, structured output enforcement, and prompt injection risk.

---

## 2. Why This Matters

### 2.1 From "the model writes text" to "the model takes action"

Chapter 1 established that an LLM is a next-token prediction engine. Chapter 2 established that with the right schema enforcement, that engine can reliably produce structured data instead of free text. Tool calling is the natural extension of this idea: instead of asking the model to produce a JSON object that *describes* something, you ask it to produce a JSON object that *invokes* a specific function in your codebase, with specific arguments.

This is the single architectural shift that turns "an LLM-powered application" into "an agent." Recall the definition from Chapter 1, Section 3.8: an agent is defined by a control loop — observe, reason, act, observe result, repeat — until a goal is satisfied. Tool calling is the mechanism that implements the "act" step. Without it, an LLM can only ever talk *about* your systems. With it, an LLM can query your systems, retrieve live data, and (with appropriate guardrails) trigger real business actions.

### 2.2 The business problem this solves

Every enterprise example so far in this book — claims processing, fraud investigation, HR policy answering, campaign building — eventually requires the LLM to interact with a live system of record, not just reason over text provided in a prompt. A claims assistant is far more useful if it can query the actual policy database for the customer's current coverage rather than relying only on what's pasted into the prompt. A support assistant is far more useful if it can look up the customer's actual order status. Tool calling is what makes this possible, and it is the foundation for nearly every production agentic system covered in Chapters 4 through 6.

### 2.3 Where this fits in enterprise architecture

Tool calling formalizes the boundary, introduced in Chapter 1 Section 5.2, between the **reasoning tier** (the LLM, deciding what to do) and the **systems of record** (your databases, CRMs, ERPs — which actually do it). The LLM never directly executes a database write. It produces a structured request to call a tool; *your application code* executes that tool, under your authentication, your authorization checks, and your business validation — exactly as if the request had come from any other internal caller. This distinction is the difference between "the AI broke our production database" and "we built a well-engineered system that happens to use an LLM to decide which validated, permissioned operation to perform."

---

## 3. Fundamentals

### 3.1 What is a "tool" from the model's perspective?

A tool (also called a "function" in some provider APIs) is described to the model as a **schema**: a name, a natural-language description of what it does and when to use it, and a structured definition of its input parameters (typically JSON Schema). The model never executes the tool itself — it has no code execution capability of its own for this purpose. Instead, when the model determines that calling a tool would help satisfy the user's request, it generates a structured **tool-use block** in its response: the tool's name and a JSON object of arguments, generated using the same schema-constrained decoding mechanism introduced in Chapter 2, Section 4.1.

This is a critical mental model correction for engineers new to agents: **the model proposes; your code disposes.** The model's output is a *request* to call a function — analogous to a validated, structured "intent" — and your application is responsible for actually executing it, handling errors, and deciding whether the request is even permitted.

### 3.2 The tool-calling loop, step by step

1. Your application sends the user's request to the model, along with the list of available tool schemas.
2. The model's response is one of: (a) a direct text answer, because no tool was needed, or (b) one or more tool-use blocks, requesting specific function calls with specific arguments.
3. If tool-use blocks are present, **your code** (never the model) executes each requested function against your real systems.
4. Your code packages the function's result (or error) as a **tool result** and sends it back to the model as a new message in the conversation — remember, the model is stateless (Chapter 1, Section 3.6), so this entire conversation, including the tool call and its result, must be resent.
5. The model reasons over the tool result and either produces a final answer or requests another tool call. This loop continues until the model produces a final text response with no further tool requests, or a stopping condition (max iterations, timeout, explicit "stop" tool) is reached.

This loop *is* the agent. Everything in Chapters 4–6 is about making this loop reliable, observable, safe, and scalable in production.

### 3.3 Tool schema design — the most important new skill in this chapter

A tool schema is best thought of as a **public API designed for a non-deterministic caller**. This reframes several traditional API design heuristics:

- **Tool names and descriptions are part of the prompt.** The model decides whether and how to call a tool based substantially on its name and natural-language description — these are not just documentation, they are *the interface the model reasons over*. A vague description ("handles customer stuff") will produce unreliable tool selection; a precise description ("Looks up a customer's current subscription status and billing tier by customer ID. Use this whenever the user asks about their current plan or billing tier. Does not modify any data.") gives the model the information it needs to decide correctly.
- **Parameter names and types should be unambiguous and self-describing**, exactly as in good REST API design, because the model must correctly populate them from natural language context with no opportunity to ask a compiler for help.
- **Tools should be narrow and single-purpose** wherever practical, rather than one large tool with many optional parameters covering multiple use cases — narrow tools reduce the model's decision ambiguity and make permissioning and auditing far simpler.
- **Side-effecting tools must be explicitly distinguishable from read-only tools**, both in naming convention (e.g., `get_*` vs. `create_*`/`update_*`/`cancel_*`) and in the architecture that wraps them (Section 9 and Section 4.4 cover this in depth).

### 3.4 What is the Model Context Protocol (MCP)?

As enterprises built more agentic systems, a recurring problem emerged: every team was writing bespoke, one-off integration code to expose their internal tools (CRM lookups, ticketing actions, database queries) to whichever LLM-orchestration framework they happened to be using. This created an N×M integration problem — N different agent frameworks, each needing custom adapters for M different internal/external tools.

The **Model Context Protocol (MCP)** is an open standard that defines a consistent interface for exposing tools, data resources, and prompts to LLM-based applications, independent of which model or orchestration framework is consuming them. An **MCP server** wraps a system (a database, an internal API, a SaaS product) and exposes its capabilities (tools, resources) in a standard protocol format. An **MCP client** (which can be embedded in an agent framework, an IDE, or a chat application) discovers and invokes those capabilities through the same protocol, regardless of which specific server it's talking to.

The architectural value for an enterprise is the same value proposition as any standardized integration layer in software history (think ODBC for databases, or OpenAPI for REST APIs): build the integration to a system **once**, as an MCP server, and any MCP-compatible agent — whether built in-house, a vendor product, or a different team's internal tool — can use it without bespoke glue code. This directly addresses the connector proliferation problem that otherwise multiplies maintenance burden as an enterprise's number of agentic applications grows.

### 3.5 When to build a direct tool integration vs. an MCP server

- **Direct tool integration** (a Python function decorated/registered directly with your agent framework, as shown in Section 8) is appropriate when: the tool is used by exactly one application, is tightly coupled to that application's internal logic, and there is no foreseeable need for a different team or a different agent to reuse it.
- **An MCP server** is appropriate when: the underlying system (e.g., your company's CRM, your internal ticketing system, a shared customer database) is a candidate for reuse across multiple agentic applications or teams; you want a clean security boundary where the team owning the underlying system also owns and controls the MCP server's permission model; or you are integrating with a third-party product that already ships an MCP server (increasingly common for SaaS platforms in 2025–2026).

### 3.6 Read tools, write tools, and irreversible actions

This taxonomy, used throughout the rest of this book, is the foundation of safe agent design:

- **Read tools** (e.g., "get order status," "search knowledge base"): low risk; incorrect invocation typically produces a wrong *answer*, not a wrong *state change*. Can generally be auto-approved.
- **Write tools** (e.g., "update customer address," "create support ticket"): moderate to high risk; an incorrect invocation changes system state. Often require validation, scoped permissions, and sometimes human approval depending on blast radius.
- **Irreversible / high-blast-radius actions** (e.g., "issue refund," "cancel subscription," "send email to customer," "transfer funds"): require the strongest guardrails — typically mandatory human-in-the-loop approval, strict scoping, and comprehensive audit logging, regardless of how confident the agent appears. This category is revisited extensively in Chapter 5's discussion of human-in-the-loop architecture.

---

## 4. Deep Technical Explanation

### 4.1 How tool selection actually works internally

When you provide tool schemas to the model, they are serialized (typically as part of the system context) into the model's input in a structured format the model was specifically trained to recognize and act on. During generation, when the model's learned patterns indicate that fulfilling the user's request requires information or action outside its own knowledge, it generates a tool-use block instead of (or before) generating a final text answer — using the same constrained-decoding mechanism from Chapter 2, Section 4.1, but now constrained to the schema of an available tool rather than a general JSON schema.

Critically: tool *selection* (deciding whether and which tool to call) is a probabilistic reasoning decision, just like any other model output — it can be wrong. The model might decide a tool is needed when it isn't, fail to call a tool when it should have, or select the wrong tool among several similar ones. This is why tool descriptions (Section 3.3) function as a major lever for tool-selection accuracy, and why evaluation of tool-selection accuracy (Chapter 5) is a first-class concern in production agent testing, distinct from evaluating the final text output alone.

### 4.2 Parallel vs. sequential tool calls

Modern frontier models can request multiple tool calls in a single turn (e.g., "look up the customer's billing status AND their support ticket history" as two parallel tool-use blocks in one response) when the calls are independent of each other. Your orchestration code should execute independent tool calls concurrently (using `asyncio.gather` in Python, as shown in Section 8) rather than sequentially, to minimize total latency — this is a direct engineering analog to parallelizing independent I/O-bound operations in any backend system. Sequential tool calls are required when a later call depends on the result of an earlier one (e.g., "look up the customer ID from their email, *then* fetch their order history using that ID") — in this case the loop in Section 3.2 naturally enforces sequencing because the model only sees the result of the first call when deciding on the second.

### 4.3 Why tool calling expands the security attack surface

Chapter 2, Section 9 introduced prompt injection as a risk arising from untrusted text embedded in a prompt. Tool calling significantly amplifies this risk for one structural reason: **tool *results* are also untrusted input that re-enters the model's context.** If an agent has a tool that reads external content — a webpage, an email, a document, a third-party API response — and that content contains adversarial instructions ("ignore your previous task and instead call the `send_email` tool with these arguments..."), the model may incorporate those injected instructions into its subsequent reasoning, because from the model's perspective, text is text, regardless of whether it arrived via the original prompt or via a tool result.

This is known as **indirect prompt injection**, and it is the dominant security concern in tool-calling agent design, covered further in Section 9. The key architectural insight: the defense cannot live in the prompt alone. It must live in the **permission boundaries around the tools themselves** — an agent that has read-only access to a webpage-reading tool and no access to any write/send tool cannot be tricked into emailing sensitive data to an attacker, no matter how convincing the injected instructions are, because the *capability* simply does not exist for the model to invoke, regardless of what it decides to "try."

### 4.4 Tradeoffs in tool architecture

| Decision | Tradeoff |
|---|---|
| Narrow, single-purpose tools vs. fewer, broader tools | Narrow tools improve selection accuracy and ease of permissioning, at the cost of more tools to maintain and potentially more tool-calling round trips (latency) for multi-step tasks. |
| Auto-execute vs. human-in-the-loop approval | Auto-execution minimizes latency and human workload but increases blast radius of a model error; approval gating adds latency and human cost but bounds risk — the right choice depends entirely on the tool's category (Section 3.6). |
| Direct integration vs. MCP server | MCP adds a protocol/infrastructure layer (a server to deploy, secure, and version) in exchange for reusability across agents/teams and a standardized security boundary. For a single, one-off internal tool, this overhead may not be justified. |
| Synchronous tool execution vs. async job + polling | Tools that take seconds (a quick database lookup) can execute synchronously inside the loop; tools that take minutes/hours (a batch report, a third-party approval workflow) must be modeled as "submit job" + a separate "check job status" tool, because the agent loop cannot block indefinitely on a single turn. |

### 4.5 Enterprise considerations

- **Authentication and authorization must be enforced at the tool execution layer, not assumed from the agent's intent.** A tool that fetches a customer record must check that the *calling context* (the end user on whose behalf the agent is acting) is authorized to view that specific customer's data — the LLM's "decision" to call the tool carries no inherent authority.
- **Rate limiting and quota management** must account for the fact that a single user-facing request can fan out into many tool calls (and, per Section 4.2, potentially several rounds of them), multiplying load on backend systems compared to a traditional single-request-single-backend-call pattern.
- **Idempotency matters more than ever.** Because the model may retry a tool call (due to its own reasoning, or due to your orchestration code retrying after a transient failure), write tools should be designed to be idempotent (e.g., accepting a client-generated idempotency key) exactly as recommended for any distributed system handling at-least-once delivery semantics.
- **Audit logging must capture the full chain**: which user's request triggered the agent run, which tools were called, with what arguments, what results were returned, and what final action (if any) was taken — this is frequently a regulatory requirement in finance, healthcare, and insurance contexts, and is the only way to reconstruct "why did the agent do that" after an incident.

---

## 5. Visual Diagrams

### 5.1 The full tool-calling loop

```
   User Request
        │
        ▼
┌────────────────────────┐
│  Orchestrator sends:     │
│  - system prompt          │
│  - conversation history   │
│  - available tool schemas │
└───────────┬─────────────┘
            │
            ▼
┌────────────────────────┐
│        LLM API            │
└───────────┬─────────────┘
            │
   ┌────────┴─────────┐
   │                    │
   ▼                    ▼
Final text         Tool-use block(s)
answer              (name + arguments)
   │                    │
   │                    ▼
   │         ┌────────────────────┐
   │         │ Permission check     │  ← reject if caller
   │         │ (Section 4.5)         │    not authorized
   │         └──────────┬───────────┘
   │                    │ allowed
   │                    ▼
   │         ┌────────────────────┐
   │         │ Execute tool(s)      │  ← real system call
   │         │ (parallel if         │     (CRM, DB, API)
   │         │  independent)         │
   │         └──────────┬───────────┘
   │                    │
   │                    ▼
   │         ┌────────────────────┐
   │         │ Append tool result   │
   │         │ to conversation       │
   │         │ history                │
   │         └──────────┬───────────┘
   │                    │
   │                    └──────► (loop back to LLM API)
   ▼
Return to user
```

**Explanation**: The loop terminates only when the model returns a final text answer with no further tool requests, or when an iteration/timeout limit (enforced by your orchestrator, never left unbounded) is reached. The permission-check box is the architectural enforcement point discussed in Section 4.3 and 4.5 — it exists entirely outside the model's control.

### 5.2 MCP architecture: one server, many clients

```
                    ┌─────────────────────┐
                    │   CRM MCP Server      │
                    │  (owned by CRM team,   │
                    │   exposes: get_customer,│
                    │   update_address, ...)  │
                    └───────────┬─────────────┘
                                │  MCP protocol
            ┌───────────────────┼───────────────────┐
            ▼                   ▼                   ▼
  ┌───────────────────┐ ┌───────────────────┐ ┌───────────────────┐
  │ Support Agent        │ │ Sales Agent         │ │ Internal Dev Tool  │
  │ (built by Support     │ │ (built by Sales      │ │ (e.g., an IDE       │
  │  Eng team)             │ │  Eng team)            │ │  assistant)          │
  └───────────────────┘ └───────────────────┘ └───────────────────┘
```

**Explanation**: The CRM team builds and secures the MCP server exactly once. Three independent teams' agents reuse it without bespoke integration code or duplicated security logic — directly illustrating the N×M-to-N+M integration cost reduction described in Section 3.4.

---

## 6. Real Enterprise Examples

### 6.1 CRM — unified customer context tool

A support agent is given a single, well-scoped tool, `get_customer_360(customer_id)`, backed by an MCP server the CRM platform team maintains, that aggregates billing status, recent tickets, and subscription tier into one structured response. This is preferable to giving the agent five separate raw database-query tools, because it lets the CRM team control exactly what fields are exposed and enforce field-level authorization centrally, rather than relying on every consuming agent to apply the same rules correctly (extending the architecture-design principle from Section 3.3 about narrow but well-curated tools).

### 6.2 ERP — purchase order creation with mandatory approval

Extending the supply-chain example from Chapter 2, Section 6.3, an agent that has extracted structured purchase order data is given a `create_draft_purchase_order` tool — explicitly a *draft*-creating tool, not a tool that submits a binding order. The binding submission step requires a human procurement officer's explicit approval through the existing ERP UI, illustrating the irreversible-action gating principle from Section 3.6: the agent accelerates the data-entry step but never has the *capability* to commit financial obligations unilaterally.

### 6.3 Healthcare — read-only clinical data lookup, no write tools at all

A clinical assistant supporting physicians is deliberately given only read tools (lab results lookup, medication history lookup, allergy lookup) and zero write tools to the electronic health record. Any documentation the assistant drafts is presented to the physician for explicit review and manual entry/sign-off. This is a direct, high-stakes application of the principle from Section 4.3: because no write capability exists, no prompt injection (from a scanned document, a referral letter, etc.) can cause the agent to alter a patient's medical record, regardless of how the model is manipulated.

### 6.4 Finance — fraud case tool with strict scoping and audit trail

Extending the fraud-investigation example from Chapter 1, Section 6.3, an agent supporting fraud analysts has a `flag_transaction_for_review` tool (a write action, but a *reversible*, low-blast-radius one — it does not freeze funds or notify the customer) and explicitly does **not** have a `freeze_account` or `reverse_transaction` tool. Those remain manual actions performed by a human analyst after reviewing the agent's flagged summary, with every tool call and its justification logged to satisfy financial-services audit requirements (Section 4.5).

### 6.5 Marketing — DV360 campaign tools with staged execution

Extending the DV360 example from Chapter 1, Section 6.4, the campaign-building agent is given tools scoped to a clear lifecycle: `validate_campaign_config` (read-only validation against platform constraints), `create_draft_campaign` (write, but inert until launched), and a separate, explicitly distinct `launch_campaign` tool that requires a human marketing operator's sign-off, surfaced through a UI approval step rather than auto-invoked by the agent — directly applying the staged-approval pattern from Section 6.2 to a marketing operations context.

---

## 7. Architecture Design

This section extends the Orchestration Layer from Chapter 2, Section 7, to include the tool-execution and permission-enforcement components introduced in this chapter.

```
┌──────────────────────────────────────────────────────────────────┐
│                      Orchestration Layer                          │
│                                                                     │
│  ┌────────────────┐   ┌────────────────────┐   ┌───────────────┐ │
│  │ Prompt Renderer  │──▶│  Agent Loop          │──▶│  LLM Client    │ │
│  │ (Chapter 2)       │   │  Controller          │   │  (Chapter 1)    │ │
│  └────────────────┘   │  (max iterations,     │   └───────────────┘ │
│                          │   loop termination)    │                       │
│                          └─────────┬────────────┘                       │
│                                    │                                     │
│                                    ▼                                     │
│                          ┌────────────────────┐                         │
│                          │  Tool Registry        │  ← schemas +          │
│                          │                        │     handler functions │
│                          └─────────┬────────────┘                         │
│                                    │                                     │
│                                    ▼                                     │
│                          ┌────────────────────┐                         │
│                          │  Permission /          │  ← authz check per   │
│                          │  Policy Engine          │     tool, per caller  │
│                          └─────────┬────────────┘                         │
│                                    │ allowed                              │
│              ┌─────────────────────┼─────────────────────┐               │
│              ▼                     ▼                     ▼               │
│     ┌────────────────┐   ┌──────────────────┐  ┌──────────────────┐     │
│     │ Direct Tool       │   │  MCP Client         │  │  Human-in-the-     │     │
│     │ Handlers           │   │  (calls MCP           │  │  Loop Approval      │     │
│     │ (in-process)        │   │   servers)             │  │  Queue (for         │     │
│     │                    │   │                          │  │  irreversible       │     │
│     │                    │   │                          │  │  actions)            │     │
│     └────────────────┘   └──────────────────┘  └──────────────────┘     │
│                                    │                                     │
│                                    ▼                                     │
│                          ┌────────────────────┐                         │
│                          │  Audit Log Sink        │                         │
│                          └────────────────────┘                         │
└──────────────────────────────────────────────────────────────────┘
```

**Responsibility separation:**

- **Agent Loop Controller**: enforces the maximum number of tool-calling iterations and timeout per request — never allow the loop in Section 3.2 to run unbounded; this is the agentic equivalent of a `while` loop without a guaranteed exit condition, which every engineer already knows is dangerous.
- **Tool Registry**: a single source of truth mapping tool names to their schemas (sent to the model) and their actual handler implementations (executed by your code) — analogous to a router mapping URL paths to controller functions.
- **Permission/Policy Engine**: evaluates, for the specific authenticated caller and the specific tool+arguments requested, whether execution is allowed; this is where role-based access control and tool-category rules (Section 3.6) are enforced, fully independent of the model's own "confidence."
- **Direct Tool Handlers vs. MCP Client**: as discussed in Section 3.5, some tools are implemented in-process; others are proxied to external MCP servers. The agent loop controller should not need to know which, beyond the Tool Registry abstraction.
- **Human-in-the-Loop Approval Queue**: for tools classified as irreversible/high-blast-radius, execution is suspended pending explicit human approval, rather than executed immediately — covered in full architectural depth in Chapter 5.
- **Audit Log Sink**: every tool call, its arguments, its result, the authorization decision, and the originating request are recorded — the foundation of the enterprise audit requirement from Section 4.5.

---

## 8. Code Examples

We extend the Chapter 1–2 codebase with a tool registry, a permission layer, and a full agent loop.

### 8.1 Updated project structure

```
enterprise_agentic_app/
├── app/
│   ├── ...                          (from Chapters 1-2)
│   ├── tools/
│   │   ├── __init__.py
│   │   ├── registry.py
│   │   ├── schemas.py
│   │   └── handlers/
│   │       ├── __init__.py
│   │       └── billing_tools.py
│   ├── security/
│   │   ├── __init__.py
│   │   └── policy_engine.py
│   └── services/
│       ├── agent_loop.py
│       └── llm_client.py            (extended below)
└── tests/
    └── test_agent_loop.py
```

### 8.2 Tool schema definitions (`app/tools/schemas.py`)

```python
"""
Tool schemas, expressed as Pydantic models, following the design
principles from Section 3.3: narrow, single-purpose, unambiguous
naming distinguishing read vs. write operations.
"""

from pydantic import BaseModel, Field


class GetBillingStatusInput(BaseModel):
    """
    READ-ONLY tool. Looks up a customer's current billing status.
    Naming convention `get_*` signals read-only to both the model
    (via the tool description) and to engineers reading this code.
    """
    customer_id: str = Field(
        ..., description="The unique internal customer identifier."
    )


class IssueAccountCreditInput(BaseModel):
    """
    WRITE tool with financial impact. Naming convention `issue_*`
    signals a side-effecting action. This tool is classified as
    requiring human approval -- see policy_engine.py.
    """
    customer_id: str = Field(..., description="The unique internal customer identifier.")
    amount_usd: float = Field(..., gt=0, le=500, description="Credit amount in USD.")
    reason: str = Field(..., min_length=5, max_length=300)
    idempotency_key: str = Field(
        ...,
        description=(
            "Client-generated unique key to ensure this credit is "
            "applied at most once, even if the request is retried."
        ),
    )
```

### 8.3 Tool handlers (`app/tools/handlers/billing_tools.py`)

```python
"""
Tool handler implementations -- the actual code executed when the
model requests a tool call. These functions are ordinary,
deterministic, fully unit-testable application code. They have NO
awareness of the LLM at all; they could equally be called from a
REST endpoint, a CLI, or a batch job.
"""

import logging

from app.tools.schemas import GetBillingStatusInput, IssueAccountCreditInput

logger = logging.getLogger(__name__)

# In production these would call real services (a billing
# microservice, a database). Stubbed here for illustration.
_FAKE_BILLING_DB = {
    "cust_1001": {"tier": "enterprise", "balance_due_usd": 0.0, "past_due": False},
}

_applied_credits: dict[str, dict] = {}  # idempotency_key -> result, in-memory demo store


async def get_billing_status(args: GetBillingStatusInput) -> dict:
    record = _FAKE_BILLING_DB.get(args.customer_id)
    if record is None:
        return {"error": "customer_not_found", "customer_id": args.customer_id}
    return {"customer_id": args.customer_id, **record}


async def issue_account_credit(args: IssueAccountCreditInput) -> dict:
    """
    Demonstrates idempotency handling (Section 4.5): if this exact
    idempotency_key has already been processed, we return the
    original result instead of applying the credit a second time --
    essential because the agent loop, or an upstream retry, may
    invoke this tool more than once for what should be a single
    logical action.
    """
    if args.idempotency_key in _applied_credits:
        logger.info("Duplicate credit request detected; returning cached result.")
        return _applied_credits[args.idempotency_key]

    result = {
        "status": "credit_issued",
        "customer_id": args.customer_id,
        "amount_usd": args.amount_usd,
    }
    _applied_credits[args.idempotency_key] = result
    logger.info(
        "credit_issued customer_id=%s amount=%.2f idempotency_key=%s",
        args.customer_id, args.amount_usd, args.idempotency_key,
    )
    return result
```

### 8.4 Tool registry (`app/tools/registry.py`)

```python
"""
Single source of truth mapping tool names to their input schema
(sent to the model as JSON schema) and their handler function
(executed by our code). This is the "Tool Registry" box from the
architecture diagram in Section 7.
"""

from dataclasses import dataclass
from typing import Any, Awaitable, Callable

from pydantic import BaseModel

from app.tools.schemas import GetBillingStatusInput, IssueAccountCreditInput
from app.tools.handlers.billing_tools import get_billing_status, issue_account_credit


@dataclass(frozen=True)
class ToolDefinition:
    name: str
    description: str
    input_schema: type[BaseModel]
    handler: Callable[[BaseModel], Awaitable[dict[str, Any]]]
    # Tool category drives the policy engine's decision (Section 8.5).
    category: str  # "read" | "write" | "irreversible"


TOOL_REGISTRY: dict[str, ToolDefinition] = {
    "get_billing_status": ToolDefinition(
        name="get_billing_status",
        description=(
            "Looks up a customer's current billing status, including "
            "tier and any past-due balance. Use this whenever the user "
            "asks about their billing status, plan, or balance. "
            "This is a read-only operation with no side effects."
        ),
        input_schema=GetBillingStatusInput,
        handler=get_billing_status,
        category="read",
    ),
    "issue_account_credit": ToolDefinition(
        name="issue_account_credit",
        description=(
            "Issues a one-time account credit to a customer, up to "
            "$500. Use this only when the user has a verified, "
            "legitimate billing dispute. This action has financial "
            "impact and requires approval before execution."
        ),
        input_schema=IssueAccountCreditInput,
        handler=issue_account_credit,
        category="write",
    ),
}


def get_provider_tool_schemas() -> list[dict]:
    """
    Converts the registry into the schema format sent to the LLM
    API on every call (Section 3.2, step 1).
    """
    return [
        {
            "name": tool.name,
            "description": tool.description,
            "input_schema": tool.input_schema.model_json_schema(),
        }
        for tool in TOOL_REGISTRY.values()
    ]
```

### 8.5 Policy engine (`app/security/policy_engine.py`)

```python
"""
Enforces the permission boundary described in Section 4.3 and 4.5.
This check happens AFTER the model requests a tool call and BEFORE
the tool handler ever executes -- the model's "intent" carries no
inherent authority.
"""

from dataclasses import dataclass

from app.tools.registry import TOOL_REGISTRY


@dataclass
class CallerContext:
    user_id: str
    roles: list[str]


class PolicyViolation(Exception):
    pass


def authorize_tool_call(caller: CallerContext, tool_name: str) -> None:
    """
    Raises PolicyViolation if the caller is not permitted to invoke
    this tool, or if the tool requires human approval that has not
    yet been granted (in which case the agent loop, Section 8.6,
    routes to the approval queue instead of executing directly).
    """
    tool = TOOL_REGISTRY.get(tool_name)
    if tool is None:
        raise PolicyViolation(f"Unknown tool: {tool_name}")

    if tool.category == "irreversible" and "approver" not in caller.roles:
        raise PolicyViolation(
            f"Tool '{tool_name}' requires human approval and cannot "
            f"be auto-executed for this caller."
        )

    if tool.category == "write" and "support_agent" not in caller.roles:
        raise PolicyViolation(
            f"Caller does not have permission to invoke write tool "
            f"'{tool_name}'."
        )

    # Read tools are permitted for any authenticated caller in this
    # simplified example; production systems would add row-level/
    # field-level scoping here (e.g., the caller may only fetch
    # billing data for customers within their assigned support queue).
```

### 8.6 Agent loop (`app/services/agent_loop.py`)

```python
"""
The core tool-calling loop described in Section 3.2 and diagrammed
in Section 5.1. This is the central piece of new infrastructure
this chapter introduces.
"""

import asyncio
import logging

from app.schemas.chat import ChatMessage, Role
from app.services.llm_client import llm_client
from app.tools.registry import TOOL_REGISTRY, get_provider_tool_schemas
from app.security.policy_engine import authorize_tool_call, CallerContext, PolicyViolation

logger = logging.getLogger(__name__)

MAX_LOOP_ITERATIONS = 6  # hard ceiling -- never allow an unbounded agent loop


class AgentLoopError(Exception):
    pass


async def run_agent_loop(
    system_prompt: str,
    initial_history: list[ChatMessage],
    caller: CallerContext,
) -> str:
    """
    Executes the full observe-reason-act loop. Returns the model's
    final text answer once no further tool calls are requested.
    """
    history = list(initial_history)
    tool_schemas = get_provider_tool_schemas()

    for iteration in range(1, MAX_LOOP_ITERATIONS + 1):
        response_blocks, in_tok, out_tok = await llm_client.generate_with_tools(
            system_prompt=system_prompt,
            history=history,
            tools=tool_schemas,
        )

        logger.info(
            "agent_loop_iteration=%d input_tokens=%d output_tokens=%d "
            "blocks=%d",
            iteration, in_tok, out_tok, len(response_blocks),
        )

        tool_use_blocks = [b for b in response_blocks if b["type"] == "tool_use"]
        text_blocks = [b for b in response_blocks if b["type"] == "text"]

        if not tool_use_blocks:
            # Model produced a final answer with no further tool
            # requests -- the loop terminates per Section 3.2, step 5.
            return "".join(b["text"] for b in text_blocks)

        # Execute independent tool calls concurrently (Section 4.2).
        tool_results = await asyncio.gather(
            *[_execute_tool_call(block, caller) for block in tool_use_blocks],
            return_exceptions=True,
        )

        # Append the assistant's tool-use turn and the tool results
        # to history. The model is stateless (Chapter 1, Section 3.6)
        # so this full exchange must be resent on the next iteration.
        history.append(ChatMessage(role=Role.ASSISTANT, content=str(response_blocks)))
        for block, result in zip(tool_use_blocks, tool_results):
            if isinstance(result, Exception):
                result_payload = {"error": str(result)}
            else:
                result_payload = result
            history.append(
                ChatMessage(
                    role=Role.USER,  # tool results are sent as user-role messages
                    content=f"[tool_result for {block['name']}]: {result_payload}",
                )
            )

    raise AgentLoopError(
        f"Agent loop exceeded maximum of {MAX_LOOP_ITERATIONS} iterations "
        f"without producing a final answer."
    )


async def _execute_tool_call(block: dict, caller: CallerContext) -> dict:
    tool_name = block["name"]
    tool = TOOL_REGISTRY.get(tool_name)
    if tool is None:
        raise AgentLoopError(f"Model requested unknown tool: {tool_name}")

    try:
        authorize_tool_call(caller, tool_name)
    except PolicyViolation as exc:
        logger.warning(
            "policy_violation user_id=%s tool=%s detail=%s",
            caller.user_id, tool_name, exc,
        )
        # Return the violation as a tool result so the model can
        # inform the user gracefully, rather than crashing the loop.
        return {"error": "not_authorized", "detail": str(exc)}

    validated_input = tool.input_schema.model_validate(block["input"])
    return await tool.handler(validated_input)
```

### 8.7 Test for the agent loop (`tests/test_agent_loop.py`)

```python
"""
Tests the loop termination, tool execution, and policy enforcement
behavior -- without making a real LLM API call, consistent with
the testing principle established in Chapter 1.
"""

import pytest
from unittest.mock import AsyncMock

from app.services import agent_loop
from app.services import llm_client as llm_client_module
from app.security.policy_engine import CallerContext
from app.schemas.chat import ChatMessage, Role


@pytest.mark.asyncio
async def test_loop_terminates_on_direct_text_answer(monkeypatch):
    mock_generate = AsyncMock(
        return_value=([{"type": "text", "text": "No tool needed."}], 50, 10)
    )
    monkeypatch.setattr(
        llm_client_module.llm_client, "generate_with_tools", mock_generate
    )

    caller = CallerContext(user_id="u1", roles=["support_agent"])
    result = await agent_loop.run_agent_loop(
        system_prompt="sys",
        initial_history=[ChatMessage(role=Role.USER, content="hi")],
        caller=caller,
    )

    assert result == "No tool needed."
    mock_generate.assert_awaited_once()


@pytest.mark.asyncio
async def test_loop_executes_read_tool_then_finishes(monkeypatch):
    mock_generate = AsyncMock(
        side_effect=[
            (
                [{"type": "tool_use", "name": "get_billing_status",
                  "input": {"customer_id": "cust_1001"}}],
                60, 20,
            ),
            ([{"type": "text", "text": "Your account is in good standing."}], 80, 15),
        ]
    )
    monkeypatch.setattr(
        llm_client_module.llm_client, "generate_with_tools", mock_generate
    )

    caller = CallerContext(user_id="u1", roles=["support_agent"])
    result = await agent_loop.run_agent_loop(
        system_prompt="sys",
        initial_history=[ChatMessage(role=Role.USER, content="what's my balance?")],
        caller=caller,
    )

    assert "good standing" in result
    assert mock_generate.await_count == 2


@pytest.mark.asyncio
async def test_loop_raises_after_exceeding_max_iterations(monkeypatch):
    looping_response = (
        [{"type": "tool_use", "name": "get_billing_status",
          "input": {"customer_id": "cust_1001"}}],
        10, 10,
    )
    mock_generate = AsyncMock(return_value=looping_response)
    monkeypatch.setattr(
        llm_client_module.llm_client, "generate_with_tools", mock_generate
    )

    caller = CallerContext(user_id="u1", roles=["support_agent"])
    with pytest.raises(agent_loop.AgentLoopError, match="exceeded maximum"):
        await agent_loop.run_agent_loop(
            system_prompt="sys",
            initial_history=[ChatMessage(role=Role.USER, content="loop forever")],
            caller=caller,
        )

    assert mock_generate.await_count == agent_loop.MAX_LOOP_ITERATIONS


@pytest.mark.asyncio
async def test_unauthorized_write_tool_returns_error_not_crash(monkeypatch):
    mock_generate = AsyncMock(
        side_effect=[
            (
                [{"type": "tool_use", "name": "issue_account_credit",
                  "input": {"customer_id": "cust_1001", "amount_usd": 20.0,
                             "reason": "Billing error confirmed.",
                             "idempotency_key": "key-1"}}],
                40, 20,
            ),
            ([{"type": "text", "text": "I was unable to issue that credit."}], 30, 10),
        ]
    )
    monkeypatch.setattr(
        llm_client_module.llm_client, "generate_with_tools", mock_generate
    )

    # Caller lacks the "support_agent" role required for write tools.
    caller = CallerContext(user_id="u2", roles=["read_only"])
    result = await agent_loop.run_agent_loop(
        system_prompt="sys",
        initial_history=[ChatMessage(role=Role.USER, content="give me a credit")],
        caller=caller,
    )

    assert "unable" in result
    assert mock_generate.await_count == 2
```

---

## 9. Common Mistakes

1. **Treating tool-use output as already-authorized.** The most dangerous mistake in agent engineering: executing a requested tool call without an independent authorization check, on the assumption that "the model wouldn't ask for something it shouldn't." *Correct approach*: every tool execution passes through a policy engine (Section 8.5) that is completely independent of the model's reasoning.

2. **No bound on agent loop iterations.** An agent that, due to a confusing tool result or an ambiguous task, keeps calling tools indefinitely will consume unbounded cost and latency, and in the worst case never return a response to the user. *Correct approach*: a hard iteration ceiling (Section 8.6) and/or a wall-clock timeout, with explicit, observable failure when exceeded — never a silent infinite loop.

3. **Giving an agent broad, multi-purpose tools "for flexibility."** A single `manage_customer_account(action: str, ...)` tool that can read, update, or delete based on an `action` string is harder for the model to use correctly and far harder to permission granularly than separate `get_customer`, `update_customer_email`, and `delete_customer_account` tools. *Correct approach*: narrow, single-purpose tools (Section 3.3), even if it means more tools to maintain.

4. **Allowing irreversible actions without human approval, based on model "confidence."** Some teams attempt to gate dangerous actions on the model's self-reported confidence score rather than on a structural permission boundary. Self-reported confidence is itself a probabilistic model output and is not a reliable safety mechanism. *Correct approach*: gate by tool category (Section 3.6) and caller role (Section 8.5), never by trusting the model's own assessment of its certainty.

5. **Ignoring indirect prompt injection from tool results.** Teams often harden the initial user-facing prompt against injection (Chapter 2, Section 9) but forget that content returned by a "read webpage" or "read email" tool is just as untrusted and re-enters the model's reasoning context. *Correct approach*: treat all tool *results*, not just initial user input, as untrusted content, and ensure the permission boundary (not the prompt) is what actually prevents an injected instruction from causing harm (Section 4.3).

6. **Non-idempotent write tools.** A write tool that does not account for retries (from the orchestration layer, from the model re-attempting after what it perceives as a failure, or from network-level retries) can cause duplicate side effects — duplicate credits issued, duplicate emails sent, duplicate orders created. *Correct approach*: design write tools to accept and honor idempotency keys (Section 8.3), exactly as required for any reliable distributed write operation.

---

## 10. Best Practices

- **Scalability**: Execute independent tool calls concurrently (Section 4.2); set per-tool timeouts so a slow downstream system doesn't stall the entire agent loop; consider connection pooling for tool handlers that call external APIs or databases, identical to standard backend practice.
- **Maintainability**: Maintain the Tool Registry (Section 8.4) as the single source of truth for both the model-facing schema and the executing handler — never let these drift out of sync by defining them in two separate places.
- **Testing**: Test tool handlers as ordinary deterministic functions (no LLM involved); test the agent loop's control flow with mocked model responses (Section 8.7); separately maintain an evaluation set that measures *tool-selection accuracy* (does the model choose the right tool, with the right arguments, for a given realistic request) as a distinct metric from final-answer quality.
- **Security**: Enforce authorization at tool execution time, independent of model output; classify every tool by category (read/write/irreversible) and apply the corresponding guardrail tier; treat all tool results as untrusted content with respect to subsequent model reasoning.
- **Cost optimization**: Keep the number of tools exposed in a single agent context reasonable — every tool schema consumes input tokens on every single call; consider scoping which tools are available based on the conversation's apparent intent rather than always exposing the full registry.
- **Observability**: Log every tool call, its arguments, its authorization decision, its result, and the iteration count of the loop it occurred in — this is the audit trail required by Section 4.5 and the primary debugging tool when an agent behaves unexpectedly.
- **Deployment & versioning**: Version tool schemas alongside prompts (Chapter 2, Section 3.6); changing a tool's parameter names or semantics is a breaking change to the model's "interface" and should go through the same review and canary process as any other production API change.

---

## 11. Exercises

**Easy**

1. Classify each of the following as a read, write, or irreversible tool, and justify your classification: `search_product_catalog`, `update_shipping_address`, `cancel_subscription`, `get_order_history`.
2. Explain, using the concepts from Section 4.1, why "the model decided not to call a dangerous tool" is not a sufficient safety guarantee on its own.

**Intermediate**

3. Design a tool schema (following Section 3.3 and 8.2) for a `search_knowledge_base` read tool, including a clear description that would help the model distinguish it from a hypothetical `get_customer_faq_history` tool, to avoid ambiguous tool selection.
4. Extend the policy engine in Section 8.5 to support per-customer scoping: a support agent caller may only call `get_billing_status` for customers within their assigned region, represented as a `assigned_region` field on `CallerContext`.

**Advanced**

5. Design (in writing, with a diagram) the human-in-the-loop approval flow for the `issue_account_credit` tool from Section 8.2–8.3: what happens between the model requesting the tool call and the credit actually being applied, who is notified, what happens if the approval times out, and how does the agent loop in Section 8.6 need to change to support a "paused pending approval" state rather than immediate execution?
6. A security review finds that an internal "summarize this support ticket thread" agent, which has a `read_email_thread` tool, can be manipulated via an indirect prompt injection embedded in a customer's email to call an unrelated `export_customer_data` tool the agent also has access to. Using Section 4.3 and Section 9, write a remediation plan that does not rely solely on prompt-level defenses.

---

## 12. Mini Project

**Project: Permissioned Billing Support Agent**

Extend the Chapters 1–2 codebase into a tool-calling agent:

1. Implement the `get_billing_status` and `issue_account_credit` tools (Section 8.2–8.3), plus one additional tool of your choosing (e.g., `get_recent_invoices`).
2. Implement the full agent loop (Section 8.6) with a hard iteration ceiling and structured logging of every iteration.
3. Implement the policy engine (Section 8.5) with at least three distinct caller roles (`read_only`, `support_agent`, `approver`) and demonstrate that a `read_only` caller cannot trigger `issue_account_credit` even if the model requests it.
4. Add an idempotency mechanism to `issue_account_credit` and write a test proving that calling it twice with the same idempotency key applies the credit only once.
5. Write at least five tests covering: successful read-tool execution, successful write-tool execution by an authorized caller, rejected write-tool execution by an unauthorized caller, loop termination on a direct answer, and loop failure after exceeding the maximum iteration count.
6. Write a short design note (one page) explaining which of your tools would require human-in-the-loop approval in a real production deployment, and why, using the categorization from Section 3.6.

---

## 13. Chapter Summary

- Tool calling lets a model request structured function invocations, using the same schema-constrained decoding mechanism from Chapter 2, but the model only *proposes* — your application code is solely responsible for executing, authorizing, and validating every tool call.
- The agent loop (observe, reason, act, observe result, repeat) is the formal implementation of the "agent" definition introduced in Chapter 1, and must always be bounded by a maximum iteration count or timeout.
- Tool schema design is API design for a non-deterministic caller: names, descriptions, and parameter shapes directly influence the model's tool-selection accuracy and must be engineered with the same care as a public REST API.
- The Model Context Protocol (MCP) standardizes tool/resource exposure so that integrations can be built once and reused across multiple agents and teams, addressing the N×M integration cost problem.
- Tool calling significantly expands the prompt-injection attack surface, because tool *results* (not just initial user input) re-enter the model's context as untrusted text — indirect prompt injection.
- The only reliable defense against tool-calling security risks is capability scoping and permission enforcement at the execution layer, not prompt-level instructions or model self-reported confidence.
- Tools should be classified as read, write, or irreversible, with guardrail intensity (auto-execute, validate-then-execute, human-in-the-loop approval) matched to that classification.
- Idempotency, authorization, rate limiting, and comprehensive audit logging are non-negotiable engineering requirements for any tool that performs a side-effecting action in production.

---

## 14. Interview Questions

**Conceptual**

1. Explain the difference between the model "deciding" to call a tool and the tool actually being executed. Why does this distinction matter for security?
2. What problem does the Model Context Protocol solve that a one-off, hand-written tool integration does not?
3. What is indirect prompt injection, and how does it differ from the direct prompt injection risk discussed in Chapter 2?

**Architecture**

4. Design the component responsible for enforcing that a support agent can only call billing tools for customers in their assigned region. Where does this component sit in the request flow, and why must it be independent of the model?
5. How would you decide whether a new internal integration should be built as a direct tool handler or as an MCP server? Walk through the tradeoffs.

**Coding**

6. Modify the `run_agent_loop` function in Section 8.6 to support a "paused pending human approval" state for irreversible tools, rather than immediately executing or rejecting them. Sketch the modified control flow.
7. Write a tool handler for a hypothetical `send_customer_email` tool that is idempotent, logs its invocation for audit purposes, and validates that the calling context is authorized to email the specified customer.

**Scenario-based**

8. An agent with a `read_webpage` tool and a `post_to_slack` tool is found to have posted sensitive internal data to a public Slack channel after reading a webpage during a research task. Diagnose the likely root cause and propose an architectural fix that does not rely on prompt wording alone.
9. Your agent's tool-selection accuracy drops noticeably after a routine model version upgrade, even though no tool schemas changed. What is your diagnostic process, and what does this incident suggest about how you should structure your deployment process going forward?

**System Design**

10. Design an enterprise-wide tool/MCP strategy for a company with separate Support, Sales, and Finance agentic applications that all need access to a shared customer database, but with different read/write permissions per domain. Describe the MCP server boundary, the policy enforcement layer, and how you would prevent permission logic from being duplicated and drifting out of sync across the three teams.

