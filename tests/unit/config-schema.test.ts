
import { describe, it, expect } from "vitest";

import { VerifyConfigSchema } from "../../src/config/schema.js";

describe("VerifyConfigSchema", () => {
  it("should accept an empty configuration and apply defaults", () => {
    const result = VerifyConfigSchema.safeParse({});

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.security.secrets).toBe(true);
      expect(result.data.agent.maxRetries).toBe(3);
      expect(result.data.execution.timeoutMs).toBe(120000);
    }
  });

  it("should accept a valid configuration", () => {
    const result = VerifyConfigSchema.safeParse({
      security: {
        secrets: false
      },
      agent: {
        maxRetries: 5
      }
    });

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.security.secrets).toBe(false);
      expect(result.data.agent.maxRetries).toBe(5);
    }
  });

  it("should reject an invalid retry count", () => {
    const result = VerifyConfigSchema.safeParse({
      agent: {
        maxRetries: 20
      }
    });

    expect(result.success).toBe(false);
  });

  it("should reject a negative timeout", () => {
    const result = VerifyConfigSchema.safeParse({
      execution: {
        timeoutMs: -100
      }
    });

    expect(result.success).toBe(false);
  });

  it("should reject unknown configuration properties", () => {
    const result = VerifyConfigSchema.safeParse({
      unknownProperty: true
    });

    expect(result.success).toBe(false);
  });
});
