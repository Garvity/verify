import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const moduleUrl = pathToFileURL(resolve(process.cwd(), "src/range.mjs")).href + "?run=" + Date.now();
const { isInRange } = await import(moduleUrl);

test("range includes both boundaries", () => {
  assert.equal(isInRange(2, 2, 5), true);
  assert.equal(isInRange(5, 2, 5), true);
  assert.equal(isInRange(4, 2, 5), true);
});

test("range excludes values outside the boundaries", () => {
  assert.equal(isInRange(1, 2, 5), false);
  assert.equal(isInRange(6, 2, 5), false);
});
