import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { nextGeneration, raceWpm, ghostPosition, setupStatsEggs } from "../public/js/easter-eggs/stats.js";

test("Life prepares before clicking, shares pending loads, and retries after cancellation or failure", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const element = (attributes = {}) => {
    const classes = new Set();
    return Object.assign(new EventTarget(), {
      children: [], namespaceURI: "http://www.w3.org/2000/svg",
      getAttribute: (key) => attributes[key] ?? null,
      hasAttribute: (key) => key in attributes,
      setAttribute: (key, value) => { attributes[key] = String(value); },
      removeAttribute: (key) => { delete attributes[key]; },
      append(child) { this.children.push(child); },
      classList: {
        add: (name) => classes.add(name), remove: (name) => classes.delete(name),
        contains: (name) => classes.has(name),
        toggle: (name, active) => active ? classes.add(name) : classes.delete(name),
      },
    });
  };
  const root = element({ width: "663", height: "104" });
  root.localName = "svg";
  root.querySelectorAll = () => Array.from({ length: 371 }, (_, i) => element({
    x: 15 + Math.floor(i / 7) * 12, y: 20 + i % 7 * 12,
    width: 10, height: 10, "data-score": 1,
  }));
  let image;
  let wrap;
  const requests = [];
  const document = Object.assign(new EventTarget(), {
    hidden: false,
    querySelector: (selector) => selector === "#github-heatmap" ? image : null,
    createElementNS: () => element(),
  });
  const globals = {
    document, matchMedia: () => Object.assign(new EventTarget(), { matches: false }),
    DOMParser: class { parseFromString() { return { documentElement: root, querySelector: () => null }; } },
    fetch: (_, options) => new Promise((resolve) => requests.push({ resolve, ...options })),
  };
  for (const [name, value] of Object.entries(globals)) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    t.after(() => previous ? Object.defineProperty(globalThis, name, previous) : delete globalThis[name]);
  }
  const setup = (complete = true) => {
    wrap = element();
    image = Object.assign(element(), { parentElement: wrap, complete });
    setupStatsEggs();
  };
  const click = () => wrap.dispatchEvent(new Event("click"));
  const respond = async (status = 200) => {
    requests.at(-1).resolve(new Response("<svg/>", { status }));
    await setImmediate();
  };

  setup(false);
  assert.equal(requests.length, 0, "wait for the visible image before preloading");
  image.dispatchEvent(new Event("load"));
  assert.equal(requests.length, 1);
  assert.equal(requests[0].cache, "no-store");
  await respond();
  assert.equal(wrap.getAttribute("aria-pressed"), "false", "preparing must not start Life");
  click();
  assert.equal(wrap.getAttribute("aria-pressed"), "true", "a ready board starts synchronously");
  assert.equal(requests.length, 1);
  click();

  setup();
  click();
  assert.equal(requests.length, 2, "click shares the in-flight preload");
  await respond();
  assert.equal(wrap.getAttribute("aria-pressed"), "true");
  click();

  setup();
  click();
  click();
  assert.equal(requests.at(-1).signal.aborted, true);
  await respond();
  assert.equal(wrap.children.length, 0, "cancelled preparation cannot start later");
  click();
  await respond(502);
  assert.equal(wrap.hasAttribute("aria-busy"), false);
  click();
  await respond();
  assert.equal(wrap.getAttribute("aria-pressed"), "true", "failures remain retryable");
  click();
});

test("a Life blinker oscillates and cells never wrap across board edges", () => {
  const horizontal = [false, false, false, true, true, true, false, false, false];
  const vertical = [false, true, false, false, true, false, false, true, false];
  assert.deepEqual(nextGeneration(horizontal, 3, 3), vertical);
  assert.deepEqual(nextGeneration(vertical, 3, 3), horizontal);
  const block = [true, true, false, true, true, false, false, false, false];
  assert.deepEqual(nextGeneration(block, 3, 3), block);
  assert.deepEqual(nextGeneration([true, true, false, false], 4, 1), [false, false, false, false]);
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
