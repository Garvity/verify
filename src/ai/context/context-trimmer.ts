import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

export interface PreparedContext {
  messages: ChatCompletionMessageParam[];
  estimatedTokens: number;
  estimatedTokensBefore: number;
  droppedMessages: number;
  trimmed: boolean;
}

interface MessageGroup {
  messages: ChatCompletionMessageParam[];
  pinned: boolean;
}

function serializedSize(message: ChatCompletionMessageParam): number {
  return JSON.stringify(message).length;
}

function estimatedTokens(messages: ChatCompletionMessageParam[]): number {
  return Math.ceil(messages.reduce((total, message) => total + serializedSize(message), 0) / 4);
}

function lastIndexWhere<T>(items: T[], predicate: (item: T) => boolean): number {
  for (let index = items.length - 1; index >= 0; index--) {
    if (predicate(items[index]!)) return index;
  }
  return -1;
}

function isVerificationGroup(messages: ChatCompletionMessageParam[]): boolean {
  return messages.some((message) => {
    if (message.role !== "tool" || typeof message.content !== "string") return false;
    try {
      const value = JSON.parse(message.content) as { tool?: unknown };
      return value.tool === "verify_changes";
    } catch {
      return false;
    }
  });
}

function groupConversation(messages: ChatCompletionMessageParam[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  let index = 0;
  while (index < messages.length) {
    const message = messages[index]!;
    const group = [message];
    index++;
    if (message.role === "assistant" && message.tool_calls?.length) {
      const expected = new Set(message.tool_calls.map((call) => call.id));
      while (index < messages.length && expected.size > 0) {
        const next = messages[index]!;
        if (next.role !== "tool" || !expected.has(next.tool_call_id)) break;
        group.push(next);
        expected.delete(next.tool_call_id);
        index++;
      }
    }
    groups.push({ messages: group, pinned: false });
  }
  const lastVerification = lastIndexWhere(groups, (group) => isVerificationGroup(group.messages));
  if (lastVerification >= 0) groups[lastVerification]!.pinned = true;
  return groups;
}

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  if (maxChars <= 32) return text.slice(0, maxChars);
  const headLength = Math.floor((maxChars - 24) * 0.7);
  const tailLength = maxChars - headLength - 24;
  return text.slice(0, headLength) + "\n[context excerpt omitted]\n" + text.slice(-tailLength);
}

function shrinkMessage(message: ChatCompletionMessageParam, maxChars: number): ChatCompletionMessageParam {
  if (typeof message.content === "string" && message.content.length > maxChars) {
    return { ...message, content: truncateText(message.content, maxChars) } as ChatCompletionMessageParam;
  }
  if (message.role === "assistant" && message.tool_calls?.length) {
    const serialized = JSON.stringify(message);
    if (serialized.length > maxChars) {
      const safeCalls = message.tool_calls.map((call) => call.type === "function"
        ? { ...call, function: { ...call.function, arguments: truncateText(call.function.arguments, Math.max(64, Math.floor(maxChars / message.tool_calls!.length))) } }
        : call);
      return { ...message, tool_calls: safeCalls };
    }
  }
  return message;
}

function normalizeLimit(value: number): number {
  if (!Number.isInteger(value) || value < 512 || value > 200_000) {
    throw new Error("Context token limit must be an integer from 512 through 200000.");
  }
  return value;
}

export function readContextTokenLimit(env: Record<string, string | undefined> = process.env): number {
  const raw = env.VERIFY_CONTEXT_MAX_TOKENS?.trim();
  if (!raw) return 12_000;
  const parsed = Number(raw);
  return normalizeLimit(parsed);
}

/** Keeps the system/task prefix and latest verification, dropping only whole older tool turns. */
export function prepareContext(
  messages: ChatCompletionMessageParam[],
  maxTokens = readContextTokenLimit()
): PreparedContext {
  const limit = normalizeLimit(maxTokens);
  const before = estimatedTokens(messages);
  if (before <= limit) {
    return { messages, estimatedTokens: before, estimatedTokensBefore: before, droppedMessages: 0, trimmed: false };
  }

  const prefixCount = Math.min(2, messages.length);
  let prefix = messages.slice(0, prefixCount);
  if (estimatedTokens(prefix) > limit) {
    const charsPerMessage = Math.max(64, Math.floor(limit * 4 / Math.max(1, prefix.length)));
    prefix = prefix.map((message) => shrinkMessage(message, charsPerMessage));
  }
  const groups = groupConversation(messages.slice(prefixCount));
  const chosen = new Set<number>();
  const lastPinned = lastIndexWhere(groups, (group) => group.pinned);
  let kept = [...prefix];
  let pinnedToKeep: ChatCompletionMessageParam[] = [];
  if (lastPinned >= 0) {
    chosen.add(lastPinned);
    const pinnedMessages = groups[lastPinned]!.messages;
    const pinnedCandidate = [...kept, ...pinnedMessages];
    if (estimatedTokens(pinnedCandidate) <= limit) {
      pinnedToKeep = pinnedMessages;
      kept = pinnedCandidate;
    } else {
      const availableChars = Math.max(64, limit * 4 - prefix.reduce((sum, message) => sum + serializedSize(message), 0));
      const charsPerMessage = Math.max(16, Math.floor(availableChars / Math.max(1, pinnedMessages.length)));
      pinnedToKeep = pinnedMessages.map((message) => shrinkMessage(message, charsPerMessage));
      kept = [...prefix, ...pinnedToKeep];
    }
  }
  for (let index = groups.length - 1; index >= 0; index--) {
    if (chosen.has(index)) continue;
    const candidate = [...kept, ...groups[index]!.messages];
    if (estimatedTokens(candidate) <= limit) {
      chosen.add(index);
      kept = candidate;
    }
  }

  const selected = groups.flatMap((group, index) => chosen.has(index)
    ? index === lastPinned ? pinnedToKeep : group.messages
    : []);
  kept = [...prefix, ...selected];

  const after = estimatedTokens(kept);
  return {
    messages: kept,
    estimatedTokens: after,
    estimatedTokensBefore: before,
    droppedMessages: Math.max(0, messages.length - kept.length),
    trimmed: true
  };
}
