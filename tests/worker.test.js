import assert from "node:assert/strict";
import test from "node:test";

import worker, {
  isAllowedVisitOrigin,
  parseLeetCodeProfile,
} from "../src/worker.js";

const LEETCODE_PROFILE = {
  data: {
    matchedUser: {
      submitStatsGlobal: {
        acSubmissionNum: [
          { difficulty: "All", count: 100 },
          { difficulty: "Easy", count: 50 },
          { difficulty: "Medium", count: 40 },
          { difficulty: "Hard", count: 10 },
        ],
      },
    },
    userContestRanking: { rating: 1_750.5, topPercentage: 12.3 },
  },
};

const MONKEYTYPE_PROFILE = {
  data: {
    typingStats: { completedTests: 123, timeTyping: 7_200 },
    personalBests: { time: { 60: [{ wpm: 118.25 }] } },
  },
};

const setGlobal = (name, value) => {
  const original = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  return () => {
    if (original) {
      Object.defineProperty(globalThis, name, original);
    } else {
      delete globalThis[name];
    }
  };
};

test("isAllowedVisitOrigin accepts absent or matching origins only", () => {
  assert.equal(isAllowedVisitOrigin(new Request("https://portfolio.example/api/visit")), true);
  assert.equal(
    isAllowedVisitOrigin(
      new Request("https://portfolio.example/api/visit", {
        headers: { origin: "https://portfolio.example" },
      }),
    ),
    true,
  );
  assert.equal(
    isAllowedVisitOrigin(
      new Request("https://portfolio.example/api/visit", {
        headers: { origin: "https://elsewhere.example" },
      }),
    ),
    false,
  );
  assert.equal(
    isAllowedVisitOrigin(
      new Request("https://portfolio.example/api/visit", {
        headers: { origin: "null" },
      }),
    ),
    false,
  );
});

test("parseLeetCodeProfile maps solved and contest statistics", () => {
  assert.deepEqual(parseLeetCodeProfile(LEETCODE_PROFILE), {
    solved: { all: 100, easy: 50, medium: 40, hard: 10 },
    contest: { rating: 1_750.5, topPercentage: 12.3 },
  });
});

test("parseLeetCodeProfile preserves a missing contest and rejects invalid payloads", () => {
  const payload = structuredClone(LEETCODE_PROFILE);
  payload.data.userContestRanking = null;

  assert.deepEqual(parseLeetCodeProfile(payload).contest, {
    rating: null,
    topPercentage: null,
  });
  assert.throws(
    () => parseLeetCodeProfile({ errors: [{ message: "Unavailable" }] }),
    /GraphQL errors/,
  );
  assert.throws(() => parseLeetCodeProfile({ data: {} }), /invalid profile/);
});

test("the Worker rejects wrong API methods and unknown API routes", async () => {
  const wrongVisitMethod = await worker.fetch(
    new Request("https://portfolio.example/api/visit", { method: "GET" }),
    {},
  );
  assert.equal(wrongVisitMethod.status, 405);
  assert.equal(wrongVisitMethod.headers.get("allow"), "POST");
  assert.equal(wrongVisitMethod.headers.get("cache-control"), "no-store");

  const wrongStatsMethod = await worker.fetch(
    new Request("https://portfolio.example/api/stats", { method: "POST" }),
    {},
  );
  assert.equal(wrongStatsMethod.status, 405);
  assert.equal(wrongStatsMethod.headers.get("allow"), "GET");

  const missing = await worker.fetch(new Request("https://portfolio.example/api/missing"), {});
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get("cache-control"), "no-store");
  assert.deepEqual(await missing.json(), { error: "Not found" });
});

test("POST /api/visit preserves the raw visit and handles a null JSON body", async () => {
  const prepared = [];
  const DB = {
    prepare(sql) {
      const statement = {
        sql,
        values: [],
        bind(...values) {
          this.values = values;
          return this;
        },
        async run() {
          return { success: true };
        },
      };
      prepared.push(statement);
      return statement;
    },
  };
  const request = new Request("https://portfolio.example/api/visit", {
    method: "POST",
    headers: {
      "CF-Connecting-IP": "203.0.113.1",
      "content-type": "application/json",
      origin: "https://portfolio.example",
    },
    body: "null",
  });
  Object.defineProperty(request, "cf", {
    value: {
      country: "CA",
      region: "Ontario",
      city: "Toronto",
      latitude: "43.65",
      longitude: "-79.38",
    },
  });

  const response = await worker.fetch(request, { DB });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(prepared.length, 1);
  assert.match(prepared[0].sql, /INSERT INTO visits/);
  assert.ok(Number.isFinite(Date.parse(prepared[0].values[0])));
  assert.deepEqual(prepared[0].values.slice(1), [
    "/",
    "203.0.113.1",
    "CA",
    "Ontario",
    "Toronto",
    "43.65",
    "-79.38",
  ]);
});

