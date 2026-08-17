# url-shortener

A URL shortener with click stats. Paste a link, get a short `/slug`, and every click on the slug is counted. The stats page shows each link's total clicks and a per-day breakdown.

Schema (in `db/schema.sql`): `links(slug, url, created_at)` + `clicks(slug, clicked_at)` — click totals and daily trends are computed from the `clicks` table, never stored.

Stack: static HTML/CSS/JS + Vercel serverless functions + Neon Postgres (`@neondatabase/serverless`).

| File | Purpose |
|---|---|
| `db/schema.sql` | the schema |
| `api/` | serverless functions (create, redirect, stats) |
| `index.html` / `stats.html` | the create form / the stats page |
| `styles.css` | house design tokens |
| `sample-stats.json` | mock stats data, swapped for the real API when wired |

Commands: `npm install` · `npm test` · `npx vercel dev` · push to `main` to deploy.
