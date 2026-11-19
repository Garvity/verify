import type { CompletionUsage } from "openai/resources/completions";

export interface TokenUsageSummary {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  cachedInputTokens: number | null;
  reasoningTokens: number | null;
}

export function summarizeUsage(
  usage: CompletionUsage | null | undefined
): TokenUsageSummary {
  return {
    inputTokens: usage?.prompt_tokens ?? null,
    outputTokens: usage?.completion_tokens ?? null,
    totalTokens: usage?.total_tokens ?? null,
    cachedInputTokens: usage?.prompt_tokens_details?.cached_tokens ?? null,
    reasoningTokens: usage?.completion_tokens_details?.reasoning_tokens ?? null
  };
}

export function addUsage(
  current: TokenUsageSummary,
  next: TokenUsageSummary
): TokenUsageSummary {
  const sum = (left: number | null, right: number | null): number | null =>
    left === null && right === null ? null : (left ?? 0) + (right ?? 0);

  return {
    inputTokens: sum(current.inputTokens, next.inputTokens),
    outputTokens: sum(current.outputTokens, next.outputTokens),
    totalTokens: sum(current.totalTokens, next.totalTokens),
    cachedInputTokens: sum(current.cachedInputTokens, next.cachedInputTokens),
    reasoningTokens: sum(current.reasoningTokens, next.reasoningTokens)
  };
}

export const EMPTY_USAGE: TokenUsageSummary = {
  inputTokens: null,
  outputTokens: null,
  totalTokens: null,
  cachedInputTokens: null,
  reasoningTokens: null
};
