
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { findGitRepository } from "./repository.js";
import { VerifyError } from "../core/error.js";

const execFileAsync = promisify(execFile);

export interface DiffReaderOptions {
  cwd?: string;
  base?: string;
}

export async function readGitDiff(
  options: DiffReaderOptions = {}
): Promise<string> {
  const repository = await findGitRepository(
    options.cwd ?? process.cwd()
  );

  const base = options.base ?? "HEAD";

  if (
    base.trim().length === 0 ||
    base.startsWith("-") ||
    base.includes("\0")
  ) {
    throw new VerifyError(
      "GIT_COMMAND_FAILED",
      "Invalid Git base reference."
    );
  }

  try {
    const result = await execFileAsync(
      "git",
      [
        "diff",
        "--no-ext-diff",
        "--no-textconv",
        "--no-color",
        "--find-renames",
        "--unified=3",
        base,
        "--"
      ],
      {
        cwd: repository.root,
        encoding: "utf8",
        maxBuffer: 20 * 1024 * 1024
      }
    );

    return result.stdout;
  } catch (error) {
    throw new VerifyError(
      "GIT_COMMAND_FAILED",
      `Unable to retrieve Git diff against '${base}'.`,
      error
    );
  }
}
