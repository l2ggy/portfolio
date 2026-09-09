import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { nextGeneration, raceWpm, ghostPosition, setupStatsEggs } from "../public/js/easter-eggs/stats.js";

test("heatmap and Life share a snapshot across activation, rollover, cancellation, and retry", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: Date.UTC(2026, 8, 8, 12) });
  const element = (attributes = {}) => {
    const classes = new Set();
    return Object.assign(new EventTarget(), {
      children: [], namespaceURI: "http://www.w3.org/2000/svg",
      getAttribute: (key) => attributes[key] ?? null,
      hasAttribute: (key) => key in attributes,
      setAttribute: (key, value) => { attributes[key] = String(value); },
      removeAttribute: (key) => { delete attributes[key]; },
      append(child) { child.parentElement = this; this.children.push(child); },
      replaceWith(next) {
        const parent = this.parentElement;
        parent.children[parent.children.indexOf(this)] = next;
        next.parentElement = parent;
      },
      querySelector: () => ({ textContent: "" }),
      classList: {
        add: (name) => classes.add(name), remove: (name) => classes.delete(name),
        contains: (name) => classes.has(name),
        toggle: (name, active) => active ? classes.add(name) : classes.delete(name),
      },
    });
  };
  const root = element({ width: "663", height: "104" });
  root.localName = "svg";
  let cellCount = 371;
  root.querySelectorAll = (selector) => selector === "text" ? [] : Array.from({ length: cellCount }, (_, i) => element({
    x: 15 + Math.floor(i / 7) * 12, y: 20 + i % 7 * 12,
    width: 10, height: 10, "data-score": i % 5,
    "data-date": new Date(Date.UTC(2025, 8, 3 + i)).toISOString().slice(0, 10),
  }));
  let image;
  let wrap;
  const requests = [];
  let saved = null;
  let restoreSaved = false;
  let storageBlocked = false;
  const document = Object.assign(new EventTarget(), {
    hidden: false,
    querySelector: (selector) => selector === "#github-heatmap" ? image : null,
    createElementNS: () => element(),
  });
  const globals = {
    document, matchMedia: () => Object.assign(new EventTarget(), { matches: false }),
    DOMParser: class { parseFromString(source) {
      if (source === "corrupt") throw new Error("Invalid saved SVG");
      return { documentElement: root, querySelector: () => null };
    } },
    fetch: (_, options) => new Promise((resolve) => requests.push({ resolve, ...options })),
    localStorage: {
      getItem() { if (storageBlocked) throw new Error("Storage blocked"); return restoreSaved ? saved : null; },
      setItem(_, value) { if (storageBlocked) throw new Error("Storage full"); saved = value; },
    },
  };
  for (const [name, value] of Object.entries(globals)) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    t.after(() => previous ? Object.defineProperty(globalThis, name, previous) : delete globalThis[name]);
  }
  const setup = () => {
    wrap = element();
    image = element();
    wrap.append(image);
    setupStatsEggs();
  };
  const click = () => wrap.dispatchEvent(new Event("click"));
  const respond = async (status = 200) => {
    requests.at(-1).resolve(new Response("<svg/>", { status }));
    await setImmediate();
  };

  setup();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].cache, "no-store");
  await respond();
  assert.equal(wrap.getAttribute("aria-pressed"), "false", "preparing must not start Life");
  const snapshot = wrap.children[0];
  assert.equal(snapshot.getAttribute("width"), "663", "preserve the image's intrinsic width for mobile grid sizing");
  assert.equal(snapshot.getAttribute("height"), "104");
  const dates = snapshot.children.map((rect) => rect.getAttribute("data-date"));
  const scores = snapshot.children.map((rect) => rect.getAttribute("data-score"));
  click();
  assert.equal(wrap.getAttribute("aria-pressed"), "true", "a ready board starts synchronously");
  assert.equal(requests.length, 1);
  assert.equal(wrap.children[0], snapshot, "starting Life must reuse the visible SVG");
  assert.deepEqual(snapshot.children.map((rect) => rect.getAttribute("data-date")), dates);
  click();
  assert.equal(snapshot.classList.contains("is-living"), false);
  assert.deepEqual(snapshot.children.map((rect) => rect.getAttribute("data-score")), scores);

  document.hidden = true;
  document.dispatchEvent(new Event("visibilitychange"));
  t.mock.timers.setTime(Date.UTC(2026, 8, 9, 12));
  cellCount++;
  document.hidden = false;
  document.dispatchEvent(new Event("visibilitychange"));
  assert.equal(requests.length, 2);
  assert.equal(wrap.children[0], snapshot, "keep the displayed snapshot until refresh succeeds");
  await respond();
  const nextSnapshot = wrap.children[0];
  assert.notEqual(nextSnapshot, snapshot);
  assert.equal(nextSnapshot.children.length, cellCount);
  click();
  assert.equal(wrap.children[0], nextSnapshot, "the next day must not add a square on activation");
  click();

  t.mock.timers.setTime(Date.UTC(2026, 8, 10, 12));
  document.dispatchEvent(new Event("visibilitychange"));
  click();
  assert.equal(requests.at(-1).signal.aborted, true, "activation cancels a background replacement");
  await respond();
  assert.equal(wrap.children[0], nextSnapshot, "a late refresh cannot replace the running board");
  click();
  await respond(502);
  assert.equal(wrap.children[0], nextSnapshot, "a failed refresh preserves the complete snapshot");

  setup();
  click();
  assert.equal(requests.length, 5, "click shares the in-flight preload");
  await respond();
  assert.equal(wrap.getAttribute("aria-pressed"), "true");
  click();

  setup();
  click();
  click();
  assert.equal(requests.at(-1).signal.aborted, true);
  await respond();
  assert.equal(wrap.children[0], image, "cancelled preparation cannot start later");
  click();
  await respond(502);
  assert.equal(wrap.hasAttribute("aria-busy"), false);
  click();
  await respond();
  assert.equal(wrap.getAttribute("aria-pressed"), "true", "failures remain retryable");
  click();

  restoreSaved = true;
  assert.equal(saved, "<svg/>", "persist the last successfully validated snapshot");
  setup();
  const restored = wrap.children[0];
  assert.notEqual(restored, image, "repeat visits render synchronously before the network responds");
  click();
  assert.equal(wrap.getAttribute("aria-pressed"), "true");
  await respond();
  assert.equal(wrap.children[0], restored, "a late response cannot change the playing cached snapshot");
  click();
  await respond();
  assert.notEqual(wrap.children[0], restored, "refresh both views together after play ends");

  saved = "corrupt";
  setup();
  assert.equal(wrap.children[0], image, "invalid saved data is never rendered");
  await respond();
  assert.notEqual(wrap.children[0], image);
  storageBlocked = true;
  setup();
  await respond();
  assert.notEqual(wrap.children[0], image, "storage errors cannot prevent the live chart from loading");
});

