import assert from "node:assert/strict";
import test from "node:test";
import { advanceRunner, createRunner } from "../public/js/easter-eggs/footer-runner.js";

test("runner patterns stay fair as speed rises, with room to jump and duck", () => {
  for (const kind of [0, 1, 2]) for (const elapsed of [0, 40]) {
    const state = { ...createRunner(125), velocity: 45, elapsed, obstacles: [{ x: 33, kind }] };
    let peak = 0;
    for (let step = 0; step < 60; step++) {
      advanceRunner(state, 1 / 60, 125, () => .5);
      peak = Math.max(peak, state.height);
      assert.equal(state.crashed, false, "a timed jump clears every ground pattern at both speed limits");
    }
    assert.ok(peak > 8 && peak < 9, "the jump fits the original footer line");
    assert.equal(state.height, 0);
    assert.equal(state.cleared, 1);
    assert.ok(state.obstacles[0].x < 125, "the next obstacle arrives before the previous one leaves");
  }
  for (const kind of [0, 1, 2, 3]) {
    const state = { ...createRunner(125), cleared: 5, obstacles: [{ x: 17, kind }] };
    advanceRunner(state, .04, 125, () => .5);
    assert.equal(state.crashed, kind !== 3, "only birds are safe to run underneath");
  }
  const airborne = { ...createRunner(125), height: 5, cleared: 5, obstacles: [{ x: 17, kind: 3 }] };
  advanceRunner(airborne, .04, 125, () => .5);
  assert.equal(airborne.crashed, true, "jumping into a bird is a collision");

  for (const roll of [0, .4, .8, .999]) for (const kind of [0, 1, 2, 3]) {
    const state = { ...createRunner(125), cleared: 5, obstacles: [{ x: 25, kind }] };
    advanceRunner(state, 0, 125, () => roll);
    assert.equal(state.obstacles.length, 2);
    assert.notEqual(state.obstacles[1].kind, kind, "adjacent patterns do not repeat");
    assert.ok(state.gap >= 72 && state.gap <= 120, "spacing leaves time to land between jumps");
  }
});

test("runner accelerates with playing time, caps its speed and resets on retry", () => {
  const speeds = [0, 20, 40, 120].map((elapsed) => {
    const state = { ...createRunner(125), elapsed, obstacles: [{ x: 1000, kind: 0 }] };
    advanceRunner(state, .04, 125);
    assert.equal(state.elapsed, elapsed + .04);
    return (1000 - state.obstacles[0].x) / .04;
  });
  assert.ok(speeds[0] < speeds[1] && speeds[1] < speeds[2]);
  assert.ok(Math.abs(speeds[2] - 80) < 1e-9);
  assert.equal(speeds[2], speeds[3], "long runs stay at the speed cap");
  const state = { ...createRunner(125), elapsed: 20, crashed: true };
  advanceRunner(state, .04, 125);
  assert.equal(state.elapsed, 20, "the clock stops after a crash");
  assert.equal(createRunner(125).elapsed, 0, "a fresh run starts slow again");
});
