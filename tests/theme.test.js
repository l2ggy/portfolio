import assert from "node:assert/strict";
import test from "node:test";

import { initEntryInteractions, setupTheme } from "../public/js/theme.js";

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
  globalThis.document = { documentElement: root, querySelector: (selector) => selector === "#theme-toggle" ? button : null };
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

test("ten name activations toggle burgundy and persist it across visits and mode changes", (t) => {
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (key) => storage.get(key),
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  };
  t.after(() => {
    delete globalThis.document;
    delete globalThis.window;
    delete globalThis.localStorage;
  });
  const visit = () => {
    const root = { dataset: {}, classList: { add() {} } };
    const home = new EventTarget();
    const toggle = Object.assign(new EventTarget(), { classList: { toggle() {} }, setAttribute() {} });
    const system = Object.assign(new EventTarget(), { matches: false });
    globalThis.document = {
      documentElement: root,
      querySelector: (selector) => selector === ".logo-slot" ? home : toggle,
    };
    globalThis.window = { matchMedia: () => system, requestAnimationFrame: (callback) => callback() };
    return { root, home, toggle, system, setBrand: setupTheme() };
  };
  const activate = (home, times) => {
    for (let index = 0; index < times; index += 1) home.dispatchEvent(new Event("click"));
  };
  let page = visit();
  activate(page.home, 9);
  assert.equal(page.root.dataset.colorScheme, undefined);
  assert.equal(storage.has("portfolio-burgundy"), false);
  activate(page.home, 1);
  assert.equal(page.root.dataset.colorScheme, "burgundy");
  assert.equal(storage.get("portfolio-burgundy"), "true");

  page = visit();
  assert.deepEqual(page.root.dataset, { theme: "light", colorScheme: "burgundy" });
  page.toggle.dispatchEvent(new Event("click"));
  assert.deepEqual(page.root.dataset, { theme: "dark", colorScheme: "burgundy" });
  page.system.dispatchEvent(new Event("change"));
  assert.deepEqual(page.root.dataset, { theme: "light", colorScheme: "burgundy" });
  page.setBrand("amazon");
  assert.equal(page.root.dataset.colorScheme, "amazon");
  page.setBrand(null);
  assert.equal(page.root.dataset.colorScheme, "burgundy", "clearing a brand returns to the saved palette");

  activate(page.home, 9);
  assert.equal(page.root.dataset.colorScheme, "burgundy");
  activate(page.home, 1);
  assert.equal(page.root.dataset.colorScheme, undefined);
  assert.equal(storage.has("portfolio-burgundy"), false);
  page = visit();
  assert.equal(page.root.dataset.colorScheme, undefined);
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
