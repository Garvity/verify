import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import OpenAI from "openai";
import type { ChatCompletionTool } from "openai/resources/chat/completions";

import { createLlmClient } from "./client.js";
import { loadProjectEnv } from "./env.js";
import { extractResponseMetadata } from "./metadata.js";
import { getConfiguredModel } from "./models.js";
import { summarizeUsage } from "./usage.js";

const TOOL_PROBE: ChatCompletionTool = {
  type: "function",
  function: {
    name: "report_probe",
    description: "Return a marker that confirms function tool calling works.",
    parameters: {
      type: "object",
      properties: { marker: { type: "string" } },
      required: ["marker"],
      additionalProperties: false
    }
  }
};

export interface GatewayCheckResult {
  modelCount: number;
  model: string;
  servedModel: string;
  provider?: string;
  requestId?: string;
  usage: ReturnType<typeof summarizeUsage>;
  toolCallingSupported: boolean;
  toolCallingError?: string;
}

export async function runGatewayCheck(): Promise<GatewayCheckResult> {
  loadProjectEnv();
  const client = createLlmClient();
  const model = getConfiguredModel();
  const modelPage = await client.models.list();
  const models = modelPage.data.map((entry) => entry.id);
  if (!models.includes(model)) {
    throw new Error(`VERIFY_MODEL '${model}' is unavailable. Run 'pnpm dev models' and choose an ID returned by the configured provider.`);
  }

  const response = await client.chat.completions.create({
    model,
    messages: [{ role: "user", content: "Reply with: verify gateway connected" }],
    max_completion_tokens: 64
  });

  let toolCallingSupported = false;
  let toolCallingError: string | undefined;
  try {
    const probe = await client.chat.completions.create({
      model,
      messages: [{ role: "user", content: "Call report_probe with marker set to 'ok'." }],
      tools: [TOOL_PROBE],
      tool_choice: { type: "function", function: { name: "report_probe" } },
      max_completion_tokens: 512
    });
    toolCallingSupported = probe.choices[0]?.message.tool_calls?.some(
      (call) => call.type === "function" && call.function.name === "report_probe"
    ) ?? false;
    if (!toolCallingSupported) toolCallingError = "The model returned no report_probe function call.";
  } catch (error) {
    toolCallingError = error instanceof OpenAI.APIError
      ? `The configured provider rejected the tool-call probe${error.status ? ` (HTTP ${error.status})` : ""}.`
      : "The tool-call probe failed; check the configured provider and model availability.";
  }

  const metadata = extractResponseMetadata(response, model);
  return {
    modelCount: models.length,
    model,
    servedModel: metadata.servedModel,
    ...(metadata.provider ? { provider: metadata.provider } : {}),
    ...(metadata.requestId ? { requestId: metadata.requestId } : {}),
    usage: summarizeUsage(response.usage),
    toolCallingSupported,
    ...(toolCallingError ? { toolCallingError } : {})
  };
}

async function main(): Promise<void> {
  try {
    const result = await runGatewayCheck();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.toolCallingSupported) process.exitCode = 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gateway check failed.";
    const apiKey = process.env.VERIFY_LLM_API_KEY;
    const safeMessage = apiKey ? message.replaceAll(apiKey, "[redacted]") : message;
    process.stderr.write(`Provider check failed: ${safeMessage}\n`);
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(resolve(invokedPath)).href) {
  void main();
}
