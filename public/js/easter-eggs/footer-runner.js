const RUNNER_X = 12;
const GRAVITY = 115;
const JUMP_SPEED = 45;

const patterns = [
  [{ offset: 0, width: 3, height: 6, bottom: 0 }],
  [{ offset: 0, width: 8, height: 3, bottom: 0 }],
  [{ offset: 0, width: 3, height: 4, bottom: 0 }, { offset: 7, width: 3, height: 4, bottom: 0 }],
  [{ offset: 0, width: 8, height: 3, bottom: 10 }],
];

export const createRunner = (width) => ({
  height: 0, velocity: 0, elapsed: 0, cleared: 0, crashed: false,
  obstacles: [{ x: width + 10, kind: 0 }], gap: 100,
});

export function advanceRunner(state, seconds, width, random = Math.random) {
  if (state.crashed) return;
  state.elapsed += seconds;
  state.height = Math.max(0, state.height + state.velocity * seconds - GRAVITY * seconds * seconds / 2);
  state.velocity = state.height ? state.velocity - GRAVITY * seconds : 0;
  const distance = Math.min(80, 48 + state.elapsed * .8) * seconds;
  for (const obstacle of state.obstacles) {
    obstacle.x -= distance;
    for (const block of patterns[obstacle.kind]) {
      const x = obstacle.x + block.offset;
      if (x + block.width > RUNNER_X + 1 && x < RUNNER_X + 6
          && state.height < block.bottom + block.height && state.height + 7 > block.bottom) state.crashed = true;
    }
  }
  const last = state.obstacles.at(-1);
  if (last.x <= width - state.gap) {
    // Introduce birds after a few ground obstacles; never repeat the last pattern.
    const count = state.cleared < 3 ? 3 : patterns.length;
    let kind = Math.floor(random() * (count - 1));
    if (kind >= last.kind) kind++;
    state.obstacles.push({ x: last.x + state.gap, kind });
    state.gap = 72 + Math.floor(random() * 49);
  }
  if (state.obstacles[0].x < -10) {
    state.obstacles.shift();
    state.cleared++;
  }
}

