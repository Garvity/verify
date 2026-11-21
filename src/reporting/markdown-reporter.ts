import type { VerificationResult } from "../core/result.js";

export function renderMarkdownReport(result: VerificationResult): string {
  const lines = [
    "# Verify report",
    "",
    `- **Status:** ${result.status}`,
    `- **Files scanned:** ${result.summary.filesScanned}`,
    `- **Checks executed:** ${result.summary.checksRun}`,
    `- **Findings:** ${result.summary.totalFindings}`,
    `- **Blocking findings:** ${result.summary.blockingFindings}`
  ];

  if (result.checks?.length) {
    lines.push("", "## Quality checks", "", "| Check | Result | Command | Duration |", "| --- | --- | --- | ---: |");
    for (const check of result.checks) {
      const state = check.passed ? "Passed" : check.timedOut ? "Timed out" : "Failed";
      lines.push(`| ${check.id} | ${state} | \`${check.command.join(" ")}\` | ${check.durationMs} ms |`);
    }
  }

  if (result.baselineComparison) {
    const comparison = result.baselineComparison;
    lines.push(
      "",
      "## Baseline comparison",
      "",
      "| Category | New | Pre-existing | Resolved |",
      "| --- | ---: | ---: | ---: |",
      `| Findings | ${comparison.findings.introduced.length} | ${comparison.findings.persistent.length} | ${comparison.findings.resolved.length} |`
    );
    if (comparison.checkFailures) {
      lines.push(`| Check failures | ${comparison.checkFailures.introduced.length} | ${comparison.checkFailures.persistent.length} | ${comparison.checkFailures.resolved.length} |`);
    }
  }

  if (result.aiReview) {
    const model = result.aiReview.model ? ` · model: \`${result.aiReview.model}\`` : "";
    const error = result.aiReview.errorCode ? ` · ${result.aiReview.errorCode}` : "";
    const attempts = result.aiReview.attempts === undefined ? "" : ` · ${result.aiReview.attempts} request(s)`;
    lines.push("", `- **AI review:** ${result.aiReview.status}${model}${error}${attempts}`);
  }

  lines.push("", "## Findings", "");
  if (result.findings.length === 0) {
    lines.push("No findings.");
  } else {
    for (const finding of result.findings) {
      const location = finding.filePath
        ? ` (${finding.filePath}${finding.line ? `:${finding.line}` : ""})`
        : "";
      const source = finding.source === "ai" ? "AI review" : "Deterministic";
      const confidence = finding.confidence === undefined ? "" : ` · ${(finding.confidence * 100).toFixed(0)}% confidence`;
      lines.push(`- **${source} · ${finding.severity} · ${finding.ruleId}**${confidence}${location}: ${finding.message}`);
      if (finding.remediation) lines.push(`  - Remediation: ${finding.remediation}`);
      for (const evidence of finding.evidence ?? []) {
        lines.push(`  - Evidence (${evidence.filePath}:${evidence.line}): ${JSON.stringify(evidence.snippet)} — ${evidence.explanation}`);
      }
    }
  }

  return lines.join("\n");
}
