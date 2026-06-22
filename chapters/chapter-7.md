# Chapter 7 — Interview Preparation & System Design

*Enterprise Agentic AI Engineering: A Textbook for Software Engineers*

---

## 1. Learning Objectives

By the end of this chapter, you will be able to:

1. Articulate, concisely and precisely, the core concepts from every prior chapter in the form expected in a technical interview setting, rather than only in the extended textbook form used to teach them.
2. Apply a structured framework for answering open-ended agentic system design interview questions, mirroring how senior interviewers actually evaluate candidates at companies building production agentic systems.
3. Recognize and avoid the specific mistakes that distinguish a junior-sounding answer from a senior-sounding answer on agentic AI system design questions.
4. Work through full, worked system design interview answers for representative enterprise scenarios, narrated the way a strong candidate would narrate them in a live interview.
5. Answer rapid-fire conceptual and coding questions spanning Chapters 1–6 with precise, defensible, first-principles explanations.
6. Conduct a mock interview of yourself (or a peer) using the complete question bank assembled in this chapter, self-assessing against the rubric provided.

This chapter is a capstone, not a new technical layer. It assumes complete fluency with Chapters 1–6 and exists to convert that fluency into interview performance — a distinct skill from engineering competence, but one that rewards exactly the depth of understanding this book has built, when expressed clearly and concisely under time pressure.

---

## 2. Why This Matters

### 2.1 Why agentic AI interviews differ from traditional backend interviews

Traditional backend interviews probe data structures, algorithms, and system design for deterministic systems (a URL shortener, a rate limiter, a chat application). Agentic AI engineering interviews, increasingly common at companies from frontier AI labs to enterprises building internal agentic platforms, probe a different and additional set of judgment calls: where to place the human-in-the-loop boundary, how to handle non-determinism in testing, how to scope tool permissions, how to reason about cost at scale, and how to recognize when an agentic approach is *not* the right solution to a problem. Interviewers evaluating senior or staff-level candidates are specifically listening for the kind of reasoning developed across Chapters 3 through 6 — not whether you know that an LLM API exists, but whether you can architect a *safe, observable, cost-bounded* system around one.

### 2.2 The business problem this solves for you

Companies hiring for these roles are making a real bet: that you can be handed a vague business problem (exactly the kind of prompt that opened Chapter 6) and produce a defensible, production-minded design under time pressure, without a chapter-by-chapter reference to consult. This chapter compresses everything built across this book into the rapid-recall, structured-narration form that a 45-minute interview actually rewards.

### 2.3 Where this fits

This chapter does not extend the architecture — it extends *you*. Every concept referenced here points back to a specific chapter and section, by design, so that this chapter functions as both an interview-preparation tool and an index into the rest of the book.

---

## 3. Fundamentals — How to Structure Any Agentic System Design Answer

### 3.1 The five-minute framework

When given an open-ended system design prompt ("design an agentic system for X"), strong candidates do not start writing code or naming specific frameworks immediately. They narrate a structure resembling the five-step process from Chapter 6, Section 3, compressed for interview pacing:

1. **Clarify the goal and constraints** (30–60 seconds): What does success look like? What's the volume/scale? What's the risk tolerance — is a wrong action here costly (financial, legal, safety) or merely inconvenient? This single question — "how costly is a wrong automated decision here?" — is the most senior-sounding question you can ask early, because it is exactly the question that determines the human-in-the-loop boundary (Chapter 3, Section 3.6; Chapter 6, Section 3.2).
2. **Decompose into decisions and actions** (1–2 minutes): Name the discrete steps. Explicitly classify each as deterministic, LLM-judgment, or human-required, narrating your reasoning out loud — this is precisely what an interviewer is listening for, more than the final architecture diagram.
3. **Name the tools and their categories** (1 minute): Read/write/irreversible (Chapter 3, Section 3.6), and which require approval gating.
4. **Sketch state, flow, and checkpoints** (1–2 minutes): Whether this needs a full graph (Chapter 4) or a simple loop (Chapter 3) is itself a signal of judgment — say so explicitly and justify it.
5. **Address production concerns proactively** (1–2 minutes): evaluation strategy, cost control, failure handling, observability — even briefly naming these (per Chapter 5) signals you are thinking past the happy path, which is frequently the single biggest differentiator between a mid-level and senior-level answer.

