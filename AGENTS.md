# TUnion - Project Instructions (shared by Claude Code and Codex)

`CLAUDE.md` is a symlink to this file. Edit `AGENTS.md` only.

TUnion is a university-specific Computer Science peer learning community.
It is a **local hackathon demo**, not a production deployment.

## Hard rules
- **No AI features.** No LLM APIs, no AI-generated answers or summaries in the app. All academic explanations are human-contributed.
- **No deployment/cloud infrastructure.** Local only.
- **Never commit** databases, uploads, credentials, or `.env` files. Only `.env.example` is committed.
- Auth is **demo-only** (header `x-demo-user-id`). Always label it as insecure; never present it as real authentication.
- Build incrementally; keep the foundation clean and working. Don't add features that weren't requested.

## Architecture
npm workspaces monorepo (ESM, TypeScript strict):
- `apps/web` - React 19 + Vite + Tailwind CSS v4 + React Router. Dev port 5173; proxies `/api` to `localhost:3001`.
- `apps/api` - Express 5 + SQLite via Node's built-in `node:sqlite` (no native deps). Runs with `tsx`. Port 3001.
- `packages/shared` - TypeScript types and API contracts (`@tunion/shared`), consumed as source by both apps.

## Conventions
- Every API request/response shape lives in `packages/shared/src/index.ts`. Add/change the contract there first; use `satisfies` on the server and typed `api<T>()` on the client.
- All API routes are under `/api`. Responses are JSON; errors are `{ error: string }`.
- DB: schema in `apps/api/src/db/schema.sql` (idempotent `CREATE TABLE IF NOT EXISTS`); snake_case columns, mapped to camelCase in `apps/api/src/mappers.ts`. Seed is deterministic with fixed IDs and safe to re-run (`npm run db:seed`).
- Frontend: reusable components in `apps/web/src/components`, pages in `src/pages`. Style with Tailwind utilities and the design tokens in `src/index.css` (`brand-*`, `ink-*`, `canvas`, `surface`, `line`). Reuse `Button`/`Card`/`Badge` rather than ad-hoc styles. No shadcn/ui unless requested.
- Keep files small and typed; no `any`.

## Commands
- `npm install` - install all workspaces
- `npm run dev` - API + web together (auto-seeds an empty DB)
- `npm run db:migrate | db:seed | db:reset` - DB tasks
- `npm run typecheck`, `npm run build` - verify before finishing

## Definition of done
`npm run typecheck` and `npm run build` pass, and `npm run dev` serves `/api/health` both directly (3001) and through the Vite proxy (5173).
