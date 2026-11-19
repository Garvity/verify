import type { VerificationResult } from "../core/result.js";
import { renderJsonReport } from "../reporting/json-reporter.js";
import { renderMarkdownReport } from "../reporting/markdown-reporter.js";
import { renderTerminalReport } from "../reporting/terminal-reporter.js";

export type OutputFormat = "terminal" | "json" | "markdown";

export function parseOutputFormat(value: string | undefined): OutputFormat {
  if (value === undefined || value === "terminal") return "terminal";
  if (value === "json" || value === "markdown") return value;
  throw new Error(`Unsupported output format '${value}'. Use terminal, json, or markdown.`);
}

export function renderResult(result: VerificationResult, format: OutputFormat): string {
  if (format === "json") return renderJsonReport(result);
  if (format === "markdown") return renderMarkdownReport(result);
  return renderTerminalReport(result);
}