### 3.2 What separates a strong answer from a weak one

A weak answer jumps straight to "I'd use an LLM with some tools and a vector database" without ever stating what could go wrong or who is accountable when it does. A strong answer spends real time on Step 1 and Step 5 — bounding risk and acknowledging production concerns — even if that means the "exciting" architecture diagram gets less airtime. Interviewers calibrated to hire for production agentic engineering roles consistently rate candidates who proactively raise human-in-the-loop boundaries, evaluation strategy, and failure modes *without being asked* more highly than candidates who only raise these topics when explicitly prompted.

### 3.3 Handling follow-up pressure-testing

Interviewers will often pressure-test your design with a "what if" — "what if the model hallucinates here," "what if this tool call fails midway," "what if a malicious user tries to inject instructions through this field." The correct response pattern, every time, is to point to a *specific, already-established mechanism* (schema validation, Chapter 2, Section 3.5; the policy engine, Chapter 3, Section 8.5; the circuit breaker, Chapter 5, Section 8.3) rather than inventing a new, vague mitigation on the spot. This is why fluency with the concrete mechanisms in Chapters 2–5 — not just their names, but how they actually work — pays off directly in this moment of the interview.

---

## 4. Deep Technical Explanation — Rapid-Recall Concept Map

This section is a dense, cross-referenced recall map of the entire book's mechanisms, organized the way you should be able to retrieve them under interview pressure — by the *failure mode or design question* they answer, not just by chapter number.

| If asked about... | The mechanism is... | Established in... |
|---|---|---|
| "How do you stop the model from making things up?" | Grounding via RAG; never trusting raw output for high-stakes facts; schema validation as a defensive backstop | Ch.1 §4.2; Ch.5 §3.3-3.4 |
| "How do you get reliable structured output?" | Constrained/schema-enforced decoding + mandatory downstream Pydantic validation + bounded retry with error feedback | Ch.2 §3.5, §4.1, §8.4 |
| "How does the model take real action?" | Tool calling: model proposes a structured call, your code authorizes and executes it | Ch.3 §3.1-3.2 |
| "How do you stop a prompt-injected webpage from causing harm?" | Capability scoping at the permission layer — the model cannot do what it has no tool for, regardless of what it's told | Ch.3 §4.3 |
| "How do you handle a multi-stage process with a human approval step that takes days?" | Graph-based workflow with durable checkpointing | Ch.4 §3.5 |
| "How do you avoid an infinite agent loop?" | Hard iteration/recursion ceiling, always explicit, never assumed | Ch.3 §8.6; Ch.4 §4.1 |
| "How do you test something non-deterministic?" | Evaluation harness measuring structured-output correctness, tool-selection accuracy, and end-to-end task success; mock the LLM for unit tests of your own code | Ch.1 §8.7; Ch.5 §3.1 |
| "How do you control cost at scale?" | Prompt caching, model routing, per-tenant budget enforcement before calls, bounded max_tokens/history | Ch.1 §8.5; Ch.5 §3.6, §4.1, §8.4 |
| "How do you handle an LLM provider outage?" | Retry with backoff for transient errors, circuit breaker to stop hammering a dead provider, fallback model/provider | Ch.5 §4.3, §8.2-8.3 |
| "How do you decide what the model should and shouldn't be allowed to do autonomously?" | Classify by reasoning type (deterministic/LLM/human-required) and by tool category (read/write/irreversible); gate accordingly | Ch.3 §3.6; Ch.6 §3.2-3.3 |
| "How do you safely deploy a prompt/model change?" | Canary rollout comparing evaluation and business metrics before full promotion | Ch.5 §4.4 |
| "When would you NOT use an agent at all?" | When the task is fully expressible as deterministic rules with no genuine ambiguity in natural language input — agentic AI is for the long tail, not a universal replacement for deterministic logic | Ch.1 §2.1; Ch.6 §3.2 |

