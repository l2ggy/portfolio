import { monkeytypeProfileEndpoints, parseMonkeytypeProfile } from "./shared/monkeytype.js";

const LEETCODE_QUERY = `
  query userProfile($username: String!) {
    matchedUser(username: $username) {
      submitStatsGlobal {
        acSubmissionNum {
          difficulty
          count
        }
      }
    }
    userContestRanking(username: $username) {
      rating
      topPercentage
    }
  }
`;
const STATS_CACHE_CONTROL = "public, max-age=900";
const UPSTREAM_TIMEOUT_MS = 8_000;
const noStore = { "cache-control": "no-store" };
const jsonResponse = (data, init = {}) =>
  new Response(JSON.stringify(data), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...noStore,
      ...init.headers,
    },
    status: init.status ?? 200,
  });
const parseVisitPath = async (request) => {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const payload = await request.json().catch(() => ({}));
    if (typeof payload?.path === "string" && payload.path.startsWith("/")) {
      return payload.path.slice(0, 512);
    }
  }

  const referer = request.headers.get("referer");
  if (!referer) {
    return "/";
  }

  try {
    return new URL(referer).pathname.slice(0, 512) || "/";
  } catch {
    return "/";
  }
};
export const isAllowedVisitOrigin = (request) => {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
};
const trackVisit = async (request, env) => {
  if (!isAllowedVisitOrigin(request)) {
    return jsonResponse({ error: "Forbidden" }, { status: 403 });
  }

  if (!env.DB) {
    return jsonResponse({ error: "Database binding not configured" }, { status: 500 });
  }

  const path = await parseVisitPath(request);
  const ip = request.headers.get("CF-Connecting-IP") || "";
  const cf = request.cf || {};
  await env.DB.prepare(
    `
      INSERT INTO visits (visited_at, path, ip, country, region, city, lat, lon)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
  )
    .bind(
      new Date().toISOString(),
      path,
      ip,
      cf.country ?? null,
      cf.region ?? null,
      cf.city ?? null,
      cf.latitude ?? null,
      cf.longitude ?? null,
    )
    .run();

  return jsonResponse({ ok: true });
};
const getVisitStats = async (env) => {
  if (!env.DB) {
    return jsonResponse({ error: "Database binding not configured" }, { status: 500 });
  }

  const [totalsResult, locationsResult] = await env.DB.batch([
    env.DB.prepare(
      "SELECT total_visits, unique_visitors FROM visit_totals WHERE id = 1",
    ),
    env.DB.prepare(
      `
        SELECT lat, lon, visit_count AS count
        FROM visit_locations
        ORDER BY visit_count DESC, lat, lon
      `,
    ),
  ]);
  const totals = totalsResult?.results?.[0];

  return jsonResponse(
    {
      totalVisits: Number(totals?.total_visits || 0),
      uniqueVisitors: Number(totals?.unique_visitors || 0),
      locations: (locationsResult?.results || []).map((row) => ({
        lat: Number(row.lat),
        lon: Number(row.lon),
        count: Number(row.count),
      })),
    },
  );
};

export const parseLeetCodeProfile = (payload) => {
  if (payload?.errors?.length) {
    throw new Error("LeetCode GraphQL errors");
  }

  const counts = payload?.data?.matchedUser?.submitStatsGlobal?.acSubmissionNum;
  if (
    !Array.isArray(counts) ||
    counts.some(
      (entry) =>
        typeof entry?.difficulty !== "string" || !Number.isFinite(entry?.count),
    )
  ) {
    throw new Error("LeetCode invalid profile");
  }

  const contest = payload.data.userContestRanking ?? null;
  if (
    contest !== null &&
    (typeof contest !== "object" ||
      Array.isArray(contest) ||
      (contest.rating != null && !Number.isFinite(contest.rating)) ||
      (contest.topPercentage != null && !Number.isFinite(contest.topPercentage)))
  ) {
    throw new Error("LeetCode invalid contest stats");
  }

  const byDifficulty = Object.fromEntries(
    counts.map(({ difficulty, count }) => [difficulty, count]),
  );
  return {
    solved: {
      all: byDifficulty.All ?? 0,
      easy: byDifficulty.Easy ?? 0,
      medium: byDifficulty.Medium ?? 0,
      hard: byDifficulty.Hard ?? 0,
    },
    contest: {
      rating: contest?.rating ?? null,
      topPercentage: contest?.topPercentage ?? null,
    },
  };
};

const getLeetCodeStats = async (username) => {
  const response = await fetch("https://leetcode.com/graphql", {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    body: JSON.stringify({
      query: LEETCODE_QUERY,
      variables: { username },
    }),
  });

  if (!response.ok) {
    await response.body?.cancel();
    throw new Error("LeetCode request failed");
  }

  return parseLeetCodeProfile(await response.json());
};

const getMonkeytypeStats = async (username) => {
  for (const endpoint of monkeytypeProfileEndpoints(username)) {
    const response = await fetch(endpoint, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (response.ok) {
      return parseMonkeytypeProfile(await response.json());
    }
    await response.body?.cancel();
  }
  throw new Error("Monkeytype request failed");
};

const getStats = async (requestUrl) => {
  const leetcode = requestUrl.searchParams.get("leetcode") || "lagsterino";
  const monkeytype = requestUrl.searchParams.get("monkeytype") || "laggy";
  const [leetcodeResult, monkeytypeResult] = await Promise.allSettled([
    getLeetCodeStats(leetcode),
    getMonkeytypeStats(monkeytype),
  ]);
  const leetcodeStats = leetcodeResult.status === "fulfilled" ? leetcodeResult.value : null;
  const monkeytypeStats = monkeytypeResult.status === "fulfilled" ? monkeytypeResult.value : null;

  return {
    complete:
      leetcodeResult.status === "fulfilled" && monkeytypeResult.status === "fulfilled",
    payload: {
      fetchedAt: new Date().toISOString(),
      leetcodeUser: leetcode,
      monkeytypeUser: monkeytype,
      leetcode: leetcodeStats,
      monkeytype: monkeytypeStats,
    },
  };
};

const getStatsResponse = async (request, requestUrl, ctx) => {
  const cache = globalThis.caches?.default;
  if (cache) {
    try {
      const cached = await cache.match(request);
      if (cached) {
        return cached;
      }
    } catch {
      // Cache availability must not affect the API.
    }
  }

  const { complete, payload } = await getStats(requestUrl);
  const response = jsonResponse(payload, {
    headers: complete ? { "cache-control": STATS_CACHE_CONTROL } : noStore,
  });

  if (complete && cache) {
    const cacheWrite = cache.put(request, response.clone()).catch(() => {});
    if (ctx?.waitUntil) {
      ctx.waitUntil(cacheWrite);
    } else {
      await cacheWrite;
    }
  }

  return response;
};

const methodNotAllowed = (allow) =>
  jsonResponse(
    { error: "Method not allowed" },
    { status: 405, headers: { allow, ...noStore } },
  );

export default {
  async fetch(request, env, ctx) {
    const requestUrl = new URL(request.url);

    if (requestUrl.pathname === "/api/visit") {
      if (request.method !== "POST") {
        return methodNotAllowed("POST");
      }
      return trackVisit(request, env);
    }

    if (requestUrl.pathname === "/api/visit-stats") {
      if (request.method !== "GET") {
        return methodNotAllowed("GET");
      }
      return getVisitStats(env);
    }

    if (requestUrl.pathname === "/api/stats") {
      if (request.method !== "GET") {
        return methodNotAllowed("GET");
      }
      return getStatsResponse(request, requestUrl, ctx);
    }

    if (requestUrl.pathname === "/api" || requestUrl.pathname.startsWith("/api/")) {
      return jsonResponse({ error: "Not found" }, { status: 404 });
    }

    return env.ASSETS.fetch(request);
  },
};
