import { runAgent } from "../../ai/agent/loop.js";
import { loadProjectEnv } from "../../ai/gateway/env.js";
import { assertModelAvailable } from "../../ai/gateway/models.js";
import { isTaskType, routeModelForTask } from "../../ai/gateway/router.js";
import { loadConfig } from "../../config/loader.js";
import { VerifyError } from "../../core/error.js";
import { parseCommandArgs, requireStringOption } from "../arguments.js";

const HELP = `Usage: verify agent --task <instruction> [--base <ref>] [--model <id>] [--task-type <simple|coding|reasoning|security>] [--format <terminal|json>]

Run the minimal OpenRouter coding loop. The agent can edit src/ files outside verification controls and will run verify_changes.`;

export async function agentCommand(args: string[]): Promise<number> {
  const { values } = parseCommandArgs(args, {
    task: { type: "string" },
    base: { type: "string" },
    model: { type: "string" },
    "task-type": { type: "string" },
    format: { type: "string" }
  });
  if (values.help) {
    process.stdout.write(`${HELP}\n`);
    return 0;
  }

  const task = requireStringOption(values.task, "task");
  if (!task) throw new VerifyError("INVALID_ARGUMENTS", "--task is required.");
  const base = requireStringOption(values.base, "base") ?? "HEAD";
  const modelOption = requireStringOption(values.model, "model");
  const taskTypeOption = requireStringOption(values["task-type"], "task-type") ?? "coding";
  if (!isTaskType(taskTypeOption)) {
    throw new VerifyError("INVALID_ARGUMENTS", "--task-type must be simple, coding, reasoning or security.");
  }
  const route = modelOption
    ? { model: modelOption, taskType: taskTypeOption, source: "explicit" as const, reason: "Selected explicitly with --model." }
    : routeModelForTask(taskTypeOption);
  const format = values.format ?? "terminal";
  if (format !== "terminal" && format !== "json") {
    throw new VerifyError("INVALID_ARGUMENTS", "--format must be terminal or json.");
  }

  loadProjectEnv();
  const config = await loadConfig();
  const model = route.model;
  await assertModelAvailable(model);
  const result = await runAgent({
    task,
    base,
    model,
    maxRetries: config.agent.maxRetries,
    protectedPaths: config.protectedPaths,
    routing: route
  });

  if (format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write("Task type: " + route.taskType + " (" + route.source + ")\nRouting: " + route.reason + "\n");
    process.stdout.write(`VERIFY AGENT\n\nStatus: ${result.status}\nModel: ${result.model}\n`);
    process.stdout.write(`Verification attempts: ${result.verificationAttempts}\nCorrection attempts: ${result.correctionAttempts}\n`);
    if (result.verification) {
      process.stdout.write(`Files scanned: ${result.verification.summary.filesScanned}\n`);
      process.stdout.write(`Findings: ${result.verification.summary.totalFindings} (${result.verification.summary.blockingFindings} blocking)\n`);
    }
    if (result.finalMessage) process.stdout.write(`\n${result.finalMessage}\n`);
  }

  if (result.status === "verified") return 0;
  if (result.status === "failed") return 1;
  return 3;
}
