#!/usr/bin/env node

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { VerifyError } from "../core/error.js";
import { agentCommand } from "./commands/agent.js";
import { checkCommand } from "./commands/check.js";
import { evalCommand } from "./commands/eval.js";
import { initCommand } from "./commands/init.js";
import { modelsCommand } from "./commands/models.js";
import { rulesCommand } from "./commands/rules.js";
import { scanCommand } from "./commands/scan.js";

const USAGE = `verify — deterministic verification for code changes

Usage: verify <command> [options]

Commands:
  scan     Scan changed code (or the full repository with --all)
  check    Scan changes and run enabled quality commands
  init     Create a default .verifyrc.json
  rules    List implemented verification rules
  models   List models exposed by OpenRouter
  agent    Run the minimal integrated coding agent
  eval     Compare two or three models on benchmark tasks

Run "verify <command> --help" for command options.`;

const EXIT_CODES: Record<string, number> = {
  INVALID_ARGUMENTS: 2,
  CONFIG_EXISTS: 2,
  CONFIG_NOT_FOUND: 2,
  CONFIG_INVALID: 2,
  CONFIG_PARSE_ERROR: 2,
  GIT_REPOSITORY_NOT_FOUND: 2,
  GIT_COMMAND_FAILED: 2,
  VERIFICATION_FAILED: 3,
  UNKNOWN_ERROR: 3
};

export async function runCli(args: string[]): Promise<number> {
  const [command, ...commandArgs] = args;
  if (!command || command === "--help" || command === "-h") {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }

  try {
    switch (command) {
      case "scan": return await scanCommand(commandArgs);
      case "check": return await checkCommand(commandArgs);
      case "init": return await initCommand(commandArgs);
      case "rules": return await rulesCommand(commandArgs);
      case "models": return await modelsCommand(commandArgs);
      case "agent": return await agentCommand(commandArgs);
      case "eval": return await evalCommand(commandArgs);
      default:
        throw new VerifyError("INVALID_ARGUMENTS", `Unknown command '${command}'.\n\n${USAGE}`);
    }
  } catch (error) {
    if (error instanceof VerifyError) {
      process.stderr.write(`verify: ${error.message}\n`);
      return EXIT_CODES[error.code] ?? 3;
    }
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`verify: ${message}\n`);
    return 3;
  }
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(resolve(invokedPath)).href) {
  void runCli(process.argv.slice(2)).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
