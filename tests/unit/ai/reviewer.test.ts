import { describe, expect, it, vi } from "vitest";
import type {
  ChatCompletion,
  ChatCompletionCreateParamsNonStreaming
} from "openai/resources/chat/completions";
import type OpenAI from "openai";

import { reviewChanges } from "../../../src/ai/review/reviewer.js";
import type { GatewayConfig } from "../../../src/ai/gateway/client.js";
import type { ParsedFileDiff, ChangedLine } from "../../../src/git/diff-parser.js";

const reviewEnv = {
  VERIFY_REVIEW_API_KEY: "review-test-key",
  VERIFY_REVIEW_BASE_URL: "http://localhost:20128/v1",
  VERIFY_REVIEW_MODEL: "review-default"
};

function diff(path: string, changed: ChangedLine[]): ParsedFileDiff {
  return {
    oldPath: path,
    newPath: path,
    status: "modified",
    isBinary: false,
    hunks: [{
      oldStart: 1,
      oldCount: changed.length,
      newStart: 1,
      newCount: changed.length,
      changedLines: changed
    }],
    addedLines: changed.filter((line) => line.type === "added"),
    removedLines: changed.filter((line) => line.type === "removed")
  };
}

function completion(content: string, model = "served-review-model"): ChatCompletion {
  return {
    id: "completion-id",
    object: "chat.completion",
    created: 1,
    model,
    provider: "freellmapi",
    choices: [{
      index: 0,
      finish_reason: "stop",
      message: { role: "assistant", content }
    }],
    usage: {
      prompt_tokens: 90,
      completion_tokens: 30,
      total_tokens: 120
    }
  } as unknown as ChatCompletion;
}

function findingFor(filePath: string, line: number, snippet: string) {
  return {
    ruleId: "UNVALIDATED_INPUT",
    severity: "medium",
    category: "security",
    message: "The new input is used without validation.",
    confidence: 0.87,
    evidence: [{ filePath, line, snippet, explanation: "The changed expression passes external input directly." }]
  };
}

function requestBody(request: ChatCompletionCreateParamsNonStreaming): string {
  return String(request.messages[1]?.content);
}

