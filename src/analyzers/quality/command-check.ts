import type { VerifyConfig } from "../../config/schema.js";
import { VerifyError } from "../../core/error.js";
import type { VerificationCheck } from "../../core/result.js";
import { runCommand } from "../../execution/command-runner.js";

export type QualityCheckId = VerificationCheck["id"];

/** Runs a quality command only when its configured argv matches the allowlist. */
export async function runQualityCheck(
  id: QualityCheckId,
  command: string[],
  config: VerifyConfig,
  cwd: string
): Promise<VerificationCheck> {
  const allowed = config.execution.allowedCommands.some((prefix) =>
    prefix.every((token, index) => command[index] === token)
  );

  if (!allowed || command.length === 0) {
    throw new VerifyError(
      "CONFIG_INVALID",
      `The configured ${id} command is not permitted by execution.allowedCommands.`
    );
  }

  try {
    const result = await runCommand({
      command: command[0]!,
      args: command.slice(1),
      cwd,
      // argv has already been checked against the more specific config allowlist.
      allowedCommands: [command[0]!],
      timeoutMs: config.execution.timeoutMs,
      maxOutputBytes: config.execution.maxOutputBytes
    });

    return {
      id,
      command,
      exitCode: result.exitCode,
      signal: result.signal,
      passed: result.exitCode === 0 && !result.timedOut,
      timedOut: result.timedOut,
      outputTruncated: result.outputTruncated,
      durationMs: result.durationMs
    };
  } catch (error) {
    throw new VerifyError(
      "VERIFICATION_FAILED",
      `Unable to run the configured ${id} command.`,
      error
    );
  }
}
