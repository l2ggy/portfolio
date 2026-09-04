export const leafTrajectory = (startX, startY, width, height, seed = 0) => {
  const distance = Math.max(80, height - startY - 64);
  return [0, 0.16, 0.35, 0.58, 0.8, 1].map((offset, index) => {
    const gust = index ? Math.sin(index * 1.8 + seed) * 44 - index * 12 : 0;
    return {
      x: Math.max(18, Math.min(width - 18, startX + gust)) - startX,
      y: distance * offset,
      rotation: index * 82 + Math.sin(index * 2) * 28,
      tilt: Math.sin(index * 1.6) * 65,
      opacity: offset === 1 ? 0 : 1,
      offset,
    };
  });
};

function setupLaggy(motion) {
  const home = document.querySelector(".logo-slot");
  const word = home?.querySelector("span");
  if (!word) return () => {};
  const text = word.textContent;
  let timer;
  function clear() {
    clearTimeout(timer);
    if (timer) {
      word.classList.remove("is-lagging");
      word.textContent = text;
    }
    timer = null;
  }
  function play() {
    if (timer || motion.matches || document.hidden) return;
    word.replaceChildren(...[...text].map((letter, index) => {
      const span = document.createElement("span");
      span.className = "laggy-letter";
      span.textContent = letter;
      span.dataset.letter = letter;
      span.style.setProperty("--letter-index", index);
      return span;
    }));
    word.classList.add("is-lagging");
    timer = setTimeout(clear, 1100);
  }
  home.addEventListener("pointerenter", (event) => { if (event.pointerType === "mouse") play(); });
  home.addEventListener("focus", play);
  home.addEventListener("click", play);
  return clear;
}

function setupMapleLeaf(motion) {
  const link = document.querySelector('.topbar-webring a[href="https://webring.ca"]');
  if (!link) return () => {};
  const symbol = document.createElement("span");
  symbol.textContent = link.textContent;
  link.replaceChildren(symbol);
  let flight;
  let leaf;
  let timer;
  let origin;
  let held = false;
  let release = 0;
  function cancelPending() {
    clearTimeout(timer);
    timer = null;
    origin = null;
  }
  function clear() {
    cancelPending();
    held = false;
    if (flight) flight.onfinish = null;
    flight?.cancel();
    flight = null;
    leaf?.remove();
    leaf = null;
    symbol.classList.remove("maple-away");
  }
  function schedule(touch = false) {
    cancelPending();
    if (leaf || motion.matches || document.hidden) return;
    timer = setTimeout(() => {
      timer = null;
      if (motion.matches || document.hidden) return;
      held = touch;
      const rect = link.getBoundingClientRect();
      leaf = document.createElement("span");
      leaf.className = "maple-flight";
      leaf.textContent = symbol.textContent;
      leaf.setAttribute("aria-hidden", "true");
      leaf.style.left = `${rect.left}px`;
      leaf.style.top = `${rect.top}px`;
      document.body.append(leaf);
      symbol.classList.add("maple-away");
      flight = leaf.animate(leafTrajectory(rect.left, rect.top, innerWidth, innerHeight, release++ * .7).map((point) => ({
        transform: `translate3d(${point.x}px, ${point.y}px, 0) rotate(${point.rotation}deg) rotateY(${point.tilt}deg)`,
        opacity: point.opacity, offset: point.offset,
      })), { duration: 3800, easing: "linear" });
      flight.onfinish = () => {
        // A long touch may still be down when the flight ends; consume its eventual click.
        const consumeClick = held;
        clear();
        held = consumeClick;
      };
    }, 5000);
  }
  link.addEventListener("pointerenter", (event) => { if (event.pointerType === "mouse") schedule(); });
  link.addEventListener("pointerleave", cancelPending);
  link.addEventListener("pointerdown", (event) => {
    cancelPending();
    held = false;
    if (event.pointerType === "mouse" || event.isPrimary === false) return;
    schedule(true);
    origin = { x: event.clientX, y: event.clientY, id: event.pointerId };
  });
  link.addEventListener("pointermove", (event) => {
    if (origin && event.pointerId === origin.id && Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 8) cancelPending();
  });
  link.addEventListener("pointerup", cancelPending);
  link.addEventListener("pointercancel", clear);
  link.addEventListener("focus", () => { if (link.matches(":focus-visible")) schedule(); });
  link.addEventListener("blur", clear);
  link.addEventListener("click", (event) => {
    if (held) { event.preventDefault(); event.stopImmediatePropagation(); }
    held = false;
    cancelPending();
  }, true);
  link.addEventListener("contextmenu", (event) => { if (origin && timer || held) event.preventDefault(); });
  window.addEventListener("scroll", clear, { passive: true });
  window.addEventListener("resize", clear);
  return clear;
}

export function setupDetails() {
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const clearLaggy = setupLaggy(motion);
  const clearMaple = setupMapleLeaf(motion);
  const clear = () => { clearLaggy(); clearMaple(); };
  window.addEventListener("blur", clear);
  window.addEventListener("pagehide", clear);
  document.addEventListener("visibilitychange", () => { if (document.hidden) clear(); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") clear(); });
  motion.addEventListener("change", clear);
}
