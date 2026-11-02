# BookLeaf Author Support, frontend

React, TypeScript, Vite and Tailwind. The frontend reads authors, books, tickets, messages and internal notes from the Express API.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173

Start the backend in a second terminal:

```bash
cd ../author-api
npx prisma migrate deploy
npx tsx src/server.ts
```

The backend runs on http://localhost:5000 and the Vite development server proxies `/api` requests to it.

- **Authors:** register at `/sign-up` using the name and email from the seeded author data, then sign in at `/sign-in`.
- **Support team:** sign in at `/support/sign-in` with an administrator account.

## Screens

| Area | Route | What it does |
|---|---|---|
| Home (author) | `/home` | Pending royalty, next payout, tickets that need attention, books |
| My books | `/books` | Genre, publication date, status, MRP, sales, earned, paid, pending |
| My tickets | `/tickets` | Grouped into new replies, open and closed. Refreshes every 10 s |
| Raise a query | `/tickets/new` | Matching answers appear while typing, before the query is sent |
| Ticket (author) | `/tickets/:id` | Chat thread, progress steps, reply box |
| Dashboard (team) | `/admin` | Counts that link into the queue, most urgent tickets |
| Ticket queue (team) | `/admin/queue` | Filters for status, priority, category and date. Filters live in the URL |
| Ticket (team) | `/admin/tickets/:id` | Thread, reply composer with AI draft, status, priority, category, author, internal notes |

## Rules the UI follows

- The AI draft is shown only to the support team and must be reviewed before it is sent.
- Each gap in a draft (for example `[ADMIN: confirm bank details status]`) must be filled in. Nothing else blocks Send.
- Internal notes are shown to the support team only.
- Royalty figures are displayed as received. The UI never calculates them.
- Priority and category changes by a person are labelled "Changed by you".
- Authors never see priority, the AI draft or internal notes.

## Known gaps in this build

- AI draft text is currently generated from the loaded ticket facts until an AI service is connected.
- The author thread refetches the ticket and its messages every 10 seconds.
- The file attachment control is UI only.
- The build has not been run in the environment where this code was written. Run `npm run build` and send any errors.
