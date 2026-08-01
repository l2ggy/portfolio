const UNAVAILABLE_TEXT = "Unavailable right now.";
const SELECTORS = {
  leetcodeSolved: "#leetcode-solved",
  leetcodeContest: "#leetcode-contest",
  leetcodePercentile: "#leetcode-percentile",
  monkeytypeSummary: "#monkeytype-summary",
  monkeytypePb: "#monkeytype-pb",
  monkeytypePercentile: "#monkeytype-percentile",
};

const formatNumber = (value, digits = 0) =>
  new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);

const setText = (section, selector, text) => {
  const element = section.querySelector(selector);
  if (element) {
    element.textContent = text;
  }
};

const setMarkup = (section, selector, markup) => {
  const element = section.querySelector(selector);
  if (element) {
    element.innerHTML = markup;
  }
};

const normalPdf = (x) => Math.exp(-(x * x) / 2) / Math.sqrt(2 * Math.PI);

const inverseStandardNormal = (p) => {
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const low = 0.02425;
  const high = 1 - low;

  if (p <= 0 || p >= 1) {
    return null;
  }

  if (p < low) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5])
      / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }

  if (p > high) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5])
      / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }

  const q = p - 0.5;
  const r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q
    / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
};

const renderPercentile = (section, selector, percentile) => {
  const element = section.querySelector(selector);
  if (!element) {
    return;
  }

  if (!Number.isFinite(percentile) || percentile <= 0 || percentile > 100) {
    element.hidden = true;
    element.replaceChildren();
    return;
  }

  const chartWidth = 228;
  const chartHeight = 72;
  const left = 6;
  const right = chartWidth - 6;
  const top = 4;
  const baseline = chartHeight - 7;
  const thresholdZ = inverseStandardNormal(1 - percentile / 100);
  if (thresholdZ === null) {
    element.hidden = true;
    element.replaceChildren();
    return;
  }

  const xMax = Math.max(3.5, thresholdZ + 0.6);
  const xMin = -xMax;
  const yMax = normalPdf(0);
  const mapX = (x) => left + ((x - xMin) / (xMax - xMin)) * (right - left);
  const mapY = (y) => baseline - (y / yMax) * (baseline - top);
  const pointCount = 140;
  const curvePoints = [];

  for (let index = 0; index <= pointCount; index += 1) {
    const x = xMin + (index / pointCount) * (xMax - xMin);
    curvePoints.push(`${mapX(x)},${mapY(normalPdf(x))}`);
  }

  const clampedThreshold = Math.max(xMin, Math.min(xMax, thresholdZ));
  const markerX = mapX(clampedThreshold);
  const markerY = mapY(normalPdf(clampedThreshold));
  const shadePoints = [`${markerX},${baseline}`];

  for (let index = 0; index <= pointCount; index += 1) {
    const x = clampedThreshold + (index / pointCount) * (xMax - clampedThreshold);
    shadePoints.push(`${mapX(x)},${mapY(normalPdf(x))}`);
  }
  shadePoints.push(`${right},${baseline}`);

  element.hidden = false;
  element.innerHTML = `
    <svg viewBox="0 0 ${chartWidth} ${chartHeight}" role="img" aria-label="Standard normal curve with top ${formatNumber(percentile, 2)} percent tail highlighted">
      <line class="percentile-axis" x1="${left}" y1="${baseline}" x2="${right}" y2="${baseline}" />
      <polygon class="percentile-fill" points="${shadePoints.join(" ")}" />
      <polyline class="percentile-curve" points="${curvePoints.join(" ")}" />
      <line class="percentile-marker" x1="${markerX}" y1="${baseline}" x2="${markerX}" y2="${markerY}" />
      <circle class="percentile-dot" cx="${markerX}" cy="${markerY}" r="2" />
    </svg>
  `;
};

const setStatsFallback = (section) => {
  [
    SELECTORS.leetcodeSolved,
    SELECTORS.leetcodeContest,
    SELECTORS.monkeytypeSummary,
    SELECTORS.monkeytypePb,
  ].forEach((selector) => setText(section, selector, UNAVAILABLE_TEXT));
  renderPercentile(section, SELECTORS.leetcodePercentile, null);
  renderPercentile(section, SELECTORS.monkeytypePercentile, null);
};

