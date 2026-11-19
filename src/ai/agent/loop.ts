import OpenAI from "openai";
import type {
  ChatCompletion,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam
} from "openai/resources/chat/completions";

import { createLlmClient } from "../gateway/client.js";
import { extractResponseMetadata, type ResponseMetadata } from "../gateway/metadata.js";
import { getConfiguredModel } from "../gateway/models.js";
import { addUsage, EMPTY_USAGE, summarizeUsage, type TokenUsageSummary } from "../gateway/usage.js";
import { createTaskPrompt, AGENT_SYSTEM_PROMPT } from "./prompts.js";
import { createRetryPolicy } from "./retry-policy.js";
import { agentToolRegistry, type AgentToolExecutor } from "./tool-registry.js";
import { AGENT_TOOLS } from "./tools.js";
import type { VerificationResult } from "../../core/result.js";

export interface AgentEvent {
  at: string;
  type: "model_response" | "tool_call";
  model?: ResponseMetadata;
  usage?: TokenUsageSummary;
  tool?: string;
  ok?: boolean;
}

export interface AgentRunResult {
  status: "verified" | "failed" | "unverified" | "tool_limit";
  model: string;
  finalMessage: string;
  correctionAttempts: number;
  verificationAttempts: number;
  verification?: VerificationResult;
  usage: TokenUsageSummary;
  events: AgentEvent[];
}

export interface AgentRunOptions {
  task: string;
  base?: string;
  cwd?: string;
  model?: string;
  maxRetries: number;
  protectedPaths?: string[];
  complete?: (request: ChatCompletionCreateParamsNonStreaming) => Promise<ChatCompletion>;
  executeTool?: AgentToolExecutor;
}

function assistantMessage(response: ChatCompletion): ChatCompletionMessageParam | undefined {
  const message = response.choices[0]?.message;
  if (!message) return undefined;
  return {
    role: "assistant",
    content: message.content,
    ...(message.tool_calls?.length ? { tool_calls: message.tool_calls } : {})
  };
}

function getText(response: ChatCompletion): string {
  return response.choices[0]?.message.content ?? "";
}

function verificationFromToolResult(value: unknown): VerificationResult | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as { ok?: unknown; tool?: unknown; data?: unknown };
  if (record.ok !== true || record.tool !== "verify_changes" || typeof record.data !== "object" || record.data === null) {
    return undefined;
  }
  const result = record.data as Partial<VerificationResult>;
  if (!["passed", "failed", "error"].includes(String(result.status)) || !Array.isArray(result.findings)) {
    return undefined;
  }
  return result as VerificationResult;
}

function toolResultStatus(value: unknown): "passed" | "failed" | "unknown" {
  const result = verificationFromToolResult(value);
  if (!result) return "unknown";
  return result.status === "passed" ? "passed" : "failed";
}

export async function runAgent(options: AgentRunOptions): Promise<AgentRunResult> {
  const task = options.task.trim();
  if (!task) throw new Error("Agent task must not be empty.");

  const policy = createRetryPolicy(options.maxRetries);
  const model = options.model?.trim() || getConfiguredModel();
  const base = options.base?.trim() || "HEAD";
  const cwd = options.cwd ?? process.cwd();
  const client = options.complete ? undefined : createLlmClient();
  const complete = options.complete ?? ((request) => {
    const llm: OpenAI = client!;
    return llm.chat.completions.create(request);
  });
  const executeTool = options.executeTool ?? agentToolRegistry;

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: AGENT_SYSTEM_PROMPT },
    { role: "user", content: createTaskPrompt(task, base, policy.maxRetries) }
  ];
  const events: AgentEvent[] = [];
  let usage = EMPTY_USAGE;
  let verification: VerificationResult | undefined;
  let verificationAttempts = 0;
  let correctionAttempts = 0;
  let toolCalls = 0;
  let finalMessage = "";
  let status: AgentRunResult["status"] = "unverified";
  let stoppedByFailure = false;
  let stoppedByToolLimit = false;

  const maxTurns = 6 + policy.maxRetries * 4;
  for (let turn = 0; turn < maxTurns; turn++) {
    const response = await complete({
      model,
      messages,
      tools: AGENT_TOOLS,
      tool_choice: "auto"
    });
    const message = assistantMessage(response);
    if (!message) throw new Error("OpenRouter returned no assistant message.");
    messages.push(message);

    const responseUsage = summarizeUsage(response.usage);
    usage = addUsage(usage, responseUsage);
    events.push({
      at: new Date().toISOString(),
      type: "model_response",
      model: extractResponseMetadata(response, model),
      usage: responseUsage
    });

    const calls = response.choices[0]?.message.tool_calls ?? [];
    if (calls.length === 0) {
      finalMessage = getText(response);
      status = verification?.status === "passed" ? "verified" : "unverified";
      break;
    }

    let passedInThisTurn = false;
    for (const call of calls) {
      toolCalls++;
      if (toolCalls > policy.maxToolCalls) {
        status = "tool_limit";
        stoppedByToolLimit = true;
        finalMessage = "Stopped because the agent reached its tool-call limit.";
        break;
      }

      const toolName = call.type === "function" ? call.function.name : "unsupported_tool";
      const toolArguments = call.type === "function" ? call.function.arguments : "{}";
      const toolResult = await executeTool(toolName, toolArguments, {
        cwd,
        base,
        protectedPaths: options.protectedPaths
      });
      const resultVerification = verificationFromToolResult(toolResult);
      if (toolName === "verify_changes" && resultVerification) {
        verification = resultVerification;
        verificationAttempts++;
        if (resultVerification.status === "passed") {
          passedInThisTurn = true;
        } else if (correctionAttempts < policy.maxRetries) {
          correctionAttempts++;
        } else {
          status = "failed";
          stoppedByFailure = true;
          finalMessage = "Verification still has blocking findings after the configured correction limit.";
        }
      } else if (toolName === "write_file" && toolResult.ok) {
        // A later write in a batch invalidates a verification result that appeared earlier.
        passedInThisTurn = false;
        verification = undefined;
      }

      events.push({
        at: new Date().toISOString(),
        type: "tool_call",
        tool: toolName,
        ok: typeof toolResult === "object" && toolResult !== null && "ok" in toolResult && toolResult.ok === true
      });
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(toolResult)
      });

      if (stoppedByFailure || stoppedByToolLimit) break;
    }

    if (stoppedByFailure || stoppedByToolLimit) break;

    if (passedInThisTurn) {
      const finalResponse = await complete({
        model,
        messages,
        tool_choice: "none"
      });
      const finalAssistantMessage = assistantMessage(finalResponse);
      if (finalAssistantMessage) messages.push(finalAssistantMessage);
      const finalUsage = summarizeUsage(finalResponse.usage);
      usage = addUsage(usage, finalUsage);
      events.push({
        at: new Date().toISOString(),
        type: "model_response",
        model: extractResponseMetadata(finalResponse, model),
        usage: finalUsage
      });
      finalMessage = getText(finalResponse);
      status = "verified";
      break;
    }
  }

  if (status === "unverified" && verification?.status === "failed") status = "failed";

  return {
    status,
    model,
    finalMessage,
    correctionAttempts,
    verificationAttempts,
    ...(verification ? { verification } : {}),
    usage,
    events
  };
}

export { toolResultStatus };
