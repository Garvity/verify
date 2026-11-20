import { describe, expect, it } from "vitest";

import { renderResult } from "../../src/cli/output.js";
import type { VerificationResult } from "../../src/core/result.js";

const result: VerificationResult = {
  id: "report-test",
  status: "failed",
  findings: [{
    id: "FINDING-1",
    ruleId: "SECRET_API_KEY",
    severity: "high",
    category: "security",
    message: "Possible secret",
    filePath: "src/config.ts",
    line: 7,
    blocking: true,
    remediation: "Move the value into a secret store."
  }],
  checks: [{
    id: "tests",
    command: ["pnpm", "test"],
    exitCode: 1,
    signal: null,
    passed: false,
    timedOut: false,
    outputTruncated: false,
    durationMs: 42
  }],
  baselineComparison: {
    findings: { introduced: [], persistent: [], resolved: [] },
    checkFailures: { introduced: [], persistent: [], resolved: [] }
  },
  summary: { filesScanned: 3, checksRun: 1, totalFindings: 1, blockingFindings: 1 },
  durationMs: 50,
  timestamp: "2026-11-20T00:00:00.000Z"
};

describe("verification report formats", () => {
  it("renders the full result as JSON", () => {
    expect(JSON.parse(renderResult(result, "json"))).toEqual(result);
  });

  it("renders quality checks, baseline details and remediation in terminal output", () => {
    const output = renderResult(result, "terminal");
    expect(output).toContain("FAIL tests: pnpm test");
    expect(output).toContain("Check failures: 0 new");
    expect(output).toContain("src/config.ts:7: Possible secret");
    expect(output).toContain("Remediation: Move the value into a secret store.");
  });

  it("renders quality checks, baseline details and findings as Markdown", () => {
    const output = renderResult(result, "markdown");
    expect(output).toContain("| tests | Failed | `pnpm test` | 42 ms |");
    expect(output).toContain("## Baseline comparison");
    expect(output).toContain("SECRET_API_KEY");
    expect(output).toContain("Move the value into a secret store.");
  });
});