### 4.1 Why this table is the right way to study, not just a cheat sheet

Notice that every row maps a *plain-English failure mode or design question* — the actual shape interview questions take — to a *specific mechanism with a specific chapter anchor*, not a vague buzzword. Memorizing buzzwords ("we'd use RAG," "we'd add guardrails") without being able to explain the underlying mechanism (how retrieval actually grounds output, what a guardrail concretely checks and where it sits in the request flow) is exactly what separates an answer that sounds senior from one that *is* senior under follow-up questioning (Section 3.3).

---

## 5. Visual Diagrams

### 5.1 The interview answer structure, as a flow

```
  Open-ended prompt: "Design an agentic system for X"
            │
            ▼
 ┌─────────────────────────┐
 │ 1. Clarify risk/scale       │  ← "How costly is a wrong
 │    (30-60 sec)                │     automated decision here?"
 └───────────┬─────────────┘
             ▼
 ┌─────────────────────────┐
 │ 2. Decompose & classify     │  ← deterministic / LLM / human
 │    out loud (1-2 min)         │
 └───────────┬─────────────┘
             ▼
 ┌─────────────────────────┐
 │ 3. Tools + categories         │  ← read / write / irreversible
 │    (1 min)                       │
 └───────────┬─────────────┘
             ▼
 ┌─────────────────────────┐
 │ 4. State/flow/checkpoints     │  ← justify loop vs. graph
 │    (1-2 min)                     │
 └───────────┬─────────────┘
             ▼
 ┌─────────────────────────┐
 │ 5. Production concerns          │  ← eval, cost, failure,
 │    raised proactively (1-2 min)   │     observability
 └───────────┬─────────────┘
             ▼
       Invite follow-up "what if" pressure-testing,
       answer by pointing to specific mechanisms (Section 3.3)
```

**Explanation**: This is the same five-step shape as Chapter 6, Section 3's design process, deliberately — the interview answer structure and the real engineering design process are the same process, just paced for 5–8 minutes of spoken narration instead of a multi-day design document.

---

## 6. Real Enterprise Examples — Three Fully Worked Interview Answers

### 6.1 Worked answer: "Design an agentic system to help a bank's call center handle customer disputes."

*(Narrated as a strong candidate would speak it.)*

"First, let me understand the risk profile — disputes can involve real money movement, so I'd want to know upfront: can this system ever move money autonomously, or does every dispute resolution ultimately require a human decision? I'll assume, given regulatory norms in banking, that final resolution always requires human sign-off, but the system can do everything up to that point.

Decomposing: the agent needs to (1) understand the customer's dispute from their description, (2) pull the relevant transaction history and prior dispute records, (3) check it against known fraud/dispute patterns, (4) draft a recommended resolution with rationale, and (5) hand off to a human agent for the final decision. Step 1 is language understanding — an LLM extraction node. Step 2 is deterministic tool calls — read-only lookups against the core banking system. Step 3 benefits from RAG over a curated fraud-pattern knowledge base, or potentially a second 'reviewer' agent for a debate-style second opinion given the stakes. Step 4 is LLM drafting. Step 5 is a mandatory human-in-the-loop checkpoint — never automated, which I'd enforce by simply not giving this agent any tool capable of moving funds or closing a dispute; that's the strongest guardrail available.

For tools: `get_transaction_history` and `get_prior_disputes` are read tools, low risk. There's no write or irreversible tool in this agent's registry at all — the only 'output' is a structured recommendation handed to a human.

I'd model this as a LangGraph workflow rather than a flat loop, because there are clear distinct stages and I want a checkpoint at the human handoff that can durably wait — these calls can sit in a queue for a human agent to pick up, possibly across a shift change, so I need persisted state, not just an in-memory loop.

