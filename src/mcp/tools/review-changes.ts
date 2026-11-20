import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { VerificationResult } from "../../core/result.js";
import type { VerificationSessionState } from "./state.js";
import { verificationOutputSchema } from "./schemas.js";
import type { VerifyChangesHandler } from "./verify-changes.js";

export function registerReviewChangesTool(
  server: McpServer,
  runVerification: VerifyChangesHandler,
  state: VerificationSessionState
): void {
  server.registerTool(
    "review_changes",
    {
      title: "Verify and review current changes",
      description:
        "Run deterministic verification and the read-only AI code reviewer on current Git changes. " +
        "Requires VERIFY_REVIEW_API_KEY. The reviewer never edits files; AI errors are included without changing deterministic status.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      },
      inputSchema: { base: z.string().min(1).optional() },
      outputSchema: verificationOutputSchema
    },
    async ({ base }) => {
      try {
        const result: VerificationResult = await runVerification({ base, aiReview: true });
        state.latestResult = result;
        return {
          structuredContent: { ...result },
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        };
      } catch (error) {
        const message = error instanceof Error
          ? error.message
          : "Verification and review could not be completed.";
        return {
          content: [{ type: "text", text: `Review error: ${message}` }],
          isError: true
        };
      }
    }
  );
}
