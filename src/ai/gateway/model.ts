export const MODEL_CONFIG = {
  default: process.env.VERIFY_MODEL
};

if (!MODEL_CONFIG.default) {
  throw new Error("VERIFY_MODEL is not configured.");
}