test("POST /api/visit rejects a cross-origin write before touching D1", async () => {
  let prepared = false;
  const response = await worker.fetch(
    new Request("https://portfolio.example/api/visit", {
      method: "POST",
      headers: { origin: "https://elsewhere.example" },
    }),
    { DB: { prepare: () => (prepared = true) } },
  );

  assert.equal(response.status, 403);
  assert.equal(prepared, false);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("GET /api/visit-stats batches exact aggregate data", async () => {
  const prepared = [];
  let batched = [];
  const DB = {
    prepare(sql) {
      const statement = { sql };
      prepared.push(statement);
      return statement;
    },
    async batch(statements) {
      batched = statements;
      return [
        { results: [{ total_visits: 12, unique_visitors: 5 }] },
        { results: [{ lat: 43.65, lon: -79.38, count: 7 }] },
      ];
    },
  };

  const response = await worker.fetch(
    new Request("https://portfolio.example/api/visit-stats"),
    { DB },
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), {
    totalVisits: 12,
    uniqueVisitors: 5,
    locations: [{ lat: 43.65, lon: -79.38, count: 7 }],
  });
  assert.equal(prepared.length, 2);
  assert.equal(batched.length, 2);
  assert.match(prepared[0].sql, /FROM visit_totals/);
  assert.match(prepared[1].sql, /FROM visit_locations/);
  assert.doesNotMatch(prepared[1].sql, /LIMIT/i);
});

test("GET /api/stats caches only a fully successful response", async () => {
  const fetchCalls = [];
  let cached;
  let puts = 0;
  const background = [];
  const restoreFetch = setGlobal("fetch", async (url, init) => {
    fetchCalls.push({ url: String(url), init });
    assert.ok(init.signal instanceof AbortSignal);
    return Response.json(
      String(url).includes("leetcode.com") ? LEETCODE_PROFILE : MONKEYTYPE_PROFILE,
    );
  });
  const restoreCaches = setGlobal("caches", {
    default: {
      async match() {
        return cached?.clone();
      },
      async put(_request, response) {
        puts += 1;
        cached = response.clone();
      },
    },
  });

  try {
    const request = new Request(
      "https://portfolio.example/api/stats?leetcode=lagsterino&monkeytype=laggy",
    );
    const ctx = { waitUntil: (promise) => background.push(promise) };
    const first = await worker.fetch(request, {}, ctx);
    await Promise.all(background);
    const firstPayload = await first.json();

    assert.equal(first.status, 200);
    assert.equal(first.headers.get("cache-control"), "public, max-age=900");
    assert.equal(firstPayload.leetcode.solved.all, 100);
    assert.equal(firstPayload.monkeytype.pb60, 118.25);
    assert.equal(fetchCalls.length, 2);
    assert.equal(puts, 1);

    const second = await worker.fetch(request, {}, ctx);
    assert.deepEqual(await second.json(), firstPayload);
    assert.equal(fetchCalls.length, 2);
    assert.equal(puts, 1);
  } finally {
    restoreCaches();
    restoreFetch();
  }
});

test("GET /api/stats does not cache a partial response", async () => {
  let puts = 0;
  const restoreFetch = setGlobal("fetch", async (url) =>
    String(url).includes("leetcode.com")
      ? new Response("unavailable", { status: 503 })
      : Response.json(MONKEYTYPE_PROFILE),
  );
  const restoreCaches = setGlobal("caches", {
    default: {
      async match() {},
      async put() {
        puts += 1;
      },
    },
  });

  try {
    const response = await worker.fetch(
      new Request("https://portfolio.example/api/stats"),
      {},
    );
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(payload.leetcode, null);
    assert.equal(payload.monkeytype.completedTests, 123);
    assert.equal(puts, 0);
  } finally {
    restoreCaches();
    restoreFetch();
  }
});
