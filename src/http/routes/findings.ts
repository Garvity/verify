import type { ServerResponse } from "node:http";

import type { VerificationResult } from "../../core/result.js";

export function respondWithFindings(response: ServerResponse, latest: VerificationResult | null): void {
  response.statusCode = 200;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify({
    status: latest ? "ok" : "empty",
    findings: latest?.findings ?? [],
    summary: latest?.summary ?? null,
    verificationStatus: latest?.status ?? null
  }));
}
