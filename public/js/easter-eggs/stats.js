const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// The finite board has dead edges, just like the rectangular contribution graph.
export function nextGeneration(cells, width, height) {
  return cells.map((alive, index) => {
    if (alive === null) return null; // Calendar positions without a date stay outside the board.
    const x = index % width;
    const y = Math.floor(index / width);
    let neighbors = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if ((!dx && !dy) || x + dx < 0 || x + dx >= width || y + dy < 0 || y + dy >= height) continue;
        neighbors += cells[(y + dy) * width + x + dx] ? 1 : 0;
      }
    }
    return neighbors === 3 || Boolean(alive && neighbors === 2);
  });
}

export function raceWpm(value, sentence, elapsedMs) {
  // A first keystroke is not enough elapsed time for a meaningful speed.
  if (!Number.isFinite(elapsedMs) || elapsedMs < 1000) return 0;
  const correct = [...value].filter((letter, index) => letter === sentence[index]).length;
  return (correct / 5) * (60_000 / elapsedMs);
}

export function ghostPosition(elapsedMs, pace, length) {
  return Math.min(length, Math.max(0, Math.floor(elapsedMs / 60_000 * pace * 5)));
}

export function createLifeBoard(source) {
  const parsed = new DOMParser().parseFromString(source, "image/svg+xml");
  const root = parsed.documentElement;
  const width = Number(root.getAttribute("width"));
  const height = Number(root.getAttribute("height"));
  const entries = [...root.querySelectorAll("rect[data-date][data-score]")].map((rect) => ({
    x: Number(rect.getAttribute("x")), y: Number(rect.getAttribute("y")),
    width: Number(rect.getAttribute("width")), height: Number(rect.getAttribute("height")),
    score: Number(rect.getAttribute("data-score")),
    date: rect.getAttribute("data-date"),
  }));
  if (root.localName !== "svg" || parsed.querySelector("parsererror")
      || !Number.isFinite(width) || width <= 0 || width > 2048
      || !Number.isFinite(height) || height <= 0 || height > 512
      || entries.length < 300 || entries.length > 378
      || entries.some(({ date, ...rect }) => !/^\d{4}-\d{2}-\d{2}$/.test(date)
        || !Object.values(rect).every(Number.isFinite)
        || rect.x < 0 || rect.y < 0 || rect.width <= 0 || rect.height <= 0
        || rect.x + rect.width > width || rect.y + rect.height > height
        || !Number.isInteger(rect.score) || rect.score < 0 || rect.score > 4)) {
    throw new Error("Invalid contribution graph");
  }
  const columns = [...new Set(entries.map((rect) => rect.x))].sort((a, b) => a - b);
  const rows = [...new Set(entries.map((rect) => rect.y))].sort((a, b) => a - b);
  if (columns.length > 54 || rows.length !== 7) throw new Error("Invalid contribution grid");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", width);
  svg.setAttribute("height", height);
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("class", "hero-heatmap life-board is-active");
  svg.setAttribute("id", "github-heatmap");
  svg.setAttribute("aria-hidden", "true");
  const seed = Array(columns.length * rows.length).fill(null);
  const indices = [];
  // Never import remote SVG nodes, styles, attributes, or executable content.
  const rects = entries.map((entry) => {
    const rect = document.createElementNS(svg.namespaceURI, "rect");
    for (const key of ["x", "y", "width", "height"]) rect.setAttribute(key, entry[key]);
    rect.setAttribute("data-score", entry.score);
    rect.setAttribute("data-date", entry.date);
    const index = rows.indexOf(entry.y) * columns.length + columns.indexOf(entry.x);
    if (seed[index] !== null) throw new Error("Duplicate contribution cell");
    indices.push(index);
    seed[index] = entry.score > 0;
    svg.append(rect);
    return rect;
  });
  for (const label of root.querySelectorAll("text")) {
    const text = label.textContent.trim();
    const x = Number(label.getAttribute("x"));
    const y = Number(label.getAttribute("y"));
    if (!/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Mon|Wed|Fri)$/.test(text)
        || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > width || y < 0 || y > height) continue;
    const node = document.createElementNS(svg.namespaceURI, "text");
    node.textContent = text;
    node.setAttribute("x", x);
    node.setAttribute("y", y);
    node.setAttribute("class", /^(Mon|Wed|Fri)$/.test(text) ? "day-label" : "month-label");
    svg.append(node);
  }
  return { svg, rects, indices, seed, width: columns.length, height: rows.length };
}

