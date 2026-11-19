import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { executeAgentTool } from "../../src/ai/agent/tools.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("adversarial agent tool boundaries", () => {
  it("blocks traversal, verification-control writes, secrets, and symlink escapes", async () => {
    const root = await mkdtemp(join(tmpdir(), "verify-agent-boundary-"));
    temporaryDirectories.push(root);
    await mkdir(join(root, "src"));
    await writeFile(join(root, ".env"), "TOKEN=private\n");
    const outsideDirectory = await mkdtemp(join(tmpdir(), "verify-agent-outside-"));
    temporaryDirectories.push(outsideDirectory);
    const outside = join(outsideDirectory, "outside.ts");
    await writeFile(outside, "export const outside = true;\n");
    await symlink(outside, join(root, "src", "escape.ts"));
    const context = { cwd: root, base: "HEAD" };

    const traversal = await executeAgentTool("write_file", JSON.stringify({
      path: "../../outside.ts",
      content: "changed"
    }), context);
    const configWrite = await executeAgentTool("write_file", JSON.stringify({
      path: "../.verifyrc.json",
      content: "{}"
    }), context);
    const secretRead = await executeAgentTool("read_file", JSON.stringify({ path: ".env" }), context);
    const symlinkRead = await executeAgentTool("read_file", JSON.stringify({ path: "src/escape.ts" }), context);

    expect(traversal.ok).toBe(false);
    expect(configWrite.ok).toBe(false);
    expect(secretRead.ok).toBe(false);
    expect(symlinkRead.ok).toBe(false);
  });
});
