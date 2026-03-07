# Project SNARL Web

Next.js webapp for an LLM-powered interactive fiction system (D&D campaign). Players chat with "Fragment" — an in-character AI librarian powered by Claude via AWS Bedrock, with RAG over a markdown knowledge base and a two-stage puzzle system.

## Tech Stack

- Next.js 16 (App Router), TypeScript, Tailwind CSS
- Auth: NextAuth.js v5 (credentials provider)
- Database: Vercel Postgres (Neon) via Drizzle ORM
- LLM: Claude via AWS Bedrock (`@ai-sdk/amazon-bedrock` + Vercel AI SDK)

## Key Directories

- `src/app/api/chat/route.ts` — main chat endpoint (streaming + tool use)
- `src/lib/` — knowledge base, system prompt, puzzle logic, auth config
- `src/db/` — Drizzle schema and connection
- `src/components/` — React UI components
- `knowledge/` — markdown files for RAG (public/ and restricted/)

## Code Review

Run the `code-reviewer` agent (`.claude/agents/code-reviewer.md`) before committing or opening a PR. Invoke it proactively when:
- A feature or bugfix is complete and ready to commit
- Before creating a pull request
- After a large refactor

## Commands

- `npm run dev` — local dev server
- `npm run build` — production build
- `npm run db:push` — push schema to database
- `npm run db:generate` — generate migrations