function setupLife() {
  const placeholder = document.querySelector("#github-heatmap");
  if (!placeholder) return;
  const wrap = placeholder.parentElement;
  const label = "GitHub contributions. Activate to bring them to life.";
  let board;
  let generation = 0;
  let cells;
  let timer;
  let loading;
  let snapshotDay;
  const snapshotKey = "portfolio-contributions";
  const today = () => new Date().toISOString().slice(0, 10);
  wrap.tabIndex = 0;
  wrap.setAttribute("role", "button");
  wrap.setAttribute("aria-label", label);
  wrap.setAttribute("aria-pressed", "false");

  function showSnapshot(source) {
    const next = createLifeBoard(source);
    (board?.svg || placeholder).replaceWith(next.svg);
    board = next;
  }
  try {
    const saved = localStorage.getItem(snapshotKey);
    if (saved) showSnapshot(saved);
  } catch {
    // Invalid or unavailable storage must not prevent a fresh load.
  }

  function reset() {
    loading?.abort();
    loading = null;
    clearTimeout(timer);
    generation = 0;
    board?.svg.classList.remove("is-living");
    wrap.setAttribute("aria-label", label);
    wrap.setAttribute("aria-pressed", "false");
    wrap.removeAttribute("aria-busy");
    if (board && snapshotDay !== today()) prepare();
  }
  function step() {
    cells = nextGeneration(cells, board.width, board.height);
    generation++;
    board.svg.classList.add("is-living");
    board.rects.forEach((rect, i) => rect.classList.toggle("is-alive", cells[board.indices[i]]));
    wrap.setAttribute("aria-label", "Contributions playing Game of Life. Activate to restore.");
    wrap.setAttribute("aria-pressed", "true");
    timer = setTimeout(generation >= 36 || reducedMotion() ? reset : step,
      generation >= 36 || reducedMotion() ? 1500 : 160);
  }
  async function prepare() {
    if (loading || generation || document.hidden) return;
    if (!board || snapshotDay !== today()) {
      const controller = new AbortController();
      const requestedDay = today();
      loading = controller;
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch("/api/contributions", { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("Contribution graph unavailable");
        const source = await response.text();
        if (controller.signal.aborted || document.hidden) return;
        showSnapshot(source);
        snapshotDay = requestedDay;
        try { localStorage.setItem(snapshotKey, source); } catch { /* Storage is optional. */ }
      } catch {
        // Keep the previous snapshot usable and let the next interaction retry.
        if (!board && loading === controller) {
          placeholder.querySelector("text").textContent = "Contributions unavailable · click to retry";
        }
        return;
      } finally {
        clearTimeout(timeout);
        if (loading === controller) {
          loading = null;
          if (!board) wrap.removeAttribute("aria-busy");
        }
      }
    }
    if (wrap.hasAttribute("aria-busy")) {
      wrap.removeAttribute("aria-busy");
      activate();
    }
  }
  function activate() {
    if (generation || wrap.hasAttribute("aria-busy")) { reset(); return; }
    if (!board) {
      wrap.setAttribute("aria-busy", "true");
      prepare();
      return;
    }
    // Play the displayed snapshot, including while its replacement is loading.
    loading?.abort();
    loading = null;
    cells = board.seed;
    step();
  }
  prepare();
  wrap.addEventListener("click", activate);
  wrap.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate(); }
    if (event.key === "Escape") reset();
  });
  document.addEventListener("visibilitychange", () => document.hidden ? reset() : prepare());
  matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", reset);
}

