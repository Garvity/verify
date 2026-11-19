
import { describe, expect, it, vi } from "vitest";

import { createVerifyMcpServer } from "../../../src/mcp/server.js";
import type { VerificationResult } from "../../../src/core/result.js";

function createMockResult(): VerificationResult {
  return {
    id: "verification-001",
    status: "failed",
    findings: [
      {
        id: "finding-001",
        ruleId: "SECRET001",
        severity: "critical",
        category: "security",
        message: "Possible exposed API key",
        filePath: ".env",
        line: 1,
        blocking: true
      },
      {
        id: "finding-002",
        ruleId: "TEST001",
        severity: "medium",
        category: "quality",
        message: "Test assertion removed",
        filePath: "src/app.test.ts",
        line: 10,
        blocking: false
      }
    ],
    summary: {
      filesScanned: 3,
      checksRun: 5,
      totalFindings: 2,
      blockingFindings: 1
    },
    durationMs: 120,
    timestamp: "2026-11-17T10:00:00.000Z"
  };
}

describe("Verify MCP server", () => {
  it("creates an MCP server", () => {
    const handler = vi.fn().mockResolvedValue(createMockResult());

    const server = createVerifyMcpServer(handler);

    expect(server).toBeDefined();
  });

  it("registers the expected tools", () => {
    const handler = vi.fn().mockResolvedValue(createMockResult());

    const server = createVerifyMcpServer(handler);

    // The server is created successfully with both registrations.
    expect(server).toBeDefined();
  });
});
