import assert from "node:assert/strict";
import test from "node:test";

import {
  monkeytypeProfileEndpoints,
  parseMonkeytypeProfile,
} from "../src/shared/monkeytype.js";

test("monkeytypeProfileEndpoints encodes a username once and preserves the fallback", () => {
  assert.deepEqual(monkeytypeProfileEndpoints("typing user/name"), [
    "https://api.monkeytype.com/users/typing%20user%2Fname/profile?isUid=false",
    "https://api.monkeytype.com/users/typing%20user%2Fname/profile",
  ]);
});

test("parseMonkeytypeProfile extracts stats and the fastest 60-second run", () => {
  const profile = parseMonkeytypeProfile({
    data: {
      typingStats: { completedTests: 123, timeTyping: 7_200 },
      personalBests: {
        time: {
          60: [{ wpm: 101.5 }, { wpm: 118.25 }, { wpm: 110 }],
        },
      },
      allTimeLbs: {
        time: {
          60: { english: { rank: 42, count: 10_000 } },
        },
      },
    },
  });

  assert.deepEqual(profile, {
    completedTests: 123,
    timeTypingSeconds: 7_200,
    pb60: 118.25,
    leaderboard: { rank: 42, count: 10_000 },
  });
});

test("parseMonkeytypeProfile tolerates optional personal-best and leaderboard data", () => {
  assert.deepEqual(
    parseMonkeytypeProfile({ data: { typingStats: { testsCompleted: 4, timeTyping: 30 } } }),
    {
      completedTests: 4,
      timeTypingSeconds: 30,
      pb60: 0,
      leaderboard: { rank: null, count: null },
    },
  );
});

test("parseMonkeytypeProfile rejects an invalid payload", () => {
  assert.throws(() => parseMonkeytypeProfile({ message: "error" }), /invalid profile/);
  assert.throws(
    () => parseMonkeytypeProfile({ data: { typingStats: {} } }),
    /invalid typing stats/,
  );
  assert.throws(
    () =>
      parseMonkeytypeProfile({
        data: {
          typingStats: { completedTests: 1, timeTyping: 1 },
          personalBests: { time: { 60: [{ wpm: "fast" }] } },
        },
      }),
    /invalid personal bests/,
  );
});
