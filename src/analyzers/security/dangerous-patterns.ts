import type { Finding } from "../../core/finding.js";
import type { ParsedFileDiff } from "../../git/diff-parser.js";

const DANGEROUS_RULES = [
  {
    id: "DANGEROUS_EVAL",
    pattern: /\b(?:eval|Function)\s*\(/,
    message: "Dynamic code evaluation was introduced"
  },
  {
    id: "DANGEROUS_TLS_DISABLED",
    pattern: /(?:rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*["']?0)/,
    message: "TLS certificate verification was disabled"
  },
  {
    id: "DANGEROUS_SHELL_EXEC",
    pattern: /\bexec\s*\(\s*[^,)]*(?:\$\{|\+\s*[A-Za-z_$])/,
    message: "Shell command execution may include dynamically constructed input"
  }
];

/** Detects a small set of risky patterns in added diff lines. */
export function detectDangerousPatterns(
  files: ParsedFileDiff[]
): Finding[] {
  const findings: Finding[] = [];

  for (const file of files) {
    for (const line of file.addedLines) {
      for (const rule of DANGEROUS_RULES) {
        if (!rule.pattern.test(line.content)) continue;

        findings.push({
          id: `${rule.id}:${file.newPath}:${line.lineNumber}`,
          ruleId: rule.id,
          severity: "high",
          category: "security",
          message: rule.message,
          filePath: file.newPath ?? undefined,
          line: line.lineNumber,
          blocking: true,
          remediation:
            "Review the new behavior and use a safer API or a fixed, validated input where possible."
        });
      }
    }
  }

  return findings;
}
