import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";

import type { VerificationResult } from "../../core/result.js";
import { renderEvaluationMarkdown, metricsAsMarkdownTable } from "../../ai/evaluation/report.js";
import type { EvaluationResult } from "../../ai/evaluation/types.js";
import { renderResult, type OutputFormat } from "../output.js";
import { parseCommandArgs, requireStringOption } from "../arguments.js";
import { VerifyError } from "../../core/error.js";

const findingSchema = z.object({
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
}).passthrough();

const verificationSchema = z.object({
  id: z.string(),
  status: z.enum(["passed", "failed", "error"]),
  findings: z.array(findingSchema),
  summary: z.object({
    filesScanned: z.number(),
    checksRun: z.number(),
    totalFindings: z.number(),
    blockingFindings: z.number()
  }),
  durationMs: z.number(),
  timestamp: z.string()
}).passthrough();

const nullableNumberSchema = z.number().nullable();
const tokenUsageSchema = z.object({
  inputTokens: nullableNumberSchema,
  outputTokens: nullableNumberSchema,
  totalTokens: nullableNumberSchema,
  cachedInputTokens: nullableNumberSchema,
  reasoningTokens: nullableNumberSchema
}).passthrough();

const evaluationRunSchema = z.object({
  taskId: z.string(),
  model: z.string(),
  reviewStatus: z.enum(["completed", "unavailable", "failed", "skipped"]),
  review: z.object({
    status: z.enum(["completed", "unavailable", "failed", "skipped"]),
    model: z.string().optional(),
    servedModel: z.string().optional(),
    provider: z.string().optional(),
    errorCode: z.string().optional(),
    durationMs: z.number()
  }).passthrough(),
  findings: z.array(findingSchema),
  expectedFindingCount: z.number(),
  truePositiveCount: z.number(),
  falsePositiveCount: z.number(),
  falseNegativeCount: z.number(),
  severityMismatchCount: z.number(),
  precision: z.number(),
  recall: z.number(),
  f1: z.number(),
  latencyMs: z.number(),
  usage: tokenUsageSchema,
  costUsd: nullableNumberSchema,
  pricingAssumption: z.string().optional(),
  requestedModel: z.string(),
  servedModel: z.string().optional(),
  provider: z.string().optional(),
  failureReason: z.string().optional()
}).passthrough();

const modelMetricsSchema = z.object({
  model: z.string(),
  runs: z.number(),
  successfulReviews: z.number(),
  reviewSuccessRate: z.number(),
  expectedFindingCount: z.number(),
  truePositiveCount: z.number(),
  falsePositiveCount: z.number(),
  falseNegativeCount: z.number(),
  severityMismatchCount: z.number(),
  precision: z.number(),
  recall: z.number(),
  f1: z.number(),
  averageLatencyMs: z.number(),
  inputTokens: nullableNumberSchema,
  outputTokens: nullableNumberSchema,
  costUsd: nullableNumberSchema
}).passthrough();

const evaluationSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string(),
  createdAt: z.string(),
  benchmarkRoot: z.string(),
  requestedModels: z.array(z.string()),
  environment: z.object({ node: z.string(), platform: z.string(), architecture: z.string() }),
  taskInputs: z.array(z.object({
    taskId: z.string(),
    definitionSha256: z.string(),
    fixtureSha256: z.string()
  }).passthrough()),
  runs: z.array(evaluationRunSchema),
  metrics: z.array(modelMetricsSchema)
}).passthrough();

const HELP =
  "Usage: verify report --input <result.json> [--format <terminal|json|markdown>] [--output <file>]\n\n" +
  "Render a saved verification or evaluation result.";

export async function reportCommand(args: string[]): Promise<number> {
  const { values } = parseCommandArgs(args, {
    input: { type: "string" },
    format: { type: "string" },
    output: { type: "string" }
  });
  if (values.help) {
    process.stdout.write(HELP + "\n");
    return 0;
  }
  const input = requireStringOption(values.input, "input");
  if (!input) throw new VerifyError("INVALID_ARGUMENTS", "--input is required.");
  const formatValue = requireStringOption(values.format, "format") ?? "terminal";
  if (!["terminal", "json", "markdown"].includes(formatValue)) {
    throw new VerifyError("INVALID_ARGUMENTS", "--format must be terminal, json or markdown.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(resolve(input), "utf8")) as unknown;
  } catch (error) {
    throw new VerifyError("CONFIG_INVALID", "Unable to read a valid JSON report.", error);
  }

  let output: string;
  const verification = verificationSchema.safeParse(parsed);
  if (verification.success) {
    output = renderResult(verification.data as VerificationResult, formatValue as OutputFormat);
  } else {
    const evaluation = evaluationSchema.safeParse(parsed);
    if (!evaluation.success) {
      throw new VerifyError("CONFIG_INVALID", "Input is not a recognized verification or evaluation result.");
    }
    const result = evaluation.data as unknown as EvaluationResult;
    if (formatValue === "markdown") output = renderEvaluationMarkdown(result);
    else if (formatValue === "json") output = JSON.stringify(result, null, 2);
    else output = metricsAsMarkdownTable(result.metrics);
  }

  const outputPath = requireStringOption(values.output, "output");
  if (outputPath) await writeFile(resolve(outputPath), output + "\n", "utf8");
  else process.stdout.write(output + "\n");
  return 0;
}
