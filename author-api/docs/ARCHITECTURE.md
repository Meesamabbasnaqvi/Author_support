# Author Support & Communication Portal — Architecture

> **Before you commit this:** this document is written from the actual decisions we made and the actual code reviewed over the course of building this project — not from the original planning doc, which described a different stack (Next.js, Anthropic SDK, express-session) that was abandoned early on. Every section below reflects what was actually built. Read it once against your current code before pushing; a few details (exact rate-limit numbers, the final list of indexes, whether the read-rate-limiter work landed) were drafted but not independently re-verified against your latest files, and are flagged inline where that applies.

## 1. System overview

Two portals, one backend:

- **Author portal** — register/login, view books with royalty figures, submit a support ticket, view "My Tickets" with near-real-time updates on admin replies.
- **Admin portal** — a ticket queue across all authors (filterable by status/priority/category), AI-assisted classification and priority scoring (overridable), AI-drafted reply suggestions (editable before sending), manual status changes, internal notes, self-assignment.
- **REST API** — JWT-authenticated, role-scoped (`AUTHOR` / `ADMIN`), Zod-validated, with structured error responses.
- **AI layer** — a background worker that classifies tickets and drafts reply suggestions. It never sends a message, never changes ticket status, and never assigns a ticket — every AI output is either a suggestion an admin can accept/edit/discard, or a field value the admin can immediately override.

## 2. Technology choices and why

| Layer | Choice | Why |
| Database | PostgreSQL | Relational data with real foreign keys, enums, and transactional guarantees — needed for the atomic multi-field ticket updates described in §5. |
| ORM | Prisma | Typed queries and migrations; custom generator output path (`generated/prisma`) rather than the default `node_modules` location. |
| API | Node.js, Express 5, TypeScript | Express 5 forwards thrown errors from async route handlers to the error middleware automatically, which removed a class of unhandled-rejection bugs we'd otherwise have to guard manually in every route. |
| Validation | Zod | One schema per route input; schemas double as the single source of truth for what's "valid," so API docs and validation never drift apart the way hand-written docs do. |
| Auth | JWT (bearer token) + bcryptjs for password hashing | Stateless auth, no server-side session store to provision. `RevokedToken` 
| AI provider | Google Gemini, called directly via REST (`x-goog-api-key` header) | See §5 for the full rationale and the failure modes we hit getting here. |
| Background processing | In-process polling worker (no external queue) | No extra infrastructure (no Redis/SQS) for a workload this size; tickets are claimed with `FOR UPDATE SKIP LOCKED` so multiple workers/instances can't double-process the same ticket. |
| Frontend | React 18 + TypeScript + Vite | — |
| Data fetching | TanStack Query with polling (`refetchInterval`) | Satisfies the brief's "near-real-time" requirement for ticket updates without the operational cost of WebSockets for a ticket-support use case where a few seconds of staleness is fine. |
| Styling | Tailwind | — |
| Tests | Vitest (+ Supertest where routes are exercised directly) | — |

## 3. Data model

Core entities: `Author`, `Book`, `User` (linked 1:1 to an `Author` when the user's role is `AUTHOR`), `Ticket`, `TicketMessage`, `InternalNote`.

AI- and audit-related additions on top of the base ticket schema:

- `Ticket.category` / `Ticket.priority` — the **active** values shown everywhere in the UI.
- `Ticket.aiCategory` / `Ticket.aiPriority` — a **permanent record** of what the AI originally classified, written once and never overwritten, kept separate from the active fields so "what did the AI think" is always answerable even after an admin overrides it.
- `Ticket.categorySource` / `Ticket.prioritySource` / `Ticket.statusSource` — a `FieldSource` enum (`DEFAULT` / `AI` / `ADMIN` / `RULE`) recording who last set the active value. The rule enforced everywhere: once a field's source is `ADMIN`, the AI must never overwrite it again.
- `Ticket.aiStatus`, `aiAttempts`, `aiNextAttemptAt`, `aiLeaseToken`, `aiLeaseExpiresAt` — worker bookkeeping for the claim/retry/lease mechanism described in §5.
- `TicketFieldAudit` — one row per admin-initiated category/priority change (field, old value, new value, admin, timestamp). No-op changes (admin sets a field to the value it already had) still promote the source to `ADMIN` but don't write an audit row.
- `TicketStatusAudit` — one row per status change, with a required reason when reopening a `RESOLVED` ticket.
- `TicketDraft` — caches a generated draft reply keyed by `(ticketId, authorMsgId)`, so re-opening a ticket doesn't re-call the AI for a draft that's already been generated for the same message; regeneration requires an explicit `{ regenerate: true }`.
- `AiCall` — logs every classify/draft call's type, status, and duration for cost/usage visibility — no ticket content or PII stored, by design (see §5.4).

Indexes beyond the primary keys: `[authorId, updatedAt]` and `[status, priority, createdAt]` on `Ticket` for the queue view, `[aiStatus, aiNextAttemptAt]` for the worker's polling query, `[ticketId, id]` on `TicketMessage` for ordered thread reads. *(Composite indexes on `[category, createdAt]` and `[priority, createdAt]` were drafted for filtered-list queries — confirm whether that migration actually ran before claiming it here.)*

## 4. API design

- Every protected route requires `Authorization: Bearer <JWT>`.
- Role checks happen in middleware, not scattered through route bodies.
- Authors are scoped to their own data at the query level (`WHERE authorId = ...`), not filtered client-side — an author's list-tickets query can never accidentally return another author's rows regardless of what the frontend does with the response.
- Status/category/priority changes go through a **check-then-transact** pattern: the server compares the client's `expected*` value against the current database value before applying a change, returning `409 CONCURRENT_MODIFICATION` on a mismatch (optimistic concurrency, so two admins editing the same ticket at once don't silently clobber each other).
- Ticket status transitions are constrained by an explicit state machine (`OPEN → {IN_PROGRESS, RESOLVED, CLOSED}`, etc.) enforced server-side, not just in the UI; reopening a `RESOLVED` ticket requires a reason of at least 10 characters.
- Full endpoint list and request/response contracts: see `API_DOCUMENTATION.md` (or your OpenAPI/Postman export, if you added one).

