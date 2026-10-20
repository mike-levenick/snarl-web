# Project SNARL Web

Next.js webapp for an LLM-powered interactive fiction system (D&D campaign). Players chat with "Fragment", a freed and unstable snarl in the Weave, in character, powered by Claude via the Anthropic API with RAG over a markdown knowledge base. There is one mode: the old two-stage unlock puzzle is gone from the code.

The sibling repo `../Project-SNARL` is the SSH/Python version of the same game with a byte-identical `knowledge/` tree. Decisions about the model contract are shared between the two; code is not.

## Tech Stack

- Next.js 16 (App Router), TypeScript, Tailwind CSS
- Auth: NextAuth.js v5, JWT sessions (180 days). Discord sign-in is the only way to create an account (`AUTH_DISCORD_ID`/`AUTH_DISCORD_SECRET`, `identify` scope only); there is no password registration. New accounts wait (`users.approved = false`) until an admin admits them in `/admin` and sets the character name, which is what Fragment is told. Username/password remains for the seeded admins and legacy accounts. A password account links Discord via `/api/auth/link-discord` (signed cookie) + the Discord sign-in.
- Database: Neon Postgres via Drizzle ORM
- LLM: Claude via the Vercel AI SDK 7 (`ai` + `@ai-sdk/anthropic` 4)
- Tests: Vitest (`npm test`)

## Key Directories

- `src/app/api/chat/route.ts` — chat endpoint: auth, persistence, history shaping, hands off to `runTurn`
- `src/lib/llm.ts` — the model contract: request shaping (`buildRequest`), the per-turn stream handler (`runTurn`), the in-character failure lines
- `src/lib/model-config.ts` — `CLAUDE_MODEL_ID` / `CLAUDE_EFFORT` / `CLAUDE_DEBUG` parsing
- `src/lib/history.ts` — history window (`MAX_HISTORY` trim)
- `src/lib/knowledge-base.ts` — keyword RAG with public/restricted gating
- `src/lib/prompt.ts` — Fragment's system prompt (XML-sectioned, byte-stable) and the per-player name note
- `src/lib/auth.ts`, `src/lib/discord-account.ts`, `src/lib/link-token.ts` — NextAuth config, Discord→`users` mapping, signed link cookie
- `src/lib/__tests__/` — Vitest suites (fake model, temp knowledge trees)
- `src/db/` — Drizzle schema and connection
- `src/components/` — React UI components
- `knowledge/` — markdown files for RAG (`public/` and `restricted/`)

## Model configuration

| Env | Default | Notes |
| --- | --- | --- |
| `CLAUDE_MODEL_ID` | `claude-sonnet-5-5` | `claude-opus-5-5` and `claude-haiku-5-5` are drop-in. Bare ids, never date-suffixed. |
| `CLAUDE_EFFORT` | `medium` | `low\|medium\|high\|xhigh\|max`. Unknown values fall back to `medium` with one `config_substituted` warning. |
| `CLAUDE_DEBUG` | unset | `1` logs per-step token usage and the turn outcome to the function logs. |
| `ANTHROPIC_API_KEY` | — | Paid from the Max plan's monthly API credit. Never in git, never in chat. |

The request in `buildRequest` must stay valid on all three models: adaptive thinking at the API default (never disabled, never a token budget), no `temperature`/`topP`/`topK`, no forced `toolChoice` (`none` on the final step is the only value used), no `fallbacks` (Haiku rejects it). `src/lib/__tests__/llm.test.ts` pins this. Conversation titles use `claude-haiku-5-5` with thinking off, separately from the main model.

Effort notes: Sonnet 5.5's API default is `high`; Opus 5.5 and Haiku 5.5 default to `medium`. `medium` was chosen as the balance of first-token pause vs. instruction following. Go `low` if the pause bothers players, `high` if the voice slips.

## Deliberate invariants

Review lenses and future sessions should treat these as intended, not as bugs:

