# AGENTS.md

## Stack

- Plain HTML/CSS/JS frontend (no framework, no build step) + Node serverless functions in `api/` (Vercel auto-detects them). **CommonJS**, matching markdown-blog and lahore-weather.
- Database: **Neon Postgres** (serverless Postgres — what "Vercel Postgres" became in Q4 2024–Q1 2025; the old `@vercel/postgres` SDK is deprecated). Provisioned via the Vercel Marketplace Neon integration. Runtime dependency: `@neondatabase/serverless` — pinned exactly, version checked from the registry at install, never from memory. Env var `DATABASE_URL` (injected by the integration, mirrored into `.env.local` for dev).
- Tests: Node's built-in test runner (`node:test`) — no test framework dependency.
- Formula: GitHub + Vercel + OpenCode. Repo: https://github.com/KarimShaikh123/url-shortener (private). Live: (set at deploy).

## The schema (designed by Karim — do not change without his approval)

```
links — one row per short link
  slug        TEXT         primary key — the unique label, what the redirect looks up
  url         TEXT         where it points
  created_at  TIMESTAMPTZ  default now() — enables newest-first listing

clicks — one row per click
  slug        TEXT         which link got hit → references links.slug (ON DELETE CASCADE)
  clicked_at  TIMESTAMPTZ  default now() — the per-click timestamp
```

- Indexes: `clicks_slug_idx` on `clicks(slug)`, `clicks_clicked_at_idx` on `clicks(clicked_at)`.
- Totals and daily trends are COMPUTED from `clicks`, never stored:
  - total per link: `SELECT slug, COUNT(*) FROM clicks GROUP BY slug`
  - daily trend: group clicks by `DATE(clicked_at)`
  - list newest-first: `ORDER BY created_at DESC`
- Source of truth: `db/schema.sql`. The stats API and page must match this contract.
- The `clicks` table has no primary key — an open decision for Karim (surrogate `id` column, or none).

## Commands

- Install: `npm install`
- Local dev: `npx vercel dev` (needs populated `.env.local`)
- Syntax check: `node --check <file>` (one file at a time)
- Tests: `npm test` (the `test` script is `node --test`, discovers `test/*.test.js`)
- Deploy: push to `main` (auto), or `npx vercel --prod`
- Verify a deploy: read the live page content — never a status code alone

## Files

- `db/schema.sql` — the schema, source of truth
- `api/create.js` — POST /api/create
- `api/redirect.js` — the 302 + click recording (rewritten from /:slug)
- `api/stats.js` — GET /api/stats
- `index.html` + `js/create.js` — the create form
- `stats.html` + `js/stats.js` — the stats page
- `styles.css` — house tokens
- `sample-stats.json` — mock data for the shell; task 5 swaps it for the real API

## Conventions

- Design tokens in `:root` in `styles.css` — reuse these, never raw hex.
- Fonts: Manrope (body) + DM Mono (labels/buttons) via Google Fonts.
- No code comments unless asked.
- One concern per file in `js/`, one concern per function in `api/`.
- Keep the Neon client construction inside the handler; tests must not construct a client when env vars are unset.

## Rules

- A 200 status proves a server answered; only content proves it is the right site.
- When stating a fact (versions, URLs, deploy targets), say what was checked versus assumed.
- One task, one commit, one review; nothing committed before the owner reviews. Branch + PR per feature.
- Commit identity: Karim Shaikh <karimhshaikh009@gmail.com>.
- Keep this file and README updated in the same commit as any structural change.

## Project status

Living checklist — update the tick in the same commit that completes the task.

- [x] Task 0 — Scaffold (2026-08-17): repo, AGENTS.md, README, schema.sql, static shell (create form + stats page with mock data), pinned @neondatabase/serverless 1.1.0
- [ ] Task 1 — Provision Neon Postgres + apply schema + probe
- [ ] Task 2 — POST /api/create + tests
- [ ] Task 3 — Redirect + click recording + tests
- [ ] Task 4 — GET /api/stats + tests
- [ ] Task 5 — Wire the site to the APIs
- [ ] Task 6 — Rate limit + security audit + deploy
