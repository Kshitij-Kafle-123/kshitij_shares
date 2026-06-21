# Chapter 1 — AI & LLM Fundamentals

*Enterprise Agentic AI Engineering: A Textbook for Software Engineers*

---

## 1. Learning Objectives

By the end of this chapter, you will be able to:

1. Explain, in precise engineering terms, what a Large Language Model (LLM) is and what it is not.
2. Describe the internal mechanics of transformer-based language models — tokenization, embeddings, attention, and autoregressive generation — at a level sufficient to reason about cost, latency, and failure modes.
3. Distinguish between a "model," an "API," an "application," and an "agent," and explain why conflating these terms causes architectural mistakes in enterprise systems.
4. Map LLM behavior (context windows, statelessness, non-determinism) onto familiar software engineering concepts (memory, sessions, idempotency) so that you can design systems around their constraints instead of being surprised by them.
5. Identify where LLMs fit inside a traditional enterprise software architecture (presentation, application, integration, data tiers) and articulate why they require a new architectural layer rather than being "just another microservice."
6. Evaluate the difference between using an LLM as a **text generator** versus using an LLM as a **reasoning and decision-making component** inside an agentic system — the foundation for every later chapter.
7. Recognize the limitations of LLMs (hallucination, knowledge cutoffs, prompt injection surface area, cost-per-token economics) and explain why production systems must compensate for these limitations through engineering, not prompting alone.

This chapter assumes no prior AI/ML knowledge. It assumes you are comfortable with standard backend engineering concepts: HTTP APIs, databases, caching, concurrency, and basic statistics (mean, probability distributions).

---

## 2. Why This Matters

### 2.1 The shift enterprises are making

For the last three decades, enterprise software has been built on **deterministic logic**. A developer writes a function; given input `X`, the function always produces output `Y`. Business rules are encoded as `if/else` statements, validation logic, and database constraints. This is the model underlying ERP systems, CRM platforms, banking cores, and insurance claims engines.

Large Language Models break this assumption. An LLM is a **probabilistic function**: given input `X`, it produces a distribution over possible outputs, and the actual output `Y` may differ between calls even with identical input. This is not a bug to be patched — it is the fundamental nature of the technology, and it is also the source of its value.

Enterprises are adopting LLMs because a large fraction of valuable knowledge work does not fit cleanly into deterministic rules:

- Reading a customer's free-text support ticket and deciding which of 40 possible internal workflows applies.
- Reading a loan applicant's uploaded documents (PDFs, scanned forms, emails) and extracting structured fields with reasoning about ambiguity.
- Negotiating between multiple internal systems (CRM, billing, inventory) to resolve a customer complaint that does not match any single predefined workflow.
- Writing, reviewing, and explaining code, contracts, or marketing copy where "correctness" is partly subjective.

Traditional software requires a human to anticipate every case in advance and hard-code the logic. LLM-based systems allow software to handle **novel combinations of cases** by reasoning over natural language and structured data at runtime. This is the central business driver: companies like Stripe, Uber, Airbnb, and Klarna are not adopting LLMs because the technology is fashionable — they are adopting it because it reduces the engineering cost of handling the long tail of business logic that previously required either manual human review or enormous rule-engine codebases.

### 2.2 Where this fits in enterprise architecture

In a traditional three-tier (or N-tier) enterprise architecture, you have:

- **Presentation tier** — web/mobile UI
- **Application tier** — business logic, services, APIs
- **Data tier** — databases, caches, message queues

Agentic AI introduces a new conceptual tier that sits inside or alongside the application tier: the **reasoning tier**. This tier does not replace your business logic — it *orchestrates* it. The LLM does not directly update your production database. Instead, it decides *which* existing API to call, *with what* parameters, and *in what order*, based on natural language input and the current state of the world. Chapter 3 and Chapter 4 will cover this orchestration layer (tool calling, MCP, LangGraph) in depth. This chapter establishes the foundation: what exactly is being orchestrated, and what are its real capabilities and constraints.

### 2.3 Why engineers must understand the internals, not just the API

It is possible to call an LLM API with three lines of code. It is not possible to build a *reliable, secure, cost-effective, enterprise-grade* system with three lines of code. Just as a backend engineer needs to understand TCP behavior to debug a flaky network call, an agentic AI engineer needs to understand tokenization, context limits, and probabilistic generation to debug a flaky agent. The remainder of this chapter builds that foundation.

---

## 3. Fundamentals

### 3.1 What is a Large Language Model?

A **Large Language Model (LLM)** is a statistical model trained to predict the next token in a sequence of text, given all previous tokens in that sequence. That is the entire foundational definition. Everything else — chatbots, coding assistants, agents — is built on top of this single capability: **next-token prediction**.

This is a critical mental adjustment for software engineers. An LLM does not "understand" a request in the way a human does, and it does not "look up" facts in the way a database does. It computes, for a given sequence of tokens, a probability distribution over what the *next* token is likely to be, based on patterns learned from its training data. It then samples a token from that distribution, appends it to the sequence, and repeats the process. This loop — predict, sample, append, repeat — is called **autoregressive generation**.

### 3.2 Tokens — the real unit of computation

