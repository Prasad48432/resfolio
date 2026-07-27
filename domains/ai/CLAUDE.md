# @resfolio/ai — the AI domain

Saved Resfolio AI chat sessions, and nothing else
(`docs/architecture/13-ai-layer.md`, Phase 7).

## What this package is not

**It is not where the AI lives.** Prompts, provider selection, the guard ladder,
the tool definitions and every model call stay in `apps/dashboard/lib/ai/`, where
the product decisions are. This package exists for one reason: persistence means a
table, and only a domain package may touch one (doc 06). Doc 13 spent six phases
correctly _not_ creating a `@resfolio/ai`; naming a package after a technology is
how it becomes a drawer.

So: if the thing you are adding calls a model, reads an env var, or writes a
prompt, it does not go here.

## The one rule

**A stored transcript is a record, never context.** Nothing reads
`ai_chat_sessions` on the way to a provider — the model's context is still built
per request from the Profile and the turns the client posts
(`lib/ai/chat-request.ts`, `lib/ai/profile-context.ts`). A stored transcript that
fed the next prompt would be a second source of truth about the user's career,
sitting beside the Profile and free to disagree with it.

## Layout

- **Root (`src/index.ts`, pure)** — `sanitizeMessages`, `deriveSessionTitle`,
  `isWorthSaving`, `messageText`, the stored-message schema and the ceilings. No
  database import, so it is safe in a client component and in a test.
- **`./server`** — the only code that touches `ai_chat_sessions`. Every function
  takes `userId` and resolves the profile itself; ownership is enforced here and
  never assumed from the caller.

## Things not to undo

- **`sanitizeMessages` drops reasoning parts before it measures the budget**, and
  that order is load-bearing: a single heavily-reasoned turn must not be able to
  evict real messages from a transcript that fits comfortably without it. Storing
  reasoning would also be a stronger commitment than rendering it — doc 13 renders
  none.
- **Trimming is oldest-first and by whole messages.** Same direction the request
  builder trims in, so a reloaded session and a sent request agree about which end
  of a conversation matters. Never truncate a message: half a message says
  something its author did not.
- **The part schema is loose (`z.looseObject`) on purpose.** A `UIMessage` part is
  an open union owned by the AI SDK and by whichever tools the dashboard defines
  this week. Tightening it makes adding a tool to the app a breaking change in a
  package that has no business knowing the tool exists. The **envelope** — role,
  id, every part naming its type — is what the reader depends on and is what is
  checked.
- **The upsert's `setWhere` is scoped to the owner.** `id` is the conflict target
  _and_ the primary key, so the insert's own `profile_id` never gets a say on
  conflict; without that clause a request naming somebody else's session id would
  update their row. It is `setWhere` (the `WHERE` on `DO UPDATE`), not
  `targetWhere` (which describes a partial index) — drizzle's plain `where` is
  deprecated precisely because the two read alike.
- **`listChatSessions` names its columns.** `messages` is deliberately not among
  them: opening the chat page must not cost every conversation the user has ever
  had.
- **Titles are derived, never generated and never asked for.** A naming dialog is
  a tax on starting a conversation; a model call to name one is paying for a
  summary of something the user is looking at.
- **Ids are client-generated** (a UUID minted when the chat opens), so the first
  save is an upsert like every later one and no turn ever belongs to no session.

## Testing

`pnpm --filter @resfolio/ai test` — the pure half only. The repository has no
integration test yet; when one is added, follow `@resfolio/blog`'s
`*.integration.test.ts` split so `pnpm test` stays database-free.
