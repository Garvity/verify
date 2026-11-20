# FreeLLMAPI and the integrated agent

The CLI and deterministic verifier work without a model provider. AI commands use FreeLLMAPI's OpenAI-compatible local endpoint and load credentials only when explicitly run. See the [FreeLLMAPI setup guide](https://github.com/valorisa/FreeLLMAPI) to install the router and create a unified key.

## Configure the gateway

1. Start FreeLLMAPI and copy its unified API key from the dashboard.
2. Set `VERIFY_LLM_BASE_URL` to `http://localhost:3001/v1` and `VERIFY_LLM_API_KEY` to that unified key. If FreeLLMAPI listens on a different host or port, use its reachable `/v1` URL.
3. Set `VERIFY_MODEL=auto` to let FreeLLMAPI choose a usable model and fail over through its configured chain. You can also discover pinned model IDs with:

   ```sh
   pnpm dev models --format json
   ```

4. Run the connection, usage, served-model metadata and function-calling check:

   ```sh
   pnpm gateway:check
   ```

The `auto` model is a virtual routing alias and may not appear in the model catalog. The gateway check allows that alias, then sends a small completion request and a separate forced function-calling probe. The result reports the model that actually served the request. FreeLLMAPI handles upstream fallback; if all configured providers are exhausted, check its dashboard and fallback chain.

Never paste an API key into source code or commit `.env`. The repository ignores `.env`.

## Run the integrated agent

```sh
pnpm dev agent --task "Describe the coding change" --base HEAD
```

Use `--format json` for structured output or `--model <id>` to select another ID returned by FreeLLMAPI. The agent reads repository files, writes source files under `src/` outside verification controls, and invokes deterministic verification with configured quality checks. It cannot edit policy/configuration, analyzers, tests, Git analysis, execution controls or its own agent/gateway implementation. `agent.maxRetries` in `.verifyrc.json` bounds correction attempts.

The result includes the verification result, model routing metadata when exposed, token usage, and a structured event log. Exit code `0` means verification passed, `1` means blocking findings remain, and `3` means the agent stopped without a verified result or encountered an execution error.

### Context and task routing

The agent keeps its system instructions and original task, drops older complete tool turns when the estimated prompt exceeds the configured budget, and pins the most recent verification result. Set `VERIFY_CONTEXT_MAX_TOKENS` to adjust the default 12,000-token budget. Each model response records the estimated context size and number of dropped messages.

For transparent task-aware selection, set any of `VERIFY_MODEL_SIMPLE`, `VERIFY_MODEL_CODING`, `VERIFY_MODEL_REASONING`, or `VERIFY_MODEL_SECURITY`. Use `--task-type` to select one when running the agent. An explicit `--model` takes precedence; otherwise the selected task model is used, with `VERIFY_MODEL` as the recorded fallback. Evaluation runs always use their explicit model IDs and bypass routing.

FreeLLMAPI model discovery is cached in memory for 60 seconds. The cache key includes the gateway URL and a one-way fingerprint of the API key; no verification or benchmark result is reused.
