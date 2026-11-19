
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { findGitRepository } from "./repository.js";
import { VerifyError } from "../core/error.js";

const execFileAsync = promisify(execFile);
const MAX_DIFF_BYTES = 20 * 1024 * 1024;

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
    const tracked = await execFileAsync(
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
        maxBuffer: MAX_DIFF_BYTES
      }
    );

    const untrackedList = await execFileAsync(
      "git",
      ["ls-files", "--others", "--exclude-standard", "-z"],
      {
        cwd: repository.root,
        encoding: "utf8",
        maxBuffer: MAX_DIFF_BYTES
      }
    );
    const untrackedPaths = untrackedList.stdout.split("\0").filter(Boolean).sort();
    const untrackedDiffs = await readUntrackedDiffs(repository.root, untrackedPaths);
    const combined = `${tracked.stdout}${untrackedDiffs.join("")}`;
    if (Buffer.byteLength(combined, "utf8") > MAX_DIFF_BYTES) {
      throw new VerifyError(
        "GIT_COMMAND_FAILED",
        `Git diff exceeds the ${MAX_DIFF_BYTES}-byte size limit.`
      );
    }
    return combined;
  } catch (error) {
    if (error instanceof VerifyError) throw error;
    throw new VerifyError(
      "GIT_COMMAND_FAILED",
      `Unable to retrieve Git diff against '${base}'.`,
      error
    );
  }
}

async function readUntrackedDiffs(root: string, paths: string[]): Promise<string[]> {
  const output = new Array<string>(paths.length);
  let next = 0;
  let totalBytes = 0;

  const worker = async (): Promise<void> => {
    while (true) {
      const index = next++;
      if (index >= paths.length) return;
      const filePath = paths[index]!;

      try {
        const result = await execFileAsync(
          "git",
          [
            "diff",
            "--no-index",
            "--no-ext-diff",
            "--no-textconv",
            "--no-color",
            "--unified=3",
            "--",
            process.platform === "win32" ? "NUL" : "/dev/null",
            filePath
          ],
          { cwd: root, encoding: "utf8", maxBuffer: MAX_DIFF_BYTES }
        );
        output[index] = result.stdout;
      } catch (error) {
        const gitError = error as NodeJS.ErrnoException & {
          stdout?: string;
        };
        // `git diff --no-index` uses exit status 1 when it found differences.
        if (Number(gitError.code) === 1) {
          output[index] = gitError.stdout ?? "";
        } else if (gitError.code === "ENOENT") {
          // The file disappeared between ls-files and diff; it is no longer a current change.
          output[index] = "";
        } else {
          throw new VerifyError(
            "GIT_COMMAND_FAILED",
            `Unable to retrieve the diff for untracked file '${filePath}'.`,
            error
          );
        }
      }

      totalBytes += Buffer.byteLength(output[index]!, "utf8");
      if (totalBytes > MAX_DIFF_BYTES) {
        throw new VerifyError(
          "GIT_COMMAND_FAILED",
          `Untracked file diffs exceed the ${MAX_DIFF_BYTES}-byte size limit.`
        );
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(4, paths.length) }, () => worker()));
  return output;
}
