import { execFile } from "node:child_process";
import { lstat, readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

import { VerifyError } from "../core/error.js";
import { findGitRepository } from "./repository.js";
import type { ParsedFileDiff } from "./diff-parser.js";

const execFileAsync = promisify(execFile);
const MAX_TEXT_FILE_BYTES = 5 * 1024 * 1024;

/** Reads tracked and non-ignored untracked text files for the opt-in --all scan. */
export async function readWorkingTreeFiles(
  cwd: string = process.cwd()
): Promise<ParsedFileDiff[]> {
  const repository = await findGitRepository(cwd);
  let output: string;

  try {
    ({ stdout: output } = await execFileAsync(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
      { cwd: repository.root, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 }
    ));
  } catch (error) {
    throw new VerifyError("GIT_COMMAND_FAILED", "Unable to list repository files.", error);
  }

  const files: ParsedFileDiff[] = [];

  for (const path of new Set(output.split("\0").filter(Boolean))) {
    const absolutePath = resolve(repository.root, path);
    const pathFromRoot = relative(repository.root, absolutePath);
    if (
      !pathFromRoot ||
      pathFromRoot === ".." ||
      pathFromRoot.startsWith(`..${sep}`) ||
      isAbsolute(pathFromRoot)
    ) continue;

    try {
      const details = await lstat(absolutePath);
      // Do not follow symlinks or load very large files into memory.
      if (!details.isFile() || details.size > MAX_TEXT_FILE_BYTES) continue;

      const contents = await readFile(absolutePath);
      if (contents.subarray(0, Math.min(contents.length, 8192)).includes(0)) continue;

      const lines = contents.toString("utf8").split(/\r?\n/);
      if (lines.at(-1) === "") lines.pop();
      const addedLines = lines.map((content, index) => ({
        type: "added" as const,
        lineNumber: index + 1,
        content
      }));

      files.push({
        oldPath: null,
        newPath: path.replace(/\\/g, "/"),
        status: "added",
        isBinary: false,
        hunks: [],
        addedLines,
        removedLines: []
      });
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") continue;
      throw new VerifyError(`GIT_COMMAND_FAILED`, `Unable to read repository file: ${path}`, error);
    }
  }

  return files;
}
