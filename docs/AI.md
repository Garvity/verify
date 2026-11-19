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
