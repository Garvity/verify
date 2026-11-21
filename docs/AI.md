# Independent AI code review

Verify's AI reviewer is an optional, read-only second layer over deterministic verification. It sends a bounded, sanitized representation of changed lines to FreeLLMAPI and returns structured findings with confidence and evidence. The external coding harness remains responsible for investigating and fixing findings, then requesting another verification run.

## Configure

Copy `.env.example` to `.env`. Existing `VERIFY_LLM_*` settings work for AI review too. Add review-specific values only to override them:

```dotenv
VERIFY_REVIEW_API_KEY=
VERIFY_REVIEW_BASE_URL=
VERIFY_REVIEW_MODEL=
VERIFY_REVIEW_TIMEOUT_MS=
```

Review-specific settings take precedence. If omitted, the API key, base URL, and timeout reuse `VERIFY_LLM_API_KEY`, `VERIFY_LLM_BASE_URL`, and `VERIFY_LLM_TIMEOUT_MS`; the model uses `VERIFY_MODEL` and then defaults to `auto`. This lets an existing FreeLLMAPI gateway configuration work without copying its key, while still allowing review to use separate credentials or routing. The reviewer makes one completion request with automatic SDK retries disabled.

Use `pnpm dev models --review` to list model IDs exposed to the review gateway. The `auto` routing alias may not appear in the provider's catalog.

## Run a review

```sh
pnpm dev review --base main
pnpm dev review --base main --checks --format json
```

`review` returns the deterministic findings and the AI review findings in one report. `scan` and `check` remain deterministic by default and require no model provider. CLI exit status reflects deterministic verification; review status and any AI failure appear separately in `aiReview` metadata.

Baseline comparison continues to classify deterministic findings; AI suggestions are reported separately because model output can vary between runs.

## MCP and HTTP

- MCP `verify_changes` performs deterministic verification by default. Pass `aiReview: true` to opt into the combined report.
- MCP `review_changes` explicitly requests the combined report.
- MCP `get_findings` can filter on `source: "deterministic"` or `source: "ai"`.
- HTTP `POST /scan` accepts `"aiReview": true` for the same opt-in combined report.

All these paths use the same orchestrator. AI provider failures do not discard deterministic findings or change deterministic pass/fail status.

## Data handling and validation

The model receives only changed lines, not repository-wide context. Before transmission, Verify omits sensitive paths such as environment files, private keys, credential files, and SSH material, then redacts common API key, token, password, bearer, JWT, provider-specific, and key-material patterns from added and removed lines. Requests are size bounded. `--all` full-repository scans are not sent to the reviewer.

The reviewer has no file-reading or file-writing tools. Its strict JSON response must contain bounded fields, valid severity/category/confidence, and evidence that matches a sanitized changed file and line. A finding's evidence is checked against what was sent. AI findings are always non-blocking; they cannot claim that deterministic checks passed or approve a change.

Provider errors and malformed or unsupported output return a generic status code such as `provider_error` or `invalid_response`. Raw provider errors, keys, and unvalidated model output are not copied into reports.

Pattern-based secret redaction cannot identify every arbitrary credential. Do not treat the reviewer as a secret-scanning boundary or send changes that should not leave the machine. Deterministic checks remain available without the AI settings.

## Reusable gateway and evaluation

The OpenAI-compatible gateway, model discovery, usage accounting, and multi-model evaluation tools remain available. Evaluation uses the review configuration and scores model findings against labeled review fixtures. See [evaluation methodology](EVALUATION.md).
