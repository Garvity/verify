import { describe, expect, it } from "vitest";
import type { ChatCompletion } from "openai/resources/chat/completions";

import { readGatewayConfig } from "../../../src/ai/gateway/client.js";
import { extractResponseMetadata } from "../../../src/ai/gateway/metadata.js";
import { assertModelAvailable, discoverModels, getConfiguredModel } from "../../../src/ai/gateway/models.js";
import { addUsage, EMPTY_USAGE, summarizeUsage } from "../../../src/ai/gateway/usage.js";

describe("OpenAI-compatible gateway configuration", () => {
  it("uses the configured provider endpoint and validates the API key lazily", () => {
    expect(() => readGatewayConfig({})).toThrow("VERIFY_LLM_API_KEY");
    expect(readGatewayConfig({ VERIFY_LLM_API_KEY: " local-token " })).toEqual({
      baseURL: "http://localhost:3001/v1",
      apiKey: "local-token",
      timeoutMs: 60_000,
      maxRetries: 2
    });
  });

  it("validates endpoint and retry settings without exposing credential values", () => {
    expect(() => readGatewayConfig({
      VERIFY_LLM_API_KEY: "local-token",
      VERIFY_LLM_BASE_URL: "file:///tmp/api"
    })).toThrow("HTTP(S) URL");
    expect(() => readGatewayConfig({
      VERIFY_LLM_API_KEY: "local-token",
      VERIFY_LLM_MAX_RETRIES: "99"
    })).toThrow("VERIFY_LLM_MAX_RETRIES");
    expect(() => readGatewayConfig({ VERIFY_LLM_API_KEY: "local-token" })).not.toThrow();
  });

  it("uses provider-neutral settings and ignores legacy OpenRouter variables", () => {
    expect(readGatewayConfig({
      VERIFY_LLM_API_KEY: "local-token",
      VERIFY_LLM_BASE_URL: "https://gateway.example/v1",
      OPENROUTER_API_KEY: "legacy-token",
      OPENROUTER_BASE_URL: "https://legacy.example/v1"
    }).baseURL).toBe("https://gateway.example/v1");
  });

  it("requires an explicitly configured model id", () => {
    expect(() => getConfiguredModel({})).toThrow("VERIFY_MODEL");
    expect(getConfiguredModel({ VERIFY_MODEL: "actual-model-id" })).toBe("actual-model-id");
  });
});

describe("provider response accounting", () => {
  it("captures the served model, optional provider, and usage details", () => {
    const response = {
      model: "served-model",
      provider: "route-a",
      _request_id: "req-123",
      system_fingerprint: "fp-1"
    } as ChatCompletion;

    expect(extractResponseMetadata(response, "requested-model")).toEqual({
      requestedModel: "requested-model",
      servedModel: "served-model",
      provider: "route-a",
      requestId: "req-123",
      systemFingerprint: "fp-1"
    });
    expect(summarizeUsage({
      prompt_tokens: 12,
      completion_tokens: 8,
      total_tokens: 20,
      prompt_tokens_details: { cached_tokens: 4 },
      completion_tokens_details: { reasoning_tokens: 3 }
    })).toEqual({
      inputTokens: 12,
      outputTokens: 8,
      totalTokens: 20,
      cachedInputTokens: 4,
      reasoningTokens: 3
    });
    expect(addUsage(EMPTY_USAGE, summarizeUsage(null)).totalTokens).toBeNull();
  });

  it("discovers IDs from the gateway and rejects guessed model names", async () => {
    const client = {
      models: {
        list: async () => ({
          data: [
            { id: "z-model", owned_by: "provider-z" },
            { id: "a-model", owned_by: "provider-a" }
          ]
        })
      }
    } as never;

    await expect(discoverModels(client)).resolves.toEqual([
      { id: "a-model", ownedBy: "provider-a" },
      { id: "z-model", ownedBy: "provider-z" }
    ]);
    await expect(assertModelAvailable("missing", client)).rejects.toThrow("a-model, z-model");
    await expect(assertModelAvailable("a-model", client)).resolves.toBeUndefined();
    await expect(assertModelAvailable("auto", client)).resolves.toBeUndefined();
  });
});
