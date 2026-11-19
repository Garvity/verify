import { VERIFICATION_RULES } from "../../policies/rules.js";
import { VerifyError } from "../../core/error.js";
import { parseCommandArgs, requireStringOption } from "../arguments.js";
import { parseOutputFormat } from "../output.js";

const HELP = `Usage: verify rules [--format <terminal|json|markdown>]

List the deterministic rules currently implemented by verify.`;

export async function rulesCommand(args: string[]): Promise<number> {
  const { values } = parseCommandArgs(args, { format: { type: "string" } });
  if (values.help) {
    process.stdout.write(`${HELP}\n`);
    return 0;
  }

  let format;
  try {
    format = parseOutputFormat(requireStringOption(values.format, "format"));
  } catch (error) {
    throw new VerifyError("INVALID_ARGUMENTS", error instanceof Error ? error.message : String(error), error);
  }

  if (format === "json") {
    process.stdout.write(`${JSON.stringify(VERIFICATION_RULES, null, 2)}\n`);
  } else if (format === "markdown") {
    process.stdout.write("# Verification rules\n\n| Rule | Category | Severity | Description |\n| --- | --- | --- | --- |\n");
    for (const rule of VERIFICATION_RULES) {
      process.stdout.write(`| ${rule.id} | ${rule.category} | ${rule.severity} | ${rule.description} |\n`);
    }
  } else {
    process.stdout.write("VERIFY RULES\n\n");
    for (const rule of VERIFICATION_RULES) {
      process.stdout.write(`  ${rule.id.padEnd(28)} ${rule.severity.padEnd(8)} ${rule.description}\n`);
    }
  }
  return 0;
}