test("a Life blinker oscillates and cells never wrap across board edges", () => {
  const horizontal = [false, false, false, true, true, true, false, false, false];
  const vertical = [false, true, false, false, true, false, false, true, false];
  assert.deepEqual(nextGeneration(horizontal, 3, 3), vertical);
  assert.deepEqual(nextGeneration(vertical, 3, 3), horizontal);
  const block = [true, true, false, true, true, false, false, false, false];
  assert.deepEqual(nextGeneration(block, 3, 3), block);
  assert.deepEqual(nextGeneration([true, true, false, false], 4, 1), [false, false, false, false]);
  assert.deepEqual(nextGeneration([true, true, true, null], 2, 2), [true, true, true, null],
    "missing calendar dates cannot be born or affect later generations");
});

test("race scoring uses correct characters and elapsed time; ghost stops at sentence end", () => {
  assert.equal(raceWpm("hello world", "hello world", 12_000), 11);
  assert.equal(raceWpm("hello xorld", "hello world", 12_000), 10);
  assert.equal(raceWpm("hello", "hello", 0), 0);
  assert.equal(raceWpm("h", "hello", 16), 0);
  assert.equal(raceWpm("h", "hello", Number.NaN), 0);
  assert.equal(raceWpm("hello EXTRA", "hello", 12_000), 5);
  assert.equal(ghostPosition(6_000, 120, 100), 60);
  assert.equal(ghostPosition(60_000, 120, 100), 100);
  assert.equal(ghostPosition(-1, 120, 100), 0);
});
