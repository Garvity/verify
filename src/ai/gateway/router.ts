export const TASK_TYPES = ["simple", "coding", "reasoning", "security"] as const;
export type TaskType = typeof TASK_TYPES[number];

export interface ModelRoute {
  model: string;
  taskType: TaskType;
  source: "task-specific" | "default" | "explicit";
  reason: string;
}

export function isTaskType(value: string): value is TaskType {
  return (TASK_TYPES as readonly string[]).includes(value);
}

/** Routes from explicit environment configuration, with a visible default fallback. */
export function routeModelForTask(
  taskType: TaskType,
  env: Record<string, string | undefined> = process.env
): ModelRoute {
  const taskModelVariable = "VERIFY_MODEL_" + taskType.toUpperCase();
  const taskModel = env[taskModelVariable]?.trim();
  if (taskModel) {
    return {
      model: taskModel,
      taskType,
      source: "task-specific",
      reason: "Selected the configured " + taskType + " model from " + taskModelVariable + "."
    };
  }

  const fallback = env.VERIFY_MODEL?.trim();
  if (!fallback) {
    throw new Error("No model is configured. Set " + taskModelVariable + " or VERIFY_MODEL.");
  }
  return {
    model: fallback,
    taskType,
    source: "default",
    reason: "No " + taskType + " model override is configured; using VERIFY_MODEL as the default fallback."
  };
}
