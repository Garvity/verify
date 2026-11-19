import { startMcpServer } from "./stdio.js";
import { runVerification } from "../core/orchestrator.js";

async function main(): Promise<void> {
  await startMcpServer(runVerification);
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error
      ? error.stack ?? error.message
      : String(error);

  // Never print diagnostic messages to stdout.
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});