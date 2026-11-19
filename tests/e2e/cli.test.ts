import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const cliPath = resolve("dist/cli/index.js");
const temporaryDirectories: string[] = [];

function runCli(args: string[]): string {
  return execFileSync(process.execPath, [cliPath, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("compiled CLI end-to-end", () => {
  it("starts the packaged entry point and prints the version", () => {
    expect(runCli(["version"])).toMatch(/^verify \d+\.\d+\.\d+\n$/);
  });

  it("lists the final command surface and machine-readable rules", () => {
    const help = runCli(["--help"]);
    expect(help).toContain("report");
    expect(help).toContain("version");
    expect(help).toContain("eval");

    const rules = JSON.parse(runCli(["rules", "--format", "json"])) as Array<{ id: string }>;
    expect(rules.some((rule) => rule.id === "QUALITY_CHECK_FAILED")).toBe(true);
  });

  it("renders a saved verification result through the report command", async () => {
    const directory = await mkdtemp(join(tmpdir(), "verify-cli-report-"));
    temporaryDirectories.push(directory);
    const input = join(directory, "result.json");
    await writeFile(input, JSON.stringify({
      id: "e2e-result",
      status: "passed",
      findings: [],
      summary: { filesScanned: 1, checksRun: 2, totalFindings: 0, blockingFindings: 0 },
      durationMs: 1,
      timestamp: "2026-11-19T00:00:00.000Z"
    }));
    const output = runCli(["report", "--input", input, "--format", "markdown"]);
    expect(output).toContain("# Verify report");
    expect(output).toContain("Status:** passed");
    expect(output).toContain("No findings.");
  });
});
