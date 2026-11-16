import OpenAI from "openai";

const baseURL = process.env.FREELLMAPI_BASE_URL;
const apiKey = process.env.FREELLMAPI_API_KEY;

if (!baseURL || !apiKey) {
  throw new Error("FreeLLMAPI configuration is missing.");
}

export const llm = new OpenAI({
  baseURL,
  apiKey,
  timeout: 60_000,
  maxRetries: 2
});