For production concerns: I'd build an evaluation set from historical disputes with known correct resolutions, specifically over-weighted with ambiguous cases, since under-flagging a genuine fraud pattern is the costlier failure mode here. I'd enforce a circuit breaker and fallback model for resilience given this is a live customer-facing channel, and I'd log every tool call and recommendation for audit, since banking regulators will expect that trail."

**Why this answer scores well**: it opens with the risk-bounding question, classifies before architecting, justifies the workflow-vs-loop choice, makes the strongest-guardrail design choice explicit (no money-moving tool at all, not just a permission check), and proactively raises evaluation and audit concerns without being asked.

### 6.2 Worked answer (shorter, for a rapid-fire round): "How would you prevent a tool-calling agent from being manipulated by malicious content in a document it reads?"

"The mitigation can't live in the prompt alone, because the model is reasoning over text and can't structurally distinguish 'legitimate instruction' from 'injected instruction' with full reliability — that's the nature of indirect prompt injection. The real defense is capability scoping: if the agent reading that document has no tool capable of, say, sending data externally or taking a financial action, then no injected instruction can cause that harm, regardless of how convincing it is. I'd also delimit the document content explicitly as data in the prompt, and treat that as a second, weaker layer of defense — useful, but not sufficient on its own."

**Why this answer scores well**: identifies the right root cause (capability scoping, not prompting) as the primary defense, names the secondary layer correctly, and is appropriately concise for a rapid-fire follow-up question rather than over-explaining.

### 6.3 Worked answer: "A stakeholder wants you to use an agent to fully automate loan approval decisions end-to-end. What do you say?"

"I'd push back, but constructively, and ground the pushback in the actual risk and regulatory profile rather than a blanket 'AI is risky' objection. Loan approval has real fair-lending regulatory scrutiny, and a wrong automated decision has direct financial and legal consequence for both the applicant and the institution — that's exactly the profile that, per the design framework I use, calls for human-required classification on the final decision, not full automation. What I would automate: document extraction, data validation, a compliance pre-check, and a drafted recommendation with rationale — handing all of that to a human underwriter so they can decide in minutes instead of hours, while keeping accountability where it currently sits. If, over time, we build a large, audited evaluation set showing extremely high agreement between the agent's recommendation and the human's final decision across a representative population — including across demographic subgroups, given fair-lending concerns — that's a conversation for expanding scope later, with the regulatory and compliance team involved in that decision, not an engineering call made unilaterally."

**Why this answer scores well**: it demonstrates the judgment to say "no, not like that" to a stakeholder while still being constructive and offering a concrete, valuable alternative scope — exactly the senior-level signal interviewers are listening for, since blindly agreeing to automate a clearly inappropriate decision is itself a red flag in this kind of interview.

---

## 7. Architecture Design — A Whiteboard-Ready Reference Template

When an interview moves to the whiteboard (or shared doc), this is the reference shape to reproduce quickly, annotated with where each prior chapter's contribution sits — practice drawing this from memory.

```
  Request ──▶ [Rate limit / budget check] (Ch.5)
                       │
                       ▼
            [Prompt render + LLM call] (Ch.1-2)
                       │
              tool_use?│
              ┌────────┴────────┐
              ▼                  ▼
        [Policy engine     [Final answer]
         check] (Ch.3)            │
              │                   │
        allowed│ denied            │
        ┌──────┘   └──────┐        │
        ▼                  ▼        │
   [Execute tool]   [Return error    │
   (Ch.3)            to model]       │
        │                  │        │
        └────────┬─────────┘        │
                 ▼                  │
        [Append result, loop]       │
        (Ch.3-4, bounded!)          │
                 │                  │
        (multi-stage? ──▶ [Graph workflow,
         use graph,         checkpoints for
         Ch.4)               human approval] (Ch.4)
                 │                  │
                 └────────┬─────────┘
                          ▼
              [Evaluation + observability +
               circuit breaker / fallback] (Ch.5)
```

