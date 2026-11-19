import { describe, expect, it } from "vitest";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

import { AsyncResultCache } from "../../../src/ai/context/cache.js";
import { prepareContext } from "../../../src/ai/context/context-trimmer.js";
import { routeModelForTask } from "../../../src/ai/gateway/router.js";

describe("AI context and routing", () => {
  it("coalesces cache misses, expires entries, and supports invalidation", async () => {
    let now = 100;
    let loads = 0;
    const cache = new AsyncResultCache<string>(2, () => now);
    const loader = async () => {
      loads++;
      await Promise.resolve();
      return "result-" + loads;
    };
    const [first, concurrent] = await Promise.all([
      cache.getOrLoad("models", 50, loader),
      cache.getOrLoad("models", 50, loader)
    ]);
    expect(first).toBe("result-1");
    expect(concurrent).toBe(first);
    expect(loads).toBe(1);

    now += 51;
    await expect(cache.getOrLoad("models", 50, loader)).resolves.toBe("result-2");
    expect(cache.delete("models")).toBe(true);
    await expect(cache.getOrLoad("models", 50, loader)).resolves.toBe("result-3");
  });

  it("preserves the task and latest verification while dropping whole old tool turns", () => {
    const messages = [
      { role: "system", content: "system instructions" },
      { role: "user", content: "the original task" },
      {
        role: "assistant",
        content: null,
        tool_calls: [{ id: "old-read", type: "function", function: { name: "read_file", arguments: "{}" } }]
      },
      { role: "tool", tool_call_id: "old-read", content: "old output ".repeat(300) },
      {
        role: "assistant",
        content: null,
        tool_calls: [{ id: "verify", type: "function", function: { name: "verify_changes", arguments: "{}" } }]
      },
      { role: "tool", tool_call_id: "verify", content: JSON.stringify({ ok: true, tool: "verify_changes", data: { status: "failed", findings: [{ ruleId: "SECRET_API_KEY" }] } }) }
    ] as ChatCompletionMessageParam[];
    const prepared = prepareContext(messages, 512);
    expect(prepared.trimmed).toBe(true);
    expect(prepared.messages.slice(0, 2)).toEqual(messages.slice(0, 2));
    expect(prepared.messages.some((message) => message.role === "tool" && message.tool_call_id === "verify")).toBe(true);
    expect(prepared.messages.some((message) => message.role === "tool" && message.tool_call_id === "old-read")).toBe(false);
    expect(prepared.droppedMessages).toBeGreaterThan(0);
    expect(prepared.estimatedTokens).toBeLessThanOrEqual(512);
  });

  it("uses task-specific model settings and records default fallback", () => {
    const taskRoute = routeModelForTask("security", {
      VERIFY_MODEL: "default/model",
      VERIFY_MODEL_SECURITY: "secure/model"
    });
    expect(taskRoute).toMatchObject({
      model: "secure/model",
      taskType: "security",
      source: "task-specific"
    });

    const fallback = routeModelForTask("coding", { VERIFY_MODEL: "default/model" });
    expect(fallback).toMatchObject({
      model: "default/model",
      taskType: "coding",
      source: "default"
    });
    expect(fallback.reason).toContain("fallback");
  });
});
