
import type { Finding } from "../../core/finding.js";
import type { ParsedFileDiff } from "../../git/diff-parser.js";

const TEST_FILE_PATTERN =
  /(^|\/)(?:__tests__\/.*|.*\.(?:test|spec)\.[^/]+)$/i;

const TEST_DECLARATION_PATTERN =
  /\b(?:it|test|describe)\s*\(/;

export function detectDeletedTests(
  files: ParsedFileDiff[]
): Finding[] {
  const findings: Finding[] = [];

  for (const file of files) {
    const filePath = file.oldPath ?? file.newPath;

    if (!filePath || !TEST_FILE_PATTERN.test(filePath)) {
      continue;
    }

    if (file.status === "deleted") {
      findings.push({
        id: `DELETED_TEST_FILE:${filePath}`,
        ruleId: "DELETED_TEST_FILE",
        severity: "high",
        category: "quality",
        message: "A test file was deleted",
        filePath,
        blocking: false,
        remediation:
          "Review why the test file was deleted. Preserve important test coverage or replace it with equivalent tests."
      });

      continue;
    }

    const removedTests = file.removedLines.filter(
      (line) => TEST_DECLARATION_PATTERN.test(line.content)
    );

    for (const line of removedTests) {
      findings.push({
        id: `REMOVED_TEST_DECLARATION:${filePath}:${line.lineNumber}`,
        ruleId: "REMOVED_TEST_DECLARATION",
        severity: "medium",
        category: "quality",
        message: "A test declaration was removed",
        filePath,
        line: line.lineNumber,
        blocking: false,
        remediation:
          "Check whether the removed test is still necessary and whether equivalent coverage exists."
      });
    }
  }

  return findings;
}
