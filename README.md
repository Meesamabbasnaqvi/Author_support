# Author Support & Communication Portal

A support ticketing system for self-publishing authors and operations team. Authors raise queries about royalties, ISBNs, printing, distribution, and book status. Admins triage, reply, and manage the queue. An AI layer classifies and prioritises incoming tickets and drafts reply suggestions that an admin reviews before anything is sent.

- Backend: `author-api/` (Express 5, TypeScript, Prisma, PostgreSQL)
- Frontend: `author-web/` (React 18, TypeScript, Vite, Tailwind, TanStack Query)
- Architecture decisions: [`author-api/docs/ARCHITECTURE.md`](author-api/docs/ARCHITECTURE.md)
- API reference: [`author-api/docs/API_DOCUMENTATION.md`](author-api/docs/API_DOCUMENTATION.md)d)

---

## 1. Prerequisites

- Node.js 20 or newer
- PostgreSQL 16 (Docker is the simplest option)
- A Google AI Studio API key  
Optional: set `USE_FAKE_AI=true` to run without AI as mock.

## 2. Setup

```bash used 
# Database
docker run --name author-db -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:16
docker exec author-db psql -U postgres -c "CREATE DATABASE author_portal;"

# Backend
cd author-api
cp .env.example .env          # then fill in the values (see section 3)
npm install
npx prisma migrate dev        # applies every migration in prisma/migrations
npx prisma generate
npm run seed                  # loads 10 authors, 18 books, and login accounts
npx tsx src/server.ts         # API on http://localhost:5000

# Frontend (new terminal)
cd author-web
cp .env.example .env
npm install
npm run dev                   # http://localhost:5173, proxies /api to port 5000
```

Open http://localhost:5173.

## 3. Environment variables

Backend, in `author-api/.env` (copied from `.env.example`):

| Variable | Required | Purpose |

| `DATABASE_URL` | yes | PostgreSQL connection string |
| `JWT_SECRET` | yes | Signs login tokens. Use a long random string. |
| `PORT` | no | Defaults to `5000` |
| `FRONTEND_URL` | yes | Allowed origin for CORS |
| `GEMINI_API_KEY` | yes
| `GEMINI_MODEL` | yes | A model shown with available quota on your AI Studio usage page |
| `RESEND_API_KEY` | send email password  | 


## 4. Test accounts

 for admin and author both created account locally,

## 5. Running tests

```bash
cd author-api
npm test          # classification, verifier, worker, workflow, and rule tests
npx tsc --noEmit  # type check

cd ../author-web
npm run build     # type check and production build
```

## 6. How the AI works

The AI does three things and nothing else: it **classifies** a ticket into one of six categories, **scores** its priority, and **drafts** a reply. It never sends messages, changes status, assigns tickets, or calculates royalties.

**Prompt strategy.** Each prompt contains the ticket's subject and description, the knowledge base document for the matched category (`author-api/docs/kb/*.md`, taken from the assignment brief), and a short list of facts loaded from the database (author name, book title, ISBN). The model is told to use only those facts.

**Priority is decided by the server, not the model.** The model proposes a priority, then two rules are applied in code:
- `CRITICAL` is only allowed for an overdue royalty payout, computed from the book's payout data.
- A wrong-ISBN report is raised to at least `HIGH` and is never `CRITICAL`.

**Draft verification.** Before a draft is shown, a verifier checks the figures, dates, ISBNs, timelines, and percentages in the text against the supplied facts. Anything it can't confirm is replaced with an `[ADMIN: verify ...]` placeholder. A reply containing a placeholder cannot be sent, enforced both in the UI and on the server.

**Error handling.** Tickets are created and replied to without the AI. Classification runs in a background worker that claims tickets with a lease, so a slow or crashed worker never leaves a ticket stuck. Failed calls retry after 30 seconds, 2 minutes, and 10 minutes, then the ticket is marked `FAILED`. If a draft fails, the admin sees a message and writes the reply manually.

**Cost control.**
- Prompts include one ticket and one knowledge base document, never the full history or the full knowledge base.
- Drafts are cached per ticket and latest author message. Regenerating a draft is an explicit action.
- Every call is logged in `AiCall` (type, status, duration) without ticket text.
- A daily call cap (`DAILY_AI_CAP` in `src/ai/constants.ts`) limits spend. It is a soft cap: under heavy concurrency it can be exceeded slightly.

## 7. Known limitations

- **Provider quota.** The Gemini free tier has a low daily limit. When it's exhausted, the AI stops working until the quota resets. Tickets and manual replies keep working.
- **Quota errors are retried like any other error.** A 429 should pause the worker instead of spending retries.working on it.. might be fixed soon.
- **Masked sample ISBNs.** For now Ai will show isbn as same as data like 912xxxxx00
- **Ticket-to-book link is optional.** Authors can create a ticket without choosing a book. Those tickets get no book facts, so the AI cannot name a title or ISBN in its draft.
- **Action claims in drafts.** The verifier checks facts, not statements such as "we have escalated this." An admin must review those before sending.
- **Pagination** is not implemented. The ticket list returns all matching tickets, which is fine at the seeded data size. i'll implement.

## 8. What I would do with more time

- Pause the AI worker on 429 and 401 errors, and show an admin banner while it's paused.
- Make the book required when creating an ISBN, printing, or production ticket.
- Add a verifier rule that flags completed-action phrases ("has been escalated", "we have resolved").
- Add pagination and server-side search to the ticket list.
- Run the 25-ticket golden dataset against the live model and publish accuracy numbers.
- Add a test for rollback when a classification write fails mid-transaction.
