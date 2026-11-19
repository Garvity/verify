# OpenRouter and the integrated agent

The CLI and deterministic verifier work without OpenRouter. The AI commands are optional and load credentials only when explicitly run.

## Configure the gateway

1. Copy `.env.example` to `.env`.
2. Set `OPENROUTER_BASE_URL` to `https://openrouter.ai/api/v1` and `OPENROUTER_API_KEY` to a valid key.
3. Discover the model IDs currently exposed by OpenRouter:

   ```sh
   pnpm dev models --format json
   ```

4. Set `VERIFY_MODEL` to an ID from that output. Do not guess model names.
5. Run the connection, usage, served-model metadata and function-calling check:

   ```sh
   pnpm gateway:check
   ```

The default model is `baidu/ernie-5.5-flash-preview:free`. It is listed as free and passed both the completion and forced function-calling probe against OpenRouter. The check sends a small completion request and a separate function-calling probe. A rate-limit or provider-key error comes from OpenRouter and must be resolved there before the agent can run.

Never paste an API key into source code or commit `.env`. The repository ignores `.env`.

## Run the integrated agent

```sh
pnpm dev agent --task "Describe the coding change" --base HEAD
```

Use `--format json` for structured output or `--model <id>` to select another ID returned by OpenRouter. The agent reads repository files, writes source files under `src/` outside verification controls, and invokes deterministic verification with configured quality checks. It cannot edit policy/configuration, analyzers, tests, Git analysis, execution controls or its own agent/gateway implementation. `agent.maxRetries` in `.verifyrc.json` bounds correction attempts.

The result includes the verification result, model routing metadata when exposed, token usage, and a structured event log. Exit code `0` means verification passed, `1` means blocking findings remain, and `3` means the agent stopped without a verified result or encountered an execution error.

### Context and task routing

The agent keeps its system instructions and original task, drops older complete tool turns when the estimated prompt exceeds the configured budget, and pins the most recent verification result. Set `VERIFY_CONTEXT_MAX_TOKENS` to adjust the default 12,000-token budget. Each model response records the estimated context size and number of dropped messages.

For transparent task-aware selection, set any of `VERIFY_MODEL_SIMPLE`, `VERIFY_MODEL_CODING`, `VERIFY_MODEL_REASONING`, or `VERIFY_MODEL_SECURITY`. Use `--task-type` to select one when running the agent. An explicit `--model` takes precedence; otherwise the selected task model is used, with `VERIFY_MODEL` as the recorded fallback. Evaluation runs always use their explicit model IDs and bypass routing.

OpenRouter model discovery is cached in memory for 60 seconds. The cache key includes the gateway URL and a one-way fingerprint of the API key; no verification or benchmark result is reused.