**How to use this in an interview**: don't reproduce every box for every question — use this as your own internal checklist of "the boxes I should be able to justify including or excluding" for the specific scenario asked, narrating the inclusion/exclusion decision (per Section 3.1) rather than mechanically drawing all of it regardless of relevance.

---

## 8. Code Examples — Live-Coding Interview Patterns

Agentic AI interviews sometimes include a live-coding component. The following are compact, interview-paced versions of the most commonly requested implementations, distilled from the full versions built across Chapters 1–5. In an interview, narrate the design decision (the comment text below) before or while writing the code — interviewers weight reasoning at least as heavily as syntax.

### 8.1 "Implement a basic retry-with-backoff wrapper for an LLM call."

```python
import asyncio
import random

async def call_with_retry(func, max_attempts=4, base_delay=1.0):
    """
    Retries on transient failures only -- a non-retryable error
    (e.g., bad request) should raise immediately, not waste attempts.
    Exponential backoff with jitter avoids a thundering-herd retry
    pattern across concurrent callers. (Ch.5 §8.2)
    """
    for attempt in range(1, max_attempts + 1):
        try:
            return await func()
        except TransientError:
            if attempt == max_attempts:
                raise
            delay = base_delay * (2 ** (attempt - 1)) * (1 + random.uniform(0, 0.1))
            await asyncio.sleep(delay)
```

### 8.2 "Implement a bounded tool-calling loop, given a mock model client."

```python
async def run_agent(model_client, tools_by_name, max_iterations=6):
    """
    The model PROPOSES tool calls; this code EXECUTES and authorizes
    them. The loop is hard-bounded -- never trust the model to
    terminate the loop on its own without a ceiling. (Ch.3 §3.2, §8.6)
    """
    history = []
    for _ in range(max_iterations):
        response = await model_client.generate(history)
        if not response.tool_calls:
            return response.text  # final answer, loop terminates
        for call in response.tool_calls:
            tool = tools_by_name[call.name]
            result = await tool(call.arguments)  # authorization happens inside `tool`
            history.append({"tool": call.name, "result": result})
    raise RuntimeError("Exceeded max agent iterations")
```

### 8.3 "Given a Pydantic schema, validate an LLM's JSON output and retry once on failure."

```python
import json
from pydantic import ValidationError

async def extract_with_one_retry(model_client, prompt, schema):
    """
    Constrained decoding reduces but does not eliminate the need
    for defensive validation (Ch.2 §3.5, §4.1) -- this is the
    minimum acceptable pattern for any structured-output call.
    """
    raw = await model_client.generate(prompt)
    try:
        return schema.model_validate(json.loads(raw))
    except (json.JSONDecodeError, ValidationError) as exc:
        retry_prompt = f"{prompt}\n\nFix this error and respond again: {exc}"
        raw_retry = await model_client.generate(retry_prompt)
        return schema.model_validate(json.loads(raw_retry))  # let this raise if still invalid
```

---

## 9. Common Mistakes — Interview-Specific

1. **Diving straight into architecture without bounding risk first.** Skipping Section 3.1's Step 1 makes every subsequent design choice (human-in-the-loop placement, guardrail intensity) look arbitrary rather than justified. *Correct approach*: always ask or state the risk/cost-of-error profile before architecting.

2. **Naming a technique without being able to explain its mechanism.** Saying "we'd use RAG" or "we'd add guardrails" and then being unable to explain *how* retrieval actually grounds output, or what a guardrail concretely checks, collapses under any follow-up question (Section 3.3, Section 4.1). *Correct approach*: study the mechanism table in Section 4, not just the vocabulary.

3. **Treating every problem as requiring the most sophisticated pattern.** Reaching for a multi-agent graph workflow when a flat agent loop would suffice (Chapter 4, Section 9, Common Mistake 1) signals a lack of judgment about complexity tradeoffs, which is exactly what senior interviews probe for. *Correct approach*: explicitly justify *why* a given level of architectural complexity is warranted for this specific scenario, including stating when it would not be.

