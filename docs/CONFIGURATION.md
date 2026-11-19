# Configuration

Place .verifyrc.json at the root of the repository being checked. Run verify init to create a default file.

Example:

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
      },
      "agent": { "maxRetries": 3 }
    }

## Fields

- security enables the deterministic security analyzers.
- quality configures tests, lint and typecheck. Commands are argv arrays; no shell is used.
- protectedPaths lists repository paths that need special review and cannot be written by the integrated agent.
- approval controls whether protected-file findings block verification.
- execution sets command timeouts, combined output limits and permitted argv prefixes. Prefer specific prefixes.
- agent.maxRetries limits correction attempts.

The schema is strict: unknown keys and invalid types are errors. The sample repository config intentionally disables lint and typecheck because those scripts are not configured in this project.

## Model provider environment

Copy .env.example to .env and set VERIFY_LLM_BASE_URL and VERIFY_LLM_API_KEY for an OpenAI-compatible provider. VERIFY_MODEL is the default model. Optional VERIFY_MODEL_SIMPLE, VERIFY_MODEL_CODING, VERIFY_MODEL_REASONING and VERIFY_MODEL_SECURITY values support explicit task routing. VERIFY_CONTEXT_MAX_TOKENS sets the integrated agent's approximate prompt budget.

The .env file is ignored by Git. Never commit provider credentials.
