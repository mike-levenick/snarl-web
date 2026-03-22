# Project SNARL Web

Next.js webapp for an LLM-powered interactive fiction system (D&D campaign). Players chat with "Fragment" — an in-character AI librarian powered by Claude via the Anthropic API, with RAG over a markdown knowledge base and a two-stage puzzle system.

## Tech Stack

- Next.js 16 (App Router), TypeScript, Tailwind CSS
- Auth: NextAuth.js v5 (credentials provider)
- Database: Vercel Postgres (Neon) via Drizzle ORM
- LLM: Claude via Anthropic API (`@ai-sdk/anthropic` + Vercel AI SDK), model configurable via `CLAUDE_MODEL_ID` env var (supports Haiku and Sonnet with model-specific prompts)

## Key Directories

- `src/app/api/chat/route.ts` — main chat endpoint (streaming + tool use)
- `src/lib/` — knowledge base, system prompt, puzzle logic, auth config
- `src/db/` — Drizzle schema and connection
- `src/components/` — React UI components
- `knowledge/` — markdown files for RAG (public/ and restricted/)
- `scripts/` — admin seed script and other utilities
- `src/lib/admin-accounts.ts` — single source of truth for admin usernames (used by registration guard + seed script)

## Git Workflow

`main` is protected — no direct pushes. All changes go through PRs with squash merge and linear history.

Never push directly to `main`. Never force-push.

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
5. After squash-merge, always branch from `origin/main` for the next feature

## Code Review

Run the `code-reviewer` agent (`.claude/agents/code-reviewer.md`) proactively:
- After completing a feature or bugfix, before committing
- Before creating a pull request
- After a large refactor

## Commands

- `npm run dev` — local dev server
- `npm run build` — production build
- `npm run db:push` — push schema to database
- `npm run db:generate` — generate migrations
- `npm run db:seed-admins` — seed admin accounts (requires env vars)

## Tool Call Guidelines

When running git commands (add, commit, push) or other shell commands, use **separate tool calls** instead of chaining with `&&`. The permission allowlist matches on command prefix, so `git add ... && git commit ...` only matches the `git add` rule and still prompts for the rest.