4. **Agreeing uncritically to over-automate a high-stakes decision when a stakeholder asks for it.** As shown in Section 6.3, blindly saying "yes, we can fully automate that" to an inappropriate full-automation request is a red flag, not a sign of can-do attitude, in this domain. *Correct approach*: push back constructively, grounded in risk classification, and offer a valuable, appropriately scoped alternative.

5. **Forgetting to address testing/evaluation for non-deterministic systems when asked generically "how would you test this."** Falling back to traditional unit-testing language alone, without mentioning evaluation harnesses, tool-selection accuracy, or the mock-the-LLM-client pattern for your own code, suggests you haven't engineered a real agentic system in production. *Correct approach*: always distinguish "testing my deterministic code" (ordinary mocks/unit tests) from "evaluating the model's behavior" (an evaluation harness, per Chapter 5, Section 3.1).

---

## 10. Best Practices — For the Interview Itself

- **Narrate your reasoning, not just your conclusion.** Interviewers are evaluating the *process* shown in Section 3.1 at least as much as the final design — silent thinking followed by a finished diagram loses most of the signal you could be providing.
- **State assumptions explicitly and ask for missing constraints early**, rather than assuming and hoping — exactly as you would clarify ambiguous requirements before designing a real production system.
- **Use precise vocabulary deliberately**: "agent loop" vs. "graph workflow" vs. "multi-agent system" (Chapter 4, Section 3.6) are not interchangeable, and using the right term in the right place signals fluency the way correctly distinguishing "process" from "thread" does in a systems interview.
- **Bring up production concerns before being asked.** This is consistently one of the highest-signal behaviors interviewers report — proactively raising evaluation, cost, and failure handling (Chapter 5) distinguishes a candidate who has actually operated these systems from one who has only prototyped them.
- **When pressure-tested, point to a specific mechanism, not a vague reassurance.** "We'd add safeguards" is weak; "the policy engine would reject that tool call because the caller's role doesn't include write access" is strong (Section 3.3).
- **Be willing to say a task is not a good fit for agentic AI**, when that's the honest answer (Chapter 1, Section 2.1; Chapter 6, Section 3.2) — this demonstrates judgment, not a lack of enthusiasm for the technology.

---

## 11. Exercises — Mock Interview Drills

**Easy (rapid-fire, aim for under 60 seconds each)**

1. What is the difference between a model, an API, an application, and an agent?
2. Why is LLM output non-deterministic even at temperature 0?
3. What is the difference between a read tool, a write tool, and an irreversible-action tool?
4. What problem does prompt caching solve, and what prompt structure maximizes its benefit?
5. What is indirect prompt injection, and why is it specific to tool-calling agents?

**Intermediate (aim for 2-3 minutes each, narrated as in Section 6.2)**

6. How would you design the human-in-the-loop boundary for an agent that processes expense reimbursement requests?
7. Walk through how you would diagnose a sudden increase in schema-validation failures after a model provider upgrade.
8. Explain the difference between RAG and fine-tuning, and which you'd choose for a frequently-updated internal policy assistant.
9. How would you test an agent's tool-selection accuracy, distinct from testing its final answer quality?
10. Design a circuit-breaker and fallback strategy for a customer-facing agent that depends on a single LLM provider.

