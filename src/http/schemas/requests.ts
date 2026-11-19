import { z } from "zod";

export const scanRequestSchema = z.object({
  base: z.string().min(1).max(256).refine((value) => !value.startsWith("-") && !value.includes("\0"), "Invalid Git base reference.").optional(),
  all: z.boolean().default(false),
  runChecks: z.boolean().default(false)
}).strict();

export type ScanRequest = z.infer<typeof scanRequestSchema>;
