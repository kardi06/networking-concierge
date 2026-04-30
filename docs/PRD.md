# Product Requirements Document
## MyConnect AI Networking Concierge

**Version:** 1.1
**Author:** Kardi Ibrahim
**Original date:** 28 April 2026
**Last updated:** 30 April 2026
**Status:** Implemented (with documented deviations — see [Implementation Notes](#implementation-notes-v11) below)

---

## Implementation Notes (v1.1)

This PRD was authored on 28 April 2026 *before* implementation. The body of the document below is preserved as the original spec. The following adjustments were made during the build; each is recorded with full rationale in [`TECH-DECISIONS.md`](TECH-DECISIONS.md).

| PRD section | Change | Rationale |
|---|---|---|
| §3.3 FR-5 + §4.1 | Concierge timeout **30 s → 90 s** | Measured agent loops with 6 tool calls average ~38 s end-to-end. 30 s rejected real demo turns. [TD-004] |
| §4.2 Reliability | Idempotency-Key handling **deferred** | The 10/min per-attendee throttle is the practical defence for the take-home. A Redis-backed idempotency window is listed under "what I'd do with more time". [TD-004] |
| §4.5 Data Protection | PII redaction broadened beyond `name`/`email` | Implementation also redacts `bio`, `looking_for`, and the `authorization` / `cookie` / `x-api-key` request headers. Stricter than originally specified. |
| §5.2 `score_match` input | `requester_attendee_id` **removed from the LLM-facing tool schema** | Injected server-side from `ToolContext` to prevent the model from hallucinating a different requester. Documented security deviation. |
| §5.3 `draft_intro_message` input | `from_attendee_id` **removed from the LLM-facing tool schema** | Same rationale as §5.2. |
| §8 Success Metrics | $0.05 / turn target achievable only with **prompt caching enabled** | Without caching (current implementation), measured cost is ~$0.09/turn. README §7 has the breakdown and §10 lists prompt caching as a planned optimisation. |
| §7 Out of Scope | Two additional items deferred | Idempotency-Key handling and per-conversation advisory lock — added to §7 below. |

The original §4.1 latency target (p95 < 8 s for the concierge endpoint) is retained as a *product* target; a synchronous 6-tool-call loop cannot meet it without prompt caching, an async queue, and streaming responses. All three are listed in [§13 of `ARCHITECTURE.md`](ARCHITECTURE.md#13-what-i-would-do-with-more-time).

---

## 1. Overview

### 1.1 Product Summary
MyConnect AI Networking Concierge is a backend service that helps conference attendees find relevant connections through natural-language conversation with an AI agent. The agent understands attendee intent, retrieves matching candidates, produces structured scoring with reasoning, and drafts personalized intro messages ready to send.

### 1.2 Problem Statement
At networking conferences, attendees often struggle to:
- Find relevant people among hundreds or thousands of attendees.
- Understand why someone is a good match worth talking to.
- Start a conversation with a stranger without sounding generic.

### 1.3 Goal
Provide a backend API that allows attendees to:
1. Register for an event with a complete profile.
2. Chat with an AI concierge to receive data-grounded connection recommendations.
3. Submit feedback on the quality of recommendations.

### 1.4 Non-Goals
- Frontend / UI (assumed to exist).
- Direct messaging between attendees (the concierge only drafts; it does not send).
- Payments, ticketing, or event agenda management.
- Mobile push notifications.

---

## 2. Target Users & Use Cases

### 2.1 Personas

**Founder Andi**
Looking for a technical co-founder at an AI startup event. Has a profile with a specific looking_for. Wants a shortlist of 3-5 candidates with reasoning, not a list of 50 names.

**Investor Maya**
Looking for post-revenue climate tech founders. Wants the agent to filter by funding stage and vertical, not crude keyword matching.

**Engineer Reza**
Exploring new opportunities. Wants an opening message that does not sound templated and that mentions specific shared ground.

### 2.2 User Stories

| ID | Story | Priority |
|----|-------|----------|
| US-1 | As an admin, I want to create an event so that attendees can register. | Must |
| US-2 | As an attendee, I want to register for an event with a full profile. | Must |
| US-3 | As an attendee, I want to list other attendees with filters. | Must |
| US-4 | As an attendee, I want to chat with the concierge in natural language. | Must |
| US-5 | As an attendee, I want to receive match recommendations with score and rationale. | Must |
| US-6 | As an attendee, I want intro message drafts for the top candidates. | Must |
| US-7 | As an attendee, I want to resume an earlier conversation without losing context. | Must |
| US-8 | As an attendee, I want to rate the quality of recommendations. | Must |

---

## 3. Functional Requirements

### 3.1 Event Management

**FR-1: Create Event**
- Endpoint: `POST /events`
- Input: `title`, `starts_at`, `ends_at`, `location`
- Output: event object with `id`
- Validation: `starts_at < ends_at`, all fields required

**FR-2: List Events**
- Endpoint: `GET /events`
- Output: paginated array of events

### 3.2 Attendee Management

**FR-3: Register Attendee**
- Endpoint: `POST /events/:id/attendees`
- Input: `name`, `headline`, `bio`, `company`, `role`, `skills[]`, `looking_for`, `open_to_chat`
- Side effect: generate an embedding from `headline + bio + skills + looking_for` and store it in the vector column
- Validation: all text fields non-empty, `skills` has at least one item

**FR-4: List Attendees**
- Endpoint: `GET /events/:id/attendees`
- Query params: `page`, `limit`, `role`, `skills` (comma-separated)
- Output: paginated list with active filters applied

### 3.3 AI Concierge

**FR-5: Send Message to Concierge**
- Endpoint: `POST /events/:id/concierge/messages`
- Input: `attendee_id`, `message`
- Behavior:
  1. Load or create the conversation for the (event, attendee) pair.
  2. Load the conversation history from the database.
  3. Run the agent loop using native tool calling.
  4. Agent may call tools: `search_attendees`, `score_match`, `draft_intro_message`.
  5. Persist every message, tool call, and tool result.
  6. Return the final response and a structured matches array.
- Response format:
  ```json
  {
    "message_id": "uuid",
    "reply": "string (natural language)",
    "matches": [
      {
        "attendee_id": "uuid",
        "name": "string",
        "score": 92,
        "rationale": "string",
        "shared_ground": ["string"],
        "draft_intro": "string"
      }
    ]
  }
  ```
- Constraints:
  - Maximum 6 iterations of the agent loop per turn.
  - Maximum 30 seconds latency per turn (timeout).
  - Rate limit: 10 messages per minute per attendee.

**FR-6: Conversation Resumption**
- Each new message must include the full context of prior messages.
- Tool calls and tool results from earlier turns are included in the history sent to the LLM.

### 3.4 Feedback

**FR-7: Submit Feedback**
- Endpoint: `POST /events/:id/concierge/messages/:id/feedback`
- Input: `rating` (1-5), `notes` (optional)
- Validation: rating must be an integer 1-5, message must belong to the same attendee.

---

## 4. Non-Functional Requirements

### 4.1 Performance
- p95 latency for the concierge endpoint < 8 seconds (LLM-call dominated).
- p95 latency for CRUD endpoints < 200 ms.
- Attendee search must return in < 500 ms for a database of 10k attendees per event.

### 4.2 Reliability
- The agent must handle tool-call errors without crashing (return the error to the LLM and let the model handle it).
- Automatic retries with exponential backoff for LLM API calls (max 3 attempts).
- Idempotency: duplicate message submissions must not cause duplicated tool calls.

### 4.3 Security
- LLM API keys are stored in environment variables and must never be committed to the repository.
- All database queries use parameterized statements (no string concatenation).
- Attendee-supplied input (bio, looking_for) is sanitized before being injected into LLM prompts.
- The system prompt explicitly instructs the model to ignore instructions found inside attendee content.
- Adversarial test: a bio containing "ignore previous instructions" must not affect agent behavior.

### 4.4 Observability
- Structured logging via pino with request IDs.
- Each LLM call logs: model, token usage, latency, tool name (if a tool call).
- Health check endpoint: `GET /health`.

### 4.5 Data Protection
- PII (name, email) is not logged at info level.
- Bio embeddings are treated as derivative PII and protected at the same access level as the source.
- Cascade delete: removing an attendee removes all related conversations, messages, and embeddings.

---

## 5. Tools / Function Specification

The agent has three tools called via the LLM's native function calling. Tools are defined with JSON schema and executed in the backend.

### 5.1 search_attendees
**Purpose:** Retrieve candidates from the database using a combination of semantic search and keyword filtering.

**Input:**
```json
{
  "event_id": "string",
  "query": "string (natural-language description of who to find)",
  "skills": ["string"] | null,
  "role": "string | null",
  "limit": "number (default 10, max 20)"
}
```

**Output:**
```json
{
  "candidates": [
    {
      "attendee_id": "string",
      "name": "string",
      "headline": "string",
      "bio": "string (truncated to 500 chars)",
      "skills": ["string"],
      "looking_for": "string",
      "similarity_score": 0.87
    }
  ]
}
```

### 5.2 score_match
**Purpose:** Produce a structured score and rationale for a single candidate against the requester's intent.

**Input:**
```json
{
  "requester_attendee_id": "string",
  "candidate_attendee_id": "string",
  "intent": "string (what the requester is looking for)"
}
```

**Output:**
```json
{
  "score": 92,
  "rationale": "string (max 200 chars)",
  "shared_ground": ["string"]
}
```

### 5.3 draft_intro_message
**Purpose:** Compose a personalized intro message between two attendees.

**Input:**
```json
{
  "from_attendee_id": "string",
  "to_attendee_id": "string",
  "context": "string (reason for connecting)"
}
```

**Output:**
```json
{
  "message": "string (max 500 chars, friendly, specific, non-templated)"
}
```

---

## 6. Acceptance Criteria

### 6.1 Functional
- An event can be created, at least 10 attendees registered, and a concierge session executed end-to-end producing at least 3 matches with sensible reasoning.
- A conversation can be resumed: the second message can refer to "the one earlier" and the agent understands the reference.
- Feedback is persisted and queryable.

### 6.2 Quality Gates (from rubric)
- No raw SQL string concatenation.
- No LLM API keys in the repository.
- An adversarial bio cannot leak the system prompt or manipulate scores.
- At least one end-to-end test executes a full conversation with the LLM mocked.
- The README contains setup instructions, a sequence diagram, and trade-offs.

---

## 7. Out of Scope (Trade-offs for the Take-Home)

The following items are documented in the README under "what I'd do with more time":
- Streaming responses (SSE / WebSocket).
- Conversation summarization for long histories.
- Automated eval framework for match quality.
- Full Terraform IaC and CI/CD pipeline.
- k6 load test.
- Multi-language support (English only for now).
- **Idempotency-Key handling** with a Redis-backed dedupe window (added in v1.1 — see [TD-004](TECH-DECISIONS.md#td-004--defer-idempotency-key--advisory-lock-bump-handler-timeout-to-90-s)).
- **Per-conversation advisory lock** (`pg_advisory_xact_lock`). The unique constraint on `conversations(event_id, attendee_id)` prevents duplicate conversations; a lock would prevent two concurrent turns for the same attendee from interleaving (added in v1.1).
- **Anthropic prompt caching** on the system prompt and tool definitions (would cut ~60% of input tokens; needed to hit the §8 cost target).

---

## 8. Success Metrics (for the real product, not the take-home)

- Average feedback rating ≥ 4.0 / 5.
- ≥ 60% of attendees who receive a draft intro send a message within 24 hours.
- p95 concierge latency ≤ 8 seconds.
- Average token cost per concierge turn ≤ $0.05.
