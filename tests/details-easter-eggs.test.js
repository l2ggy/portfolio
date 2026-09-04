import assert from "node:assert/strict";
import test from "node:test";
import { leafTrajectory, setupDetails } from "../public/js/easter-eggs/details.js";

test("leaf falls inside the viewport and comes to an invisible end", () => {
  for (const width of [320, 390, 1440]) {
    for (const startX of [18, width / 2, width - 18]) {
      for (const seed of [0, 0.7, 7]) {
        const path = leafTrajectory(startX, 24, width, 800, seed);
        assert.equal(path[0].x, 0);
        assert.equal(path[0].y, 0);
        assert.equal(path.at(-1).opacity, 0);
        assert.equal(path.at(-1).y, 712);
        path.forEach((point, index) => {
          assert.ok(startX + point.x >= 18 && startX + point.x <= width - 18);
          if (index) assert.ok(point.y > path[index - 1].y);
        });
      }
    }
  }
});

function setup(t) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const element = (text = "") => {
    const node = new EventTarget();
    const classes = new Set();
    Object.assign(node, {
      textContent: text, children: [], dataset: {},
      classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name), contains: (name) => classes.has(name) },
      style: { setProperty() {} }, setAttribute() {},
      replaceChildren(...children) { this.children = children; },
      getBoundingClientRect: () => ({ left: 24, top: 24 }),
      remove() { this.removed = true; },
      animate() { this.animation = { cancel() {} }; return this.animation; },
    });
    return node;
  };
  const link = element("🍁");
  link.matches = () => link.keyboardFocus;
  const word = element("laggy");
  const home = element();
  home.querySelector = () => word;
  const flights = [];
  const document = Object.assign(new EventTarget(), {
    hidden: false,
    querySelector: (selector) => selector === ".logo-slot" ? home : link,
    body: { append: (leaf) => flights.push(leaf) },
    createElement: () => element(),
  });
  const motion = Object.assign(new EventTarget(), { matches: false });
  const window = Object.assign(new EventTarget(), { matchMedia: () => motion });
  for (const [name, value] of Object.entries({ document, window, innerWidth: 1200, innerHeight: 800 })) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => previous ? Object.defineProperty(globalThis, name, previous) : delete globalThis[name]);
  }
  const send = (target, type, properties = {}) => {
    const event = Object.assign(new Event(type, { cancelable: true }), properties);
    target.dispatchEvent(event);
    return event.defaultPrevented;
  };
  setupDetails();
  return { link, word, home, flights, document, window, motion, send,
    hover: () => send(link, "pointerenter", { pointerType: "mouse" }),
    down: () => send(link, "pointerdown", { pointerType: "touch", pointerId: 1, clientX: 0, clientY: 0 }),
  };
}

test("maple waits five uninterrupted seconds and clears on lifecycle changes", (t) => {
  const { link, flights, document, window, motion, send, hover, down } = setup(t);
  hover();
  t.mock.timers.tick(4999);
  assert.equal(flights.length, 0);
  send(link, "pointerleave");
  t.mock.timers.tick(1);
  assert.equal(flights.length, 0);
  for (const cancel of [
    () => send(window, "scroll"),
    () => send(window, "blur"),
    () => send(window, "pagehide"),
    () => send(link, "blur"),
    () => send(link, "pointerup"),
    () => send(document, "keydown", { key: "Escape" }),
    () => { document.hidden = true; send(document, "visibilitychange"); document.hidden = false; },
  ]) {
    hover();
    cancel();
    t.mock.timers.tick(5000);
    assert.equal(flights.length, 0);
    down();
    cancel();
    t.mock.timers.tick(5000);
    assert.equal(flights.length, 0);
  }
  send(link, "focus"); // A tapped link may retain focus; that must not schedule a flight.
  t.mock.timers.tick(5000);
  assert.equal(flights.length, 0);
  link.keyboardFocus = true;
  send(link, "focus");
  t.mock.timers.tick(4999);
  assert.equal(flights.length, 0);
  t.mock.timers.tick(1);
  assert.equal(flights.length, 1);
  assert.ok(link.children[0].classList.contains("maple-away"));
  assert.equal(link.classList.contains("maple-away"), false, "the link and its focus ring stay visible");
  flights[0].animation.onfinish();
  assert.ok(flights[0].removed);
  assert.equal(link.children[0].classList.contains("maple-away"), false);
  t.mock.timers.tick(10000);
  assert.equal(flights.length, 1, "one flight per interaction");
  hover();
  t.mock.timers.tick(5000);
  send(window, "blur");
  assert.ok(flights[1].removed);
  motion.matches = true;
  hover();
  t.mock.timers.tick(5000);
  assert.equal(flights.length, 2);
});

test("held maple touches consume only their click; taps and scrolling stay native", (t) => {
  const { link, flights, send, down } = setup(t);
  down();
  send(link, "pointerup");
  assert.equal(send(link, "click"), false);
  t.mock.timers.tick(5000);
  assert.equal(flights.length, 0);
  down();
  assert.equal(send(link, "contextmenu"), true);
  t.mock.timers.tick(4999);
  assert.equal(flights.length, 0);
  t.mock.timers.tick(1);
  assert.equal(flights.length, 1);
  flights[0].animation.onfinish();
  send(link, "pointerup");
  assert.equal(send(link, "click"), true);
  assert.equal(send(link, "click"), false);
  down();
  send(link, "pointermove", { pointerId: 1, clientX: 0, clientY: 20 });
  t.mock.timers.tick(5000);
  send(link, "pointerup");
  assert.equal(flights.length, 1);
  assert.equal(send(link, "click"), false);
  down();
  send(link, "pointercancel");
  t.mock.timers.tick(5000);
  assert.equal(flights.length, 1);
  assert.equal(send(link, "contextmenu"), false);
});

test("laggy runs once on a stable link, restores text, and respects reduced motion", (t) => {
  const { word, home, document, motion, send } = setup(t);
  send(home, "pointerenter", { pointerType: "mouse" });
  const letters = word.children;
  assert.equal(letters.length, 5);
  assert.ok(word.classList.contains("is-lagging"));
  send(home, "focus");
  assert.equal(send(home, "click"), false);
  assert.equal(word.children, letters, "focus and click do not restart an active animation");
  t.mock.timers.tick(1100);
  assert.equal(word.classList.contains("is-lagging"), false);
  assert.equal(word.textContent, "laggy");
  send(home, "focus");
  send(document, "keydown", { key: "Escape" });
  assert.equal(word.classList.contains("is-lagging"), false);
  motion.matches = true;
  send(home, "pointerenter", { pointerType: "mouse" });
  assert.equal(word.classList.contains("is-lagging"), false);
});
