const { neon } = require("@neondatabase/serverless");

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

async function fetchStats(sql) {
  const links = await sql.query("SELECT slug, url, created_at FROM links ORDER BY created_at DESC, slug");
  const totals = await sql.query("SELECT slug, COUNT(*) AS total FROM clicks GROUP BY slug");
  const daily = await sql.query(
    "SELECT slug, to_char(clicked_at AT TIME ZONE 'Asia/Karachi', 'YYYY-MM-DD') AS day, COUNT(*) AS count" +
      " FROM clicks GROUP BY slug, day ORDER BY day DESC, slug"
  );
  return assembleStats(links, totals, daily);
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  if (!process.env.DATABASE_URL) {
    res.status(500).json({ error: "Database not configured" });
    return;
  }

  const sql = neon(process.env.DATABASE_URL);
  let payload;
  try {
    payload = await fetchStats(sql);
  } catch {
    res.status(500).json({ error: "Could not load stats" });
    return;
  }

  res.status(200).json(payload);
};

module.exports.formatKarachi = formatKarachi;
module.exports.assembleStats = assembleStats;
module.exports.fetchStats = fetchStats;
