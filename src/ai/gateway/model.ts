import { getConfiguredModel } from "./models.js";

/** Compatibility surface retained for callers of the earlier gateway stub. */
export const MODEL_CONFIG = {
  get default(): string {
    return getConfiguredModel();
  }
};
