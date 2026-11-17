
import type { Finding } from "../../core/finding.js";
import type { ParsedFileDiff } from "../../git/diff-parser.js";

interface SecretRule {
  id: string;
  description: string;
  pattern: RegExp;
  severity: Finding["severity"];
}

const SECRET_RULES: SecretRule[] = [
  {
    id: "SECRET_AWS_ACCESS_KEY",
    description: "Possible AWS access key",
    pattern: /\bAKIA[0-9A-Z]{16}\b/,
    severity: "critical"
  },
  {
    id: "SECRET_PRIVATE_KEY",
    description: "Possible private key",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    severity: "critical"
  },
  {
    id: "SECRET_GITHUB_TOKEN",
    description: "Possible GitHub token",
    pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
    severity: "critical"
  },
  {
    id: "SECRET_API_KEY",
    description: "Possible hardcoded API key or secret",
    pattern: /(?:api[_-]?key|secret[_-]?key|access[_-]?token)\s*[:=]\s*["'][^"'\s]{12,}["']/i,
    severity: "high"
  },
  {
    id: "SECRET_PASSWORD",
    description: "Possible hardcoded password",
    pattern: /(?:password|passwd)\s*[:=]\s*["'][^"']{8,}["']/i,
    severity: "high"
  }
];

export function detectSecrets(
  files: ParsedFileDiff[]
): Finding[] {
  const findings: Finding[] = [];

  for (const file of files) {
    for (const line of file.addedLines) {
      for (const rule of SECRET_RULES) {
        if (!rule.pattern.test(line.content)) {
          continue;
        }

        findings.push({
          id: `${rule.id}:${file.newPath}:${line.lineNumber}`,
          ruleId: rule.id,
          severity: rule.severity,
          category: "security",
          message: rule.description,
          filePath: file.newPath ?? undefined,
          line: line.lineNumber,
          blocking: false,
          remediation:
            "Remove the hardcoded credential and use a secure secret-management mechanism. Rotate the credential if it was real."
        });
      }
    }
  }

  return findings;
}
