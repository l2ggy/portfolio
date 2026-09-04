import assert from "node:assert/strict";
import test from "node:test";

import { fitGlobeScale, rotateGlobeVector, setupInteractiveGlobe } from "../public/js/interactive-globe.js";

test("globe zoom fits both the available height and width", () => {
  assert.equal(fitGlobeScale(1.55, 252, 381.125, 482.8), 381.125 / 252);
  assert.equal(fitGlobeScale(1.55, 252, 500, 370.8), 370.8 / 252);
  assert.equal(fitGlobeScale(1.85, 210, 500, 242), 242 / 210);
});

test("mathematical globe rotation preserves the sphere", () => {
  for (const yaw of [-Math.PI, -0.4, 0, Math.PI]) {
    for (const pitch of [-1.3, 0, 1.3]) {
      const rotated = rotateGlobeVector([0.6, 0.8, 0], yaw, pitch);
      assert.ok(Math.abs(Math.hypot(...rotated) - 1) < 1e-12);
    }
  }
});

test("globe forms cycle locally and keyboard reset preserves browser shortcuts", (t) => {
  const events = new Map();
  const attributes = new Map();
  const globe = {
    closest: () => ({ querySelector: () => ({}) }),
    getContext: () => ({}),
    setAttribute: (name, value) => attributes.set(name, value),
    addEventListener: (name, listener) => events.set(name, listener),
  };
  globalThis.document = { querySelector: () => globe, documentElement: {}, addEventListener() {} };
  globalThis.window = {
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    addEventListener() {},
    setTimeout() {},
  };
  globalThis.Image = class {};
  globalThis.MutationObserver = class { observe() {} };
  globalThis.getComputedStyle = () => ({ getPropertyValue: () => "0" });
  t.after(() => {
    for (const name of ["document", "window", "Image", "MutationObserver", "getComputedStyle"]) delete globalThis[name];
  });
  setupInteractiveGlobe();
  assert.equal(globe.tabIndex, 0);
  const mode = () => attributes.get("aria-label").split(" ")[0];
  const key = (value, options = {}) => {
    let prevented = false;
    events.get("keydown")({ key: value, preventDefault() { prevented = true; }, ...options });
    return prevented;
  };
  assert.equal(mode(), "earth");
  events.get("dblclick")({ preventDefault() {} });
  assert.equal(mode(), "wireframe");
  assert.equal(key("m", { ctrlKey: true }), false);
  assert.equal(key("m", { repeat: true }), true);
  assert.equal(mode(), "wireframe");
  for (const expected of ["points", "orbits", "earth"]) {
    assert.equal(key("M"), true);
    assert.equal(mode(), expected);
  }
  key("m");
  key("Escape");
  assert.equal(mode(), "earth");
  assert.equal(key("ArrowLeft"), true);
  assert.equal(key("Tab"), false);
});
