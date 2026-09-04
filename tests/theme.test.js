import assert from "node:assert/strict";
import test from "node:test";

import { initEntryInteractions, initHeatmapAccent, setupTheme } from "../public/js/theme.js";

test("switching light/dark mode preserves the selected brand", (t) => {
  const root = { dataset: {}, classList: { add() {} } };
  const attributes = new Map();
  const storage = new Map();
  let click;
  let stopped = false;
  const button = {
    classList: { toggle() {} },
    setAttribute: (key, value) => attributes.set(key, value),
    addEventListener: (_, listener) => { click = listener; },
  };
  globalThis.document = { documentElement: root, querySelector: () => button };
  globalThis.window = {
    matchMedia: () => ({ matches: true, addEventListener() {} }),
    requestAnimationFrame: (callback) => callback(),
  };
  globalThis.localStorage = {
    getItem: (key) => storage.get(key),
    setItem: (key, value) => storage.set(key, value),
  };
  t.after(() => {
    delete globalThis.document;
    delete globalThis.window;
    delete globalThis.localStorage;
  });

  const setBrand = setupTheme();
  setBrand("amazon");
  click({ stopPropagation() { stopped = true; } });

  assert.deepEqual(root.dataset, { theme: "light", colorScheme: "amazon" });
  assert.equal(stopped, true, "mode switch must not reach the outside-click reset");
  assert.equal(attributes.get("aria-label"), "Switch to dark mode");
  assert.equal(storage.get("portfolio-theme-override"), "light");
  setBrand(null);
  assert.deepEqual(root.dataset, { theme: "light" });
});

test("entry selection toggles, switches, and clears with matching pressed states", (t) => {
  let click;
  let selectedBrand;
  const entries = ["uoft", "amazon", "uoft", "helmholtz"].map((colorScheme) => ({
    dataset: { colorScheme },
    active: false,
    pressed: "false",
  }));
  for (const entry of entries) {
    entry.classList = {
      add() { entry.active = true; },
      remove() { entry.active = false; },
    };
    entry.querySelector = () => ({ setAttribute: (_, value) => { entry.pressed = value; } });
  }
  globalThis.document = {
    querySelector: () => entries.find((entry) => entry.active),
    addEventListener: (_, listener) => { click = listener; },
  };
  globalThis.window = { matchMedia: () => ({ matches: false }) };
  t.after(() => { delete globalThis.document; delete globalThis.window; });
  initEntryInteractions((brand) => { selectedBrand = brand; });
  const select = (entry) => click({ target: { closest: () => entry } });
  for (const entry of entries) {
    select(entry);
    assert.equal(selectedBrand, entry.dataset.colorScheme);
    assert.equal(entries.filter((item) => item.active && item.pressed === "true").length, 1);
  }
  select(entries.at(-1));
  assert.equal(selectedBrand, null);
  select(entries[0]);
  select(null);
  assert.ok(entries.every((entry) => !entry.active && entry.pressed === "false"));
  assert.equal(selectedBrand, null);
});

test("heatmap fades reuse layers, ignore stale loads, and retry failed loads", (t) => {
  let accent = "#1e3765";
  let sync;
  const images = [];
  const wrap = { append(image) { image.isConnected = true; } };
  const makeImage = () => {
    const image = {
      src: "https://ghchart.rshah.org/1E3765/l2ggy",
      parentElement: wrap,
      active: false,
      isConnected: false,
      cloneNode: makeImage,
      removeAttribute() {},
      getBoundingClientRect() {},
    };
    image.classList = {
      remove() { image.active = false; },
      toggle(_, active) { image.active = active; },
    };
    images.push(image);
    return image;
  };
  const original = makeImage();
  original.isConnected = original.active = true;
  globalThis.document = { documentElement: {}, querySelector: () => original };
  globalThis.getComputedStyle = () => ({ getPropertyValue: () => accent });
  globalThis.MutationObserver = class {
    constructor(callback) { sync = callback; }
    observe() {}
  };
  t.after(() => {
    delete globalThis.document;
    delete globalThis.getComputedStyle;
    delete globalThis.MutationObserver;
  });
  initHeatmapAccent();
  accent = "#663d00";
  sync();
  const amazon = images.at(-1);
  accent = "#490043";
  sync();
  const helmholtz = images.at(-1);
  amazon.onload();
  assert.equal(amazon.active, false, "a late image must not replace the selected theme");
  helmholtz.onerror();
  assert.equal(original.active, true, "keep the previous chart visible on failure");
  sync();
  const retry = images.at(-1);
  assert.notEqual(retry, helmholtz);
  retry.onload();
  assert.equal(retry.active, true);
  accent = "#663d00";
  sync();
  assert.equal(amazon.active, true);
  accent = "#1e3765";
  sync();
  assert.equal(original.active, true);
  assert.equal(images.length, 4, "revisiting a loaded theme must reuse its image");
});
