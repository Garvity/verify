import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const moduleUrl = pathToFileURL(resolve(process.cwd(), "src/text.mjs")).href + "?run=" + Date.now();
const { truncate } = await import(moduleUrl);

test("leaves text within the limit unchanged", () => {
  assert.equal(truncate("verify", 6), "verify");
  assert.equal(truncate("ok", 6), "ok");
});

test("uses one ellipsis within the requested maximum length", () => {
  assert.equal(truncate("verification", 5), "veri…");
  assert.equal(truncate("abcdef", 1), "…");
});

test("returns an empty string for nonpositive limits", () => {
  assert.equal(truncate("text", 0), "");
});
