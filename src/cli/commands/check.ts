import { runVerification } from "../../core/orchestrator.js";
import { VerifyError } from "../../core/error.js";
import { loadBaselineFile } from "../baseline.js";
import { parseCommandArgs, requireStringOption } from "../arguments.js";
import { parseOutputFormat, renderResult } from "../output.js";

const HELP = `Usage: verify check [--base <ref> | --all] [--baseline <json-file>] [--format <terminal|json|markdown>]

Run change analysis and all enabled, allowlisted quality commands.`;

export async function checkCommand(args: string[]): Promise<number> {
  const { values } = parseCommandArgs(args, {
    base: { type: "string" },
    all: { type: "boolean" },
    baseline: { type: "string" },
    format: { type: "string" }
  });
  if (values.help) {
    process.stdout.write(`${HELP}\n`);
    return 0;
  }

  const base = requireStringOption(values.base, "base");
  const baselinePath = requireStringOption(values.baseline, "baseline");
  if (values.all && base) {
    throw new VerifyError("INVALID_ARGUMENTS", "Use either --all or --base, not both.");
  }
  let format;
  try {
    format = parseOutputFormat(requireStringOption(values.format, "format"));
  } catch (error) {
    throw new VerifyError("INVALID_ARGUMENTS", error instanceof Error ? error.message : String(error), error);
  }

  const baseline = baselinePath ? await loadBaselineFile(baselinePath) : undefined;
  const result = await runVerification({ base, all: Boolean(values.all), runChecks: true, baseline });
  process.stdout.write(`${renderResult(result, format)}\n`);
  return result.status === "passed" ? 0 : result.status === "failed" ? 1 : 3;
}
