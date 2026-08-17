# AGENTS.md

## Stack

- Plain HTML/CSS/JS frontend (no framework, no build step) + Node serverless functions in `api/` (Vercel auto-detects them). **CommonJS**, matching markdown-blog and lahore-weather.
- Database: **Neon Postgres** (serverless Postgres — what "Vercel Postgres" became in Q4 2024–Q1 2025; the old `@vercel/postgres` SDK is deprecated). Provisioned via the Vercel Marketplace Neon integration. Runtime dependency: `@neondatabase/serverless` — pinned exactly, version checked from the registry at install, never from memory. Env var `DATABASE_URL` (injected by the integration, mirrored into `.env.local` for dev).
- Tests: Node's built-in test runner (`node:test`) — no test framework dependency.
- Formula: GitHub + Vercel + OpenCode. Repo: https://github.com/KarimShaikh123/url-shortener (private). Live: https://url-shortener-gamma-one.vercel.app (auto-deploys on push to `main`; alias of project `personal-e375/url-shortener`).

## The schema (designed by Karim — do not change without his approval)

```
links — one row per short link
  slug        TEXT         primary key — the unique label, what the redirect looks up
  url         TEXT         where it points
  created_at  TIMESTAMPTZ  default now() — enables newest-first listing
  owner       TEXT         owner key of the browser that created it (NULL on legacy rows)

clicks — one row per click
  id          BIGINT       generated identity — every row's primary key
  slug        TEXT         which link got hit → references links.slug (ON DELETE CASCADE)
  clicked_at  TIMESTAMPTZ  default now() — the per-click timestamp
```

