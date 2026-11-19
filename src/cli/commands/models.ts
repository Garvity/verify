import { loadProjectEnv } from "../../ai/gateway/env.js";
import { discoverModels } from "../../ai/gateway/models.js";
import { VerifyError } from "../../core/error.js";
import { parseCommandArgs } from "../arguments.js";

const HELP = `Usage: verify models [--format <terminal|json>]

List model IDs exposed by OpenRouter.`;

export async function modelsCommand(args: string[]): Promise<number> {
  const { values } = parseCommandArgs(args, { format: { type: "string" } });
  if (values.help) {
    process.stdout.write(`${HELP}\n`);
    return 0;
  }

  const format = values.format ?? "terminal";
  if (format !== "terminal" && format !== "json") {
    throw new VerifyError("INVALID_ARGUMENTS", "--format must be terminal or json.");
  }

  loadProjectEnv();
  const models = await discoverModels();
  if (format === "json") {
    process.stdout.write(`${JSON.stringify(models, null, 2)}\n`);
  } else if (models.length === 0) {
    process.stdout.write("No models are available.\n");
  } else {
    for (const model of models) {
      process.stdout.write(`${model.id}${model.ownedBy ? `\t${model.ownedBy}` : ""}\n`);
    }
  }
  return 0;
}
