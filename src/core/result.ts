
import type { Finding } from "./finding.js";

export type VerificationStatus =
  | "passed"
  | "failed"
  | "error";

export interface VerificationSummary {
  filesScanned: number;

  checksRun: number;

  totalFindings: number;

  blockingFindings: number;
}

export interface AIReviewSummary {
  status: "completed" | "unavailable" | "failed" | "skipped";
  model?: string;
  servedModel?: string;
  provider?: string;
  /** Number of provider requests made; includes a single bounded transient retry. */
  attempts?: number;
  errorCode?:
    | "not_configured"
    | "invalid_config"
    | "provider_error"
    | "invalid_response"
    | "input_too_large"
    | "no_reviewable_changes"
    | "sensitive_content_detected"
    | "full_scan_not_supported";
  durationMs: number;
}

/** A configured quality command executed during `verify check`. */
export interface VerificationCheck {
  id: "tests" | "lint" | "typecheck";
  command: string[];
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  passed: boolean;
  timedOut: boolean;
  outputTruncated: boolean;
  durationMs: number;
}

export interface BaselineGroup<T> {
  introduced: T[];
  persistent: T[];
  resolved: T[];
}

export interface BaselineComparison {
  findings: BaselineGroup<Finding>;
  /** Omitted when either result did not run quality checks. */
  checkFailures?: BaselineGroup<VerificationCheck>;
}

export interface VerificationResult {
  id: string;

  status: VerificationStatus;

  findings: Finding[];

  /** Present when the run included configured quality commands. */
  checks?: VerificationCheck[];

  /** Informational comparison; current blocking findings still determine status. */
  baselineComparison?: BaselineComparison;

  /** Present when AI review was explicitly requested. It never changes deterministic status. */
  aiReview?: AIReviewSummary;

  summary: VerificationSummary;

  durationMs: number;

  timestamp: string;
}
