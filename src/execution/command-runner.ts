import { spawn } from "node:child_process";

export interface CommandRunnerOptions {
  command: string;
  args: string[];
  cwd: string;
  allowedCommands: string[];
  timeoutMs: number;
  maxOutputBytes: number;
}

export interface CommandResult {
  command: string;
  args: string[];
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  outputTruncated: boolean;
}

function validateOptions(options: CommandRunnerOptions): void {
  if (!options.command.trim()) {
    throw new Error("Command cannot be empty");
  }

  if (!options.allowedCommands.includes(options.command)) {
    throw new Error(`Command is not allowed: ${options.command}`);
  }

  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error("timeoutMs must be a positive integer");
  }

  if (
    !Number.isInteger(options.maxOutputBytes) ||
    options.maxOutputBytes <= 0
  ) {
    throw new Error("maxOutputBytes must be a positive integer");
  }

  if (
    !Array.isArray(options.args) ||
    !options.args.every((arg) => typeof arg === "string")
  ) {
    throw new Error("args must be an array of strings");
  }
}

export async function runCommand(
  options: CommandRunnerOptions
): Promise<CommandResult> {
  validateOptions(options);

  const startedAt = Date.now();

  let stdout: Buffer = Buffer.alloc(0);
  let stderr: Buffer = Buffer.alloc(0);
  let outputTruncated = false;
  let timedOut = false;
  let outputBytes = 0;

  // The output limit applies to stdout and stderr combined.
  const appendOutput = (current: Buffer, chunk: Buffer): Buffer => {
    const remaining = options.maxOutputBytes - outputBytes;

    if (remaining <= 0) {
      outputTruncated = true;
      return current;
    }

    const bytesToAppend = Math.min(chunk.length, remaining);

    if (bytesToAppend < chunk.length) {
      outputTruncated = true;
    }

    outputBytes += bytesToAppend;

    return Buffer.concat([current, chunk.subarray(0, bytesToAppend)]);
  };

  // Pass only a limited set of environment variables to the child.
  const allowedEnvironmentKeys = [
    "PATH",
    "HOME",
    "TMPDIR",
    "TEMP",
    "CI",
    "NODE_ENV",
    "PNPM_HOME",
    "SYSTEMROOT",
    "WINDIR"
  ];

  const env: NodeJS.ProcessEnv = {};

  for (const key of allowedEnvironmentKeys) {
    const value = process.env[key];

    if (value !== undefined) {
      env[key] = value;
    }
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let forceKill: ReturnType<typeof setTimeout> | undefined;

    const child = spawn(options.command, options.args, {
      cwd: options.cwd,
      env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32"
    });

    const clearTimers = () => {
      if (timeout) clearTimeout(timeout);
      if (forceKill) clearTimeout(forceKill);
    };

    const killProcess = (signal: NodeJS.Signals) => {
      if (!child.pid) return;

      try {
        if (process.platform !== "win32") {
          // Kill the child process group, not just its parent.
          process.kill(-child.pid, signal);
        } else {
          child.kill(signal);
        }
      } catch {
        // The process may already have exited.
      }
    };

    const finish = (
      exitCode: number | null,
      signal: NodeJS.Signals | null
    ) => {
      if (settled) return;
      settled = true;
      clearTimers();

      resolve({
        command: options.command,
        args: options.args,
        exitCode,
        signal,
        stdout: stdout.toString("utf8"),
        stderr: stderr.toString("utf8"),
        durationMs: Date.now() - startedAt,
        timedOut,
        outputTruncated
      });
    };

    child.stdout.on("data", (chunk: Buffer) => {
      stdout = appendOutput(stdout, chunk);
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr = appendOutput(stderr, chunk);
    });

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimers();
      reject(error);
    });

    child.on("close", (exitCode, signal) => {
      finish(exitCode, signal);
    });

    timeout = setTimeout(() => {
      timedOut = true;
      killProcess("SIGTERM");

      // Force termination if the process ignores SIGTERM.
      forceKill = setTimeout(() => {
        killProcess("SIGKILL");
      }, 1000);
    }, options.timeoutMs);
  });
}