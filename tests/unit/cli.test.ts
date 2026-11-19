import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runCli } from "../../src/cli/index.js";

describe("CLI command dispatch", () => {
  let stdout = "";

  beforeEach(() => {
    stdout = "";
    vi.spyOn(process.stdout, "write").mockImplementation(((chunk: string | Uint8Array) => {
      stdout += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
      return true;
    }) as typeof process.stdout.write);
    vi.spyOn(process.stderr, "write").mockImplementation((() => true) as typeof process.stderr.write);
  });

  afterEach(() => vi.restoreAllMocks());

  it("prints top-level help", async () => {
    await expect(runCli(["--help"])).resolves.toBe(0);
    expect(stdout).toContain("verify <command>");
    expect(stdout).toContain("models");
    expect(stdout).toContain("agent");
  });

  it("returns the documented invalid-arguments exit code", async () => {
    await expect(runCli(["scan", "--unknown"])).resolves.toBe(2);
    await expect(runCli(["scan", "--format", "yaml"])).resolves.toBe(2);
  });

  it("prints machine-readable rules", async () => {
    await expect(runCli(["rules", "--format", "json"])).resolves.toBe(0);
    const rules = JSON.parse(stdout) as Array<{ id: string }>;
    expect(rules.some((rule) => rule.id === "SECRET_API_KEY")).toBe(true);
  });

  it("shows the JSON scan invocation in scan help", async () => {
    await expect(runCli(["scan", "--help"])).resolves.toBe(0);
    expect(stdout).toContain("--format <terminal|json|markdown>");
  });

  it("shows the explicit multi-model evaluation invocation", async () => {
    await expect(runCli(["eval", "--help"])).resolves.toBe(0);
    expect(stdout).toContain("--benchmark <tasks-dir|task.json>");
    expect(stdout).toContain("--models <model-a,model-b");
  });
});
