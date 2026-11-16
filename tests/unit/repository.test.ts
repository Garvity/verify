
import { describe, it, expect } from "vitest";
import { mkdtemp, mkdir, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

import { findGitRepository } from "../../src/git/repository.js";

describe("findGitRepository", () => {
  it("should find the root from a nested directory", async () => {
    const directory = await realpath(
      await mkdtemp(join(tmpdir(), "verify-git-"))
    );
    try {
      execFileSync("git", ["init", "-q"], {
        cwd: directory
      });

      const nested = join(directory, "src", "nested");

      await mkdir(nested, { recursive: true });

      const result = await findGitRepository(nested);

      expect(result.root).toBe(directory);
      expect(result.gitDir).toBe(join(directory, ".git"));
    } finally {
      await rm(directory, {
        recursive: true,
        force: true
      });
    }
  });

  it("should reject a directory outside Git", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "verify-nogit-")
    );

    try {
      await expect(
        findGitRepository(directory)
      ).rejects.toMatchObject({
        code: "GIT_REPOSITORY_NOT_FOUND"
      });
    } finally {
      await rm(directory, {
        recursive: true,
        force: true
      });
    }
  });
});
