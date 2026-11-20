import type { ChatCompletion } from "openai/resources/chat/completions";
import { describe, expect, it, vi } from "vitest";

import { runAgent } from "../../../src/ai/agent/loop.js";
import type { VerificationResult } from "../../../src/core/result.js";

function response(
  message: { content: string | null; tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }> },
  tokenCount = 10
): ChatCompletion {
  return {
    id: `completion-${tokenCount}`,
    object: "chat.completion",
    created: 1,
    model: "served-model",
    choices: [{
      index: 0,
      finish_reason: message.tool_calls ? "tool_calls" : "stop",
      logprobs: null,
      message: { role: "assistant", content: message.content, refusal: null, ...message }
    }],
    usage: {
      prompt_tokens: tokenCount,
      completion_tokens: tokenCount,
      total_tokens: tokenCount * 2
    }
  } as unknown as ChatCompletion;
}

function verification(status: "passed" | "failed"): VerificationResult {
  return {
    id: `result-${status}`,
    status,
    findings: status === "failed" ? [{
      id: "FAILED_CHECK",
      ruleId: "FAILED_CHECK",
      severity: "high",
      category: "quality",
      message: "A configured check failed",
      blocking: true
    }] : [],
    summary: {
      filesScanned: 1,
      checksRun: 1,
      totalFindings: status === "failed" ? 1 : 0,
      blockingFindings: status === "failed" ? 1 : 0
    },
    durationMs: 1,
    timestamp: "2026-01-01T00:00:00.000Z"
  };
}

const verifyCall = (id: string) => ({
  id,
  type: "function" as const,
  function: { name: "verify_changes", arguments: "{\"base\":\"HEAD\"}" }
});

const failedWriteCall = {
  id: "write-failed",
  type: "function" as const,
  function: { name: "write_file", arguments: "{\"path\":\"src/example.ts\",\"content\":\"partial\"}" }
};

describe("minimal integrated agent loop", () => {
  it("reports verified only after a passing verification and final response", async () => {
    const complete = vi.fn()
      .mockResolvedValueOnce(response({ content: null, tool_calls: [verifyCall("verify-1")] }))
      .mockResolvedValueOnce(response({ content: "The changes pass verification." }));
    const executeTool = vi.fn().mockResolvedValue({
      ok: true,
      tool: "verify_changes",
      data: verification("passed")
    });

    const result = await runAgent({
      task: "Check the current changes",
      model: "test-model",
      maxRetries: 2,
      complete,
      executeTool
    });

    expect(result.status).toBe("verified");
    expect(result.verificationAttempts).toBe(1);
    expect(result.verification?.status).toBe("passed");
    expect(result.finalMessage).toContain("pass verification");
    expect(result.usage.totalTokens).toBe(40);
    expect(complete.mock.calls[1]?.[0].tool_choice).toBe("none");
  });

  it("uses failed findings for a bounded correction, then verifies again", async () => {
    const writeCall = {
      id: "write-1",
      type: "function" as const,
      function: { name: "write_file", arguments: "{\"path\":\"src/example.ts\",\"content\":\"fixed\"}" }
    };
    const complete = vi.fn()
      .mockResolvedValueOnce(response({ content: null, tool_calls: [verifyCall("verify-1")] }))
      .mockResolvedValueOnce(response({ content: null, tool_calls: [writeCall, verifyCall("verify-2")] }))
      .mockResolvedValueOnce(response({ content: "Fixed and verified." }));
    const executeTool = vi.fn(async (name: string) => name === "verify_changes"
      ? {
          ok: true,
          tool: name,
          data: verification(executeTool.mock.calls.filter(([toolName]) => toolName === name).length === 1 ? "failed" : "passed")
        }
      : { ok: true, tool: name, data: { bytesWritten: 5 } });

    const result = await runAgent({
      task: "Fix the failing change",
      model: "test-model",
      maxRetries: 2,
      complete,
      executeTool
    });

    expect(result.status).toBe("verified");
    expect(result.correctionAttempts).toBe(1);
    expect(result.verificationAttempts).toBe(2);
    expect(executeTool).toHaveBeenCalledTimes(3);
  });

  it("stops on the first failure when no correction attempts are allowed", async () => {
    const complete = vi.fn().mockResolvedValueOnce(
      response({ content: null, tool_calls: [verifyCall("verify-1")] })
    );
    const executeTool = vi.fn().mockResolvedValue({
      ok: true,
      tool: "verify_changes",
      data: verification("failed")
    });

    const result = await runAgent({
      task: "Check the current changes",
      model: "test-model",
      maxRetries: 0,
      complete,
      executeTool
    });

    expect(result.status).toBe("failed");
    expect(result.correctionAttempts).toBe(0);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("invalidates a passing verification after any write attempt in the same tool batch", async () => {
    const complete = vi.fn()
      .mockResolvedValueOnce(response({ content: null, tool_calls: [verifyCall("verify-1"), failedWriteCall] }))
      .mockResolvedValueOnce(response({ content: "The write failed." }));
    const executeTool = vi.fn(async (name: string) => name === "verify_changes"
      ? { ok: true, tool: name, data: verification("passed") }
      : { ok: false, tool: name, error: "write failed" });

    const result = await runAgent({
      task: "Check then attempt a fix",
      model: "test-model",
      maxRetries: 1,
      complete,
      executeTool
    });

    expect(result.status).toBe("unverified");
    expect(result.verification).toBeUndefined();
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it("routes direct agent calls by task type and records the decision", async () => {
    vi.stubEnv("VERIFY_MODEL_SECURITY", "routed-security-model");
    try {
      const complete = vi.fn().mockResolvedValueOnce(response({ content: "I need to inspect the task." }));
      const result = await runAgent({
        task: "Review this authorization change",
        taskType: "security",
        maxRetries: 0,
        complete,
        executeTool: vi.fn()
      });
      expect(result.model).toBe("routed-security-model");
      expect(result.routing).toMatchObject({
        taskType: "security",
        source: "task-specific",
        model: "routed-security-model"
      });
      expect(complete.mock.calls[0]?.[0].model).toBe("routed-security-model");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
