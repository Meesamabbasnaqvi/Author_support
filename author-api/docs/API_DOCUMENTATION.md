# Author Support API

**Base URL (local):** `http://localhost:5000`
**Auth:** Bearer JWT from `POST /auth/login`. Send `Authorization: Bearer <token>`.


## Roles

| Role | Can do |

| `AUTHOR` | Create tickets, see own tickets, read and reply to own ticket threads |
| `ADMIN` | See all tickets, reply, change status, category, and priority, draft AI replies, view stats |

## Auth

### `POST /auth/login`

```json
{ "email": "author@example.com", "password": "..." }
```

**200**

```json
{ "token": "<JWT>", "user": { "id": 2, "email": "author@example.com", "role": "AUTHOR" } }
```

**401** for invalid credentials. **400** if validation fails.

### `POST /auth/register`

Creates a login for an existing author. The name and email must match an `Author` record. Authors cannot create their own profile.

**201** on success. Use `POST /auth/login` to get a token. Registration does not return a token.

**Errors:** `400` for invalid input, `409` or `400` if the email already has an account which, `404` or `400` if no matching author exists.

### `GET /auth/me`

Returns the user for the token. **Auth:** any signed-in user.

### Password reset

`POST /auth/forgot-password` and `POST /auth/reset-password`. Confirm these exist and document their bodies before submitting.

---

## Tickets

### `POST /tickets`

**Access:** `AUTHOR`

- `subject`: 3 to 200 characters
- `description`: 10 to 5000 characters
- `bookId`: optional. If given, the book must belong to the author.
- Category and priority are set by the AI in the background. They start as `GENERAL_INQUIRY` and `MEDIUM` until classification runs.

### `GET /tickets`

**Access:** `AUTHOR` (own tickets) and `ADMIN` (all tickets)

Query parameters, all optional:

| Parameter | Values | Notes |
| `status` | `OPEN`, `IN_PROGRESS`, `RESOLVED`, `CLOSED` | |
| `priority` | `CRITICAL`, `HIGH`, `MEDIUM`, `LOW` | |
| `category` | see categories below | |
| `unassigned` | `true` or `false` |


**200** returns an array. Each item includes the ticket, its author, its book if any, the assigned admin if any, and only the latest message. The full thread is returned by `GET /tickets/:id`.

### `GET /tickets/stats`

**Access:** `ADMIN` only. Mounted before `/tickets/:id` so `stats` is not read as an ID.

**200**



`byPriority` counts only tickets that are not `CLOSED`.

### `GET /tickets/:id`

**Access:** ticket owner or `ADMIN`. Returns the ticket with its full message thread, AI fields, and audit history for admins. Internal notes are only returned to admins, if the endpoint includes them (**VERIFY**).

**404** if the ticket doesn't exist or isn't visible to the caller.

### `GET /tickets/:id/messages`

**Access:** ticket owner or `ADMIN`. Returns messages in order, oldest first.

### `POST /tickets/:id/messages`

**Access:** ticket owner or `ADMIN`

- `content`: 1 to 5000 characters after trimming
- **400** if the content contains `[ADMIN:` (any case). Admins must resolve the placeholder first.
- **400** if the ticket is `CLOSED` (**VERIFY**).

**201** returns the created message.

### `PATCH /tickets/:id/status`

**Access:** `ADMIN`

Allowed transitions:

| From | To |
| `OPEN` | `IN_PROGRESS`, `RESOLVED`, `CLOSED` |
| `IN_PROGRESS` | `OPEN`, `RESOLVED`, `CLOSED` |
| `RESOLVED` | `IN_PROGRESS`, `OPEN`, `CLOSED` |
| `CLOSED` | none |

Reopening a `RESOLVED` ticket (to `IN_PROGRESS` or `OPEN`) requires a `reason` of at least 10 characters after trimming.

- `expectedStatus` is optional but recommended. If the ticket's current status doesn't match, the response is `409`.
- Every change is recorded in the status audit log.

### `PATCH /tickets/:id/category`

**Access:** `ADMIN`



- Categories: `ROYALTY_PAYMENTS`, `ISBN_METADATA`, `PRINTING_QUALITY`, `DISTRIBUTION_AVAILABILITY`, `BOOK_STATUS_PRODUCTION`, `GENERAL_INQUIRY`
- Sets the category source to `ADMIN`, so the AI will not overwrite it.
- Writes a field audit row unless the value is unchanged.
- **409** on `expectedCategory` mismatch.

### `PATCH /tickets/:id/priority`

**Access:** `ADMIN`

Set a value:

```json
{ "priority": "HIGH", "expectedPriority": "MEDIUM" }
```

Or accept the AI's suggestion:

```json
{ "useAiSuggestion": true, "expectedPriority": "MEDIUM" }
```

- `useAiSuggestion` and `priority` cannot be sent together (**400**).
- `useAiSuggestion` returns **400** if the AI has not produced a priority yet.
- Sets the priority source to `ADMIN`, so the AI will not overwrite it.
- **409** on `expectedPriority` mismatch.

### `POST /tickets/:id/draft`

**Access:** `ADMIN`

Generates an AI reply suggestion for the author's latest message.

```json
{ "regenerate": false }
```

- With `regenerate: false` (the default), a draft already generated for the same author message is returned from cache, with no AI call.
- `regenerate: true` forces a new AI call.

**200**


- `placeholders` lists values the admin must fill in before sending.
- **429** if the daily AI cap has been reached.
- **502** if the AI call failed. The admin can write the reply manually.

### Internal notes (**VERIFY**)

Notes are visible only to admins and stored separately from messages. Confirm the route path and request body before documenting them here.

---

## Enum reference

| Name | Values |
| Role | `AUTHOR`, `ADMIN` |
| Status | `OPEN`, `IN_PROGRESS`, `RESOLVED`, `CLOSED` |
| Priority | `CRITICAL`, `HIGH`, `MEDIUM`, `LOW` |
| Category | `ROYALTY_PAYMENTS`, `ISBN_METADATA`, `PRINTING_QUALITY`, `DISTRIBUTION_AVAILABILITY`, `BOOK_STATUS_PRODUCTION`, `GENERAL_INQUIRY` |
| Field source | `DEFAULT`, `AI`, `ADMIN` |
| AI status | `PENDING`, `DONE`, `FAILED` |
