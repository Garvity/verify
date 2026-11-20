import OpenAI from "openai";

export const DEFAULT_LLM_BASE_URL = "http://localhost:3001/v1";

export interface GatewayConfig {
  baseURL: string;
  apiKey: string;
  timeoutMs: number;
  maxRetries: number;
}

export type GatewayEnvironment = Record<string, string | undefined>;

function positiveInteger(
  value: string | undefined,
  fallback: number,
  name: string,
  maximum: number
): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new Error(`${name} must be an integer between 1 and ${maximum}.`);
  }
  return parsed;
}

export function readGatewayConfig(
  env: GatewayEnvironment = process.env
): GatewayConfig {
  const baseURL = (env.VERIFY_LLM_BASE_URL ?? DEFAULT_LLM_BASE_URL).trim();
  let parsedURL: URL;
  try {
    parsedURL = new URL(baseURL);
  } catch {
    throw new Error("VERIFY_LLM_BASE_URL must be a valid HTTP(S) URL.");
  }

  if (
    !["http:", "https:"].includes(parsedURL.protocol) ||
    parsedURL.username !== "" ||
    parsedURL.password !== "" ||
    parsedURL.search !== "" ||
    parsedURL.hash !== ""
  ) {
    throw new Error("VERIFY_LLM_BASE_URL must be an HTTP(S) URL without credentials, query, or fragment.");
  }

  const apiKey = env.VERIFY_LLM_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Provider API key is missing. Set VERIFY_LLM_API_KEY in the environment or .env.");
  }

  return {
    baseURL: parsedURL.toString().replace(/\/+$/, ""),
    apiKey,
    timeoutMs: positiveInteger(env.VERIFY_LLM_TIMEOUT_MS, 60_000, "VERIFY_LLM_TIMEOUT_MS", 300_000),
    maxRetries: positiveInteger(env.VERIFY_LLM_MAX_RETRIES, 2, "VERIFY_LLM_MAX_RETRIES", 5)
  };
}

/** Create an SDK client only when an AI workflow is explicitly requested. */
export function createLlmClient(
  config: GatewayConfig = readGatewayConfig()
): OpenAI {
  return new OpenAI({
    baseURL: config.baseURL,
    apiKey: config.apiKey,
    timeout: config.timeoutMs,
    maxRetries: config.maxRetries
  });
}
