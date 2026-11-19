import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { VerificationResult } from "../../core/result.js";
import type { VerificationSessionState } from "./state.js";
import { findingOutputSchema } from "./schemas.js";

export function registerGetFindingsTool(
  server: McpServer,
  state: VerificationSessionState
): void {
  server.registerTool(
    "get_findings",
    {
      title: "Get verification findings",
      description:
        "Retrieve findings from the most recent verification. " +
        "Can optionally filter by severity or blocking status.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      },
      inputSchema: {
        blockingOnly: z.boolean().optional(),
        severity: z.enum(["critical", "high", "medium", "low", "info"]).optional()
      },
      outputSchema: z.object({
        verificationId: z.string(),
        status: z.enum(["passed", "failed", "error"]),
        totalFindings: z.number(),
        findings: z.array(findingOutputSchema)
      })
    },
    async ({ blockingOnly, severity }) => {
      if (!state.latestResult) {
        return {
          content: [{
            type: "text",
            text: "No verification result is available. Call verify_changes first."
          }],
          isError: true
        };
      }

      let findings = state.latestResult.findings;
      if (blockingOnly) findings = findings.filter((finding) => finding.blocking);
      if (severity) findings = findings.filter((finding) => finding.severity === severity);

      const output: FindingsOutput = {
        verificationId: state.latestResult.id,
        status: state.latestResult.status,
        totalFindings: findings.length,
        findings
      };

      return {
        structuredContent: { ...output },
        content: [{ type: "text", text: JSON.stringify(output, null, 2) }]
      };
    }
  );
}

interface FindingsOutput {
  verificationId: string;
  status: VerificationResult["status"];
  totalFindings: number;
  findings: VerificationResult["findings"];
}