**Advanced (full system design, aim for 6-8 minutes each, following Section 3.1 and Section 6's worked examples)**

11. Design an agentic system for a hospital's appointment scheduling and triage line.
12. Design an agentic system to help a logistics company's dispatchers handle delivery exceptions (delays, damaged goods, failed deliveries).
13. A stakeholder asks you to build an agent that can autonomously respond to and resolve negative reviews on public platforms on behalf of the company. Walk through your full design reasoning, including whether and how you would push back on any part of the request.

---

## 12. Mini Project

**Project: Run a Full Mock Interview**

1. Recruit a peer (or use this chapter's question bank solo, speaking your answers aloud) and run a structured 45-minute mock interview: 5 rapid-fire conceptual questions (Section 11, Easy), 2 intermediate questions (Section 11, Intermediate), and 1 full system design question (Section 11, Advanced or a new scenario of the interviewer's choosing).
2. Record yourself (audio is sufficient) and review the recording against the Section 3.2 "strong vs. weak answer" criteria and the Section 9 common-mistakes list.
3. Write a one-page self-assessment: which of the five steps in Section 3.1 did you consistently address without prompting, which did you only address when pushed, and which specific mechanism (from the Section 4 table) did you reference imprecisely or not at all.
4. Repeat the system design question one week later, without reviewing your notes beforehand, and compare your two answers for improvement in structure, specificity, and proactive coverage of production concerns.

---

## 13. Chapter Summary

- Agentic AI system design interviews evaluate judgment about risk, automation boundaries, and production readiness — not just familiarity with LLM APIs — and reward the same structured decomposition process introduced in Chapter 6, paced for spoken delivery.
- The strongest signal a candidate can give is proactively bounding risk (Step 1) and proactively raising production concerns (Step 5) without being prompted by the interviewer.
- Every named technique (RAG, guardrails, tool calling, checkpointing) must be explainable at the mechanism level, not just the vocabulary level, to survive realistic follow-up pressure-testing.
- Strong answers point to specific, concrete mechanisms (a named tool category, a named retry/circuit-breaker pattern, a named evaluation dimension) when pressure-tested, rather than offering vague reassurances.
- Pushing back constructively on an inappropriate full-automation request, grounded in risk classification, is a senior-level signal, not a sign of insufficient enthusiasm for the technology.
- Live-coding requests in this domain typically center on retry logic, bounded tool-calling loops, and structured-output validation with retry — all directly distilled from the full implementations built in Chapters 1, 2, 3, and 5.
- The fastest way to prepare is rehearsal: narrating full worked answers aloud, under time pressure, against the rubric in this chapter, repeated until the five-step structure becomes automatic rather than effortful.

---

## 14. Interview Questions — Final Comprehensive Bank

**Conceptual**

1. Explain the full chain of reasoning from "an LLM is a next-token predictor" (Chapter 1) to "therefore we need a permission boundary that doesn't trust model output" (Chapter 3). Why does each step necessarily follow from the one before it?
2. What is the single most important question to ask before designing any agentic system, and why does it determine so much of the subsequent architecture?

**Architecture**

3. Design the full architecture, end to end, for an agentic system of your choosing that you have not discussed elsewhere in your preparation, applying every layer introduced across Chapters 1-5 (reasoning tier, tool registry, policy engine, graph workflow, evaluation harness, resilience layer, observability).
4. How would you redesign an existing, currently-too-permissive agentic system (one where a single agent has broad read/write access across many systems) to apply the least-privilege, multi-agent decomposition principles from Chapter 4 and Chapter 6, without a full rewrite?

**Coding**

5. Live-code a complete, bounded tool-calling loop, including authorization checks, from memory, narrating each design decision as you go.
6. Live-code a structured-output extraction function with schema validation and a bounded retry-with-error-feedback loop, from memory.

**Scenario-based**

7. You join a team whose agentic system has no evaluation harness, no cost budget enforcement, and a single-point-of-failure dependency on one LLM provider. Prioritize, with justification, the order in which you would address these gaps.
8. A stakeholder is frustrated that your agentic system design includes "too many human approval steps" and is asking you to remove them to "let the AI just handle it." Construct your response, using the reasoning from Chapter 6, Section 3.2 and this chapter's Section 6.3.

**System Design (capstone)**

9. You are the senior engineer responsible for an enterprise's first major agentic AI initiative. Design the complete system for a business problem given to you live in the interview, and additionally describe the rollout plan: what gets built and evaluated first, what stays human-only initially, what the first production canary looks like, and what evidence would justify expanding automation scope over the following two quarters.
10. Reflecting on all seven chapters of this book: if you had to identify the single architectural principle that, if violated, causes the most serious production incidents in agentic systems, what would it be, and why? Defend your answer against at least one plausible counterargument.


