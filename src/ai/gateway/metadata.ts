import type { ChatCompletion } from "openai/resources/chat/completions";

export interface ResponseMetadata {
  requestedModel: string;
  servedModel: string;
  provider?: string;
  requestId?: string;
  systemFingerprint?: string;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : undefined;
}

/** Capture routing details when the OpenAI-compatible gateway exposes them. */
export function extractResponseMetadata(
  response: ChatCompletion,
  requestedModel: string
): ResponseMetadata {
  const extensions = response as ChatCompletion & {
    provider?: unknown;
    provider_name?: unknown;
    served_by?: unknown;
    _request_id?: unknown;
  };

  return {
    requestedModel,
    servedModel: response.model,
    ...(optionalString(extensions.provider) ??
      optionalString(extensions.provider_name) ??
      optionalString(extensions.served_by)
      ? {
          provider:
            optionalString(extensions.provider) ??
            optionalString(extensions.provider_name) ??
            optionalString(extensions.served_by)
        }
      : {}),
    ...(optionalString(extensions._request_id)
      ? { requestId: optionalString(extensions._request_id) }
      : {}),
    ...(optionalString(response.system_fingerprint)
      ? { systemFingerprint: optionalString(response.system_fingerprint) }
      : {})
  };
}
