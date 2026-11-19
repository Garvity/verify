import type OpenAI from "openai";

import { createLlmClient } from "./client.js";

export interface AvailableModel {
  id: string;
  ownedBy?: string;
}

export interface ModelsClient {
  models: Pick<OpenAI["models"], "list">;
}

export function getConfiguredModel(
  env: Record<string, string | undefined> = process.env
): string {
  const model = env.VERIFY_MODEL?.trim();
  if (!model) {
    throw new Error("No model is configured. Set VERIFY_MODEL to an ID returned by the OpenRouter models endpoint.");
  }
  return model;
}

/** Return the model IDs reported by OpenRouter; callers should not guess IDs. */
export async function discoverModels(
  client: ModelsClient = createLlmClient()
): Promise<AvailableModel[]> {
  const page = await client.models.list();
  return page.data
    .map((model) => ({ id: model.id, ownedBy: model.owned_by }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

export async function assertModelAvailable(
  modelId: string,
  client: ModelsClient = createLlmClient()
): Promise<void> {
  const models = await discoverModels(client);
  if (!models.some((model) => model.id === modelId)) {
    const available = models.map((model) => model.id).join(", ") || "none";
    throw new Error(`Configured model '${modelId}' was not returned by OpenRouter. Available models: ${available}.`);
  }
}
