import { lstat, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { z } from "zod";
import type { ChatCompletionTool } from "openai/resources/chat/completions";

import type { VerificationResult } from "../../core/result.js";
import { runVerification } from "../../core/orchestrator.js";
import { matchesProtectedPath } from "../../policies/engine.js";

const MAX_READ_BYTES = 128 * 1024;
const MAX_WRITE_BYTES = 128 * 1024;

const readInput = z.object({ path: z.string().min(1).max(2048) }).strict();
const writeInput = z.object({
  path: z.string().min(1).max(2048),
  content: z.string().max(MAX_WRITE_BYTES)
}).strict();
const verifyInput = z.object({ base: z.string().min(1).max(256).optional() }).strict();

export const AGENT_TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a text file in the current repository. Sensitive files are blocked.",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "Repository-relative file path" } },
        required: ["path"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Create or replace a source file in src/. Verification controls and tests cannot be edited.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Repository-relative path under src/" },
          content: { type: "string", description: "Complete replacement file contents" }
        },
        required: ["path", "content"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "verify_changes",
      description: "Run deterministic verification and enabled quality checks against Git changes.",
      parameters: {
        type: "object",
        properties: { base: { type: "string", description: "Git base reference, default HEAD" } },
        additionalProperties: false
      }
    }
  }
];

export interface AgentToolContext {
  cwd: string;
  base: string;
  protectedPaths?: string[];
  verify?: (base: string) => Promise<VerificationResult>;
}

export type AgentToolResult =
  | { ok: true; tool: string; data: unknown }
  | { ok: false; tool: string; error: string };

function isWithin(root: string, target: string): boolean {
  const relativePath = relative(root, target);
  return relativePath === "" ||
    (relativePath !== ".." && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath));
}

function isSensitivePath(relativePath: string): boolean {
  const path = relativePath.replace(/\\/g, "/").toLowerCase();
  return path === ".env" || path.startsWith(".env/") || path.startsWith(".env.") ||
    path === ".git" || path.startsWith(".git/") ||
    path === ".omp" || path.startsWith(".omp/") ||
    path.startsWith("node_modules/") || path.startsWith("dist/") ||
    /(^|\/)(credentials?|secrets?)(\/|\.|$)/.test(path) ||
    /\.(pem|key|p12|pfx)$/i.test(path);
}

function isVerificationControl(relativePath: string): boolean {
  const path = relativePath.replace(/\\/g, "/").toLowerCase();
  return path === ".verifyrc.json" || path.startsWith(".github/") ||
    path === "package.json" || path === "pnpm-lock.yaml" || path === "pnpm-workspace.yaml" ||
    path === "tsconfig.json" || path === "vitest.config.ts" ||
    ["src/ai/agent/", "src/ai/gateway/", "src/analyzers/", "src/config/", "src/execution/", "src/git/", "src/mcp/", "src/policies/"]
      .some((prefix) => path.startsWith(prefix)) ||
    ["src/core/orchestrator.ts", "src/core/result.ts", "src/core/error.ts"]
      .includes(path);
}

async function resolveAgentPath(
  cwd: string,
  userPath: string,
  forWrite: boolean,
  protectedPaths: string[] = []
): Promise<{ absolutePath: string; relativePath: string }> {
  if (isAbsolute(userPath)) throw new Error("Use a repository-relative path.");
  const root = await realpath(cwd);
  const absolutePath = resolve(root, userPath);
  if (!isWithin(root, absolutePath) || absolutePath === root) {
    throw new Error("Path must stay inside the repository.");
  }

  const relativePath = relative(root, absolutePath).replace(/\\/g, "/");
  if (isSensitivePath(relativePath)) throw new Error("Access to sensitive paths is blocked.");
  if (forWrite && matchesProtectedPath(relativePath, protectedPaths)) {
    throw new Error("Writes to configured protected paths are blocked.");
  }
  if (forWrite && (!relativePath.startsWith("src/") || isVerificationControl(relativePath))) {
    throw new Error("Writes are limited to src/ files outside verification controls.");
  }

  let resolvedPath = absolutePath;
  try {
    resolvedPath = await realpath(absolutePath);
  } catch (error) {
    if (!forWrite || !(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") {
      throw error;
    }
    // The target may be new; its existing parent must remain inside the repository.
    const realParent = await realpath(resolve(absolutePath, ".."));
    if (!isWithin(root, realParent)) throw new Error("Path resolves outside the repository.");
  }

  if (!isWithin(root, resolvedPath)) throw new Error("Path resolves outside the repository.");
  const resolvedRelativePath = relative(root, resolvedPath).replace(/\\/g, "/");
  if (isSensitivePath(resolvedRelativePath)) throw new Error("Access to sensitive paths is blocked.");
  if (forWrite && matchesProtectedPath(resolvedRelativePath, protectedPaths)) {
    throw new Error("Writes to configured protected paths are blocked.");
  }
  if (forWrite && isVerificationControl(resolvedRelativePath)) {
    throw new Error("Writes to verification controls are blocked.");
  }
  return { absolutePath, relativePath };
}

async function readRepositoryFile(cwd: string, userPath: string): Promise<string> {
  const { absolutePath } = await resolveAgentPath(cwd, userPath, false);
  const details = await stat(absolutePath);
  if (!details.isFile()) throw new Error("Only regular files can be read.");
  if (details.size > MAX_READ_BYTES) throw new Error(`File exceeds the ${MAX_READ_BYTES}-byte read limit.`);
  const content = await readFile(absolutePath, "utf8");
  if (content.includes("\0")) throw new Error("Binary files cannot be read.");
  return content;
}

async function writeRepositoryFile(
  cwd: string,
  userPath: string,
  content: string,
  protectedPaths: string[] = []
): Promise<void> {
  const { absolutePath } = await resolveAgentPath(cwd, userPath, true, protectedPaths);
  const parent = await realpath(resolve(absolutePath, ".."));
  const root = await realpath(cwd);
  if (!isWithin(root, parent)) throw new Error("Path resolves outside the repository.");

  try {
    const details = await lstat(absolutePath);
    if (details.isSymbolicLink() || !details.isFile()) {
      throw new Error("Only regular source files can be replaced; symbolic links are blocked.");
    }
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
  }

  await writeFile(absolutePath, content, { encoding: "utf8" });
}

export async function executeAgentTool(
  name: string,
  rawArguments: string,
  context: AgentToolContext
): Promise<AgentToolResult> {
  try {
    const parsed: unknown = JSON.parse(rawArguments);
    switch (name) {
      case "read_file": {
        const input = readInput.parse(parsed);
        const content = await readRepositoryFile(context.cwd, input.path);
        return { ok: true, tool: name, data: { path: input.path, content } };
      }
      case "write_file": {
        const input = writeInput.parse(parsed);
        await writeRepositoryFile(context.cwd, input.path, input.content, context.protectedPaths);
        return { ok: true, tool: name, data: { path: input.path, bytesWritten: Buffer.byteLength(input.content) } };
      }
      case "verify_changes": {
        const input = verifyInput.parse(parsed);
        const base = input.base ?? context.base;
        if (base.startsWith("-") || base.includes("\0")) {
          throw new Error("Invalid Git base reference.");
        }
        const result = await (context.verify ?? ((ref) => runVerification({ base: ref, runChecks: true, cwd: context.cwd })))(base);
        return { ok: true, tool: name, data: result };
      }
      default:
        throw new Error(`Tool is not available: ${name}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tool call failed.";
    return { ok: false, tool: name, error: message };
  }
}