function setupTyping() {
  const pb = document.querySelector("#monkeytype-pb");
  const copy = pb?.closest(".stats-copy");
  if (!copy) return;
  const sentence = "make simple things feel extraordinary";
  let active = false;
  function attach() {
    const chip = pb.querySelector(".stat-value");
    if (!chip || chip.tagName === "BUTTON") return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = chip.className;
    button.textContent = chip.textContent;
    button.setAttribute("aria-label", `${chip.textContent}. Race this typing pace`);
    button.addEventListener("click", () => open(button));
    chip.replaceWith(button);
  }
  new MutationObserver(attach).observe(pb, { childList: true, subtree: true });
  attach();

  function open(button) {
    const pace = Number.parseFloat(button.textContent.replaceAll(",", ""));
    if (active || !Number.isFinite(pace) || pace <= 0) return;
    active = true;
    const original = [...copy.childNodes];
    const originalHeight = copy.style.minHeight;
    copy.style.minHeight = `${copy.getBoundingClientRect().height}px`;
    const race = document.createElement("div");
    race.className = "tiny-race";
    race.innerHTML = `<div class="tiny-race-line"><span class="tiny-race-prompt" aria-hidden="true"></span><input class="tiny-race-input" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" /><i class="tiny-race-ghost" aria-hidden="true" hidden></i></div><p class="tiny-race-result"></p>`;
    const input = race.querySelector("input");
    input.setAttribute("aria-label", `Type: ${sentence}. Escape closes the race.`);
    input.setAttribute("autocorrect", "off");
    input.maxLength = sentence.length;
    const prompt = race.querySelector(".tiny-race-prompt");
    const letters = [...sentence].map((letter) => {
      const span = document.createElement("span");
      span.textContent = letter;
      prompt.append(span);
      return span;
    });
    const result = race.querySelector(".tiny-race-result");
    result.textContent = `Start typing · ghost ${Math.round(pace)} wpm`;
    const ghost = race.querySelector(".tiny-race-ghost");
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    let start = null;
    let finished = false;
    let frame;
    let restoreTimer;
    let lastGhost = -1;
    const resize = new ResizeObserver(() => { lastGhost = -1; });
    resize.observe(prompt);
    function close(focus = false) {
      if (!active) return;
      active = false;
      cancelAnimationFrame(frame);
      clearTimeout(restoreTimer);
      resize.disconnect();
      motion.removeEventListener("change", motionChange);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("visibilitychange", visibility);
      copy.replaceChildren(...original);
      copy.style.minHeight = originalHeight;
      if (focus) button.focus({ preventScroll: true });
    }
    function outside(event) { if (!copy.contains(event.target)) close(); }
    function visibility() { if (document.hidden) close(); }
    function motionChange() { close(document.activeElement === input); }
    function update(now) {
      const elapsed = now - start;
      const index = ghostPosition(elapsed, pace, sentence.length);
      if (!motion.matches && index !== lastGhost) {
        const rect = letters[Math.min(index, letters.length - 1)].getBoundingClientRect();
        const bounds = prompt.getBoundingClientRect();
        ghost.style.left = `${(index === letters.length ? rect.right : rect.left) - bounds.left}px`;
        ghost.style.top = `${rect.top - bounds.top}px`;
        ghost.style.height = `${rect.height}px`;
        ghost.hidden = false;
        lastGhost = index;
      }
      const text = elapsed < 1000 ? `Typing · ghost ${Math.round(pace)} wpm`
        : `${Math.round(raceWpm(input.value, sentence, elapsed))} wpm · ghost ${Math.round(pace)}`;
      if (result.textContent !== text) result.textContent = text;
    }
    function updateSelection() {
      const start = input.selectionStart ?? 0;
      const end = input.selectionEnd ?? start;
      letters.forEach((span, index) => {
        span.classList.toggle("is-current", !finished && index === Math.min(start, letters.length - 1));
        span.classList.toggle("is-end", start === letters.length && index === letters.length - 1);
        span.classList.toggle("is-selected", index >= start && index < end);
      });
    }
    function tick(now) {
      if (!active || finished) return;
      update(now);
      frame = requestAnimationFrame(tick);
    }
    input.addEventListener("input", (event) => {
      if (event.isComposing || finished) return;
      if (start === null && input.value) {
        start = performance.now();
        if (!motion.matches) frame = requestAnimationFrame(tick);
      }
      letters.forEach((span, index) => {
        span.className = index < input.value.length ? input.value[index] === sentence[index] ? "is-correct" : "is-wrong" : "";
      });
      updateSelection();
      if (start !== null) update(performance.now());
      if (input.value === sentence) {
        finished = true;
        cancelAnimationFrame(frame);
        input.readOnly = true;
        updateSelection();
        result.setAttribute("role", "status");
        const wpm = Math.round(raceWpm(sentence, sentence, performance.now() - start));
        result.textContent = `${wpm} wpm · Boris ${Math.round(pace)}${wpm > pace ? " · caught the ghost" : ""}`;
        restoreTimer = setTimeout(() => close(document.activeElement === input), 4000);
      }
    });
    ["selectionchange", "select", "keyup", "click"].forEach((event) => input.addEventListener(event, updateSelection));
    input.addEventListener("paste", (event) => event.preventDefault());
    input.addEventListener("drop", (event) => event.preventDefault());
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") { event.preventDefault(); close(true); }
    });
    race.addEventListener("focusout", (event) => {
      if (!race.contains(event.relatedTarget)) close();
    });
    motion.addEventListener("change", motionChange);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("visibilitychange", visibility);
    copy.replaceChildren(race);
    input.focus({ preventScroll: true });
    updateSelection();
  }
}

export function setupStatsEggs() {
  setupLife();
  setupTyping();
}