Before any text reaches the model's neural network, it is converted into **tokens** by a tokenizer. A token is not necessarily a word. It might be a whole word ("the"), part of a word ("engineer" → "engin" + "eer"), a single character, or even whitespace. Different model families use different tokenizers (e.g., BPE-based tokenizers).

This matters for engineering reasons:

- **Cost** is billed per token (input tokens + output tokens), not per character or per word.
- **Context window limits** are expressed in tokens, not characters.
- **Latency** scales with the number of tokens generated, because generation is sequential — each output token requires a new forward pass through the model (though optimizations like KV-caching reduce redundant computation).

A rough engineering heuristic: in English text, 1 token ≈ 4 characters ≈ 0.75 words. This ratio changes significantly for code, non-English languages, and structured data like JSON (which tokenizes less efficiently due to repeated punctuation).

### 3.3 Embeddings — turning tokens into numbers

Once text is tokenized, each token is mapped to a high-dimensional vector called an **embedding**. An embedding is a list of floating-point numbers (commonly 768 to 12,000+ dimensions depending on the model) that represents the token's meaning as a point in a continuous mathematical space. Tokens with related meanings are positioned closer together in this space than unrelated tokens.

This is the same underlying concept used in vector databases and semantic search systems (covered in later chapters) — embeddings are not unique to generative models; they are a general technique for representing meaning numerically so it can be compared and computed on.

### 3.4 Attention — how the model decides what matters

The core architectural innovation behind modern LLMs is the **transformer**, introduced in the 2017 paper "Attention Is All You Need." The key mechanism is **self-attention**: for every token in the input, the model computes a weighted relationship to every other token in the input, determining how much each other token should influence the interpretation of this one.

Engineering analogy: imagine resolving a pronoun in a sentence — "The engineer fixed the bug because *she* found the root cause." To interpret "she," a reader must look back at "engineer." Self-attention is the mechanized, learned, weighted version of this look-back process, computed simultaneously for every token against every other token. This all-pairs computation is why **compute cost grows quadratically with context length** in the standard transformer architecture — doubling your input length roughly quadruples the attention computation (architectural optimizations like sparse attention and sliding windows mitigate this in modern models, but the underlying tradeoff remains relevant for cost and latency planning).

### 3.5 Context window — the model's working memory

The **context window** is the maximum number of tokens (input + output combined, in most architectures) that a model can process in a single request. Common context windows in 2026-era frontier models range from 128K to over 1M tokens, but the practical, *reliable* usable window for complex reasoning is often smaller than the advertised maximum — a phenomenon sometimes called "lost in the middle," where models attend less reliably to information buried in the center of a very long context compared to the beginning or end.

This is the single most important constraint for system design. Unlike a traditional application server with persistent memory and a database it can query indefinitely, **an LLM has no memory between requests**. Every single API call is stateless. If you want the model to "remember" a previous conversation, *you* — the engineer — must resend the entire relevant conversation history as part of the input on every single call. This is fundamentally different from how session state works in traditional web applications, and it is the root cause of a huge fraction of cost and architecture decisions in agentic systems (covered extensively in Chapters 4 and 5).

### 3.6 Statelessness and non-determinism — the two properties every engineer must internalize

**Statelessness**: The model holds no state between API calls. There is no implicit session, no server-side memory of "the user," no persistent variables. State must be engineered explicitly — typically via a conversation history array, a database, or both.

**Non-determinism**: Even with identical input, an LLM may produce different output on different calls. This stems from the sampling step in autoregressive generation — the model does not always pick the single highest-probability token; it samples from the probability distribution, controlled by a parameter called **temperature** (discussed below). Even at temperature 0, minor numerical non-determinism can occur due to floating-point operations and parallelized computation on GPUs.

For an engineer trained on deterministic systems, this is the hardest mental shift. You cannot write a unit test that asserts `response == "exact expected string"` for an open-ended generation task and expect it to pass reliably. Testing strategies for LLM-based systems are different (covered in Section 10 and in Chapter 5) — they rely on structural validation, schema enforcement, and statistical evaluation rather than exact-match assertions.

### 3.7 Key inference parameters every engineer must know

| Parameter | What it controls | Engineering implication |
|---|---|---|
| `temperature` | Randomness of token sampling (0 = near-deterministic/greedy, higher = more random) | Use low temperature (0–0.3) for extraction, classification, and tool-calling tasks where consistency matters. Use higher temperature (0.7+) for creative generation. |
| `max_tokens` | Hard cap on output length | Directly controls cost ceiling and latency ceiling for a single call. Must be set deliberately, not left at a default. |
| `top_p` (nucleus sampling) | Restricts sampling to the smallest set of tokens whose cumulative probability exceeds `p` | Often used instead of, or alongside, temperature to control output diversity. |
| `stop_sequences` | Strings that, if generated, halt generation immediately | Useful for structured output parsing and cost control. |
| `system prompt` | Persistent instruction context applied before user input | The primary mechanism for shaping agent behavior; covered in depth in Chapter 2. |

### 3.8 Model, API, Application, Agent — four terms that are not interchangeable

Enterprise teams frequently misuse these terms, which leads to architectural confusion. Precise definitions:

