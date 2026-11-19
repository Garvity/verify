export interface VerificationRule {
  id: string;
  category: "security" | "quality" | "structural" | "policy";
  severity: "critical" | "high" | "medium" | "low" | "info";
  description: string;
}

/** Rules currently implemented by the deterministic verification engine. */
export const VERIFICATION_RULES: VerificationRule[] = [
  { id: "SECRET_AWS_ACCESS_KEY", category: "security", severity: "critical", description: "Possible AWS access key in added content" },
  { id: "SECRET_PRIVATE_KEY", category: "security", severity: "critical", description: "Possible private key in added content" },
  { id: "SECRET_GITHUB_TOKEN", category: "security", severity: "critical", description: "Possible GitHub token in added content" },
  { id: "SECRET_API_KEY", category: "security", severity: "high", description: "Possible hardcoded API key or secret" },
  { id: "SECRET_PASSWORD", category: "security", severity: "high", description: "Possible hardcoded password" },
  { id: "SENSITIVE_ENV_FILE", category: "security", severity: "high", description: "Environment file changed" },
  { id: "SENSITIVE_PRIVATE_KEY", category: "security", severity: "high", description: "Private key or certificate file changed" },
  { id: "SENSITIVE_CREDENTIALS", category: "security", severity: "high", description: "Credentials or secrets file changed" },
  { id: "SENSITIVE_SSH", category: "security", severity: "high", description: "SSH configuration or key file changed" },
  { id: "DANGEROUS_EVAL", category: "security", severity: "high", description: "Dynamic code evaluation introduced" },
  { id: "DANGEROUS_TLS_DISABLED", category: "security", severity: "high", description: "TLS verification disabled" },
  { id: "DANGEROUS_SHELL_EXEC", category: "security", severity: "high", description: "Potentially dynamic shell execution introduced" },
  { id: "DELETED_TEST_FILE", category: "quality", severity: "high", description: "Test file deleted" },
  { id: "REMOVED_TEST_DECLARATION", category: "quality", severity: "medium", description: "Test declaration removed" },
  { id: "QUALITY_CHECK_FAILED", category: "quality", severity: "high", description: "A configured test, lint or typecheck command failed" },
  { id: "DEPENDENCY_CHANGE", category: "structural", severity: "medium", description: "Dependency manifest or lockfile changed" },
  { id: "CI_WORKFLOW_CHANGE", category: "structural", severity: "medium", description: "GitHub Actions workflow changed" },
  { id: "DOCKER_CONFIG_CHANGE", category: "structural", severity: "medium", description: "Docker configuration changed" },
  { id: "TERRAFORM_CONFIG_CHANGE", category: "structural", severity: "medium", description: "Terraform configuration changed" },
  { id: "KUBERNETES_CONFIG_CHANGE", category: "structural", severity: "medium", description: "Kubernetes configuration changed" },
  { id: "PROTECTED_FILE_CHANGE", category: "policy", severity: "high", description: "Protected path changed and requires approval" }
];
