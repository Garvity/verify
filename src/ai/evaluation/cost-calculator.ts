import { readFile } from "node:fs/promises";
import { z } from "zod";

import { VerifyError } from "../../core/error.js";
import type { TokenUsageSummary } from "../gateway/usage.js";
import type { ModelPrice, PriceBook } from "./types.js";

const priceSchema = z.record(z.string().min(1), z.object({
  inputPerMillionUsd: z.number().finite().nonnegative(),
  outputPerMillionUsd: z.number().finite().nonnegative(),
  assumption: z.string().min(1).max(500)
}).strict());

export async function loadPriceBook(path: string): Promise<PriceBook> {
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error) {
    throw new VerifyError("CONFIG_INVALID", `Unable to read pricing file '${path}'.`, error);
  }
  const parsed = priceSchema.safeParse(raw);
  if (!parsed.success) throw new VerifyError("CONFIG_INVALID", `Invalid pricing file: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`);
  return parsed.data satisfies PriceBook;
}

export function calculateCostUsd(usage: TokenUsageSummary, price: ModelPrice | undefined): number | null {
  if (!price || usage.inputTokens === null || usage.outputTokens === null) return null;
  const cost = (usage.inputTokens * price.inputPerMillionUsd + usage.outputTokens * price.outputPerMillionUsd) / 1_000_000;
  return Math.round(cost * 1_000_000_000) / 1_000_000_000;
}
