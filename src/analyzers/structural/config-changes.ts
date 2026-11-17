
import type { Finding } from "../../core/finding.js";
import type { ParsedFileDiff } from "../../git/diff-parser.js";

const CONFIG_FILE_RULES = [
  {
    id: "CI_WORKFLOW_CHANGE",
    pattern: /^\.github\/workflows\/.+\.(?:yml|yaml)$/i,
    description: "A GitHub Actions workflow was changed"
  },
  {
    id: "DOCKER_CONFIG_CHANGE",
    pattern: /(^|\/)(?:Dockerfile|docker-compose(?:\.[^/]*)?\.ya?ml)$/i,
    description: "Docker configuration was changed"
  },
  {
    id: "TERRAFORM_CONFIG_CHANGE",
    pattern: /\.tf(?:vars)?$/,
    description: "Terraform configuration was changed"
  },
  {
    id: "KUBERNETES_CONFIG_CHANGE",
    pattern: /(^|\/)(?:deployment|service|configmap|secret|ingress)\.ya?ml$/i,
    description: "A Kubernetes configuration file was changed"
  }
];

export function detectConfigChanges(
  files: ParsedFileDiff[]
): Finding[] {
  const findings: Finding[] = [];

  for (const file of files) {
    const filePath = file.newPath ?? file.oldPath;

    if (!filePath) {
      continue;
    }

    for (const rule of CONFIG_FILE_RULES) {
      if (!rule.pattern.test(filePath)) {
        continue;
      }

      findings.push({
        id: `${rule.id}:${filePath}`,
        ruleId: rule.id,
        severity: "medium",
        category: "structural",
        message: rule.description,
        filePath,
        blocking: false,
        remediation:
          "Review the configuration change for unintended permission, deployment, environment or workflow modifications."
      });

      break;
    }
  }

  return findings;
}