## 5. AI integration
used gemeini api to integrate AI added error handling 4 times so that if limit reach ai can stop
The system allows a maximum of 4 attempts (1 initial try + 3 retries at 30s, 2min, 10min delays). Once 4 attempts are exhausted, it stops and marks the ticket FAILED.

### 5.1 Scope — what the AI is and isn't allowed to do

Three jobs, no more:

1. **Classify** a new ticket into one of six categories (`ROYALTY_PAYMENTS`, `ISBN_METADATA`, `PRINTING_QUALITY`, `DISTRIBUTION_AVAILABILITY`, `BOOK_STATUS_PRODUCTION`, `GENERAL_INQUIRY`).
2. **Score priority** (`LOW` / `MEDIUM` / `HIGH` / `CRITICAL`) as a function of category plus ticket signals.
3. **Draft a reply** grounded in a BookLeaf knowledge base and the ticket's own facts.

The AI never sends a message, never changes ticket status, never assigns a ticket, and never calculates a royalty figure. Every one of its outputs is either an editable suggestion or a value an admin can immediately overwrite — this was a deliberate boundary, not an oversight, specifically so a bad classification or a hallucinated draft can't reach an author without a human in the loop.

### 5.2 Prompt strategy and knowledge base

The AI's factual grounding comes from a set of per-category knowledge base documents (`docs/kb/*.md`) sourced directly from the assignment brief's own knowledge base and tone guidance — each document states the relevant policy, how to answer, and a calibration Q&A pair. The classify/draft prompts are built from: the ticket's subject and description, the relevant KB document for its category, and specific server-supplied facts (e.g., the book's actual title and production stage) rather than letting the model invent them. Priority is never left purely to the model's judgment — two hard rules are enforced server-side regardless of what the model proposes: `CRITICAL` is reserved strictly for overdue royalty payouts (computed from the book's actual payout data, not keyword-matched from ticket text), and a wrong-ISBN report is clamped to at least `HIGH` but never `CRITICAL`.

A draft reply is passed through a verifier before being shown to an admin: it checks specific fact-bearing tokens in the generated text (currency figures, dates, ISBN-shaped numbers, timelines, percentages) against the facts actually supplied to the model and the author's own prior messages. Anything the verifier can't confirm is replaced with an `[ADMIN: verify ...]` placeholder, and a ticket containing any such placeholder cannot be sent — enforced both in the UI (the send button is disabled) and server-side (the messages endpoint rejects it), so a hallucinated fact can't slip through because someone clicked send without reading carefully.

### 5.3 Error handling and graceful degradation

Ticket creation and admin replies do not depend on the AI in any way — both work identically whether the AI is healthy, slow, or completely down, because classification and drafting run asynchronously against an already-created ticket rather than blocking it. If a draft-generation call fails, the admin sees an error and can still write and send a manual reply; nothing about the ticket conversation itself requires the AI to be reachable.

The worker processes tickets in a claim → call model → write batches with a lease token and expiry, so a crashed or slow worker never leaves a ticket stuck mid-processing — another pass can reclaim it once the lease expires. Failed classify/draft calls retry on a backoff schedule (30s, 2min, 10min) before the ticket is marked `FAILED` and surfaced for manual handling.


### 5.4 Cost awareness

- Prompts are built from the single ticket in question plus its matched KB document — not the full ticket history or the entire knowledge base on every call.
- Draft generation is cached per `(ticket, latest author message)` — reopening a ticket or re-rendering the admin view does not re-trigger a model call; regeneration is explicit and admin-initiated.
- Every AI call is logged (`AiCall`: type, status, duration) without storing ticket content, giving visibility into call volume without creating a second copy of potentially sensitive author/royalty data.


## 6. Known limitations

- AI handling quota/auth errors.
- Pagination on the ticket list was deliberately deferred — not needed at the current/tested data scale, but would be required before this could handle a materially larger ticket volume.
- The daily AI-call cap is soft under concurrent load.
What is still missing: There is no limit/offset or cursor-based pagination in either GET /tickets or the UI tables. The endpoint currently returns all matching records in a single array:

## 7. What I'd do with more time

- Make worker failure handling 429/401-aware (pause instead of retry) rather than treating all failures identically.
- Add real pagination and server-side filtering to the ticket list for scale beyond the seed dataset.
- Run the full AI-accuracy golden dataset against the real provider (not just the deterministic fake client) and record actual classification accuracy.
- Add the atomic-write rollback test proving a mid-transaction failure during AI classification can't leave a ticket in a half-updated state.