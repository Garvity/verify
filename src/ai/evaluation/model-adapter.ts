import { loadConfig } from "../../config/loader.js";
import { runAgent, type AgentRunResult } from "../agent/loop.js";
import type { LoadedBenchmarkTask } from "./types.js";

export interface ModelTaskInput {
  task: LoadedBenchmarkTask;
  model: string;
  cwd: string;
}

/** Runs one model/task pair through the same minimal agent with an explicit model ID. */
export async function runModelTask(input: ModelTaskInput): Promise<AgentRunResult> {
  const config = await loadConfig(`${input.cwd}/.verifyrc.json`);
  return runAgent({
    task: input.task.description,
    model: input.model,
    base: "HEAD",
    cwd: input.cwd,
    maxRetries: input.task.maxRetries,
    protectedPaths: config.protectedPaths
  });
}