const renderStats = (section, { leetcode, monkeytype }) => {
  const solved = leetcode?.solved;
  const contest = leetcode?.contest;

  setText(section, SELECTORS.leetcodeSolved, UNAVAILABLE_TEXT);
  if (solved && [solved.all, solved.easy, solved.medium, solved.hard].every(Number.isFinite)) {
    setMarkup(
      section,
      SELECTORS.leetcodeSolved,
      `<span class="stat-value">${formatNumber(solved.all)}</span> solved (<span class="stat-value">${formatNumber(solved.easy)}</span> easy · <span class="stat-value">${formatNumber(solved.medium)}</span> medium · <span class="stat-value">${formatNumber(solved.hard)}</span> hard)`,
    );
  }

  setText(section, SELECTORS.leetcodeContest, UNAVAILABLE_TEXT);
  if (Number.isFinite(contest?.rating) && Number.isFinite(contest?.topPercentage)) {
    setMarkup(
      section,
      SELECTORS.leetcodeContest,
      `Contest rating: <span class="stat-value">${formatNumber(Math.round(contest.rating))}</span> · top <span class="stat-value">${formatNumber(contest.topPercentage, 2)}%</span>`,
    );
  }
  renderPercentile(section, SELECTORS.leetcodePercentile, contest?.topPercentage);

  const hasMonkeytypeStats = [
    monkeytype?.completedTests,
    monkeytype?.timeTypingSeconds,
    monkeytype?.pb60,
  ].every(Number.isFinite);
  if (!hasMonkeytypeStats) {
    setText(section, SELECTORS.monkeytypeSummary, UNAVAILABLE_TEXT);
    setText(section, SELECTORS.monkeytypePb, UNAVAILABLE_TEXT);
    renderPercentile(section, SELECTORS.monkeytypePercentile, null);
    return;
  }

  const { leaderboard } = monkeytype;
  const typingHours = monkeytype.timeTypingSeconds / 3600;
  const topPercent = Number.isFinite(leaderboard?.rank)
      && Number.isFinite(leaderboard?.count)
      && leaderboard.count > 0
    ? (leaderboard.rank / leaderboard.count) * 100
    : null;

  setMarkup(
    section,
    SELECTORS.monkeytypeSummary,
    `<span class="stat-value">${formatNumber(monkeytype.completedTests)}</span> tests completed · <span class="stat-value">${formatNumber(typingHours, 1)}h</span> total typing`,
  );
  setMarkup(
    section,
    SELECTORS.monkeytypePb,
    topPercent
      ? `PB (60s): <span class="stat-value">${formatNumber(monkeytype.pb60, 2)} WPM</span> · top <span class="stat-value">${formatNumber(topPercent, 2)}%</span>`
      : `PB (60s): <span class="stat-value">${formatNumber(monkeytype.pb60, 2)} WPM</span>`,
  );
  renderPercentile(section, SELECTORS.monkeytypePercentile, topPercent);
};

const loadMonkeytypeDirect = async (username) => {
  const { monkeytypeProfileEndpoints, parseMonkeytypeProfile } = await import(
    "./shared/monkeytype.js"
  );
  for (const endpoint of monkeytypeProfileEndpoints(username)) {
    const response = await fetch(endpoint, { headers: { accept: "application/json" } });
    if (response.ok) {
      return parseMonkeytypeProfile(await response.json());
    }
  }
  return null;
};

const loadStats = async (section) => {
  const leetcode = section.dataset.leetcodeUser || "lagsterino";
  const monkeytype = section.dataset.monkeytypeUser || "laggy";
  const query = new URLSearchParams({ leetcode, monkeytype });
  const response = await fetch(`/api/stats?${query.toString()}`);
  if (!response.ok) {
    throw new Error(`Unable to load stats (${response.status})`);
  }

  const payload = await response.json();
  if (!payload || typeof payload !== "object") {
    throw new TypeError("Stats response must be an object");
  }
  if (!payload.monkeytype) {
    payload.monkeytype = await loadMonkeytypeDirect(monkeytype).catch(() => null);
  }
  return payload;
};

export const setupStats = () => {
  const section = document.querySelector("#stats");
  if (!section) {
    return;
  }

  loadStats(section)
    .then((stats) => renderStats(section, stats))
    .catch(() => setStatsFallback(section));
};
