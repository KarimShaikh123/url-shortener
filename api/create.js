const { randomInt } = require("crypto");
const { neon } = require("@neondatabase/serverless");

const SLUG_ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const SLUG_LENGTH = 5;
const MAX_ATTEMPTS = 5;
const LINK_LIMIT = 10;
const MAX_URL_LENGTH = 2048;
const MAX_BODY_LENGTH = 8192;

function isValidUrl(value) {
  if (typeof value !== "string") return false;
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return url.protocol === "http:" || url.protocol === "https:";
}

function isValidOwnerKey(value) {
  return typeof value === "string" && value.length >= 32 && value.length <= 36 && /^[0-9a-f-]+$/i.test(value);
}

function generateSlug() {
  let slug = "";
  for (let i = 0; i < SLUG_LENGTH; i++) {
    slug += SLUG_ALPHABET[randomInt(SLUG_ALPHABET.length)];
  }
  return slug;
}

function isUniqueViolation(err) {
  return err && (err.code === "23505" || /duplicate key value/.test(err.message || ""));
}

async function countOwnerLinks(sql, owner) {
  const rows = await sql.query("SELECT COUNT(*) AS count FROM links WHERE owner = $1", [owner]);
  return Number(rows[0].count);
}

async function createLink(sql, url, owner) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const slug = generateSlug();
    try {
      await sql.query("INSERT INTO links (slug, url, owner) VALUES ($1, $2, $3)", [slug, url, owner]);
      return slug;
    } catch (err) {
      if (isUniqueViolation(err)) continue;
      throw err;
    }
  }
  throw new Error("could not find a free slug");
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === "object") {
      resolve(req.body);
      return;
    }
    let data = "";
    let oversized = false;
    req.on("data", (chunk) => {
      if (oversized) return;
      data += chunk;
      if (data.length > MAX_BODY_LENGTH) oversized = true;
    });
    req.on("end", () => {
      if (oversized) {
        resolve({ __oversized: true });
        return;
      }
      try {
        resolve(JSON.parse(data || "{}"));
      } catch {
        resolve(null);
      }
    });
    req.on("error", reject);
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  const body = await readJsonBody(req);
  if (!body) {
    res.status(400).json({ error: "Invalid JSON body" });
    return;
  }
  if (body.__oversized) {
    res.status(400).json({ error: "Payload too large" });
    return;
  }

  const url = body.url;
  if (!isValidUrl(url)) {
    res.status(400).json({ error: "Provide a valid http(s) URL" });
    return;
  }
  if (url.length > MAX_URL_LENGTH) {
    res.status(400).json({ error: "URL too long (" + MAX_URL_LENGTH + " characters max)" });
    return;
  }

  const owner = body.owner;
  if (!isValidOwnerKey(owner)) {
    res.status(400).json({ error: "Provide a valid owner key" });
    return;
  }

  if (!process.env.DATABASE_URL) {
    res.status(500).json({ error: "Database not configured" });
    return;
  }

  const sql = neon(process.env.DATABASE_URL);

  let count;
  try {
    count = await countOwnerLinks(sql, owner);
  } catch (err) {
    res.status(500).json({ error: "Could not save the link" });
    return;
  }
  if (count >= LINK_LIMIT) {
    res.status(429).json({ error: "Link limit reached (" + LINK_LIMIT + "). Delete one to add another." });
    return;
  }

  let slug;
  try {
    slug = await createLink(sql, url, owner);
  } catch (err) {
    res.status(500).json({ error: "Could not save the link" });
    return;
  }

  const shortUrl = "https://" + (req.headers.host || "") + "/" + slug;
  res.status(200).json({ slug: slug, short_url: shortUrl });
};

module.exports.isValidUrl = isValidUrl;
module.exports.isValidOwnerKey = isValidOwnerKey;
module.exports.generateSlug = generateSlug;
module.exports.createLink = createLink;
module.exports.countOwnerLinks = countOwnerLinks;
module.exports.isUniqueViolation = isUniqueViolation;
module.exports.LINK_LIMIT = LINK_LIMIT;
module.exports.MAX_URL_LENGTH = MAX_URL_LENGTH;
module.exports.MAX_BODY_LENGTH = MAX_BODY_LENGTH;
