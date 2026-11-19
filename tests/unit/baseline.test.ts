import { describe, expect, it } from "vitest";

import type { Finding } from "../../src/core/finding.js";
import type { VerificationCheck } from "../../src/core/result.js";
import { compareBaseline, parseBaselineSnapshot } from "../../src/git/baseline.js";

function finding(
  id: string,
  filePath: string,
  line: number,
  message = `Finding ${id}`
): Finding {
  return {
    id,
    ruleId: "TEST_RULE",
    severity: "medium",
    category: "quality",
    message,
    filePath,
    line,
    blocking: false
  };
}

function check(
  id: VerificationCheck["id"],
  passed: boolean
): VerificationCheck {
  return {
    id,
    command: ["pnpm", id],
    exitCode: passed ? 0 : 1,
    signal: null,
    passed,
    timedOut: false,
    outputTruncated: false,
    durationMs: 10
  };
}

describe("compareBaseline", () => {
  it("classifies introduced, persistent, and resolved findings and failed checks", () => {
    const persistentFinding = finding("current-a", "src/a.ts", 2);
    const newFinding = finding("new", "src/b.ts", 4);
    const resolvedFinding = finding("old", "src/old.ts", 7);
    const comparison = compareBaseline(
      {
        findings: [persistentFinding, newFinding],
        checks: [check("tests", false), check("lint", false), check("typecheck", true)]
      },
      {
        findings: [finding("baseline-a", "src/a.ts", 1, "Finding current-a"), resolvedFinding],
        checks: [check("tests", false), check("typecheck", false)]
      }
    );

    expect(comparison.findings).toEqual({
      introduced: [newFinding],
      persistent: [persistentFinding],
      resolved: [resolvedFinding]
    });
    expect(comparison.checkFailures).toEqual({
      introduced: [check("lint", false)],
      persistent: [check("tests", false)],
      resolved: [check("typecheck", false)]
    });
  });

  it("does not compare checks unless both snapshots ran them", () => {
    const comparison = compareBaseline(
      { findings: [], checks: [check("tests", false)] },
      { findings: [] }
    );
    expect(comparison.checkFailures).toBeUndefined();
  });
});

describe("parseBaselineSnapshot", () => {
  it("accepts verification JSON and keeps only comparison data", () => {
    const findingValue = finding("one", "src/a.ts", 1);
    const checkValue = check("tests", false);
    expect(parseBaselineSnapshot({
      status: "failed",
      findings: [findingValue],
      checks: [checkValue],
      summary: { filesScanned: 1 }
    })).toEqual({ findings: [findingValue], checks: [checkValue] });
  });

  it("rejects malformed results", () => {
    expect(parseBaselineSnapshot({ findings: "none" })).toBeUndefined();
    expect(parseBaselineSnapshot({ findings: [], checks: [{ id: "tests" }] })).toBeUndefined();
  });
});
