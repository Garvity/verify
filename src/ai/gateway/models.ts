import { createHash } from "node:crypto";
import type OpenAI from "openai";

import { AsyncResultCache } from "../context/cache.js";
import { createLlmClient, readGatewayConfig } from "./client.js";

export interface AvailableModel {
  id: string;
  ownedBy?: string;
}

export interface ModelsClient {
  models: Pick<OpenAI["models"], "list">;
}

const modelDiscoveryCache = new AsyncResultCache<AvailableModel[]>(32);
const MODEL_CACHE_TTL_MS = 60_000;

export function getConfiguredModel(
  env: Record<string, string | undefined> = process.env
): string {
  const model = env.VERIFY_MODEL?.trim();
  if (!model) {
    throw new Error("No model is configured. Set VERIFY_MODEL to an ID returned by the configured provider's models endpoint.");
  }
  return model;
}

/** Return the model IDs reported by the configured provider; callers should not guess IDs. */
export async function discoverModels(
  client?: ModelsClient
): Promise<AvailableModel[]> {
  if (!client) {
    const config = readGatewayConfig();
    const credentialFingerprint = createHash("sha256").update(config.apiKey).digest("hex");
    const cacheKey = config.baseURL + ":" + credentialFingerprint;
    return modelDiscoveryCache.getOrLoad(cacheKey, MODEL_CACHE_TTL_MS, async () => {
      const page = await createLlmClient(config).models.list();
      return page.data
        .map((model) => ({ id: model.id, ownedBy: model.owned_by }))
        .sort((left, right) => left.id.localeCompare(right.id));
    });
  }
  const page = await client.models.list();
  return page.data
    .map((model) => ({ id: model.id, ownedBy: model.owned_by }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

export async function assertModelAvailable(
  modelId: string,
  client?: ModelsClient
): Promise<void> {
  const models = await discoverModels(client);
  if (!models.some((model) => model.id === modelId)) {
    const available = models.map((model) => model.id).join(", ") || "none";
    throw new Error(`Configured model '${modelId}' was not returned by the configured provider. Available models: ${available}.`);
  }
}
