const { test } = require("node:test");
const assert = require("node:assert");
const create = require("../api/create.js");

const OWNER = "c8d1f2a3-9b4e-4c5d-8e6f-0a1b2c3d4e5f";

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

test("isValidOwnerKey accepts uuids and 32-char hex keys", () => {
  assert.strictEqual(create.isValidOwnerKey(OWNER), true);
  assert.strictEqual(create.isValidOwnerKey("a".repeat(32)), true);
});

test("isValidOwnerKey rejects junk", () => {
  assert.strictEqual(create.isValidOwnerKey(""), false);
  assert.strictEqual(create.isValidOwnerKey("short"), false);
  assert.strictEqual(create.isValidOwnerKey("z".repeat(32)), false);
  assert.strictEqual(create.isValidOwnerKey("a".repeat(37)), false);
  assert.strictEqual(create.isValidOwnerKey(null), false);
  assert.strictEqual(create.isValidOwnerKey(42), false);
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

test("createLink returns a slug and inserts the row with its owner", async () => {
  let inserted = null;
  const sql = {
    query: async (query, params) => {
      assert.strictEqual(query, "INSERT INTO links (slug, url, owner) VALUES ($1, $2, $3)");
      assert.strictEqual(params.length, 3);
      assert.match(params[0], /^[a-km-zA-HJ-NP-Z2-9]{5}$/);
      assert.strictEqual(params[1], "https://example.com");
      assert.strictEqual(params[2], OWNER);
      inserted = params[0];
    },
  };
  const slug = await create.createLink(sql, "https://example.com", OWNER);
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
  const slug = await create.createLink(sql, "https://example.com", OWNER);
  assert.strictEqual(attempts, 3);
  assert.match(slug, /^[a-km-zA-HJ-NP-Z2-9]{5}$/);
});

test("createLink gives up after MAX_ATTEMPTS collisions", async () => {
  const sql = {
    query: async () => {
      throw { code: "23505", message: "duplicate key value violates unique constraint" };
    },
  };
  await assert.rejects(() => create.createLink(sql, "https://example.com", OWNER), /free slug/);
});

test("createLink rethrows non-collision errors", async () => {
  const sql = {
    query: async () => {
      throw new Error("connection refused");
    },
  };
  await assert.rejects(() => create.createLink(sql, "https://example.com", OWNER), /connection refused/);
});

test("countOwnerLinks returns the owner's link count as a number", async () => {
  const sql = {
    query: async (query, params) => {
      assert.match(query, /SELECT COUNT\(\*\) AS count FROM links WHERE owner = \$1/);
      assert.deepStrictEqual(params, [OWNER]);
      return [{ count: "7" }];
    },
  };
  assert.strictEqual(await create.countOwnerLinks(sql, OWNER), 7);
});

test("countOwnerLinks returns 0 for a fresh owner", async () => {
  const sql = { query: async () => [{ count: "0" }] };
  assert.strictEqual(await create.countOwnerLinks(sql, OWNER), 0);
});

test("LINK_LIMIT is 10", () => {
  assert.strictEqual(create.LINK_LIMIT, 10);
});

function fakeRes() {
  const res = {
    statusCode: null,
    payload: null,
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(payload) {
      res.payload = payload;
      return res;
    },
  };
  return res;
}

test("create handler rejects URLs longer than 2048 characters", async () => {
  const req = {
    method: "POST",
    body: { url: "https://example.com/" + "a".repeat(create.MAX_URL_LENGTH), owner: OWNER },
  };
  const res = fakeRes();
  await create(req, res);
  assert.strictEqual(res.statusCode, 400);
  assert.match(res.payload.error, /too long/i);
});

test("create handler accepts a URL at exactly 2048 characters up to validation", async () => {
  const req = {
    method: "POST",
    body: { url: "https://e.co/" + "a".repeat(create.MAX_URL_LENGTH - 13), owner: OWNER },
  };
  const res = fakeRes();
  await create(req, res);
  assert.notStrictEqual(res.statusCode, 400);
});

test("create handler rejects oversized streamed bodies", async () => {
  const { EventEmitter } = require("node:events");
  const req = new EventEmitter();
  req.method = "POST";
  const res = fakeRes();
  const done = create(req, res);
  req.emit("data", JSON.stringify({ url: "https://example.com/", owner: OWNER }).slice(0, 10));
  req.emit("data", "x".repeat(create.MAX_BODY_LENGTH + 100));
  req.emit("end");
  await done;
  assert.strictEqual(res.statusCode, 400);
  assert.match(res.payload.error, /too large/i);
});
