
import { z } from "zod";

const commandSchema = z
  .array(z.string().min(1))
  .min(1);

export const VerifyConfigSchema = z
  .object({
    security: z
      .object({
        secrets: z.boolean().default(true),

        sensitiveFiles: z.boolean().default(true),

        dangerousPatterns: z.boolean().default(true)
      })
      .prefault({}),

    quality: z
      .object({
        tests: z
          .object({
            enabled: z.boolean().default(true),

            command: commandSchema.default([
              "pnpm",
              "test"
            ])
          })
          .prefault({}),

        lint: z
          .object({
            enabled: z.boolean().default(false),

            command: commandSchema.default([
              "pnpm",
              "lint"
            ])
          })
          .prefault({}),

        typecheck: z
          .object({
            enabled: z.boolean().default(false),

            command: commandSchema.default([
              "pnpm",
              "exec",
              "tsc",
              "--noEmit"
            ])
          })
          .prefault({})
      })
      .prefault({}),

    protectedPaths: z
      .array(z.string().min(1))
      .default([
        ".env",
        ".github/workflows/**"
      ]),

    approval: z
      .object({
        requireForProtectedFiles: z
          .boolean()
          .default(true)
      })
      .prefault({}),

    execution: z
      .object({
        timeoutMs: z
          .number()
          .int()
          .positive()
          .default(120000),

        maxOutputBytes: z
          .number()
          .int()
          .positive()
          .default(1024 * 1024),

        allowedCommands: z
          .array(commandSchema)
          .default([
            ["pnpm", "test"],
            ["pnpm", "lint"],
            ["pnpm", "exec", "tsc", "--noEmit"]
          ])
      })
      .prefault({}),

    agent: z
      .object({
        maxRetries: z
          .number()
          .int()
          .min(0)
          .max(10)
          .default(3)
      })
      .prefault({})
  })
  .strict();

export type VerifyConfig = z.infer<
  typeof VerifyConfigSchema
>;
