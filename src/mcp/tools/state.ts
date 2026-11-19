import type { VerificationResult } from "../../core/result.js";

export interface VerificationSessionState {
  latestResult: VerificationResult | null;
}
