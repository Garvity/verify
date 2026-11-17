
import { describe, expect, it } from "vitest";
import { runCommand } from "../../src/execution/command-runner.js";

describe("runCommand", () => {
  it("runs an allowlisted command", async () => {
    const result = await runCommand({
      command: "node",
      args: ["-e", "console.log('hello')"],
      cwd: process.cwd(),
      allowedCommands: ["node"],
      timeoutMs: 5000,
      maxOutputBytes: 1024
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("hello");
    expect(result.timedOut).toBe(false);
  });

  it("rejects a command that is not allowlisted", async () => {
    await expect(
      runCommand({
        command: "node",
        args: ["-e", "console.log('hello')"],
        cwd: process.cwd(),
        allowedCommands: ["pnpm"],
        timeoutMs: 5000,
        maxOutputBytes: 1024
      })
    ).rejects.toThrow("Command is not allowed");
  });

  it("does not exceed the output limit", async () => {
    const result = await runCommand({
      command: "node",
      args: ["-e", "console.log('x'.repeat(5000))"],
      cwd: process.cwd(),
      allowedCommands: ["node"],
      timeoutMs: 5000,
      maxOutputBytes: 100
    });

    expect(Buffer.byteLength(result.stdout, "utf8")).toBeLessThanOrEqual(100);
    expect(result.outputTruncated).toBe(true);
  });

  it("times out a long-running command", async () => {
    const result = await runCommand({
      command: "node",
      args: ["-e", "setTimeout(() => {}, 10000)"],
      cwd: process.cwd(),
      allowedCommands: ["node"],
      timeoutMs: 200,
      maxOutputBytes: 1024
    });

    expect(result.timedOut).toBe(true);
  });

  it("reports a non-zero exit code", async () => {
    const result = await runCommand({
      command: "node",
      args: ["-e", "process.exit(2)"],
      cwd: process.cwd(),
      allowedCommands: ["node"],
      timeoutMs: 5000,
      maxOutputBytes: 1024
    });

    expect(result.exitCode).toBe(2);
  });
});
