const { test } = require("node:test");
const assert = require("node:assert");
const redirect = require("../api/redirect.js");

test("redirectFor returns 302 with the destination when the slug exists", async () => {
  let inserted = null;
  const sql = {
    query: async (query, params) => {
      if (query.startsWith("SELECT")) {
        assert.deepStrictEqual(params, ["abc12"]);
        return [{ url: "https://example.com" }];
      }
      inserted = params[0];
    },
  };
  const result = await redirect.redirectFor(sql, "abc12", true);
  assert.strictEqual(result.status, 302);
  assert.strictEqual(result.location, "https://example.com");
  assert.strictEqual(inserted, "abc12");
});

test("redirectFor does not record a click when countClick is false", async () => {
  let inserted = null;
  const sql = {
    query: async (query, params) => {
      if (query.startsWith("SELECT")) return [{ url: "https://example.com" }];
      inserted = params[0];
    },
  };
  const result = await redirect.redirectFor(sql, "abc12", false);
  assert.strictEqual(result.status, 302);
  assert.strictEqual(inserted, null);
});

test("redirectFor returns 404 for an unknown slug", async () => {
  const sql = {
    query: async () => [],
  };
  const result = await redirect.redirectFor(sql, "zzzzz", true);
  assert.strictEqual(result.status, 404);
});

test("a failed click record never breaks the redirect", async () => {
  const sql = {
    query: async (query) => {
      if (query.startsWith("SELECT")) return [{ url: "https://example.com" }];
      throw new Error("db hiccup");
    },
  };
  const result = await redirect.redirectFor(sql, "abc12", true);
  assert.strictEqual(result.status, 302);
  assert.strictEqual(result.location, "https://example.com");
});