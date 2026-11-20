import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { VerificationResult } from "../../core/result.js";
import type { VerificationSessionState } from "./state.js";
import { verificationOutputSchema } from "./schemas.js";

export interface VerifyChangesInput {
  base?: string;
  aiReview?: boolean;
}

export type VerifyChangesHandler = (
  input: VerifyChangesInput
) => Promise<VerificationResult>;

export function registerVerifyChangesTool(
  server: McpServer,
  runVerification: VerifyChangesHandler,
  state: VerificationSessionState
): void {
  server.registerTool(
    "verify_changes",
    {
      title: "Verify current changes",
      description:
        "Run deterministic verification against current Git changes. Set aiReview=true to also request the read-only AI reviewer. " +
        "AI failure is reported separately and does not change deterministic status.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      },
      inputSchema: {
        base: z.string().min(1).optional(),
        aiReview: z.boolean().optional()
      },
      outputSchema: verificationOutputSchema
    },
    async ({ base, aiReview }) => {
      try {
        const result = await runVerification({ base, aiReview });
        state.latestResult = result;
        return {
          structuredContent: { ...result },
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        };
      } catch (error) {
        const message = error instanceof Error
          ? error.message
          : "Verification could not be completed.";
        return {
          content: [{ type: "text", text: `Verification error: ${message}` }],
          isError: true
        };
      }
    }
  );
}