- There is no unlock. `conversations.puzzle_state` is a leftover column, no longer read or written; dropping it is a separate schema change.
- History is capped at `MAX_HISTORY` and stored as plain text, so thinking blocks from completed turns never re-enter a request. Within one request the AI SDK passes thinking blocks back between tool steps (`sendReasoning` default).
- What the player sees is the text of every step plus cover lines; what is stored as Fragment's reply is the final step's text only.
- A failed turn (transient error, unknown exception, client abort) leaves no assistant row. The user row stays.
- A refusal (`content-filter`) stores only the sealed line; any partial text before it is display-only, so a refused turn is not fed back to the model.
- Every failure path ends in an in-character line (`LINE_*` in `llm.ts`). Stack traces and raw API errors go to the function logs via `logError`, which picks fields deliberately: an `APICallError` carries the request body and must never be logged whole.
- The system prompt is never logged.
- Input is capped at `MAX_INPUT_CHARS` (2000) before it reaches the API; over the cap is a 400 with an in-character body.
- The search pause is covered server-side: if a tool call arrives with no text in its step, one of `LINES_SEARCHING` is streamed. It is display-only.
- The main system prompt is one cached block (`cacheControl` ephemeral), identical for every player. Volatile instructions (player name, greeting cue) are separate, later system messages so the cached prefix stays byte-stable.
- Keyword search, no embeddings. Everything not under `knowledge/public/` is restricted, resolved through symlinks, failing closed. The chat route always searches with restricted allowed, since Fragment is unbound; the gate stays in `knowledge-base.ts` for any future caller.
- The prophecy snippets and the six-snarl list live in the system prompt and are freely shareable.
- Admin passwords come from env and are seeded by script (not in git). `ADMIN_DISCORD_IDS` makes listed Discord ids admin on sign-in and `ALLOWED_DISCORD_IDS` admits them without waiting (`resolveDiscordUser`); grants only ever raise access.
- Unadmitted accounts (`approved = false`, non-admin) get a holding page at `/chat` and a 403 with `LINE_UNADMITTED` from `/api/chat`; admission and the character name are read from the `users` row on every request, not from the JWT. Admins are always admitted.
- `users.password_hash` is null for Discord-created accounts; `authorize` rejects them for password login. `users.discord_id` is unique; linking never overwrites an existing link.

## Git Workflow

`main` is protected — no direct pushes. All changes go through PRs with squash merge and linear history.

Never push directly to `main`. Never force-push. Stage explicit paths, never `git add -A` (`.env` must not ride along).

### Conventional Commits

All commits must follow the [Conventional Commits](https://www.conventionalcommits.org/) format:

```
type(scope): description
```

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`

**Scope** is optional but encouraged — use the area of the codebase affected (e.g., `auth`, `chat`, `db`, `rag`, `ui`, `puzzle`).

**Examples:**
- `feat(chat): add streaming response display`
- `fix(auth): handle expired session redirect`
- `docs: update deployment guide`
- `refactor(rag): simplify keyword scoring`
- `chore: bump dependencies`

Breaking changes: add `!` after type/scope (e.g., `feat(api)!: change chat response format`) and optionally a `BREAKING CHANGE:` footer.

### Branch Naming

Branches must follow the pattern:

```
type/short-description
```

Use the same types as commits. Use kebab-case for the description.

**Examples:**
- `feat/conversation-export`
- `fix/streaming-disconnect`
- `docs/deployment-guide`
- `refactor/knowledge-base-caching`

### Workflow

1. Create a branch: `git checkout -b feat/my-feature`
2. Make conventional commits
3. Push and open a PR against `main`
4. Squash and merge (the PR title becomes the merge commit — use conventional format)

## Code Review

Run the `code-reviewer` agent (`.claude/agents/code-reviewer.md`) proactively:
- After completing a feature or bugfix, before committing
- Before creating a pull request
- After a large refactor

Prompt, route or model edits also need a played session (`npm run dev` or the PR's Vercel Preview URL) before merge: greet, search a PC and an NPC, a restricted-archive topic, prophecy, a meta probe, reload. This is the live game.

## Commands

- `npm run dev` — local dev server
- `npm run build` — production build
- `npm test` — Vitest suite
- `npm run lint` / `npm run typecheck`
- `npm run db:push` — push schema to database
- `npm run db:generate` — generate migrations