describe("read-only AI code reviewer", () => {
  it("returns validated evidence, usage, and served model metadata", async () => {
    const changed = diff("src/input.ts", [{
      type: "added",
      lineNumber: 12,
      content: "const value = request.query.value;"
    }]);
    const complete = vi.fn(async (_request: ChatCompletionCreateParamsNonStreaming) =>
      completion(JSON.stringify({
        findings: [findingFor("src/input.ts", 12, "request.query.value")]
      }))
    );

    const result = await reviewChanges([changed], {
      env: reviewEnv,
      model: "evaluation-model",
      complete
    });

    expect(result.review).toMatchObject({
      status: "completed",
      model: "evaluation-model",
      servedModel: "served-review-model",
      provider: "freellmapi"
    });
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      source: "ai",
      blocking: false,
      ruleId: "UNVALIDATED_INPUT",
      confidence: 0.87,
      filePath: "src/input.ts",
      line: 12
    });
    expect(result.usage).toEqual({
      inputTokens: 90,
      outputTokens: 30,
      totalTokens: 120,
      cachedInputTokens: null,
      reasoningTokens: null
    });
    expect(complete.mock.calls[0]?.[0].model).toBe("evaluation-model");
    expect(complete.mock.calls[0]?.[0].response_format).toEqual({ type: "json_object" });
  });

  it("redacts credential patterns and PEM blocks before calling the model", async () => {
    const secrets = [
      "ghp_123456789012345678901234",
      "sk-or-v1-012345678901234567890123",
      "hms-012345678901234567890123",
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signaturevalue",
      "opaque-bearer-token-value",
      "private-key-body-material"
    ];
    const lines: ChangedLine[] = [
      { type: "added", lineNumber: 1, content: `const githubToken = "${secrets[0]}";` },
      { type: "added", lineNumber: 2, content: `const key = "${secrets[1]}";` },
      { type: "added", lineNumber: 3, content: `// ${secrets[2]}` },
      { type: "added", lineNumber: 4, content: `const jwt = "${secrets[3]}";` },
      { type: "added", lineNumber: 5, content: `Authorization: Bearer ${secrets[4]}` },
      { type: "added", lineNumber: 6, content: "-----BEGIN PRIVATE KEY-----" },
      { type: "added", lineNumber: 7, content: secrets[5]! },
      { type: "added", lineNumber: 8, content: "-----END PRIVATE KEY-----" },
      { type: "removed", lineNumber: 9, content: "password = \"old-removed-password-value\"" }
    ];
    const complete = vi.fn(async (_request: ChatCompletionCreateParamsNonStreaming) =>
      completion(JSON.stringify({ findings: [] }))
    );

    await reviewChanges([diff("src/auth.ts", lines)], { env: reviewEnv, complete });

    const sent = requestBody(complete.mock.calls[0]![0]);
    for (const secret of [...secrets, "old-removed-password-value"]) {
      expect(sent).not.toContain(secret);
    }
    expect(sent.match(/\[REDACTED/g)?.length).toBeGreaterThanOrEqual(8);
    expect(sent).toContain("Authorization");
  });

  it("omits dotenv, credential, key, and SSH files while retaining example templates", async () => {
    const files = [
      diff(".env.local", [{ type: "added", lineNumber: 1, content: "PRIVATE=value" }]),
      diff("config/credentials.json", [{ type: "added", lineNumber: 1, content: "{\"password\":\"value\"}" }]),
      diff("keys/deploy.pem", [{ type: "added", lineNumber: 1, content: "private material" }]),
      diff("keys/deploy.p8", [{ type: "added", lineNumber: 1, content: "private material" }]),
      diff(".ssh/id_ed25519", [{ type: "added", lineNumber: 1, content: "private material" }]),
      diff(`src/${"x".repeat(40)}/module.ts`, [{ type: "added", lineNumber: 1, content: "private material" }]),
      diff(".env.example", [{ type: "added", lineNumber: 2, content: "VERIFY_REVIEW_API_KEY=\"\"" }]),
      diff("src/safe.ts", [{ type: "added", lineNumber: 4, content: "export const safe = true;" }])
    ];
    const complete = vi.fn(async (_request: ChatCompletionCreateParamsNonStreaming) =>
      completion(JSON.stringify({ findings: [] }))
    );

    const result = await reviewChanges(files, { env: reviewEnv, complete });
    const sent = requestBody(complete.mock.calls[0]![0]);

    expect(result.review.status).toBe("completed");
    expect(sent).toContain(".env.example");
    expect(sent).toContain("src/safe.ts");
    expect(sent).not.toContain(".env.local");
    expect(sent).not.toContain("credentials.json");
    expect(sent).not.toContain("deploy.pem");
    expect(sent).not.toContain("deploy.p8");
    expect(sent).not.toContain(".ssh/id_ed25519");
    expect(sent).not.toContain("x".repeat(40));
  });

  it("redacts encrypted and PGP private key blocks", async () => {
    const lines: ChangedLine[] = [
      { type: "added", lineNumber: 1, content: "-----BEGIN ENCRYPTED PRIVATE KEY-----" },
      { type: "added", lineNumber: 2, content: "short-encrypted-key-material" },
      { type: "added", lineNumber: 3, content: "-----END ENCRYPTED PRIVATE KEY-----" },
      { type: "added", lineNumber: 4, content: "-----BEGIN PGP PRIVATE KEY BLOCK-----" },
      { type: "added", lineNumber: 5, content: "short-pgp-key-material" },
      { type: "added", lineNumber: 6, content: "-----END PGP PRIVATE KEY BLOCK-----" }
    ];
    const complete = vi.fn(async (_request: ChatCompletionCreateParamsNonStreaming) =>
      completion(JSON.stringify({ findings: [] }))
    );

    await reviewChanges([diff("src/keys.ts", lines)], { env: reviewEnv, complete });

    const sent = requestBody(complete.mock.calls[0]![0]);
    expect(sent).not.toContain("short-encrypted-key-material");
    expect(sent).not.toContain("short-pgp-key-material");
    expect(sent.match(/\[REDACTED PRIVATE KEY MATERIAL\]/g)).toHaveLength(6);
  });

  it("rejects malformed schemas and evidence that does not match submitted lines", async () => {
    const file = diff("src/changed.ts", [{
      type: "added", lineNumber: 3, content: "const value = untrusted;"
    }]);
    const invalidSchema = vi.fn(async () => completion(JSON.stringify({
      findings: [{ ...findingFor("src/changed.ts", 3, "untrusted"), unexpected: true }]
    })));
    const invalidEvidence = vi.fn(async () => completion(JSON.stringify({
      findings: [findingFor("src/changed.ts", 3, "not in the submitted change")]
    })));

    const schemaResult = await reviewChanges([file], { env: reviewEnv, complete: invalidSchema });
    const evidenceResult = await reviewChanges([file], { env: reviewEnv, complete: invalidEvidence });

    expect(schemaResult.review).toMatchObject({ status: "failed", errorCode: "invalid_response" });
    expect(evidenceResult.review).toMatchObject({ status: "failed", errorCode: "invalid_response" });
    expect(schemaResult.usage.totalTokens).toBeNull();
    expect(schemaResult.review.servedModel).toBeUndefined();
  });

  it("does not leak secret-like text from a model response", async () => {
    const file = diff("src/changed.ts", [{
      type: "added", lineNumber: 1, content: "const token = [REDACTED];"
    }]);
    const complete = vi.fn(async () => completion(JSON.stringify({
      findings: [{
        ...findingFor("src/changed.ts", 1, "[REDACTED]"),
        message: "A token was found: ghp_123456789012345678901234"
      }]
    })));

    const result = await reviewChanges([file], { env: reviewEnv, complete });

    expect(result.review).toMatchObject({ status: "failed", errorCode: "invalid_response" });
    expect(result.findings).toEqual([]);
    expect(result.usage.totalTokens).toBeNull();
  });

  it("returns not-configured metadata without calling the provider", async () => {
    const complete = vi.fn();
    const result = await reviewChanges([
      diff("src/changed.ts", [{ type: "added", lineNumber: 1, content: "const value = 1;" }])
    ], { env: {}, complete });

    expect(result.review).toMatchObject({ status: "unavailable", errorCode: "not_configured" });
    expect(result.usage.totalTokens).toBeNull();
    expect(result.review.servedModel).toBeUndefined();
    expect(complete).not.toHaveBeenCalled();
  });

  it("reuses the configured FreeLLMAPI gateway when review overrides are unset", async () => {
    let gatewayConfig: GatewayConfig | undefined;
    const clientFactory = vi.fn((config: GatewayConfig): OpenAI => {
      gatewayConfig = config;
      return {
        chat: { completions: { create: async () => completion(JSON.stringify({ findings: [] })) } }
      } as unknown as OpenAI;
    });
    const result = await reviewChanges([
      diff("src/changed.ts", [{ type: "added", lineNumber: 1, content: "const value = 1;" }])
    ], {
      env: {
        VERIFY_LLM_API_KEY: "generic-gateway-test-key",
        VERIFY_LLM_BASE_URL: "https://gateway.example/v1",
        VERIFY_MODEL: "generic-gateway-model",
        VERIFY_LLM_TIMEOUT_MS: "5000"
      },
      clientFactory
    });

    expect(result.review).toMatchObject({ status: "completed", model: "generic-gateway-model" });
    expect(gatewayConfig).toMatchObject({
      apiKey: "generic-gateway-test-key",
      baseURL: "https://gateway.example/v1",
      timeoutMs: 5000,
      maxRetries: 0
    });
    expect(clientFactory).toHaveBeenCalledOnce();
  });

  it("keeps provider errors non-fatal and hides the raw provider error", async () => {
    const complete = vi.fn(async () => {
      throw new Error("request failed with key review-test-key and a remote trace");
    });
    const result = await reviewChanges([
      diff("src/changed.ts", [{ type: "added", lineNumber: 1, content: "const value = 1;" }])
    ], { env: reviewEnv, complete });

    expect(result.review).toMatchObject({ status: "failed", errorCode: "provider_error", model: "review-default" });
    expect(JSON.stringify(result)).not.toContain("review-test-key");
    expect(result.usage.totalTokens).toBeNull();
    expect(result.review.provider).toBeUndefined();
  });

  it("skips empty and sensitive-only changes without loading provider credentials", async () => {
    const complete = vi.fn();
    const result = await reviewChanges([
      diff(".env", [{ type: "added", lineNumber: 1, content: "API_KEY=never-send-this" }])
    ], { env: {}, complete });

    expect(result.review).toMatchObject({ status: "skipped", errorCode: "no_reviewable_changes" });
    expect(complete).not.toHaveBeenCalled();
    expect(result.usage.totalTokens).toBeNull();
  });

  it("rejects invalid review configuration without a provider call", async () => {
    const complete = vi.fn();
    const result = await reviewChanges([
      diff("src/changed.ts", [{ type: "added", lineNumber: 1, content: "const value = 1;" }])
    ], {
      env: { ...reviewEnv, VERIFY_REVIEW_TIMEOUT_MS: "0" },
      complete
    });

    expect(result.review).toMatchObject({ status: "failed", errorCode: "invalid_config" });
    expect(complete).not.toHaveBeenCalled();
  });

  it("rejects oversized review input before making a provider call", async () => {
    const complete = vi.fn();
    const result = await reviewChanges([
      diff("src/large.ts", [{ type: "added", lineNumber: 1, content: `const source = "${"x ".repeat(35_000)}";` }])
    ], { env: reviewEnv, complete });

    expect(result.review).toMatchObject({ status: "failed", errorCode: "input_too_large" });
    expect(complete).not.toHaveBeenCalled();
    expect(result.usage.totalTokens).toBeNull();
  });
});
