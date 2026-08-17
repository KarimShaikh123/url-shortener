const { neon } = require("@neondatabase/serverless");

async function redirectFor(sql, slug, countClick) {
  const rows = await sql.query("SELECT url FROM links WHERE slug = $1", [slug]);
  if (rows.length === 0) return { status: 404 };
  if (countClick) {
    try {
      await sql.query("INSERT INTO clicks (slug) VALUES ($1)", [slug]);
    } catch {}
  }
  return { status: 302, location: rows[0].url };
}

module.exports = async function handler(req, res) {
  const slug = String(req.query.slug || "").trim();
  if (!slug) {
    res.status(404).end();
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  if (!process.env.DATABASE_URL) {
    res.status(500).json({ error: "Database not configured" });
    return;
  }

  const sql = neon(process.env.DATABASE_URL);
  const result = await redirectFor(sql, slug, req.method === "GET");
  if (result.status === 302) {
    res.status(302).setHeader("Location", result.location).end();
  } else {
    res.status(404).end();
  }
};

module.exports.redirectFor = redirectFor;
