# url-shortener

A URL shortener with click stats. Paste a link, get a short `/slug`, and every click on the slug is counted. The stats page shows each link's total clicks and a per-day breakdown.

Links belong to the browser that created them: on first visit the browser generates an owner key and keeps it in localStorage — no accounts, no passwords. The stats page shows only your own links. Each browser can hold up to 10 links — delete one to add another.

Schema (in `db/schema.sql`): `links(slug, url, created_at, owner)` + `clicks(id, slug, clicked_at)` — click totals and daily trends are computed from the `clicks` table, never stored.

Stack: static HTML/CSS/JS + Vercel serverless functions + Neon Postgres (`@neondatabase/serverless`).

| File | Purpose |
|---|---|
| `db/schema.sql` | the schema |
| `db/migrate.js` | applies `schema.sql` to Neon |
| `api/` | serverless functions (create, redirect, stats, delete) |
| `index.html` / `stats.html` | the create form / the stats page |
| `js/owner-key.js` | get-or-generate the browser's owner key |
| `js/create.js` / `js/stats.js` | wire the create form / stats page to the APIs |
| `styles.css` | house design tokens |
| `test/` | `node:test` suites for the four APIs |

Commands: `npm install` · `npm test` · `npm run db:migrate` · `npx vercel dev` · push to `main` to deploy.
