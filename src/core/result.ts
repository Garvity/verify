
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

export interface VerificationResult {
  id: string;

  status: VerificationStatus;

  findings: Finding[];

  summary: VerificationSummary;

  durationMs: number;

  timestamp: string;
}
