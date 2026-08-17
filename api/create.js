const { randomInt } = require("crypto");
const { neon } = require("@neondatabase/serverless");

const SLUG_ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const SLUG_LENGTH = 5;
const MAX_ATTEMPTS = 5;

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

async function createLink(sql, url) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const slug = generateSlug();
    try {
      await sql.query("INSERT INTO links (slug, url) VALUES ($1, $2)", [slug, url]);
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
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => {
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

  const url = body.url;
  if (!isValidUrl(url)) {
    res.status(400).json({ error: "Provide a valid http(s) URL" });
    return;
  }

  if (!process.env.DATABASE_URL) {
    res.status(500).json({ error: "Database not configured" });
    return;
  }

  const sql = neon(process.env.DATABASE_URL);
  let slug;
  try {
    slug = await createLink(sql, url);
  } catch (err) {
    res.status(500).json({ error: "Could not save the link" });
    return;
  }

  const shortUrl = "https://" + (req.headers.host || "") + "/" + slug;
  res.status(200).json({ slug: slug, short_url: shortUrl });
};

module.exports.isValidUrl = isValidUrl;
module.exports.generateSlug = generateSlug;
module.exports.createLink = createLink;
module.exports.isUniqueViolation = isUniqueViolation;
