import { Readable, Writable } from "node:stream";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";

import { createVerifyHttpServer } from "../../../src/http/server.js";
import type { VerificationResult } from "../../../src/core/result.js";

class TestResponse extends Writable {
  statusCode = 200;
  body = "";
  headers = new Map<string, string>();

  setHeader(name: string, value: string | number | readonly string[]): this {
    this.headers.set(name.toLowerCase(), String(value));
    return this;
  }

  _write(chunk: Buffer | string, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.body += chunk.toString();
    callback();
  }
}

async function request(
  server: Server,
  method: string,
  url: string,
  body?: string
): Promise<TestResponse> {
  const incoming = body === undefined ? Readable.from([]) : Readable.from([Buffer.from(body)]);
  Object.assign(incoming, { method, url });
  const response = new TestResponse();
  const finished = new Promise<void>((resolve, reject) => {
    response.once("finish", resolve);
    response.once("error", reject);
  });
  server.emit("request", incoming as IncomingMessage, response as unknown as ServerResponse);
  await finished;
  return response;
}

const verificationResult: VerificationResult = {
  id: "test-run",
  status: "passed",
  findings: [],
  summary: { filesScanned: 2, checksRun: 3, totalFindings: 0, blockingFindings: 0 },
  durationMs: 12,
  timestamp: "2026-11-19T00:00:00.000Z"
};

describe("verification HTTP API", () => {
  it("accepts a scan and returns its findings through GET", async () => {
    const verify = vi.fn().mockResolvedValue(verificationResult);
    const server = createVerifyHttpServer({ cwd: "/tmp/project", verify });
    const scan = await request(server, "POST", "/scan", JSON.stringify({ base: "HEAD" }));
    expect(scan.statusCode).toBe(200);
    expect(JSON.parse(scan.body)).toEqual({ result: verificationResult });
    expect(verify).toHaveBeenCalledWith({
      base: "HEAD",
      all: false,
      runChecks: false,
      cwd: "/tmp/project"
    });

    const findings = await request(server, "GET", "/findings");
    expect(JSON.parse(findings.body)).toMatchObject({
      status: "ok",
      findings: [],
      verificationStatus: "passed"
    });
  });

  it("rejects invalid JSON, bad bases, and unsupported routes", async () => {
    const server = createVerifyHttpServer({ verify: vi.fn().mockResolvedValue(verificationResult) });
    expect((await request(server, "POST", "/scan", "{")).statusCode).toBe(400);
    expect((await request(server, "POST", "/scan", JSON.stringify({ base: "--upload" }))).statusCode).toBe(400);
    expect((await request(server, "GET", "/missing")).statusCode).toBe(404);
    expect((await request(server, "GET", "/scan")).statusCode).toBe(405);
  });

  it("limits the request body", async () => {
    const server = createVerifyHttpServer({
      maxBodyBytes: 8,
      verify: vi.fn().mockResolvedValue(verificationResult)
    });
    const response = await request(server, "POST", "/scan", JSON.stringify({ base: "HEAD" }));
    expect(response.statusCode).toBe(413);
    expect(JSON.parse(response.body).error).toContain("too large");
  });
});
