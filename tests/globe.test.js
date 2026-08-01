import assert from "node:assert/strict";
import test from "node:test";

import { fitGlobeScale } from "../public/js/interactive-globe.js";

test("globe zoom fits both the available height and width", () => {
  assert.equal(fitGlobeScale(1.55, 252, 381.125, 482.8), 381.125 / 252);
  assert.equal(fitGlobeScale(1.55, 252, 500, 370.8), 370.8 / 252);
  assert.equal(fitGlobeScale(1.85, 210, 500, 242), 242 / 210);
});
