import { executeAgentTool, type AgentToolContext, type AgentToolResult } from "./tools.js";

export type AgentToolExecutor = (
  name: string,
  argumentsJson: string,
  context: AgentToolContext
) => Promise<AgentToolResult>;

export const agentToolRegistry: AgentToolExecutor = executeAgentTool;
