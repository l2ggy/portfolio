import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import worker from "../src/worker.js";

const migration = (name) =>
  readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8");

const createD1 = (db) => ({
  prepare(sql) {
    const statement = db.prepare(sql);
    let values = [];
    return {
      bind(...nextValues) {
        values = nextValues;
        return this;
      },
      async run() {
        return statement.run(...values);
      },
      all() {
        return statement.all(...values).map((row) => ({ ...row }));
      },
    };
  },
  async batch(statements) {
    return statements.map((statement) => ({ results: statement.all() }));
  },
});

test("visit aggregates seed existing rows and track future raw inserts", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(migration("0001_visits.sql"));
    const insertVisit = db.prepare(`
      INSERT INTO visits (visited_at, path, ip, country, region, city, lat, lon)
      VALUES (?, '/', ?, 'CA', 'Ontario', 'Toronto', ?, ?)
    `);
    insertVisit.run("2026-01-01T00:00:00.000Z", "203.0.113.1", 43.6532, -79.3832);
    insertVisit.run("2026-01-01T00:01:00.000Z", "203.0.113.1", 43.6532, -79.3832);

    db.exec(migration("0002_aggregate_visits.sql"));
    assert.deepEqual(
      { ...db.prepare("SELECT total_visits, unique_visitors FROM visit_totals").get() },
      { total_visits: 2, unique_visitors: 1 },
    );
    assert.deepEqual(
      { ...db.prepare("SELECT lat, lon, visit_count FROM visit_locations").get() },
      { lat: 43.65, lon: -79.38, visit_count: 2 },
    );

    insertVisit.run("2026-01-01T00:02:00.000Z", "203.0.113.1", 43.6533, -79.3831);
    insertVisit.run("2026-01-01T00:03:00.000Z", "203.0.113.2", 40.7128, -74.006);

    assert.deepEqual(
      { ...db.prepare("SELECT total_visits, unique_visitors FROM visit_totals").get() },
      { total_visits: 4, unique_visitors: 2 },
    );
    assert.deepEqual(
      db
        .prepare(
          "SELECT lat, lon, visit_count FROM visit_locations ORDER BY visit_count DESC, lat, lon",
        )
        .all()
        .map((row) => ({ ...row })),
      [
        { lat: 43.65, lon: -79.38, visit_count: 3 },
        { lat: 40.71, lon: -74.01, visit_count: 1 },
      ],
    );
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM visits").get().count, 4);
  } finally {
    db.close();
  }
});

test("a completed visit write is immediately visible through uncached visit stats", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(migration("0001_visits.sql"));
    db.exec(migration("0002_aggregate_visits.sql"));
    const DB = createD1(db);
    const visitRequest = new Request("https://portfolio.example/api/visit", {
      method: "POST",
      headers: {
        "CF-Connecting-IP": "203.0.113.1",
        origin: "https://portfolio.example",
      },
    });
    Object.defineProperty(visitRequest, "cf", {
      value: { latitude: "43.6532", longitude: "-79.3832" },
    });

    const visitResponse = await worker.fetch(visitRequest, { DB });
    const statsResponse = await worker.fetch(
      new Request("https://portfolio.example/api/visit-stats"),
      { DB },
    );

    assert.deepEqual(await visitResponse.json(), { ok: true });
    assert.equal(visitResponse.headers.get("cache-control"), "no-store");
    assert.equal(statsResponse.headers.get("cache-control"), "no-store");
    assert.deepEqual(await statsResponse.json(), {
      totalVisits: 1,
      uniqueVisitors: 1,
      locations: [{ lat: 43.65, lon: -79.38, count: 1 }],
    });
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM visits").get().count, 1);
  } finally {
    db.close();
  }
});
