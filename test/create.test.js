const { test } = require("node:test");
const assert = require("node:assert");
const create = require("../api/create.js");

test("isValidUrl accepts http and https", () => {
  assert.strictEqual(create.isValidUrl("https://example.com"), true);
  assert.strictEqual(create.isValidUrl("http://example.com/path?q=1"), true);
});

test("isValidUrl rejects non-http protocols and junk", () => {
  assert.strictEqual(create.isValidUrl("javascript:alert(1)"), false);
  assert.strictEqual(create.isValidUrl("file:///etc/passwd"), false);
  assert.strictEqual(create.isValidUrl("ftp://example.com"), false);
  assert.strictEqual(create.isValidUrl("not a url"), false);
  assert.strictEqual(create.isValidUrl("example.com"), false);
  assert.strictEqual(create.isValidUrl(""), false);
  assert.strictEqual(create.isValidUrl(null), false);
  assert.strictEqual(create.isValidUrl(42), false);
});

test("generateSlug returns 5 characters from the alphabet only", () => {
  for (let i = 0; i < 50; i++) {
    const slug = create.generateSlug();
    assert.strictEqual(slug.length, 5);
    assert.match(slug, /^[a-km-zA-HJ-NP-Z2-9]{5}$/);
  }
});

test("generateSlug is not constant across calls", () => {
  const seen = new Set();
  for (let i = 0; i < 50; i++) {
    seen.add(create.generateSlug());
  }
  assert.ok(seen.size > 1, "expected varied slugs");
});

test("createLink returns a slug and inserts the row", async () => {
  let inserted = null;
  const sql = {
    query: async (query, params) => {
      assert.strictEqual(query, "INSERT INTO links (slug, url) VALUES ($1, $2)");
      assert.strictEqual(params.length, 2);
      assert.match(params[0], /^[a-km-zA-HJ-NP-Z2-9]{5}$/);
      assert.strictEqual(params[1], "https://example.com");
      inserted = params[0];
    },
  };
  const slug = await create.createLink(sql, "https://example.com");
  assert.strictEqual(slug, inserted);
});

test("createLink retries on a unique violation", async () => {
  let attempts = 0;
  const sql = {
    query: async () => {
      attempts++;
      if (attempts < 3) {
        throw { code: "23505", message: "duplicate key value violates unique constraint" };
      }
    },
  };
  const slug = await create.createLink(sql, "https://example.com");
  assert.strictEqual(attempts, 3);
  assert.match(slug, /^[a-km-zA-HJ-NP-Z2-9]{5}$/);
});

test("createLink gives up after MAX_ATTEMPTS collisions", async () => {
  const sql = {
    query: async () => {
      throw { code: "23505", message: "duplicate key value violates unique constraint" };
    },
  };
  await assert.rejects(() => create.createLink(sql, "https://example.com"), /free slug/);
});

test("createLink rethrows non-collision errors", async () => {
  const sql = {
    query: async () => {
      throw new Error("connection refused");
    },
  };
  await assert.rejects(() => create.createLink(sql, "https://example.com"), /connection refused/);
});
