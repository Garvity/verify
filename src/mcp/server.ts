import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { VerificationResult } from "../core/result.js";
import { registerGetFindingsTool } from "./tools/get-findings.js";
import { registerReviewChangesTool } from "./tools/review-changes.js";
import {
  registerVerifyChangesTool,
  type VerifyChangesInput
} from "./tools/verify-changes.js";
import type { VerificationSessionState } from "./tools/state.js";

export type VerifyChangesHandler = (
  input: VerifyChangesInput
) => Promise<VerificationResult>;

export function createVerifyMcpServer(
  runVerification: VerifyChangesHandler
) {
  const server = new McpServer({ name: "verify", version: "0.1.0" });
  const state: VerificationSessionState = { latestResult: null };

  registerVerifyChangesTool(server, runVerification, state);
  registerReviewChangesTool(server, runVerification, state);
  registerGetFindingsTool(server, state);

  return server;
}
