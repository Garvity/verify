
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

      const diff = await readGitDiff({
        cwd: directory,
        base: "HEAD"
      });

      expect(diff).toContain("diff --git");
      expect(diff).toContain("-original");
      expect(diff).toContain("+modified");
    } finally {
      await rm(directory, {
        recursive: true,
        force: true
      });
    }
  });
});
