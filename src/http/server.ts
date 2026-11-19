import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { respondWithFindings } from "./routes/findings.js";
import { handleScanRequest } from "./routes/scan.js";
import { runVerification } from "../core/orchestrator.js";
import type { VerificationResult } from "../core/result.js";

export interface VerifyHttpServerOptions {
  cwd?: string;
  maxBodyBytes?: number;
  verify?: typeof runVerification;
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

export function createVerifyHttpServer(options: VerifyHttpServerOptions = {}): Server {
  const cwd = options.cwd ?? process.cwd();
  const maxBodyBytes = options.maxBodyBytes ?? 16 * 1024;
  if (!Number.isInteger(maxBodyBytes) || maxBodyBytes < 1 || maxBodyBytes > 1024 * 1024) {
    throw new Error("maxBodyBytes must be an integer from 1 through 1048576.");
  }
  let latest: VerificationResult | null = null;

  return createServer((request: IncomingMessage, response: ServerResponse) => {
    response.setHeader("x-content-type-options", "nosniff");
    response.setHeader("cache-control", "no-store");
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    if (request.method === "GET" && path === "/findings") {
      respondWithFindings(response, latest);
      return;
    }
    if (request.method === "POST" && path === "/scan") {
      void handleScanRequest(request, response, {
        cwd,
        maxBodyBytes,
        verify: options.verify,
        onResult: (result) => { latest = result; }
      });
      return;
    }
    if (path === "/scan" || path === "/findings") {
      sendJson(response, 405, { error: "Method not allowed." });
      return;
    }
    sendJson(response, 404, { error: "Route not found." });
  });
}
