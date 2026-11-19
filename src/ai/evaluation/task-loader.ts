import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { z } from "zod";

import { VerifyError } from "../../core/error.js";
import { loadConfig } from "../../config/loader.js";
import type { BenchmarkTask, LoadedBenchmark, LoadedBenchmarkTask } from "./types.js";

const taskSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/),
  description: z.string().min(1).max(20_000),
  expectedOutcome: z.string().min(1).max(10_000),
  fixture: z.string().min(1).max(512),
  hiddenTests: z.array(z.string().min(1).max(512)).max(30).default([]),
  maxRetries: z.number().int().min(0).max(5).default(2),
  testTimeoutMs: z.number().int().min(1000).max(120_000).default(30_000),
  verification: z.object({
    requirePass: z.boolean().default(true),
    forbiddenRuleIds: z.array(z.string().min(1)).max(100).default([])
  }).strict().prefault({})
}).strict();

function isWithin(root: string, target: string): boolean {
  const child = relative(root, target);
  return child === "" || (child !== ".." && !child.startsWith(`..${sep}`) && !isAbsolute(child));
}

function validateRelativePath(value: string, label: string, expectedTop: string): string[] {
  if (isAbsolute(value) || value.includes("\\") || value.includes("\0")) {
    throw new VerifyError("CONFIG_INVALID", `${label} must be a safe relative path.`);
  }
  const parts = value.split("/");
  if (parts[0] !== expectedTop || parts.some((part) => !part || part === "." || part === "..")) {
    throw new VerifyError("CONFIG_INVALID", `${label} must stay under '${expectedTop}/'.`);
  }
  return parts;
}

async function resolveSafePath(root: string, value: string, label: string, top: string): Promise<string> {
  const parts = validateRelativePath(value, label, top);
  const absoluteRoot = await realpath(root);
  let cursor = absoluteRoot;
  for (const [index, part] of parts.entries()) {
    cursor = resolve(cursor, part);
    const details = await lstat(cursor).catch((error: unknown) => {
      throw new VerifyError("CONFIG_INVALID", `${label} does not exist: ${value}`, error);
    });
    if (details.isSymbolicLink()) throw new VerifyError("CONFIG_INVALID", `${label} cannot use symbolic links: ${value}`);
    if (index < parts.length - 1 && !details.isDirectory()) {
      throw new VerifyError("CONFIG_INVALID", `${label} has a non-directory parent: ${value}`);
    }
  }
  const actual = await realpath(cursor);
  if (!isWithin(absoluteRoot, actual)) throw new VerifyError("CONFIG_INVALID", `${label} resolves outside the benchmark directory.`);
  return actual;
}

async function assertFixtureTreeSafe(root: string): Promise<void> {
  const visit = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === ".git") throw new VerifyError("CONFIG_INVALID", "Benchmark fixtures must not include a Git repository.");
      const path = resolve(directory, entry.name);
      const details = await lstat(path);
      if (details.isSymbolicLink()) throw new VerifyError("CONFIG_INVALID", `Benchmark fixture contains a symbolic link: ${relative(root, path)}`);
      if (details.isDirectory()) await visit(path);
      else if (!details.isFile()) throw new VerifyError("CONFIG_INVALID", `Benchmark fixture contains a non-regular file: ${relative(root, path)}`);
    }
  };
  await visit(root);
}

async function hashFile(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function hashTree(root: string): Promise<string> {
  const hash = createHash("sha256");
  const visit = async (directory: string): Promise<void> => {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = resolve(directory, entry.name);
      const name = relative(root, path).split(sep).join("/");
      hash.update(name);
      hash.update("\0");
      if (entry.isDirectory()) await visit(path);
      else hash.update(await readFile(path));
      hash.update("\0");
    }
  };
  await visit(root);
  return hash.digest("hex");
}

function parseTask(raw: unknown, path: string): BenchmarkTask {
  const parsed = taskSchema.safeParse(raw);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new VerifyError("CONFIG_INVALID", `Invalid benchmark task ${path}: ${detail}`);
  }
  return parsed.data;
}

