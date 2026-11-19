import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

import { prepareContext, readContextTokenLimit, type PreparedContext } from "./context-trimmer.js";

/** Holds a stable context budget for one agent run and delegates safe turn trimming. */
export class ContextManager {
  constructor(readonly maxTokens = readContextTokenLimit()) {}

  prepare(messages: ChatCompletionMessageParam[]): PreparedContext {
    return prepareContext(messages, this.maxTokens);
  }
}
