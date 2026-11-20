import { PassThrough, Readable, Writable } from "node:stream";
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
  body?: string,
  contentType = "application/json"
): Promise<TestResponse> {
  const incoming = body === undefined ? Readable.from([]) : Readable.from([Buffer.from(body)]);
  Object.assign(incoming, { method, url, headers: body === undefined ? {} : { "content-type": contentType } });
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
      aiReview: false,
      cwd: "/tmp/project"
    });

    const findings = await request(server, "GET", "/findings");
    expect(JSON.parse(findings.body)).toMatchObject({
      status: "ok",
      findings: [],
      verificationStatus: "passed"
    });
  });

  it("passes an explicit AI review request to the shared verifier", async () => {
    const verify = vi.fn().mockResolvedValue(verificationResult);
    const server = createVerifyHttpServer({ cwd: "/tmp/project", verify });
    const scan = await request(server, "POST", "/scan", JSON.stringify({ aiReview: true }));
    expect(scan.statusCode).toBe(200);
    expect(verify).toHaveBeenCalledWith({
      base: undefined,
      all: false,
      runChecks: false,
      aiReview: true,
      cwd: "/tmp/project"
    });
  });

  it("rejects invalid JSON, bad bases, and unsupported routes", async () => {
    const server = createVerifyHttpServer({ verify: vi.fn().mockResolvedValue(verificationResult) });
    expect((await request(server, "POST", "/scan", "{")).statusCode).toBe(400);
    expect((await request(server, "POST", "/scan", JSON.stringify({ base: "--upload" }))).statusCode).toBe(400);
    expect((await request(server, "GET", "/missing")).statusCode).toBe(404);
    expect((await request(server, "GET", "/scan")).statusCode).toBe(405);
  });

  it("rejects non-JSON scan requests and malformed request URLs", async () => {
    const verify = vi.fn().mockResolvedValue(verificationResult);
    const server = createVerifyHttpServer({ verify });
    const contentType = await request(server, "POST", "/scan", "{}", "text/plain");
    const preflight = await request(server, "OPTIONS", "/scan");
    const malformedUrl = await request(server, "GET", "http://[");

    expect(contentType.statusCode).toBe(415);
    expect(preflight.statusCode).toBe(405);
    expect(preflight.headers.has("access-control-allow-origin")).toBe(false);
    expect(malformedUrl.statusCode).toBe(400);
    expect(verify).not.toHaveBeenCalled();
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

  it("returns 413 as soon as the body limit is crossed and continues draining", async () => {
    const server = createVerifyHttpServer({ maxBodyBytes: 8 });
    const incoming = new PassThrough();
    Object.assign(incoming, { method: "POST", url: "/scan", headers: { "content-type": "application/json" } });
    const response = new TestResponse();
    const finished = new Promise<void>((resolve, reject) => {
      response.once("finish", resolve);
      response.once("error", reject);
    });
    server.emit("request", incoming as IncomingMessage, response as unknown as ServerResponse);

    incoming.write("x".repeat(9));
    await finished;
    expect(response.statusCode).toBe(413);
    incoming.end("remaining body");
    await new Promise<void>((resolve) => incoming.once("end", resolve));
  });
});
