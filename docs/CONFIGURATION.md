# Configuration

Place `.verifyrc.json` at the root of the repository being checked. Run `verify init` to create the default file.

```json
{
  "security": {
    "secrets": true,
    "sensitiveFiles": true,
    "dangerousPatterns": true
  },
  "quality": {
    "tests": { "enabled": true, "command": ["pnpm", "test"] },
    "lint": { "enabled": false, "command": ["pnpm", "lint"] },
    "typecheck": { "enabled": false, "command": ["pnpm", "exec", "tsc", "--noEmit"] }
  },
  "protectedPaths": [".env", ".github/workflows/**"],
  "approval": { "requireForProtectedFiles": true },
  "execution": {
    "timeoutMs": 120000,
    "maxOutputBytes": 1048576,
    "allowedCommands": [["pnpm", "test"], ["pnpm", "lint"], ["pnpm", "exec", "tsc", "--noEmit"]]
  }
}
```

## Fields

- `security` enables deterministic security analyzers.
- `quality` configures tests, lint, and typecheck. Commands are argv arrays; no shell is used.
- `protectedPaths` lists repository paths requiring special review.
- `approval` controls whether protected-file findings block deterministic verification.
- `execution` sets command timeouts, combined output limits, and permitted argv prefixes. Prefer specific prefixes.

The schema is strict: unknown keys and invalid types are errors.

## FreeLLMAPI review settings

Copy `.env.example` to `.env` to configure AI review:

```dotenv
VERIFY_REVIEW_API_KEY=
VERIFY_REVIEW_BASE_URL=
VERIFY_REVIEW_MODEL=
VERIFY_REVIEW_TIMEOUT_MS=
```

The API key is required only for `verify review`, MCP `review_changes`, or an explicit AI review option. Deterministic verification does not read or require it. Each non-empty `VERIFY_REVIEW_*` value overrides its corresponding shared gateway setting; unset values reuse `VERIFY_LLM_API_KEY`, `VERIFY_LLM_BASE_URL`, and `VERIFY_LLM_TIMEOUT_MS`, while the model falls back to `VERIFY_MODEL` and then `auto`. Review uses one request with retries disabled and reports provider failures separately.

The reusable gateway retains `VERIFY_LLM_BASE_URL`, `VERIFY_LLM_API_KEY`, `VERIFY_MODEL`, `VERIFY_LLM_TIMEOUT_MS`, and `VERIFY_LLM_MAX_RETRIES` for model listing and other gateway workflows. Review can use those settings by default or override them with `VERIFY_REVIEW_*` values. Its requests still have automatic retries disabled.

The `.env` file is ignored by Git. Never commit provider credentials.
