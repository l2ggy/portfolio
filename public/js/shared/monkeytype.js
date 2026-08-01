export const monkeytypeProfileEndpoints = (username) => {
  const profile = `https://api.monkeytype.com/users/${encodeURIComponent(username)}/profile`;
  return [`${profile}?isUid=false`, profile];
};

export const parseMonkeytypeProfile = (payload) => {
  const data = payload?.data;
  if (!data || typeof data !== "object") {
    throw new Error("Monkeytype invalid profile");
  }

  const typingStats = data.typingStats;
  const completedTests = typingStats?.completedTests ?? typingStats?.testsCompleted;
  if (!Number.isFinite(completedTests) || !Number.isFinite(typingStats?.timeTyping)) {
    throw new Error("Monkeytype invalid typing stats");
  }

  const personalBest60 = data.personalBests?.time?.["60"];
  if (
    personalBest60 != null &&
    (!Array.isArray(personalBest60) ||
      personalBest60.some((run) => !Number.isFinite(run?.wpm)))
  ) {
    throw new Error("Monkeytype invalid personal bests");
  }

  const leaderboard = data.allTimeLbs?.time?.["60"]?.english;
  if (
    leaderboard != null &&
    (typeof leaderboard !== "object" ||
      Array.isArray(leaderboard) ||
      (leaderboard.rank != null && !Number.isFinite(leaderboard.rank)) ||
      (leaderboard.count != null && !Number.isFinite(leaderboard.count)))
  ) {
    throw new Error("Monkeytype invalid leaderboard");
  }

  return {
    completedTests,
    timeTypingSeconds: typingStats.timeTyping,
    pb60: (personalBest60 || []).reduce(
      (best, run) => Math.max(best, Number.isFinite(run?.wpm) ? run.wpm : 0),
      0,
    ),
    leaderboard: {
      rank: leaderboard?.rank ?? null,
      count: leaderboard?.count ?? null,
    },
  };
};
