import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const moduleUrl = pathToFileURL(resolve(process.cwd(), "src/permissions.mjs")).href + "?run=" + Date.now();
const { canDeleteUsers } = await import(moduleUrl);

test("allows deletion only for administrators", () => {
  assert.equal(canDeleteUsers("admin"), true);
  for (const role of ["viewer", "guest", "owner", "", "ADMIN", null, undefined, 1]) {
    assert.equal(canDeleteUsers(role), false);
  }
});
