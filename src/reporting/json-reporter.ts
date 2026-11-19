import type { VerificationResult } from "../core/result.js";

export function renderJsonReport(result: VerificationResult): string {
  return JSON.stringify(result, null, 2);
}