export async function loadBenchmarkTasks(taskPath: string): Promise<LoadedBenchmark> {
  const requestedPath = resolve(taskPath);
  const details = await lstat(requestedPath).catch((error: unknown) => {
    throw new VerifyError("CONFIG_NOT_FOUND", `Benchmark path not found: ${requestedPath}`, error);
  });
  if (details.isSymbolicLink()) throw new VerifyError("CONFIG_INVALID", "Benchmark task paths cannot be symbolic links.");

  const files = details.isDirectory()
    ? (await readdir(requestedPath, { withFileTypes: true }))
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map((entry) => resolve(requestedPath, entry.name))
        .sort()
    : details.isFile() && requestedPath.endsWith(".json")
      ? [requestedPath]
      : [];
  if (files.length === 0) throw new VerifyError("CONFIG_INVALID", "Benchmark path must contain at least one .json task definition.");

  const root = details.isDirectory()
    ? basename(requestedPath) === "tasks" ? dirname(requestedPath) : requestedPath
    : basename(dirname(requestedPath)) === "tasks" ? dirname(dirname(requestedPath)) : dirname(requestedPath);
  const resolvedRoot = await realpath(root);
  const tasks: LoadedBenchmarkTask[] = [];
  const ids = new Set<string>();

  for (const definitionPath of files) {
    const actualDefinition = await realpath(definitionPath);
    if (!isWithin(resolvedRoot, actualDefinition)) throw new VerifyError("CONFIG_INVALID", "Benchmark task definition resolves outside its root.");
    const task = parseTask(JSON.parse(await readFile(actualDefinition, "utf8")) as unknown, actualDefinition);
    if (ids.has(task.id)) throw new VerifyError("CONFIG_INVALID", `Duplicate benchmark task ID '${task.id}'.`);
    ids.add(task.id);

    const fixturePath = await resolveSafePath(resolvedRoot, task.fixture, `Task '${task.id}' fixture`, "fixtures");
    const fixtureInfo = await lstat(fixturePath);
    if (!fixtureInfo.isDirectory()) throw new VerifyError("CONFIG_INVALID", `Task '${task.id}' fixture must be a directory.`);
    await assertFixtureTreeSafe(fixturePath);
    try {
      await lstat(resolve(fixturePath, ".verifyrc.json"));
    } catch (error) {
      throw new VerifyError("CONFIG_INVALID", `Task '${task.id}' fixture must include .verifyrc.json.`, error);
    }

    const configPath = resolve(fixturePath, ".verifyrc.json");
    if (!(await lstat(configPath)).isFile()) throw new VerifyError("CONFIG_INVALID", "Benchmark .verifyrc.json must be a regular file.");
    const config = await loadConfig(configPath);
    if (!Object.values(config.security).every(Boolean)) {
      throw new VerifyError("CONFIG_INVALID", "Benchmark fixtures must keep all security analyzers enabled.");
    }
    if ([config.quality.tests, config.quality.lint, config.quality.typecheck].some((check) => check.enabled)) {
      throw new VerifyError("CONFIG_INVALID", "Benchmark fixtures must disable project commands; the runner executes only validated hidden Node tests.");
    }

    const hiddenTestPaths: string[] = [];
    const hiddenTestSha256: Record<string, string> = {};
    for (const hiddenPath of task.hiddenTests) {
      if (!hiddenPath.endsWith(".mjs")) throw new VerifyError("CONFIG_INVALID", "Hidden tests must be Node.js .mjs files.");
      const absolute = await resolveSafePath(resolvedRoot, hiddenPath, `Task '${task.id}' hidden test`, "hidden-tests");
      if (!(await lstat(absolute)).isFile()) throw new VerifyError("CONFIG_INVALID", `Hidden test is not a file: ${hiddenPath}`);
      hiddenTestPaths.push(absolute);
      hiddenTestSha256[hiddenPath] = await hashFile(absolute);
    }

    tasks.push({
      ...task,
      definitionPath: actualDefinition,
      fixturePath,
      hiddenTestPaths,
      definitionSha256: await hashFile(actualDefinition),
      fixtureSha256: await hashTree(fixturePath),
      hiddenTestSha256
    });
  }

  return { root: resolvedRoot, tasks };
}