export default function setupFooterRunner() {
  const paragraph = document.querySelector(".footer-content > p");
  if (!paragraph || paragraph.querySelector(".footer-runner-year")) return;
  const copyright = paragraph.textContent;
  const match = copyright.match(/\b\d{4}\b/);
  if (!match) return;
  const year = document.createElement("button");
  year.type = "button";
  year.className = "footer-runner-year";
  year.textContent = match[0];
  year.setAttribute("aria-label", `${match[0]}. Double-click or press Enter to play a tiny jumping game.`);
  const before = copyright.slice(0, match.index);
  const after = copyright.slice(match.index + match[0].length);
  const restore = () => paragraph.replaceChildren(before, year, after);
  restore();
  let active = false;

  function start(keyboard = false) {
    if (active || document.hidden) return;
    const { width, height } = paragraph.getBoundingClientRect();
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) return;
    active = true;
    const scale = window.devicePixelRatio || 1;
    const viewportWidth = innerWidth;
    canvas.width = Math.ceil(width * scale);
    canvas.height = Math.ceil(height * scale);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.className = `footer-runner${keyboard ? " is-keyboard" : ""}`;
    canvas.tabIndex = 0;
    canvas.setAttribute("role", "button");
    canvas.setAttribute("aria-label", "Tiny runner. Space or tap jumps over blocks; stay low under birds. Escape closes.");
    context.scale(scale, scale);
    paragraph.replaceChildren(canvas);
    canvas.focus({ preventScroll: true });
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const events = new AbortController();
    const { signal } = events;
    let state;
    let playing = false;
    let frame;
    let timeout;
    let lastTime;

    function stop(returnFocus = false) {
      if (!active) return;
      active = false;
      events.abort();
      clearTimeout(timeout);
      cancelAnimationFrame(frame);
      restore();
      if (returnFocus) year.focus({ preventScroll: true });
    }

    function keepAlive() {
      clearTimeout(timeout);
      timeout = setTimeout(() => stop(), 10000);
    }

    function draw() {
      const ground = Math.floor(height - 2);
      const top = ground - 7 - state.height;
      context.clearRect(0, 0, width, height);
      context.fillStyle = getComputedStyle(canvas).color;
      context.globalAlpha = .26;
      context.fillRect(0, ground + .5, width, .5);
      context.globalAlpha = .88;
      // A six-pixel silhouette keeps its eyes, body and feet readable at footer size.
      context.fillRect(RUNNER_X + 2, top, 4, 3);
      context.clearRect(RUNNER_X + 4, top + 1, 1, 1);
      context.fillRect(RUNNER_X + 1, top + 3, 3, 2);
      context.fillRect(RUNNER_X, top + 2, 1, 2);
      const stride = playing && !motion.matches && !state.height && Math.floor(state.elapsed * 10) % 2;
      context.fillRect(RUNNER_X + 1, top + 5, 1, stride ? 1 : 2);
      context.fillRect(RUNNER_X + 3, top + 5, 1, stride ? 2 : 1);
      if (playing || state.crashed) {
        for (const obstacle of state.obstacles) {
          if (!playing && obstacle.x > RUNNER_X + 6) continue;
          for (const block of patterns[obstacle.kind]) {
            const x = obstacle.x + block.offset;
            const y = ground - block.bottom - block.height;
            if (block.bottom) {
              const wing = playing && !motion.matches && Math.floor(state.elapsed * 8) % 2 ? 0 : 2;
              context.fillRect(x + 3, y + 1, 2, 2);
              context.fillRect(x, y + wing, 3, 1);
              context.fillRect(x + 5, y + wing, 3, 1);
            } else context.fillRect(x, y, block.width, block.height);
          }
        }
      }
      if (!playing) {
        context.globalAlpha = .7;
        context.font = "9px ui-monospace, monospace";
        context.fillText(state.crashed ? `${state.cleared} · again?` : "space / tap", 29, ground - 3);
      }
      context.globalAlpha = 1;
    }

    function tick(now) {
      if (!active || !playing) return;
      const seconds = Math.min((now - lastTime) / 1000, .04);
      lastTime = now;
      advanceRunner(state, seconds, width);
      if (state.crashed) {
        playing = false;
        canvas.setAttribute("aria-label", `Runner stopped after ${state.cleared} obstacles. Press Space or tap to retry. Escape closes.`);
      }
      draw();
      if (playing) frame = requestAnimationFrame(tick);
    }

    function jump() {
      keepAlive();
      if (!playing) {
        state = createRunner(width);
        playing = true;
        lastTime = performance.now();
        canvas.setAttribute("aria-label", "Tiny runner. Space or tap jumps over blocks; stay low under birds. Escape closes.");
        frame = requestAnimationFrame(tick);
      }
      if (!state.height) state.velocity = JUMP_SPEED;
    }

    canvas.addEventListener("keydown", (event) => {
      if (event.key === "Escape") { event.preventDefault(); stop(true); }
      if ((event.code === "Space" || event.key === "Enter") && !event.altKey && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        canvas.classList.add("is-keyboard");
        if (!event.repeat) jump();
      }
    }, { signal });
    canvas.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.isPrimary === false) return;
      event.preventDefault();
      jump();
    }, { signal });
    canvas.addEventListener("click", (event) => { if (!event.detail) jump(); }, { signal });
    canvas.addEventListener("blur", () => stop(), { signal });
    document.addEventListener("pointerdown", (event) => { if (!paragraph.contains(event.target)) stop(); }, { signal });
    document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); }, { signal });
    window.addEventListener("blur", () => stop(), { signal });
    window.addEventListener("pagehide", () => stop(), { signal });
    window.addEventListener("resize", () => { if (innerWidth !== viewportWidth || devicePixelRatio !== scale) stop(); }, { signal });
    motion.addEventListener("change", () => stop(), { signal });
    state = createRunner(width);
    keepAlive();
    draw();
  }

  year.addEventListener("dblclick", () => start());
  year.addEventListener("click", (event) => { if (!event.detail) start(true); });
  year.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.code === "Space") {
      event.preventDefault();
      if (!event.repeat) start(true);
    }
  });
}
