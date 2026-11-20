import { loadProjectEnv } from "../../ai/gateway/env.js";
import { discoverModels } from "../../ai/gateway/models.js";
import { listReviewModels } from "../../ai/review/reviewer.js";
import { VerifyError } from "../../core/error.js";
import { parseCommandArgs } from "../arguments.js";

const HELP = `Usage: verify models [--review] [--format <terminal|json>]

List model IDs exposed by the configured gateway. --review uses VERIFY_REVIEW_* settings.`;

export async function modelsCommand(args: string[]): Promise<number> {
  const { values } = parseCommandArgs(args, {
    format: { type: "string" },
    review: { type: "boolean" }
  });
  if (values.help) {
    process.stdout.write(`${HELP}\n`);
    return 0;
  }

  const format = values.format ?? "terminal";
  if (format !== "terminal" && format !== "json") {
    throw new VerifyError("INVALID_ARGUMENTS", "--format must be terminal or json.");
  }

  loadProjectEnv();
  const models = values.review ? await listReviewModels() : await discoverModels();
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