- **Model**: The trained neural network weights themselves (e.g., a specific Claude or GPT model checkpoint). You do not run this directly in most enterprise contexts; you access it through an API.
- **API**: The network interface (typically HTTPS + JSON) that lets your code send a prompt to a hosted model and receive a completion. This is a stateless request/response interaction, similar in shape to any other REST API your team already builds.
- **Application**: The full system you build around the API — including business logic, authentication, databases, UI, and orchestration code. The LLM is one component inside this system, not the system itself.
- **Agent**: An application architecture pattern in which the LLM is given the ability to **choose its own sequence of actions** (calling tools, querying data, calling itself again) to accomplish a goal, rather than following a hard-coded sequence written by a developer. An agent is defined by a control loop: *observe → reason → act → observe result → repeat*, until a goal is satisfied or a stopping condition is reached.

This last distinction is the conceptual core of this entire book. A simple LLM-powered application asks the model one question and returns one answer. An **agentic** system asks the model to *decide what to do next*, potentially across many steps, using tools, with the engineer responsible for building the guardrails, validation, and infrastructure around that decision loop. Chapters 3–6 are entirely about building that loop correctly and safely for production.

---

## 4. Deep Technical Explanation

### 4.1 The transformer architecture, end to end

To reason about latency, cost, and failure modes in production, you need a working mental model of what happens between sending a prompt and receiving a response. Here is the pipeline:

