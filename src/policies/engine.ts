
import type { Finding } from "../core/finding.js";
import type { VerifyConfig } from "../config/schema.js";
import type { ParsedFileDiff } from "../git/diff-parser.js";

export interface PolicyEvaluation {
  findings: Finding[];
  blocked: boolean;
  approvalRequiredFiles: string[];
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/^\.\//, "");
}

function globToRegExp(pattern: string): RegExp {
  const normalized = normalizePath(pattern);
  let expression = "^";

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];

    if (char === "*" && normalized[i + 1] === "*") {
      expression += ".*";
      i++;
    } else if (char === "*") {
      expression += "[^/]*";
    } else if (char === "?") {
      expression += "[^/]";
    } else {
      expression += char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
  }

  expression += "$";

  return new RegExp(expression);
}

export function matchesProtectedPath(
  filePath: string,
  protectedPatterns: string[]
): boolean {
  const normalizedPath = normalizePath(filePath);

  return protectedPatterns.some((pattern) =>
    globToRegExp(pattern).test(normalizedPath)
  );
}

export function evaluatePolicies(
  findings: Finding[],
  changedFiles: ParsedFileDiff[],
  config: VerifyConfig,
  approvedPaths: string[] = []
): PolicyEvaluation {
  const evaluatedFindings: Finding[] = findings.map(
    (finding) => ({
      ...finding,
      blocking:
        finding.severity === "critical" ||
        finding.severity === "high"
    })
  );

  const approvalRequiredFiles: string[] = [];

  if (config.approval.requireForProtectedFiles) {
    for (const file of changedFiles) {
      const filePath = file.newPath ?? file.oldPath;

      if (!filePath) {
        continue;
      }

      if (
        !matchesProtectedPath(
          filePath,
          config.protectedPaths
        )
      ) {
        continue;
      }

      const approved = approvedPaths.some(
        (approvedPath) =>
          normalizePath(approvedPath) ===
          normalizePath(filePath)
      );

      if (approved) {
        continue;
      }

      approvalRequiredFiles.push(filePath);

      evaluatedFindings.push({
        id: `PROTECTED_FILE_CHANGE:${filePath}`,
        ruleId: "PROTECTED_FILE_CHANGE",
        severity: "high",
        category: "policy",
        message: "A protected file was changed and requires approval",
        filePath,
        blocking: true,
        remediation:
          "Obtain the required review and approval before accepting this change."
      });
    }
  }

  return {
    findings: evaluatedFindings,
    blocked: evaluatedFindings.some(
      (finding) => finding.blocking
    ),
    approvalRequiredFiles
  };
}
