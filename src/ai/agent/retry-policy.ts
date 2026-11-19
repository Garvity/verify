export interface RetryPolicy {
  maxRetries: number;
  maxToolCalls: number;
}

export function createRetryPolicy(maxRetries: number): RetryPolicy {
  if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 10) {
    throw new Error("Agent maxRetries must be an integer from 0 through 10.");
  }

  return {
    maxRetries,
    // Leave room for reading, editing, and verifying on each correction pass.
    maxToolCalls: 5 + maxRetries * 6
  };
}