1. **Input text** arrives as a string (e.g., a user's chat message plus system prompt plus prior conversation history).
2. **Tokenization** converts this string into a sequence of integer token IDs using the model's vocabulary (typically 50,000–200,000 possible tokens).
3. **Embedding lookup** converts each token ID into a dense vector using a learned embedding table.
4. **Positional encoding** is added to each embedding so the model knows the *order* of tokens (since attention itself is order-agnostic without this).
5. The sequence of vectors passes through a stack of **transformer blocks** (commonly tens to over a hundred layers in frontier models), each consisting of:
   - A **multi-head self-attention** sub-layer, where the model computes attention weights between all token pairs, across multiple parallel "heads" that can each specialize in different types of relationships (syntax, coreference, long-range dependency, etc.).
   - A **feed-forward (MLP) sub-layer**, applied independently to each token position, which performs additional non-linear transformation.
   - **Residual connections and layer normalization**, which stabilize training and gradient flow across very deep networks.
6. After the final transformer block, a **linear projection + softmax** converts the final hidden state into a probability distribution over the entire vocabulary for "what token comes next."
7. A **sampling strategy** (greedy, temperature-based, nucleus/top-p, etc.) selects the next token from that distribution.
8. The selected token is appended to the sequence, and the entire process (steps 3–7) runs again to generate the *next* token. This repeats until a stop condition (max tokens, stop sequence, or the model generating a special "end of sequence" token) is reached.

### 4.2 Why this architecture explains real production behavior

- **Latency is dominated by output length, not input length** (after the initial "prefill" of input tokens). Because generation is autoregressive — one token at a time — a response of 1,000 output tokens requires roughly 1,000 sequential forward passes through the network (mitigated somewhat by techniques like speculative decoding, but the sequential dependency remains the dominant cost driver). This is why production systems aggressively constrain `max_tokens` and favor structured, concise outputs over free-form prose when a task doesn't need prose.
- **Cost is asymmetric between input and output tokens.** Most providers price output tokens higher than input tokens (often 3–5x), because output tokens require the expensive sequential generation step, while input tokens can be processed largely in parallel during the "prefill" phase. This has direct architectural consequences: summarizing a long document (lots of input, little output) is cheaper per call than generating a long document (lots of output) — a fact that should influence whether you ask the model to "rewrite the whole document" versus "output only the diff."
- **Hallucination is a structural property, not a defect.** Because the model is fundamentally predicting statistically plausible continuations rather than retrieving verified facts, it will sometimes generate a fluent, confident, and *false* statement — because that statement was a high-probability continuation given the patterns in its training data, even though it does not correspond to truth. This is why production enterprise systems never treat raw LLM output as a verified source of truth for high-stakes decisions (financial transactions, medical determinations, legal conclusions) without independent validation layers — a recurring theme in Chapters 5 and 6.
- **Knowledge cutoff is structural.** A model's factual knowledge is frozen at the point its training data was collected. It cannot know about events, products, or policy changes after that date unless your application provides that information at runtime (via retrieval, tool calls, or context injection). This is the foundational justification for Retrieval-Augmented Generation (RAG) and tool calling, covered in Chapter 3.

### 4.3 Tradeoffs engineers must explicitly manage

| Dimension | Tradeoff |
|---|---|
| Model size (parameter count) | Larger models generally reason better but cost more per token and have higher latency. Enterprise systems often route easy tasks to smaller/cheaper models and hard tasks to larger ones (model routing, covered in Chapter 5). |
| Context length used | Longer context improves the model's available information but increases cost quadratically-ish in compute and can degrade attention accuracy ("lost in the middle"). |
| Temperature | Lower = more consistent/predictable, higher = more creative/varied. Production agentic systems making structured decisions almost always use low temperature. |
| Single large prompt vs. multiple smaller calls | Fewer calls reduce orchestration overhead and latency from round-trips, but a single overloaded prompt can reduce accuracy on any individual sub-task. Splitting into focused calls (or agent steps) often improves reliability at the cost of more total tokens and latency. |

### 4.4 Enterprise considerations

- **Data residency and privacy**: enterprise contracts typically require that prompt data sent to an LLM provider is not used to train future models, and may require regional data processing guarantees (EU, US, etc.). This is a contractual/infrastructure concern engineers must verify, not assume.
- **Rate limits and quotas**: production systems must handle 429 (rate-limited) responses gracefully with exponential backoff and queuing — identical to handling rate limits against any third-party API, but more frequent in agentic systems because a single user action can trigger many LLM calls.
- **Auditability**: regulated industries (finance, healthcare, insurance) require logging of exactly what prompt was sent and what response was received, for compliance and post-incident review. This must be designed in from day one, not retrofitted.

---

## 5. Visual Diagrams

### 5.1 The autoregressive generation loop

```
            ┌─────────────────────────────┐
            │   Input Prompt (tokens)     │
            └──────────────┬──────────────┘
                           │
                           ▼
            ┌─────────────────────────────┐
            │   Tokenizer                 │
            │   text → token IDs          │
            └──────────────┬──────────────┘
                           │
                           ▼
            ┌─────────────────────────────┐
            │   Embedding + Positional    │
            │   Encoding                  │
            └──────────────┬──────────────┘
                           │
                           ▼
            ┌─────────────────────────────┐
            │   Transformer Block × N     │
            │   (Self-Attention + MLP)    │
            └──────────────┬──────────────┘
                           │
                           ▼
            ┌─────────────────────────────┐
            │   Softmax over vocabulary   │
            │   → probability distribution│
            └──────────────┬──────────────┘
                           │
                           ▼
            ┌─────────────────────────────┐
            │   Sample next token         │
            │   (temperature, top_p)      │
            └──────────────┬──────────────┘
                           │
              ┌────────────┴────────────┐
              │  Append token to        │
              │  sequence. Stop?        │
              └────────────┬────────────┘
                   No ◄─────┴───── Yes
                   │                │
                   ▼                ▼
         (repeat from Transformer)  Return final text
```

**Explanation**: This diagram shows that every single output token requires a full pass through the entire network stack. There is no shortcut for generating ten tokens versus generating one — the model executes this loop ten separate times. This is the architectural reason output length dominates latency and cost, as discussed in Section 4.2.

### 5.2 Where the LLM sits in enterprise architecture

```
   User / Channel (Web, Mobile, Slack, Voice)
                  │
                  ▼
        ┌───────────────────────┐
        │  Application Backend  │   ← your existing services
        │  (Auth, Business      │      (FastAPI, Java, .NET, etc.)
        │   Logic, Validation)  │
        └──────────┬────────────┘
                   │
                   ▼
        ┌───────────────────────┐
        │   Reasoning Tier       │  ← NEW: orchestration / agent layer
        │  (Prompting, Agent     │     (Chapters 2–4)
        │   Loop, Tool Routing)  │
        └──────────┬────────────┘
                   │
         ┌─────────┴─────────┐
         ▼                   ▼
 ┌───────────────┐   ┌───────────────────┐
 │   LLM API      │   │  Tools / APIs /   │
 │ (stateless,    │   │  Databases / CRM  │
 │  probabilistic)│   │  / ERP / Search   │
 └───────────────┘   └───────────────────┘
```

**Explanation**: The LLM does not sit "in place of" your application backend — it sits as a new tier that *consults* the LLM API for reasoning/decision-making and *consults* your existing systems of record for facts and actions. Your databases, CRMs, and ERPs remain the source of truth; the LLM is a reasoning interface on top of them, never a replacement for them.

---

## 6. Real Enterprise Examples

### 6.1 Customer Support — ticket triage

A traditional support system uses a rules engine: if the subject line contains "refund," route to billing; if it contains "login," route to account security. This breaks down quickly because real customer messages are messy, multi-topic, and ambiguous ("I was charged twice and now I can't log in to check"). An LLM reads the full free-text ticket, reasons about intent, and outputs a structured classification (e.g., `{"category": "billing_dispute", "secondary_category": "account_access", "urgency": "high"}`) that downstream deterministic logic then routes — combining the LLM's language understanding with traditional system reliability.

### 6.2 Insurance — claims document processing

Insurance claims arrive as a mix of scanned PDFs, photos of damage, handwritten forms, and emailed correspondence. A traditional OCR + regex pipeline fails whenever the document format deviates slightly from the expected template. An LLM with vision capabilities can read the document, identify the relevant fields regardless of layout, and output structured data validated against a schema (Pydantic models, covered in Section 8) before it ever touches the claims database.

### 6.3 Banking — fraud investigation support

Fraud analysts must read transaction histories, customer notes, and flagged-pattern reports to decide whether to escalate a case. An agentic system can pre-summarize the case, pull relevant historical context from multiple internal systems (core banking, CRM, prior fraud cases), and draft a recommendation — while the actual approval/escalation decision remains a human-in-the-loop step, because the cost of a wrong automated decision in fraud/financial contexts is too high to fully automate (see Section 9 on common mistakes, and Chapter 5 on human-in-the-loop design).

### 6.4 Marketing — DV360 campaign builder

Large advertising platforms like Google's DV360 require configuring dozens of structured parameters (targeting, budget caps, creative rotation rules, bid strategy) per campaign. A marketing operator describing a campaign in natural language ("Launch a $50K awareness campaign targeting US adults 25-45 across YouTube and display, capped at $2K/day") can have an agent translate this into the structured API calls DV360 requires, validate the structure against the platform's constraints, and submit for human approval before going live. This is a clear example of the **reasoning tier translating natural language intent into structured, validated, deterministic API calls** — the architectural pattern that recurs throughout this book.

### 6.5 HR — policy question answering

Employees ask HR questions in natural language ("Can I carry over unused vacation days if I'm on parental leave next quarter?"). Traditional systems require employees to search static documents or wait for a human response. A Retrieval-Augmented Generation system (introduced conceptually here, detailed in later chapters) retrieves the relevant, current policy sections and has the LLM synthesize a precise answer grounded in those retrieved documents — directly addressing the knowledge-cutoff and hallucination limitations discussed in Section 4.2.

---

## 7. Architecture Design

Even though this chapter is foundational, it is important to see the shape of a production architecture before diving into prompting and tool calling in later chapters, so each subsequent concept has a "home" in the overall system.

```
┌────────────┐     ┌─────────────────┐     ┌──────────────────────┐
│  Frontend   │────▶│  API Gateway /  │────▶│  Application Backend │
│ (Web/Mobile)│     │  Auth / Rate    │     │  (FastAPI service)   │
└────────────┘     │  Limiting       │     └──────────┬───────────┘
                    └─────────────────┘                │
                                                        ▼
                                          ┌──────────────────────────┐
                                          │   Orchestration Layer    │
                                          │  (Agent / Prompt Builder)│
                                          └─────────────┬────────────┘
                                                        │
                          ┌─────────────────────────────┼───────────────────────┐
                          ▼                             ▼                       ▼
                 ┌────────────────┐          ┌────────────────────┐   ┌──────────────────┐
                 │   LLM Provider  │          │   Internal Tools/   │   │  Caching Layer    │
                 │   API (Claude,  │          │   APIs (CRM, ERP,   │   │  (Redis) for      │
                 │   GPT, etc.)    │          │   Databases)        │   │  repeated prompts │
                 └────────────────┘          └────────────────────┘   └──────────────────┘
                                                        │
                                                        ▼
                                          ┌──────────────────────────┐
                                          │   Observability /        │
                                          │   Logging / Audit Trail  │
                                          └──────────────────────────┘
```

**Responsibility separation:**

- **Frontend**: presentation only; no business logic, no direct LLM calls (to protect API keys and enforce auth).
- **API Gateway**: authentication, authorization, rate limiting — identical to any standard enterprise API gateway pattern.
- **Application Backend**: validates requests, enforces business rules, and decides *when* to invoke the orchestration layer.
- **Orchestration Layer**: builds prompts, manages conversation state, invokes the LLM, and (starting in Chapter 3) manages tool-calling loops.
- **LLM Provider API**: stateless reasoning engine; treated as an external dependency with its own latency, cost, and failure characteristics — like any third-party API.
- **Internal tools/APIs**: the actual systems of record; the LLM never writes to these directly without going through your existing validated business logic.
- **Caching layer**: critical for cost control — many enterprise prompts (e.g., system prompts, common queries) benefit from prompt caching features offered by LLM providers, and a Redis layer can cache full responses for repeated/identical, non-personalized queries.
- **Observability**: every prompt and response must be logged for debugging, cost tracking, and compliance audit — non-negotiable for enterprise deployment.

---

## 8. Code Examples

This chapter's code focuses on establishing a clean, production-style foundation for calling an LLM API — the building block every later chapter extends. We use Python, FastAPI, Pydantic, and async programming, following the conventions used throughout this book.

### 8.1 Project structure

```
enterprise_agentic_app/
├── app/
│   ├── __init__.py
│   ├── main.py
│   ├── config.py
│   ├── schemas/
│   │   ├── __init__.py
│   │   └── chat.py
│   ├── services/
│   │   ├── __init__.py
│   │   └── llm_client.py
│   └── api/
│       ├── __init__.py
│       └── chat_routes.py
├── tests/
│   └── test_chat_routes.py
├── requirements.txt
└── .env.example
```

### 8.2 Configuration (`app/config.py`)

```python
"""
Centralized application configuration.

Enterprise systems must never hard-code API keys or model names
inline in business logic. All environment-dependent values are
loaded here using pydantic-settings, which validates types and
fails fast at startup if required values are missing.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Name of the LLM model to use. Kept configurable so it can be
    # changed via environment variable without a code deployment.
    anthropic_model: str = "claude-sonnet-4-6"

    # API key is loaded from environment, never committed to source control.
    anthropic_api_key: str

    # Default generation parameters. Centralizing these avoids
    # "magic numbers" scattered across the codebase.
    default_max_tokens: int = 1024
    default_temperature: float = 0.2

    # Maximum number of conversation turns we will resend to the model.
    # Protects against unbounded context growth and runaway cost.
    max_history_turns: int = 20

    model_config = SettingsConfigDict(env_file=".env", env_prefix="APP_")


settings = Settings()
```

### 8.3 Request/response schemas (`app/schemas/chat.py`)

```python
"""
Pydantic schemas define the contract between the API layer and
the rest of the system. In an LLM-based system, schemas are even
more important than in traditional APIs, because they are the
primary mechanism for enforcing structure on otherwise
unstructured model output.
"""

from enum import Enum
from pydantic import BaseModel, Field


class Role(str, Enum):
    """
    Mirrors the roles defined by LLM provider APIs.
    Using an Enum instead of raw strings prevents typos like
    "asistant" from silently corrupting conversation history.
    """
    USER = "user"
    ASSISTANT = "assistant"


class ChatMessage(BaseModel):
    role: Role
    content: str = Field(..., min_length=1, max_length=8000)


class ChatRequest(BaseModel):
    """
    Incoming request from the frontend. Note that we do NOT accept
    a free-form 'system_prompt' field from the client — system
    prompts are controlled server-side to prevent prompt injection
    from a malicious or compromised frontend (see Chapter 3 for the
    full security treatment of prompt injection).
    """
    conversation_id: str = Field(..., min_length=1)
    message: str = Field(..., min_length=1, max_length=8000)


class ChatResponse(BaseModel):
    conversation_id: str
    reply: str
    input_tokens: int
    output_tokens: int
```

### 8.4 LLM client service (`app/services/llm_client.py`)

```python
"""
Thin, testable wrapper around the LLM provider API.

Isolating all LLM API calls behind a single service class is a
deliberate architectural decision: it means every later chapter
(tool calling, agent loops, retries, model routing) extends THIS
class rather than scattering raw API calls throughout route
handlers. This mirrors the standard "repository pattern" used for
database access in traditional backend systems.
"""

import logging

from anthropic import AsyncAnthropic, APIStatusError, APIConnectionError

from app.config import settings
from app.schemas.chat import ChatMessage

logger = logging.getLogger(__name__)


class LLMClient:
    def __init__(self) -> None:
        # A single shared async client is reused across requests.
        # Creating a new client per request would waste connection
        # setup overhead, identical to reusing a DB connection pool.
        self._client = AsyncAnthropic(api_key=settings.anthropic_api_key)

    async def generate_reply(
        self,
        system_prompt: str,
        history: list[ChatMessage],
    ) -> tuple[str, int, int]:
        """
        Sends the system prompt and conversation history to the
        model and returns (reply_text, input_tokens, output_tokens).

        Token counts are returned explicitly so the caller can log
        and bill for usage — never assume cost; always measure it.
        """
        messages = [{"role": m.role.value, "content": m.content} for m in history]

        try:
            response = await self._client.messages.create(
                model=settings.anthropic_model,
                max_tokens=settings.default_max_tokens,
                temperature=settings.default_temperature,
                system=system_prompt,
                messages=messages,
            )
        except APIConnectionError:
            # Network-level failure talking to the provider.
            # Treated as retryable by the caller.
            logger.exception("Network error calling LLM provider")
            raise
        except APIStatusError as exc:
            # Includes rate limits (429) and provider-side errors (5xx).
            # We log the status code so on-call engineers can
            # immediately distinguish "we are rate limited" from
            # "the provider is down" without re-reading source code.
            logger.error("LLM provider returned error status=%s", exc.status_code)
            raise

        # Concatenate all text blocks in the response. Frontier model
        # APIs can return multiple content blocks (text, tool_use,
        # etc.) — Chapter 3 covers handling tool_use blocks. For a
        # plain chat reply, we only expect text blocks here.
        reply_text = "".join(
            block.text for block in response.content if block.type == "text"
        )

        return (
            reply_text,
            response.usage.input_tokens,
            response.usage.output_tokens,
        )


# Module-level singleton, injected into routes via FastAPI dependency
# override in tests. See tests/test_chat_routes.py.
llm_client = LLMClient()
```

### 8.5 API route (`app/api/chat_routes.py`)

```python
"""
HTTP route layer. Responsible only for request validation,
delegating to services, and shaping the HTTP response — it must
never contain prompt-construction logic itself (that belongs in a
dedicated prompt-building module, introduced in Chapter 2).
"""

from fastapi import APIRouter, HTTPException, status

from app.schemas.chat import ChatRequest, ChatResponse, ChatMessage, Role
from app.services.llm_client import llm_client
from app.config import settings

router = APIRouter(prefix="/chat", tags=["chat"])

# In production this in-memory store would be replaced with Redis
# or a database table. It exists here only to demonstrate the
# STATELESSNESS principle from Section 3.6: the application,
# not the model, is responsible for remembering conversation history.
_conversation_store: dict[str, list[ChatMessage]] = {}

SYSTEM_PROMPT = (
    "You are an internal enterprise assistant. Answer concisely "
    "and professionally. If you do not know an answer, say so "
    "explicitly rather than guessing."
)


@router.post("", response_model=ChatResponse)
async def post_chat_message(request: ChatRequest) -> ChatResponse:
    history = _conversation_store.get(request.conversation_id, [])

    # Enforce the bounded-history limit from Settings. Without this,
    # a long-running conversation would silently grow the context
    # window on every turn, increasing cost and latency until it
    # eventually exceeds the model's context limit entirely.
    history = history[-settings.max_history_turns :]

    history.append(ChatMessage(role=Role.USER, content=request.message))

    try:
        reply_text, input_tokens, output_tokens = await llm_client.generate_reply(
            system_prompt=SYSTEM_PROMPT,
            history=history,
        )
    except Exception as exc:
        # We deliberately do not leak provider error details to the
        # client — this prevents internal infrastructure details
        # from being exposed and is standard API security hygiene.
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Assistant is temporarily unavailable. Please try again.",
        ) from exc

    history.append(ChatMessage(role=Role.ASSISTANT, content=reply_text))
    _conversation_store[request.conversation_id] = history

    return ChatResponse(
        conversation_id=request.conversation_id,
        reply=reply_text,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
    )
```

### 8.6 Application entrypoint (`app/main.py`)

```python
"""
FastAPI application entrypoint.
"""

from fastapi import FastAPI

from app.api.chat_routes import router as chat_router

app = FastAPI(
    title="Enterprise Agentic AI — Chapter 1 Foundation Service",
    version="0.1.0",
)

app.include_router(chat_router)


@app.get("/health")
async def health_check() -> dict[str, str]:
    return {"status": "ok"}
```

### 8.7 Minimal test (`tests/test_chat_routes.py`)

```python
"""
Demonstrates the testing principle from Section 3.6: we do NOT
assert on the exact text of the LLM's reply (that would be a flaky,
non-deterministic test). Instead, we mock the LLM client and assert
on the STRUCTURE and FLOW of our own code — the part we actually
control and are responsible for.
"""

import pytest
from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock

from app.main import app
from app.services import llm_client as llm_client_module


@pytest.mark.asyncio
async def test_post_chat_message_returns_structured_response(monkeypatch):
    mock_generate_reply = AsyncMock(return_value=("Mocked reply", 42, 7))
    monkeypatch.setattr(
        llm_client_module.llm_client, "generate_reply", mock_generate_reply
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/chat",
            json={"conversation_id": "conv-1", "message": "Hello"},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["reply"] == "Mocked reply"
    assert body["input_tokens"] == 42
    assert body["output_tokens"] == 7
    mock_generate_reply.assert_awaited_once()
```

### 8.8 `requirements.txt`

```
fastapi==0.115.0
uvicorn[standard]==0.30.6
anthropic==0.40.0
pydantic==2.9.2
pydantic-settings==2.5.2
httpx==0.27.2
pytest==8.3.3
pytest-asyncio==0.24.0
```

---

## 9. Common Mistakes

1. **Treating the model as a database.** Engineers new to LLMs sometimes ask the model factual questions ("what is our current refund policy?") and trust the answer directly, instead of retrieving the actual policy document and grounding the model's answer in it. The model will answer fluently and confidently even when wrong. *Correct approach*: retrieve authoritative data first (RAG, tool calls), and have the model summarize/reason over *that* data, not its training memory.

2. **Assuming statelessness is a minor detail.** Teams often discover, in production, that conversation context is being silently dropped or duplicated because no one designed an explicit history-management strategy. *Correct approach*: design conversation state storage (Section 8.5) before writing any prompts.

3. **Using temperature 0.7+ for structured/decision tasks.** This introduces unnecessary inconsistency into classification, extraction, and routing tasks that should behave predictably. *Correct approach*: use low temperature (0–0.3) for any task with a "correct" structured answer, and reserve higher temperature for genuinely open-ended creative tasks.

4. **Ignoring token costs until the bill arrives.** Because input is "free-feeling" to write in a prompt, engineers often resend entire documents or full conversation histories on every call without bound. *Correct approach*: explicitly cap history length, summarize old context, and use prompt caching features for repeated system prompts (Chapter 5 covers cost optimization in depth).

5. **Exposing the system prompt as a client-controlled field.** Allowing the frontend (or an end user) to inject or override the system prompt creates a direct prompt-injection and security vulnerability. *Correct approach*: system prompts are constructed and controlled entirely server-side, as shown in Section 8.5.

6. **Writing brittle string-matching tests against LLM output.** Because of non-determinism, asserting `response.text == "exact string"` produces flaky test suites. *Correct approach*: test your own orchestration code with mocks (Section 8.7), and validate LLM output structurally (schema validation) rather than via exact string matching.

---

## 10. Best Practices

- **Scalability**: Treat the LLM API as an external dependency behind a connection-pooled async client (Section 8.4), and design for horizontal scaling of your orchestration service independently from the LLM provider's own scaling.
- **Maintainability**: Isolate all LLM calls behind a service class (the repository pattern shown in Section 8.4) so that prompt changes, model upgrades, or provider switches touch one file, not the entire codebase.
- **Testing**: Mock the LLM client in unit tests; reserve real API calls for a small number of integration/smoke tests run against a fixed evaluation set, not the full test suite.
- **Security**: Never accept system prompts, model parameters, or tool definitions from untrusted client input. Sanitize and bound all user-supplied text that will be interpolated into a prompt.
- **Cost optimization**: Cap `max_tokens` deliberately per use case; bound conversation history length; use prompt caching for repeated system prompts and few-shot examples; route simple tasks to smaller/cheaper models where available (Chapter 5).
- **Observability**: Log every prompt, response, token count, latency, and model version per request, with correlation IDs tying LLM calls back to the originating user request — essential for debugging non-deterministic behavior in production.
- **Deployment & versioning**: Pin exact model version strings (not "latest") in configuration, and treat model upgrades as a reviewed, tested deployment event — model behavior can shift meaningfully between versions, just as a major dependency upgrade can break behavior in traditional software.

---

## 11. Exercises

**Easy**

1. Explain, in your own words, why an LLM API call is stateless, and name two traditional backend concepts (from session management or caching) that are analogous to the problem of maintaining LLM conversation state.
2. Given a model that charges $3 per million input tokens and $15 per million output tokens, calculate the cost of a single API call with 2,000 input tokens and 500 output tokens.

**Intermediate**

3. Extend the `LLMClient` from Section 8.4 to implement exponential backoff retry logic for `APIStatusError` exceptions with a 429 (rate limit) status code, while immediately raising (not retrying) on other 4xx errors.
4. Design a Pydantic schema for extracting structured fields (claimant name, policy number, incident date, estimated damage amount) from a free-text insurance claim description, including appropriate field validation (e.g., date format, positive damage amount).

**Advanced**

5. Design (in writing, with a diagram) a conversation-history summarization strategy that keeps the most recent N turns verbatim but replaces older turns with an LLM-generated summary once the history exceeds a configurable token budget. Identify the failure modes of this approach (e.g., information loss) and how you would mitigate them.
6. A production incident report shows that an agentic customer support system occasionally produces different classifications for the *exact same* support ticket text submitted twice within the same minute. Using the concepts in Sections 3.6 and 4.2, write a root-cause analysis and propose two concrete engineering mitigations.

---

## 12. Mini Project

**Project: Internal Knowledge Concierge (Foundation Version)**

Build a FastAPI service, following the structure in Section 8, that:

1. Accepts a `conversation_id` and a `message` via a `/chat` POST endpoint.
2. Maintains bounded conversation history per `conversation_id` (in-memory is acceptable for this version; Redis-backed storage is a stretch goal).
3. Enforces a server-side, non-overridable system prompt that restricts the assistant to answering only questions about a fictional company's HR policy, refusing politely and explicitly for anything else.
4. Logs, for every request: `conversation_id`, input token count, output token count, latency in milliseconds, and model version used.
5. Includes at least three unit tests using mocked LLM responses (per Section 8.7) that verify: (a) history is correctly bounded by `max_history_turns`, (b) a 502 error is returned to the client when the LLM client raises an exception, and (c) the system prompt is never taken from client input.

This project intentionally does *not* include tool calling or RAG — those are the subjects of Chapter 3. The goal here is a clean, well-tested foundation for everything that follows.

---

## 13. Chapter Summary

- An LLM is fundamentally a next-token prediction engine, trained on the statistical patterns of its training data — not a database and not a reasoning oracle in the human sense.
- Text is processed as tokens, not words or characters; tokenization directly determines cost and context-window usage.
- The transformer architecture's self-attention mechanism lets every token weigh every other token's relevance, at a computational cost that scales with context length — explaining why long contexts are expensive and why output length dominates latency.
- LLM API calls are **stateless** and **non-deterministic** — two properties with no real analog in traditional deterministic backend systems, and the source of most architectural decisions in agentic system design.
- "Model," "API," "application," and "agent" are distinct concepts; an agent is specifically an architecture where the LLM chooses its own sequence of actions inside an observe-reason-act loop.
- Enterprises adopt LLMs to handle the long tail of ambiguous, natural-language-driven business logic that is too costly to hand-code as deterministic rules — not as a wholesale replacement for existing systems of record.
- Hallucination and knowledge cutoffs are structural properties of the technology, not bugs, and must be compensated for through architecture (retrieval, validation, human-in-the-loop) rather than through prompting alone.
- Production-grade LLM integration requires the same engineering discipline as any other external dependency: connection pooling, retries, observability, cost control, and security boundaries — applied with awareness of the unique properties covered in this chapter.

---

## 14. Interview Questions

**Conceptual**

1. What is the difference between a language model, an LLM-powered application, and an agent? Give an example of each.
2. Explain why LLM output is non-deterministic even at temperature 0, and why this matters for testing strategy.
3. What is a context window, and why does context length affect both cost and accuracy?

**Architecture**

4. Where does the "reasoning tier" sit in a traditional three-tier enterprise architecture, and what should it never be allowed to do directly?
5. How would you design conversation state management for a multi-turn agentic chatbot used by thousands of concurrent users, considering both cost and latency?

**Coding**

6. Given the `LLMClient` class in Section 8.4, modify it to support streaming responses token-by-token to the client instead of waiting for the full completion. What changes are required at the FastAPI route layer to support this?
7. Write a Pydantic model that validates structured output from an LLM extracting an invoice's line items, ensuring totals reconcile, and explain what you would do if validation fails.

**Scenario-based**

8. A finance team reports that an LLM-based reconciliation assistant occasionally states incorrect account balances with high confidence. Walk through your diagnosis process and the architectural changes you would propose.
9. Your company's legal team is concerned about sending customer PII to a third-party LLM API. What architectural and contractual mitigations would you propose?

**System Design**

10. Design, at a high level, a system that allows customer support agents to ask natural-language questions about a customer's account and receive answers grounded in real account data across three internal systems (billing, CRM, ticketing). Identify where the LLM fits, where deterministic logic fits, and where a human must remain in the loop.


