import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { loadBaselineFile } from "../../src/cli/baseline.js";

let directory = "";

afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = "";
});

describe("loadBaselineFile", () => {
  it("loads and normalizes a verification result", async () => {
    directory = await mkdtemp(join(tmpdir(), "verify-baseline-test-"));
    const path = join(directory, "baseline.json");
    await writeFile(path, JSON.stringify({ status: "passed", findings: [], summary: {} }));
    await expect(loadBaselineFile(path)).resolves.toEqual({ findings: [] });
  });

  it("distinguishes missing files, unreadable paths, invalid JSON, and invalid snapshots", async () => {
    directory = await mkdtemp(join(tmpdir(), "verify-baseline-errors-"));
    const folder = join(directory, "folder");
    await mkdir(folder);
    const malformed = join(directory, "malformed.json");
    const invalid = join(directory, "invalid.json");
    await writeFile(malformed, "{");
    await writeFile(invalid, JSON.stringify({ findings: "none" }));

    await expect(loadBaselineFile(join(directory, "missing.json")))
      .rejects.toMatchObject({ code: "CONFIG_NOT_FOUND" });
    await expect(loadBaselineFile(folder)).rejects.toMatchObject({ code: "UNKNOWN_ERROR" });
    await expect(loadBaselineFile(malformed)).rejects.toMatchObject({ code: "CONFIG_PARSE_ERROR" });
    await expect(loadBaselineFile(invalid)).rejects.toMatchObject({ code: "CONFIG_INVALID" });
  });
});