- Indexes: `links_owner_idx` on `links(owner)`, `clicks_slug_idx` on `clicks(slug)`, `clicks_clicked_at_idx` on `clicks(clicked_at)`.
- Totals and daily trends are COMPUTED from `clicks`, never stored, and always scoped to one owner (`WHERE owner = <key>`, totals/daily JOIN through the owner's links):
  - total per link: `SELECT slug, COUNT(*) FROM clicks GROUP BY slug`
  - daily trend: group clicks by Karachi day — `to_char(clicked_at AT TIME ZONE 'Asia/Karachi', 'YYYY-MM-DD')`, never bare `DATE(clicked_at)` (session-timezone dependent)
  - list newest-first: `ORDER BY created_at DESC`
- Source of truth: `db/schema.sql`. The stats API and page must match this contract.

## Commands

- Install: `npm install`
- Local dev: `npx vercel dev` (needs populated `.env.local`). The Vercel CLI is NOT on PATH in this environment — pin it from the root AGENTS.md: `~/.npm/_npx/69f9afb961c37556/node_modules/.bin/vercel`, or `npx vercel` from the repo dir.
- Ad-hoc DB scripts/probes: `node --env-file=.env.local -e "..."` (or a temp script) run from the repo dir — reads `DATABASE_URL` from `.env.local`; never embed a connection string in a script.
- Syntax check: `node --check <file>` (one file at a time)
- Tests: `npm test` (the `test` script is `node --test`, discovers `test/*.test.js`)
- Apply schema: `npm run db:migrate` (reads `db/schema.sql`, runs statements one at a time against Neon using `DATABASE_URL` from `.env.local`)
- Deploy: push to `main` (auto), or `npx vercel --prod`
- Verify a deploy: read the live page content — never a status code alone

## Neon Postgres (provisioned + verified live 2026-08-17, task 1)

- Provision: `vercel install neon/neon --plan free_v3 --name url-shortener --json`. Plan slug is **`free_v3`**, not `free` (the CLI rejects `free`). First run prints a terms-acceptance URL and waits for the browser; the store name on Neon's side is `rough-lab-46063816`.
- Connect to the project (this injects the env vars): `vercel integration-resource connect url-shortener url-shortener --yes`. Pass both the resource name and the project name — `--yes` skips the prompt; the resource resolves by name, not by store id.
- Env vars injected (all 3 environments, mirrored into `.env.local` via `vercel env pull .env.local`): `DATABASE_URL` (what the SDK reads), `DATABASE_URL_UNPOOLED`, `NEON_PROJECT_ID`, `NEON_AUTH_BASE_URL`, `PG*`/`POSTGRES_*` legacy names. `VERCEL_OIDC_TOKEN` is the short-lived link token — never commit `.env.local`.
- `@neondatabase/serverless@1.1.0` facts (checked the installed package + live probes, not assumed): CommonJS works (`const { neon } = require('@neondatabase/serverless')`); `neon(process.env.DATABASE_URL)` returns a tagged-template function — call as `sql\`...\`` or `sql.query("SELECT ... $1", [param])`; the old `sql("q", [params])` form **throws**. The Neon HTTP endpoint rejects **multiple commands in one call** — `db/migrate.js` splits `schema.sql` on `;` and runs each statement separately (all `IF NOT EXISTS`, so idempotent). **`COUNT(*)` returns a string** — coerce with `Number()` before numeric comparison. `timestamptz` returns a JS `Date`; casting to `::date` parses as local midnight (Asia/Karachi, UTC+5) so `.toISOString()` shifts a day — task 4 formats instead: `to_char(clicked_at AT TIME ZONE 'Asia/Karachi', 'YYYY-MM-DD')` for buckets, UTC+5 shift + `toISOString` for timestamps.
- **Timezone rule (pinned 2026-08-17): every date is Lahore local — `Asia/Karachi`, UTC+5, no DST** (Pakistan observes no DST; same fact lahore-weather verified). Day boundaries are Karachi days, never UTC: task 4 buckets with `clicked_at AT TIME ZONE 'Asia/Karachi'`. Every date the API returns carries an explicit `+05:00` offset in its ISO string, and the stats page labels its timezone so a viewer never has to guess. Stored values stay `timestamptz` (absolute instants); only display/bucketing uses the Lahore view. Foreign key `ON DELETE CASCADE` verified live (deleting a link removes its clicks).

## Ownership (task 7, 2026-08-17 — chosen by Karim over a shared password gate and over real accounts)

- Anonymous ownership — no accounts, no passwords, no signup. On first visit the browser generates a key (`crypto.randomUUID()`, fallback 16 random bytes hex), stores it in `localStorage["owner-key"]`, and sends it with every request: `owner` in the `/api/create` body, `Authorization: Bearer <key>` on `/api/stats`.
- `js/owner-key.js` owns key generation — loaded before `create.js`/`stats.js` on both pages, sets `window.ownerKey`.
- Key validation (both endpoints): 32–36 chars of `[0-9a-f-]`. Stats with a missing/invalid key → 401; create with a missing/invalid owner → 400.
- The key IS the identity: whoever holds it sees those links. Clearing localStorage loses the links — no recovery by design at this stage.
- Legacy rows (created before task 7) have `owner NULL`: they still redirect but appear in no one's stats.
- Mass-creation abuse is Task 6's rate limit to blunt.

## Routing on Vercel (needed by task 3)

- Vercel resolves filesystem first, then `redirects`, then `headers`, then `rewrites` (per Vercel docs, verified live 2026-08-17). So static files always win over our rewrites: `/index.html`, `/styles.css`, `/js/*`, and (via `cleanUrls`) `/stats` keep working while `/:slug` only catches paths that are not real files — i.e. exactly the slugs.
- Wire the catch-all in `vercel.json`: `"rewrites": [{ "source": "/:slug", "destination": "/api/redirect" }]`.
- `api/redirect.js` contract (task 3): look up `links` by slug, `INSERT` a row into `clicks`, answer `302` with `Location: <url>`; unknown slug → `404`. Head requests do not count clicks.
- Gotcha: if a slug ever equals a real path (e.g. a link named `styles.css`), the static file wins — fine for this project, do not "fix" it.

## Files

- `vercel.json` — routing/config: static output, `cleanUrls`, nosniff header, and (task 3) the `/:slug → /api/redirect` rewrite
- `db/schema.sql` — the schema, source of truth
- `db/migrate.js` — applies `schema.sql` to Neon (run via `npm run db:migrate`)
- `api/create.js` — POST /api/create (tags the link with the owner key)
- `api/redirect.js` — the 302 + click recording (rewritten from /:slug, see Routing section)
- `api/stats.js` — GET /api/stats (owner-scoped, requires the bearer key)
- `api/delete.js` — DELETE /api/delete?slug=<slug> (owner-scoped, requires the bearer key)
- `index.html` + `js/create.js` — the create form
- `stats.html` + `js/stats.js` — the stats page
- `js/owner-key.js` — get-or-generate the owner key in localStorage (both pages load it first)
- `styles.css` — house tokens

## Conventions

- Design tokens in `:root` in `styles.css` — reuse these, never raw hex.
- Fonts: Manrope (body) + DM Mono (labels/buttons) via Google Fonts.
- No code comments unless asked.
- One concern per file in `js/`, one concern per function in `api/`.
- Keep the Neon client construction inside the handler; tests must not construct a client when env vars are unset.

## Rules

- A 200 status proves a server answered; only content proves it is the right site.
- When stating a fact (versions, URLs, deploy targets), say what was checked versus assumed.
- One task, one commit, one review — nothing committed before the owner reviews. Commit direct to `main` after in-chat review (Karim, 2026-08-17): no branches, no GitHub PRs; the in-chat diff IS the review artifact.
- Never background `vercel dev` in a way that loses cwd — it silently falls back to the home dir, creates a stray `~/.vercel` linked to a junk project, and serves 404s. If that happens: delete `~/.vercel`, kill the process, restart from the repo dir (pin cwd inside the backgrounded subshell).
- Commit identity: Karim Shaikh <karimhshaikh009@gmail.com>.
- Keep this file and README updated in the same commit as any structural change.

## Project status

Living checklist — update the tick in the same commit that completes the task.

- [x] Task 0 — Scaffold (2026-08-17): repo, AGENTS.md, README, schema.sql, static shell (create form + stats page with mock data), pinned @neondatabase/serverless 1.1.0. Review round (2026-08-17, approved): clicks got identity PK, user-friendly UI copy (short link/destination/opens per day), nav buttons, per-day chips, clickable destination links
- [x] Task 1 — Provision Neon Postgres + apply schema + probe (2026-08-17): Neon `free_v3` provisioned + connected (DATABASE_URL injected), `npm run db:migrate` applies `db/schema.sql`, round-trip probe green live — insert, redirect lookup, identity ids, total count, daily group-by, FK rejection, indexes, cascade delete. SDK facts pinned above
- [x] Task 2 — POST /api/create + tests (2026-08-17): `api/create.js` + `test/create.test.js` (8 tests). 5-char slug from `crypto.randomInt` (56^5 ≈ 550M combos), alphabet `[a-km-zA-HJ-NP-Z2-9]` (no 0/O/1/l/I), collision retry ×5 then 500. Contract verified live on production: 200 `{slug, short_url}` (host-derived), 405 on non-POST, 400 on invalid URL or malformed JSON. Note: malformed JSON → clean 400 on production, but `vercel dev` returns a platform 500 (its body-parser throws before the handler). Test rows cleaned up; create page now works live unchanged
- [x] Task 3 — Redirect + click recording + tests (2026-08-17): `api/redirect.js` + `test/redirect.test.js` (4 tests). `vercel.json` gets `rewrites: [{ "source": "/:slug", "destination": "/api/redirect" }]`; Vercel passes the slug as `req.query.slug` (verified live). GET: look up `links`, INSERT into `clicks` (best-effort — a lost click never breaks the redirect), answer 302 `Location`. HEAD: 302 without counting. Empty/unknown slug → 404, other methods → 405. Verified live: 302+Location, 404, root and `/stats` still served, 2 GETs recorded 2 clicks, HEAD added none, link delete cascades clicks
- [x] Task 4 — GET /api/stats + tests (2026-08-17): `api/stats.js` + `test/stats.test.js` (7 tests). Three queries — links newest-first (`ORDER BY created_at DESC, slug` tiebreak), totals (`COUNT(*) GROUP BY slug`), daily buckets (`to_char(clicked_at AT TIME ZONE 'Asia/Karachi', 'YYYY-MM-DD')`) — assembled into the `sample-stats.json` shape so task 5 is a one-line fetch swap. `created_at` rendered with explicit `+05:00`; daily dates are bare Karachi calendar dates (Karim's call, 2026-08-17); COUNT strings coerced with `Number()`; zero-click links get `total: 0, daily: []`. Verified: 19/19 tests, Neon probe proved Karachi-midnight bucketing (18:59Z→Aug 16, 19:01Z→Aug 17) + cascade cleanup, `vercel dev` GET shape + POST 405
- [x] Task 5 — Wire the site to the APIs (2026-08-17): `js/stats.js` fetches `/api/stats` instead of the mock; "clicks this week" is now a rolling 7 Karachi days incl. today (string-compare on `YYYY-MM-DD`, no more UTC-midnight parsing); error states split — non-ok response → "Could not load stats. Try again.", zero links → "No stats yet.". `sample-stats.json` deleted (dead after the swap). Create page needed no change (wired since task 2). Verified: DOM-stub probe rendered real payload + both error paths, `vercel dev` serves `/stats` + `/api/stats`
- [ ] Task 6 — Rate limit + security audit + deploy
- [x] Task 7 — Anonymous ownership (2026-08-17, built before task 6 at Karim's direction): `links.owner` column + `links_owner_idx` (migration applied live); browser generates a uuid key in localStorage (`js/owner-key.js`), create tags the link with it, stats is bearer-key-scoped (401 without). Replaces a shared-password gate built the same day (superseded pre-commit — its only survivor is the bearer-header transport). Verified: 23/23 tests, live Neon probe proved owner isolation (A never sees B's links/clicks; unknown key → empty; NULL-owner legacy rows in no one's stats), `vercel dev` full flow (create 200/400, stats 200/401, redirect + click land in the owner's stats), probe rows cleaned up. The 14 legacy NULL-owner test links deleted at Karim's direction — DB starts empty under ownership
- [x] Task 8 — Delete your own links (2026-08-17): `api/delete.js` — `DELETE /api/delete?slug=<slug>` with the bearer owner key; `DELETE ... WHERE slug = $1 AND owner = $2 RETURNING slug` (cascade removes the clicks); wrong-owner and unknown both → 404 (no existence leak), no key → 401, non-DELETE → 405. UI: red `.delete-button` per row (house `--error` token — Karim spec'd "a red button on the side"), `window.confirm` first, stats reload after a successful delete. Reuses `ownerKey` from stats.js via require — no duplicated validation. Verified: 26/26 tests, DOM probe (button renders with slug; confirmed delete sends DELETE + bearer then reloads; declined confirm deletes nothing; failed/404 delete → error row), `vercel dev` full flow (wrong owner 404, no key 401, GET 405, right owner 200 + stats empty + deleted slug 404s)
- [x] Stats UX fix — clickable + copyable short link, two-step delete (2026-08-17, Karim's pre-task-6 caveat: "can't open the short link easily if I don't have it copied"): the slug cell is now an anchor to `/<slug>` (new tab) — clicking exercises the real redirect, so it counts as a click by design — plus a `Copy` button that writes `location.origin + /<slug>` via `navigator.clipboard` (flips to "Copied" for 1.5s; on clipboard refusal falls back to `window.prompt` with the URL). Also: delete confirm switched from `window.confirm` to two-step inline — first click arms the button to "Sure?" for 3s, second click deletes — because `window.confirm` was silently suppressed in Karim's browser (button looked dead; served JS verified correct, so the dialog itself was blocked — browsers suppress confirm via "don't show more dialogs", background tabs, extensions). Never depend on browser dialogs again. Hover underline via `.short-link`, `.copy-button`/armed state styled with house tokens. Verified: DOM probe asserts `href="/<slug>"` + new tab, copy writes the full URL, prompt fallback, arm-then-delete, single click never deletes
