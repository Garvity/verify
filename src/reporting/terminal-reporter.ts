import type { FindingSeverity } from "../core/finding.js";
import type { VerificationResult } from "../core/result.js";

const SEVERITIES: FindingSeverity[] = ["critical", "high", "medium", "low", "info"];

export function renderTerminalReport(result: VerificationResult): string {
  const counts = Object.fromEntries(
    SEVERITIES.map((severity) => [
      severity,
      result.findings.filter((finding) => finding.severity === severity).length
    ])
  );
  const lines = [
    "VERIFY REPORT",
    "",
    `Status: ${result.status.toUpperCase()}`,
    `Files scanned: ${result.summary.filesScanned}`,
    `Checks executed: ${result.summary.checksRun}`,
    `Findings: ${result.summary.totalFindings}`,
    `Blocking findings: ${result.summary.blockingFindings}`,
    `Severity: ${SEVERITIES.map((severity) => `${severity} ${counts[severity]}`).join(" · ")}`
  ];

  if (result.checks?.length) {
    lines.push("", "Quality checks:");
    for (const check of result.checks) {
      const state = check.passed ? "PASS" : check.timedOut ? "TIMEOUT" : "FAIL";
      lines.push(`  ${state} ${check.id}: ${check.command.join(" ")} (${check.durationMs} ms)`);
    }
  }

  if (result.baselineComparison) {
    const comparison = result.baselineComparison;
    lines.push(
      "",
      "Baseline comparison:",
      `  Findings: ${comparison.findings.introduced.length} new · ${comparison.findings.persistent.length} pre-existing · ${comparison.findings.resolved.length} resolved`
    );
    if (comparison.checkFailures) {
      lines.push(
        `  Check failures: ${comparison.checkFailures.introduced.length} new · ${comparison.checkFailures.persistent.length} pre-existing · ${comparison.checkFailures.resolved.length} resolved`
      );
    }
  }

  if (result.aiReview) {
    const requestedModel = result.aiReview.model ? ` (${result.aiReview.model})` : "";
    const failure = result.aiReview.errorCode ? ` · ${result.aiReview.errorCode}` : "";
    const attempts = result.aiReview.attempts === undefined ? "" : ` · ${result.aiReview.attempts} request(s)`;
    lines.push("", `AI review: ${result.aiReview.status}${requestedModel}${failure}${attempts}`);
  }

  if (result.findings.length) {
    lines.push("", "Findings:");
    for (const finding of result.findings) {
      const source = finding.source === "ai" ? "AI REVIEW" : "DETERMINISTIC";
      const confidence = finding.confidence === undefined
        ? ""
        : ` · ${(finding.confidence * 100).toFixed(0)}% confidence`;
      const location = finding.filePath
        ? `${finding.filePath}${finding.line ? `:${finding.line}` : ""}: `
        : "";
      lines.push(`  [${finding.severity.toUpperCase()}] [${source}${confidence}] ${location}${finding.message}`);
      if (finding.remediation) lines.push(`    Remediation: ${finding.remediation}`);
      for (const evidence of finding.evidence ?? []) {
        lines.push(`    Evidence: ${evidence.filePath}:${evidence.line}: ${evidence.snippet}`);
        if (evidence.explanation) lines.push(`      Why: ${evidence.explanation}`);
      }
    }
  }

  return lines.join("\n");
}
