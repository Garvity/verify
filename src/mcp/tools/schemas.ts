import { z } from "zod";

export const findingOutputSchema = z.object({
  id: z.string(),
  ruleId: z.string(),
  severity: z.enum(["critical", "high", "medium", "low", "info"]),
  category: z.enum(["security", "quality", "structural", "policy"]),
  message: z.string(),
  filePath: z.string().optional(),
  line: z.number().optional(),
  column: z.number().optional(),
  blocking: z.boolean(),
  remediation: z.string().optional()
});

export const verificationOutputSchema = z.object({
  id: z.string(),
  status: z.enum(["passed", "failed", "error"]),
  findings: z.array(findingOutputSchema),
  checks: z.array(z.object({
    id: z.enum(["tests", "lint", "typecheck"]),
    command: z.array(z.string()),
    exitCode: z.number().nullable(),
    signal: z.string().nullable(),
    passed: z.boolean(),
    timedOut: z.boolean(),
    outputTruncated: z.boolean(),
    durationMs: z.number()
  })).optional(),
  summary: z.object({
    filesScanned: z.number(),
    checksRun: z.number(),
    totalFindings: z.number(),
    blockingFindings: z.number()
  }),
  durationMs: z.number(),
  timestamp: z.string()
});
