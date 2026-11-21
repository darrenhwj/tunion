# TUnion

A university-specific Computer Science peer learning community. Students help students through discussions, shared resources, tutoring, and study groups. **All academic explanations are human-contributed. There are no AI features.**

> Local hackathon demo, not a production deployment. Authentication is a **demo account switcher only and is not secure.**

## Requirements
- Node.js >= 22.13 (uses the built-in `node:sqlite`; developed on Node 26)
- npm >= 10

## Setup
```bash
npm install
cp apps/api/.env.example apps/api/.env   # optional
npm run dev
```
- Web: http://localhost:5173
- API: http://localhost:3001 (also reachable at `/api/*` through the Vite proxy)

The SQLite file is created at `apps/api/data/tunion.db` and seeded automatically on first `npm run dev`. It is git-ignored.

## Commands
| Command | What it does |
|---|---|
| `npm run dev` | Run API and web together |
| `npm run dev:api` / `dev:web` | Run one side only |
| `npm run db:migrate` | Apply schema |
| `npm run db:seed` | Wipe and re-seed demo users/courses/tutors (repeatable) |
| `npm run db:reset` | Alias of seed (full wipe + reseed) |
| `npm run typecheck` | Typecheck all workspaces |
| `npm run build` | Production build of the web app |

## Layout
```
apps/web/          React + Vite + Tailwind frontend
apps/api/          Express + SQLite backend
packages/shared/   Shared TypeScript types and API contracts
AGENTS.md          Shared instructions for Claude Code and Codex (CLAUDE.md symlinks to it)
```

## API (current)
`GET /api/health`, `GET /api/users[/:id]`, `GET /api/courses[/:id]`, `GET /api/demo-auth/accounts`, `GET /api/me` (header `x-demo-user-id`). Contracts live in `packages/shared/src/index.ts`.

## Demo accounts
Seeded: 2 students, 2 tutors, 1 TA, 1 admin (`*@demo.tunion.edu`). Pick one in the header dropdown.

## Configuration
`PORT` (default 3001) and `DATABASE_PATH` via `apps/api/.env` or environment. Never commit `.env` files.
