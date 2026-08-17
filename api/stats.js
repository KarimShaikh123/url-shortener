const { neon } = require("@neondatabase/serverless");

function ownerKey(req) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7);
  if (token.length < 32 || token.length > 36 || !/^[0-9a-f-]+$/i.test(token)) return null;
  return token;
}

function formatKarachi(date) {
  const shifted = new Date(date.getTime() + 5 * 3600 * 1000);
  return shifted.toISOString().replace(/\.\d{3}Z$/, "+05:00");
}

function assembleStats(links, totals, daily) {
  const totalBySlug = new Map();
  for (const row of totals) totalBySlug.set(row.slug, Number(row.total));
  const dailyBySlug = new Map();
  for (const row of daily) {
    let days = dailyBySlug.get(row.slug);
    if (!days) {
      days = [];
      dailyBySlug.set(row.slug, days);
    }
    days.push({ date: row.day, count: Number(row.count) });
  }
  return {
    links: links.map((link) => ({
      slug: link.slug,
      url: link.url,
      created_at: formatKarachi(link.created_at),
      total: totalBySlug.get(link.slug) || 0,
      daily: dailyBySlug.get(link.slug) || [],
    })),
  };
}

async function fetchStats(sql, owner) {
  const links = await sql.query("SELECT slug, url, created_at FROM links WHERE owner = $1 ORDER BY created_at DESC, slug", [owner]);
  const totals = await sql.query(
    "SELECT c.slug, COUNT(*) AS total FROM clicks c JOIN links l ON l.slug = c.slug WHERE l.owner = $1 GROUP BY c.slug",
    [owner]
  );
  const daily = await sql.query(
    "SELECT c.slug, to_char(c.clicked_at AT TIME ZONE 'Asia/Karachi', 'YYYY-MM-DD') AS day, COUNT(*) AS count" +
      " FROM clicks c JOIN links l ON l.slug = c.slug WHERE l.owner = $1 GROUP BY c.slug, day ORDER BY day DESC, c.slug",
    [owner]
  );
  return assembleStats(links, totals, daily);
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  const owner = ownerKey(req);
  if (!owner) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (!process.env.DATABASE_URL) {
    res.status(500).json({ error: "Database not configured" });
    return;
  }

  const sql = neon(process.env.DATABASE_URL);
  let payload;
  try {
    payload = await fetchStats(sql, owner);
  } catch {
    res.status(500).json({ error: "Could not load stats" });
    return;
  }

  res.status(200).json(payload);
};

module.exports.ownerKey = ownerKey;
module.exports.formatKarachi = formatKarachi;
module.exports.assembleStats = assembleStats;
module.exports.fetchStats = fetchStats;
