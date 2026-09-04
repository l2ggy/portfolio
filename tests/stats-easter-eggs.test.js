import assert from "node:assert/strict";
import test from "node:test";
import { nextGeneration, raceWpm, ghostPosition } from "../public/js/easter-eggs/stats.js";

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
