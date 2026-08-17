const { neon } = require("@neondatabase/serverless");
const { ownerKey } = require("./stats.js");

async function deleteLink(sql, slug, owner) {
  const rows = await sql.query("DELETE FROM links WHERE slug = $1 AND owner = $2 RETURNING slug", [slug, owner]);
  if (rows.length === 0) return null;
  return rows[0].slug;
}

module.exports = async function handler(req, res) {
  if (req.method !== "DELETE") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  const owner = ownerKey(req);
  if (!owner) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const slug = String(req.query.slug || "").trim();
  if (!slug) {
    res.status(400).json({ error: "Provide a slug" });
    return;
  }

  if (!process.env.DATABASE_URL) {
    res.status(500).json({ error: "Database not configured" });
    return;
  }

  const sql = neon(process.env.DATABASE_URL);
  let deleted;
  try {
    deleted = await deleteLink(sql, slug, owner);
  } catch {
    res.status(500).json({ error: "Could not delete the link" });
    return;
  }

  if (!deleted) {
    res.status(404).json({ error: "Link not found" });
    return;
  }

  res.status(200).json({ deleted: deleted });
};

module.exports.deleteLink = deleteLink;
