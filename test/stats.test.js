const { test } = require("node:test");
const assert = require("node:assert");
const stats = require("../api/stats.js");

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

test("fetchStats buckets clicks by Karachi day in SQL and lists links newest-first", async () => {
  const seen = [];
  const sql = {
    query: async (query) => {
      seen.push(query);
      return [];
    },
  };
  assert.deepStrictEqual(await stats.fetchStats(sql), { links: [] });
  assert.ok(seen.some((q) => q.includes("AT TIME ZONE 'Asia/Karachi'")), "daily buckets use Karachi days");
  assert.ok(seen.some((q) => q.includes("ORDER BY created_at DESC")), "links listed newest-first");
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
  assert.deepStrictEqual(await stats.fetchStats(sql), {
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
