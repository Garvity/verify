import { describe, expect, it, vi } from "vitest";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createVerifyMcpServer } from "../../../src/mcp/server.js";
import type { VerificationResult } from "../../../src/core/result.js";

const mockResult: VerificationResult = {
  id: "test-verification-001",
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
      source: "ai",
      confidence: 0.91,
      evidence: [{ filePath: "src/app.test.ts", line: 10, snippet: "assert.equal(x, y)", explanation: "This assertion was removed." }],
      filePath: "src/app.test.ts",
      line: 10,
      blocking: false
    }
  ],
  summary: {
    filesScanned: 2,
    checksRun: 6,
    totalFindings: 2,
    blockingFindings: 1
  },
  durationMs: 100,
  timestamp: new Date().toISOString()
};

describe("MCP integration", () => {
  async function createTestConnection() {
    const handler = vi.fn().mockResolvedValue(mockResult);

    const server = createVerifyMcpServer(handler);

    const client = new Client({
      name: "verify-test-client",
      version: "1.0.0"
    });

    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport)
    ]);

    return { handler, server, client };
  }

  it("exposes verification, AI review, and findings tools", async () => {
    const { server, client } = await createTestConnection();

    try {
      const result = await client.listTools();

      const names = result.tools.map((tool) => tool.name);

      expect(names).toContain("verify_changes");
      expect(names).toContain("review_changes");
      expect(names).toContain("get_findings");
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("requests the combined AI review tool and returns its unified result", async () => {
    const { handler, server, client } = await createTestConnection();

    try {
      const response = await client.callTool({
        name: "review_changes",
        arguments: { base: "main" }
      });

      expect(handler).toHaveBeenCalledWith({ base: "main", aiReview: true });
      expect(response.isError).not.toBe(true);
      expect(JSON.stringify(response.content)).toContain("test-verification-001");
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("calls the verification handler", async () => {
    const { handler, server, client } = await createTestConnection();

    try {
      const response = await client.callTool({
        name: "verify_changes",
        arguments: { base: "main" }
      });

      expect(handler).toHaveBeenCalledWith({ base: "main" });
      expect(response.isError).not.toBe(true);
      expect(JSON.stringify(response.content)).toContain(
        "test-verification-001"
      );
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("returns only blocking findings when requested", async () => {
    const { server, client } = await createTestConnection();

    try {
      await client.callTool({
        name: "verify_changes",
        arguments: {}
      });

      const response = await client.callTool({
        name: "get_findings",
        arguments: { blockingOnly: true }
      });

      const output = JSON.stringify(response.content);

      expect(output).toContain("SECRET001");
      expect(output).not.toContain("TEST001");
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("filters findings by source", async () => {
    const { server, client } = await createTestConnection();

    try {
      await client.callTool({ name: "review_changes", arguments: {} });
      const response = await client.callTool({
        name: "get_findings",
        arguments: { source: "ai" }
      });
      const output = JSON.stringify(response.content);
      expect(output).toContain("TEST001");
      expect(output).not.toContain("SECRET001");
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("returns an error if findings are requested before verification", async () => {
    const { server, client } = await createTestConnection();

    try {
      const response = await client.callTool({
        name: "get_findings",
        arguments: {}
      });

      expect(response.isError).toBe(true);
      expect(JSON.stringify(response.content)).toContain(
        "Call verify_changes first"
      );
    } finally {
      await client.close();
      await server.close();
    }
  });
});
