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

  it("distinguishes AI findings with confidence, evidence, and review status", () => {
    const combined: VerificationResult = {
      ...result,
      aiReview: { status: "completed", model: "auto", servedModel: "review-v1", durationMs: 35 },
      findings: [...result.findings, {
        id: "AI_REVIEW:INPUT_VALIDATION:src/input.ts:8:1",
        ruleId: "INPUT_VALIDATION",
        severity: "medium",
        category: "security",
        message: "Request input is used without validation.",
        filePath: "src/input.ts",
        line: 8,
        blocking: false,
        source: "ai",
        confidence: 0.91,
        evidence: [{
          filePath: "src/input.ts",
          line: 8,
          snippet: "request.query.value",
          explanation: "The changed line passes request data directly into the query."
        }]
      }]
    };

    const terminal = renderResult(combined, "terminal");
    expect(terminal).toContain("AI review: completed (auto)");
    expect(terminal).toContain("[AI REVIEW · 91% confidence]");
    expect(terminal).toContain("Evidence: src/input.ts:8: request.query.value");

    const markdown = renderResult(combined, "markdown");
    expect(markdown).toContain("**AI review:** completed");
    expect(markdown).toContain("91% confidence");
    expect(markdown).toContain("request.query.value");
  });
});
