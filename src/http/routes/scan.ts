import type { IncomingMessage, ServerResponse } from "node:http";

import { runVerification } from "../../core/orchestrator.js";
import type { VerificationResult } from "../../core/result.js";
import { scanRequestSchema } from "../schemas/requests.js";

export interface ScanRouteOptions {
  cwd: string;
  maxBodyBytes: number;
  verify?: typeof runVerification;
  onResult: (result: VerificationResult) => void;
}

async function readJsonBody(request: IncomingMessage, maxBytes: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > maxBytes) throw new Error("Request body is too large.");
    chunks.push(buffer);
  }
  if (length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

export async function handleScanRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: ScanRouteOptions
): Promise<void> {
  let raw: unknown;
  try {
    raw = await readJsonBody(request, options.maxBodyBytes);
  } catch (error) {
    response.statusCode = error instanceof Error && error.message === "Request body is too large." ? 413 : 400;
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.end(JSON.stringify({ error: error instanceof Error && error.message === "Request body is too large." ? error.message : "Request body must be valid JSON." }));
    return;
  }

  const parsed = scanRequestSchema.safeParse(raw);
  if (!parsed.success) {
    response.statusCode = 400;
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.end(JSON.stringify({ error: "Invalid scan request.", details: parsed.error.issues.map((issue) => issue.message) }));
    return;
  }

  try {
    const result = await (options.verify ?? runVerification)({
      base: parsed.data.base,
      all: parsed.data.all,
      runChecks: parsed.data.runChecks,
      cwd: options.cwd
    });
    options.onResult(result);
    response.statusCode = result.status === "error" ? 500 : 200;
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.end(JSON.stringify({ result }));
  } catch {
    response.statusCode = 500;
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.end(JSON.stringify({ error: "Verification request failed." }));
  }
}
