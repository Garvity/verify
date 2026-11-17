
import type { Finding } from "../../core/finding.js";
import type { ParsedFileDiff } from "../../git/diff-parser.js";

const DEPENDENCY_FILES = new Set([
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  "Cargo.toml",
  "Cargo.lock",
  "go.mod",
  "go.sum",
  "requirements.txt",
  "Pipfile",
  "Pipfile.lock",
  "poetry.lock",
  "pyproject.toml",
  "Gemfile",
  "Gemfile.lock"
]);

function getBaseName(filePath: string): string {
  return filePath.split("/").pop() ?? filePath;
}

export function detectDependencyChanges(
  files: ParsedFileDiff[]
): Finding[] {
  const findings: Finding[] = [];

  for (const file of files) {
    const filePath = file.newPath ?? file.oldPath;

    if (!filePath) {
      continue;
    }

    if (!DEPENDENCY_FILES.has(getBaseName(filePath))) {
      continue;
    }

    findings.push({
      id: `DEPENDENCY_CHANGE:${filePath}`,
      ruleId: "DEPENDENCY_CHANGE",
      severity: "medium",
      category: "structural",
      message: "A dependency manifest or lockfile was changed",
      filePath,
      blocking: false,
      remediation:
        "Review added, removed and updated dependencies. Confirm that changes are intentional and that lockfiles are consistent."
    });
  }

  return findings;
}
