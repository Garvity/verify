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
  remediation: z.string().optional(),
  source: z.enum(["deterministic", "ai"]).optional(),
  confidence: z.number().min(0).max(1).optional(),
  evidence: z.array(z.object({
    filePath: z.string(),
    line: z.number().int().positive(),
    snippet: z.string(),
    explanation: z.string()
  }).strict()).optional()
});

export const aiReviewOutputSchema = z.object({
  status: z.enum(["completed", "unavailable", "failed", "skipped"]),
  model: z.string().optional(),
  servedModel: z.string().optional(),
  provider: z.string().optional(),
  attempts: z.number().int().nonnegative().optional(),
  errorCode: z.enum([
    "not_configured",
    "invalid_config",
    "provider_error",
    "invalid_response",
    "input_too_large",
    "no_reviewable_changes",
    "sensitive_content_detected",
    "full_scan_not_supported"
  ]).optional(),
  durationMs: z.number()
}).strict();

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
  aiReview: aiReviewOutputSchema.optional(),
  durationMs: z.number(),
  timestamp: z.string()
});
