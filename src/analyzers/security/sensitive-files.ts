
import type { Finding } from "../../core/finding.js";
import type { ParsedFileDiff } from "../../git/diff-parser.js";

const SENSITIVE_FILE_RULES = [
  {
    id: "SENSITIVE_ENV_FILE",
    pattern: /(^|\/)\.env(?:\.(?!(?:example|sample|template)$).+)?$/i,
    description: "Environment file was changed"
  },
  {
    id: "SENSITIVE_PRIVATE_KEY",
    pattern: /\.(?:pem|key|p12|pfx)$/i,
    description: "Private key or certificate file was changed"
  },
  {
    id: "SENSITIVE_CREDENTIALS",
    pattern: /(^|\/)(?:credentials|secrets)(?:\.(?:json|ya?ml|toml|env|txt|csv|db|sqlite|conf|config|properties|ini|xml))?$/i,
    description: "Credentials or secrets file was changed"
  },
  {
    id: "SENSITIVE_SSH",
    pattern: /(^|\/)\.ssh\//i,
    description: "SSH configuration or key file was changed"
  }
];

export function detectSensitiveFiles(
  files: ParsedFileDiff[]
): Finding[] {
  const findings: Finding[] = [];

  for (const file of files) {
    const filePath = file.newPath ?? file.oldPath;

    if (!filePath) {
      continue;
    }

    for (const rule of SENSITIVE_FILE_RULES) {
      if (!rule.pattern.test(filePath)) {
        continue;
      }

      findings.push({
        id: `${rule.id}:${filePath}`,
        ruleId: rule.id,
        severity: "high",
        category: "security",
        message: rule.description,
        filePath,
        blocking: false,
        remediation:
          "Review this change carefully. Avoid committing credentials, private keys or local environment secrets."
      });

      break;
    }
  }

  return findings;
}
