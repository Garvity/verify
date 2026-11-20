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
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let length = 0;
    let settled = false;
    const cleanup = (): void => {
      request.off("data", onData);
      request.off("end", onEnd);
      request.off("error", onError);
      request.off("close", onClose);
    };
    const onData = (chunk: Buffer | string): void => {
      if (settled) return;
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      length += buffer.length;
      if (length > maxBytes) {
        settled = true;
        chunks.length = 0;
        reject(new Error("Request body is too large."));
        // Keep consuming without retaining bytes so the client receives the 413 response
        // and the socket is not destroyed by an early async-iterator return.
        request.once("end", cleanup);
        return;
      }
      chunks.push(buffer);
    };
    const onEnd = (): void => {
      if (settled) return;
      settled = true;
      cleanup();
      try {
        resolve(length === 0 ? {} : JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown);
      } catch (error) {
        reject(error);
      }
    };
    const onError = (error: Error): void => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const onClose = (): void => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(new Error("Request body ended before the upload completed."));
      } else {
        cleanup();
      }
    };

    request.on("data", onData);
    request.on("end", onEnd);
    request.on("error", onError);
    request.on("close", onClose);
  });
}

export async function handleScanRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: ScanRouteOptions
): Promise<void> {
  const contentType = request.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    response.statusCode = 415;
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.end(JSON.stringify({ error: "Content-Type must be application/json." }));
    request.resume();
    return;
  }

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
      aiReview: parsed.data.aiReview,
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
