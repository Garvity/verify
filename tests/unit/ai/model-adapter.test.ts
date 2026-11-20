import { beforeEach, describe, expect, it, vi } from "vitest";

const { loadConfig, runAgent } = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  runAgent: vi.fn()
}));

vi.mock("../../../src/config/loader.js", () => ({ loadConfig }));
vi.mock("../../../src/ai/agent/loop.js", () => ({ runAgent }));

import { runModelTask } from "../../../src/ai/evaluation/model-adapter.js";

describe("runModelTask", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads project policy and runs the task with the requested model", async () => {
    loadConfig.mockResolvedValue({ protectedPaths: [".env", "secrets/**"] });
    runAgent.mockResolvedValue({ status: "verified" });
    const task = { description: "Implement a function", maxRetries: 2 } as never;

    await expect(runModelTask({ task, model: "provider/model", cwd: "/repo" }))
      .resolves.toEqual({ status: "verified" });

    expect(loadConfig).toHaveBeenCalledWith("/repo/.verifyrc.json");
    expect(runAgent).toHaveBeenCalledWith({
      task: "Implement a function",
      model: "provider/model",
      base: "HEAD",
      cwd: "/repo",
      maxRetries: 2,
      protectedPaths: [".env", "secrets/**"]
    });
  });
});
