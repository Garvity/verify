import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { executeAgentTool } from "../../../src/ai/agent/tools.js";

let root = "";

async function createRepo(): Promise<string> {
  root = await mkdtemp(join(tmpdir(), "verify-agent-tools-"));
  await mkdir(join(root, "src"), { recursive: true });
  await mkdir(join(root, "src", "policies"), { recursive: true });
  await writeFile(join(root, "src", "sample.ts"), "export const old = true;\n");
  return root;
}

afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  root = "";
});

describe("integrated agent tools", () => {
  it("reads repository source and writes permitted source files", async () => {
    const cwd = await createRepo();
    const read = await executeAgentTool("read_file", JSON.stringify({ path: "src/sample.ts" }), { cwd, base: "HEAD" });
    expect(read).toMatchObject({ ok: true, data: { content: "export const old = true;\n" } });

    const write = await executeAgentTool("write_file", JSON.stringify({
      path: "src/sample.ts",
      content: "export const next = true;\n"
    }), { cwd, base: "HEAD" });
    expect(write.ok).toBe(true);
    await expect(readFile(join(cwd, "src", "sample.ts"), "utf8")).resolves.toBe("export const next = true;\n");
  });

  it("blocks path traversal, secrets, and verification-control edits", async () => {
    const cwd = await createRepo();
    await writeFile(join(cwd, ".env"), "TOKEN=do-not-read\n");

    const traversal = await executeAgentTool("write_file", JSON.stringify({
      path: "../outside.ts",
      content: "unsafe"
    }), { cwd, base: "HEAD" });
    const policyEdit = await executeAgentTool("write_file", JSON.stringify({
      path: "src/policies/engine.ts",
      content: "export const allowEverything = true;"
    }), { cwd, base: "HEAD" });
    const secretRead = await executeAgentTool("read_file", JSON.stringify({ path: ".env" }), { cwd, base: "HEAD" });

    expect(traversal).toMatchObject({ ok: false });
    expect(policyEdit).toMatchObject({ ok: false });
    expect(secretRead).toMatchObject({ ok: false });
    expect(JSON.stringify(secretRead)).not.toContain("do-not-read");
  });

  it("honors project-specific protected path rules", async () => {
    const cwd = await createRepo();
    const result = await executeAgentTool("write_file", JSON.stringify({
      path: "src/sample.ts",
      content: "blocked"
    }), {
      cwd,
      base: "HEAD",
      protectedPaths: ["src/*.ts"]
    });

    expect(result).toMatchObject({ ok: false, error: "Writes to configured protected paths are blocked." });
  });

  it("blocks symlinks that point outside the repository", async () => {
    const cwd = await createRepo();
    const outside = join(cwd, "..", "outside-secret.txt");
    await writeFile(outside, "private");
    await symlink(outside, join(cwd, "src", "linked.ts"));

    const result = await executeAgentTool("write_file", JSON.stringify({
      path: "src/linked.ts",
      content: "overwritten"
    }), { cwd, base: "HEAD" });

    expect(result).toMatchObject({ ok: false });
    await expect(readFile(outside, "utf8")).resolves.toBe("private");
    await rm(outside, { force: true });
  });

  it("runs verification through the injected deterministic engine", async () => {
    const cwd = await createRepo();
    const verify = async (base: string) => ({
      id: "result-1",
      status: "passed" as const,
      findings: [],
      summary: { filesScanned: 1, checksRun: 1, totalFindings: 0, blockingFindings: 0 },
      durationMs: 2,
      timestamp: "2026-01-01T00:00:00.000Z",
      checkBase: base
    });

    const result = await executeAgentTool("verify_changes", JSON.stringify({ base: "main" }), {
      cwd,
      base: "HEAD",
      verify
    });
    expect(result).toMatchObject({ ok: true, tool: "verify_changes", data: { status: "passed" } });
  });

  it("runs the default verifier in the agent's repository", async () => {
    const cwd = await createRepo();
    await writeFile(join(cwd, ".verifyrc.json"), JSON.stringify({
      security: { secrets: false, sensitiveFiles: false, dangerousPatterns: false },
      quality: {
        tests: { enabled: false },
        lint: { enabled: false },
        typecheck: { enabled: false }
      }
    }));
    execFileSync("git", ["init", "-q"], { cwd });
    execFileSync("git", ["add", "."], { cwd });
    execFileSync("git", [
      "-c", "user.name=Verify Test",
      "-c", "user.email=verify-test@example.invalid",
      "commit", "-q", "-m", "baseline"
    ], { cwd });

    const result = await executeAgentTool("verify_changes", "{}", { cwd, base: "HEAD" });
    expect(result).toMatchObject({
      ok: true,
      tool: "verify_changes",
      data: { status: "passed", summary: { filesScanned: 0, blockingFindings: 0 } }
    });
  });
});
