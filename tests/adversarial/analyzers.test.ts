import { describe, expect, it } from "vitest";

import { detectDangerousPatterns } from "../../src/analyzers/security/dangerous-patterns.js";
import { detectSecrets } from "../../src/analyzers/security/secrets.js";
import { detectSensitiveFiles } from "../../src/analyzers/security/sensitive-files.js";
import { detectDeletedTests } from "../../src/analyzers/quality/deleted-tests.js";
import type { ParsedFileDiff } from "../../src/git/diff-parser.js";

function diff(path: string, content: string, status: ParsedFileDiff["status"] = "modified"): ParsedFileDiff {
  return {
    oldPath: status === "added" ? null : path,
    newPath: status === "deleted" ? null : path,
    status,
    isBinary: false,
    hunks: [],
    addedLines: content ? [{ type: "added", lineNumber: 1, content }] : [],
    removedLines: []
  };
}

describe("targeted adversarial detection measurements", () => {
  it("detects each seeded risk and reports zero false positives on benign samples", () => {
    const fakeToken = ["ghp_", "123456789012345678901234"].join("");
    const dangerousLine = ["const result = ", "eval", "(input);"].join("");
    const adversarialCases: Array<{ expected: string; file: ParsedFileDiff }> = [
      { expected: "SECRET_GITHUB_TOKEN", file: diff("src/auth.ts", "const token = \"" + fakeToken + "\";") },
      { expected: "DANGEROUS_EVAL", file: diff("src/parser.ts", dangerousLine) },
      { expected: "SENSITIVE_CREDENTIALS", file: diff("secrets.json", "{\"token\":\"placeholder\"}", "added") },
      { expected: "DELETED_TEST_FILE", file: diff("tests/auth.test.ts", "", "deleted") }
    ];
    const analyzers = [detectSecrets, detectDangerousPatterns, detectSensitiveFiles, detectDeletedTests];
    const detected = adversarialCases.filter(({ expected, file }) =>
      analyzers.flatMap((analyze) => analyze([file])).some((finding) => finding.ruleId === expected)
    );

    const benignFiles = [
      diff("src/auth.ts", "export const authenticated = validateSession(token);"),
      diff("src/parser.ts", "const result = evaluate(input);"),
      diff("src/analyzers/security/secrets.ts", "const secretRuleCount = 4;"),
      diff("tests/auth.test.ts", "test('denies invalid users', () => {});")
    ];
    const falsePositives = benignFiles.filter((file) =>
      analyzers.some((analyze) => analyze([file]).length > 0)
    );

    expect(detected).toHaveLength(4);
    expect(detected.length / adversarialCases.length).toBe(1);
    expect(falsePositives).toHaveLength(0);
    expect(falsePositives.length / benignFiles.length).toBe(0);
  });
});
