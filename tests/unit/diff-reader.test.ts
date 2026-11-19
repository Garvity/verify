
import { describe, it, expect } from "vitest";
import {
  mkdtemp,
  writeFile,
  rm
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

import { readGitDiff } from "../../src/git/diff-reader.js";
import { parseGitDiff } from "../../src/git/diff-parser.js";

describe("readGitDiff", () => {
  it("should retrieve a real Git diff", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "verify-diff-")
    );

    try {
      execFileSync("git", ["init", "-q"], {
        cwd: directory
      });

      execFileSync(
        "git",
        ["config", "user.name", "Verify Test"],
        { cwd: directory }
      );

      execFileSync(
        "git",
        ["config", "user.email", "verify@example.com"],
        { cwd: directory }
      );

      await writeFile(
        join(directory, "example.txt"),
        "original\n"
      );
      await writeFile(join(directory, ".gitignore"), ".env\n");

      execFileSync("git", ["add", "."], {
        cwd: directory
      });

      execFileSync(
        "git",
        ["commit", "-m", "Initial commit", "-q"],
        { cwd: directory }
      );

      await writeFile(
        join(directory, "example.txt"),
        "modified\n"
      );
      await writeFile(join(directory, "new-file.ts"), "export const added = true;\n");
      await writeFile(join(directory, ".env"), "TOKEN=ignored\n");

      const diff = await readGitDiff({
        cwd: directory,
        base: "HEAD"
      });

      expect(diff).toContain("diff --git");
      expect(diff).toContain("-original");
      expect(diff).toContain("+modified");
      expect(diff).toContain("+export const added = true;");
      expect(diff).not.toContain("TOKEN=ignored");

      const addedFile = parseGitDiff(diff).find((file) => file.newPath === "new-file.ts");
      expect(addedFile).toMatchObject({ status: "added", oldPath: null });
      expect(addedFile?.addedLines[0]).toMatchObject({
        type: "added",
        lineNumber: 1,
        content: "export const added = true;"
      });
    } finally {
      await rm(directory, {
        recursive: true,
        force: true
      });
    }
  });
});
