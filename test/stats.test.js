const { test } = require("node:test");
const assert = require("node:assert");
const stats = require("../api/stats.js");

const OWNER = "c8d1f2a3-9b4e-4c5d-8e6f-0a1b2c3d4e5f";

function fakeReq(header) {
  return { headers: header === undefined ? {} : { authorization: header } };
}

test("ownerKey extracts a valid bearer key", () => {
  assert.strictEqual(stats.ownerKey(fakeReq("Bearer " + OWNER)), OWNER);
  assert.strictEqual(stats.ownerKey(fakeReq("Bearer " + "a".repeat(32))), "a".repeat(32));
});

test("ownerKey rejects missing, malformed, or non-hex headers", () => {
  assert.strictEqual(stats.ownerKey(fakeReq(undefined)), null);
  assert.strictEqual(stats.ownerKey(fakeReq("")), null);
  assert.strictEqual(stats.ownerKey(fakeReq(OWNER)), null);
  assert.strictEqual(stats.ownerKey(fakeReq("Bearer ")), null);
  assert.strictEqual(stats.ownerKey(fakeReq("Bearer short")), null);
  assert.strictEqual(stats.ownerKey(fakeReq("Bearer " + "z".repeat(32))), null);
  assert.strictEqual(stats.ownerKey(fakeReq("Bearer " + "a".repeat(37))), null);
  assert.strictEqual(stats.ownerKey(fakeReq("Basic " + OWNER)), null);
});

test("formatKarachi renders a UTC instant as Lahore wall time with +05:00", () => {
  assert.strictEqual(stats.formatKarachi(new Date("2026-08-16T09:00:00Z")), "2026-08-16T14:00:00+05:00");
});

test("formatKarachi day boundary is the Karachi midnight, not UTC", () => {
  assert.strictEqual(stats.formatKarachi(new Date("2026-08-16T18:59:59Z")), "2026-08-16T23:59:59+05:00");
  assert.strictEqual(stats.formatKarachi(new Date("2026-08-16T19:00:00Z")), "2026-08-17T00:00:00+05:00");
});

test("assembleStats joins links, totals, and daily rows in link order", () => {
  const links = [
    { slug: "newer", url: "https://b.example", created_at: new Date("2026-08-16T09:00:00Z") },
    { slug: "older", url: "https://a.example", created_at: new Date("2026-08-14T14:30:00Z") },
  ];
  const totals = [
    { slug: "older", total: "12" },
    { slug: "newer", total: "3" },
  ];
  const daily = [
    { slug: "newer", day: "2026-08-17", count: "1" },
    { slug: "newer", day: "2026-08-16", count: "2" },
    { slug: "older", day: "2026-08-14", count: "12" },
  ];
  assert.deepStrictEqual(stats.assembleStats(links, totals, daily), {
    links: [
      {
        slug: "newer",
        url: "https://b.example",
        created_at: "2026-08-16T14:00:00+05:00",
        total: 3,
        daily: [
          { date: "2026-08-17", count: 1 },
          { date: "2026-08-16", count: 2 },
        ],
      },
      {
        slug: "older",
        url: "https://a.example",
        created_at: "2026-08-14T19:30:00+05:00",
        total: 12,
        daily: [{ date: "2026-08-14", count: 12 }],
      },
    ],
  });
});

test("assembleStats gives a link with no clicks total 0 and an empty daily list", () => {
  const payload = stats.assembleStats(
    [{ slug: "quiet", url: "https://example.com", created_at: new Date("2026-08-16T09:00:00Z") }],
    [],
    []
  );
  assert.strictEqual(payload.links[0].total, 0);
  assert.deepStrictEqual(payload.links[0].daily, []);
});

test("assembleStats coerces COUNT strings to numbers", () => {
  const payload = stats.assembleStats(
    [{ slug: "abc12", url: "https://example.com", created_at: new Date("2026-08-16T09:00:00Z") }],
    [{ slug: "abc12", total: "38" }],
    [{ slug: "abc12", day: "2026-08-16", count: "15" }]
  );
  assert.strictEqual(payload.links[0].total, 38);
  assert.strictEqual(payload.links[0].daily[0].count, 15);
});

test("fetchStats scopes every query to the owner", async () => {
  const seen = [];
  const sql = {
    query: async (query, params) => {
      seen.push({ query, params });
      return [];
    },
  };
  assert.deepStrictEqual(await stats.fetchStats(sql, OWNER), { links: [] });
  assert.strictEqual(seen.length, 3);
  for (const { query, params } of seen) {
    assert.deepStrictEqual(params, [OWNER]);
    assert.match(query, /owner = \$1/);
  }
  assert.ok(seen.some(({ query }) => query.includes("AT TIME ZONE 'Asia/Karachi'")), "daily buckets use Karachi days");
  assert.ok(seen.some(({ query }) => query.includes("ORDER BY created_at DESC")), "links listed newest-first");
});

test("fetchStats assembles what the database returns", async () => {
  const sql = {
    query: async (query) => {
      if (query.includes("FROM links")) {
        return [{ slug: "abc12", url: "https://example.com", created_at: new Date("2026-08-16T09:00:00Z") }];
      }
      if (query.includes("AS total")) return [{ slug: "abc12", total: "2" }];
      return [{ slug: "abc12", day: "2026-08-16", count: "2" }];
    },
  };
  assert.deepStrictEqual(await stats.fetchStats(sql, OWNER), {
    links: [
      {
        slug: "abc12",
        url: "https://example.com",
        created_at: "2026-08-16T14:00:00+05:00",
        total: 2,
        daily: [{ date: "2026-08-16", count: 2 }],
      },
    ],
  });
});
