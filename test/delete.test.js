const { test } = require("node:test");
const assert = require("node:assert");
const del = require("../api/delete.js");

const OWNER = "c8d1f2a3-9b4e-4c5d-8e6f-0a1b2c3d4e5f";

test("deleteLink returns the slug when the owner's link is deleted", async () => {
  const sql = {
    query: async (query, params) => {
      assert.match(query, /DELETE FROM links WHERE slug = \$1 AND owner = \$2 RETURNING slug/);
      assert.deepStrictEqual(params, ["abc12", OWNER]);
      return [{ slug: "abc12" }];
    },
  };
  assert.strictEqual(await del.deleteLink(sql, "abc12", OWNER), "abc12");
});

test("deleteLink returns null for an unknown slug", async () => {
  const sql = { query: async () => [] };
  assert.strictEqual(await del.deleteLink(sql, "zzzzz", OWNER), null);
});

test("deleteLink returns null when the slug belongs to another owner", async () => {
  const sql = {
    query: async (query, params) => {
      assert.deepStrictEqual(params, ["abc12", OWNER]);
      return [];
    },
  };
  assert.strictEqual(await del.deleteLink(sql, "abc12", OWNER), null);
});
