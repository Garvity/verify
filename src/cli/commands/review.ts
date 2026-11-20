import { runVerification } from "../../core/orchestrator.js";
import { VerifyError } from "../../core/error.js";
import { parseCommandArgs, requireStringOption } from "../arguments.js";
import { parseOutputFormat, renderResult } from "../output.js";

const HELP = `Usage: verify review [--base <ref>] [--checks] [--format <terminal|json|markdown>]

Run deterministic verification and the read-only AI reviewer on changed code.`;

export async function reviewCommand(args: string[]): Promise<number> {
  const { values } = parseCommandArgs(args, {
    base: { type: "string" },
    checks: { type: "boolean" },
    format: { type: "string" }
  });
  if (values.help) {
    process.stdout.write(`${HELP}\n`);
    return 0;
  }

  const base = requireStringOption(values.base, "base");
  let format;
  try {
    format = parseOutputFormat(requireStringOption(values.format, "format"));
  } catch (error) {
    throw new VerifyError("INVALID_ARGUMENTS", error instanceof Error ? error.message : String(error), error);
  }

  const result = await runVerification({
    base,
    runChecks: Boolean(values.checks),
    aiReview: true
  });
  process.stdout.write(`${renderResult(result, format)}\n`);
  return result.status === "passed" ? 0 : result.status === "failed" ? 1 : 3;
}
