
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";

import { VerifyError } from "../core/error.js";

const execFileAsync = promisify(execFile);

export interface GitRepository {
  root: string;
  gitDir: string;
}

export async function findGitRepository(
  startPath: string = process.cwd()
): Promise<GitRepository> {
  const cwd = resolve(startPath);

  let root: string;
  let gitDir: string;

  try {
    const rootResult = await execFileAsync(
      "git",
      ["rev-parse", "--show-toplevel"],
      {
        cwd,
        encoding: "utf8",
        maxBuffer: 1024 * 1024
      }
    );

    root = rootResult.stdout.trim();

    const gitDirResult = await execFileAsync(
      "git",
      ["rev-parse", "--absolute-git-dir"],
      {
        cwd,
        encoding: "utf8",
        maxBuffer: 1024 * 1024
      }
    );

    gitDir = gitDirResult.stdout.trim();
  } catch (error) {
    const gitError = error as NodeJS.ErrnoException & {
      stderr?: string;
    };

    if (
      gitError.code === "ENOENT" ||
      String(gitError.code) === "128"
    ) {
      throw new VerifyError(
        "GIT_REPOSITORY_NOT_FOUND",
        `No Git repository found from: ${cwd}`,
        error
      );
    }

    throw new VerifyError(
      "GIT_COMMAND_FAILED",
      `Unable to detect Git repository from: ${cwd}`,
      error
    );
  }

  return {
    root: resolve(root),
    gitDir: resolve(gitDir)
  };
}
