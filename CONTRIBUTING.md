# Contributing

## Set up

    pnpm install --frozen-lockfile
    pnpm build
    pnpm test
    pnpm test:e2e

MCP changes should also pass pnpm test:mcp. Provider credentials are optional and must stay in the ignored .env file. Do not use live provider calls in automated tests.

## Make changes

- Keep deterministic verification independent from model responses; provider failures must not change deterministic status.
- Keep the reviewer read-only. External coding harnesses own investigation, edits, and re-verification requests.
- Add regression coverage for fixes and targeted adversarial cases for security boundaries.
- For benchmark tasks, use immutable labeled fixtures and record SHA-256 input fingerprints.
- Use clear conventional commits that describe the delivered change without roadmap labels or claims that overstate validation.

## Validate a change

    pnpm build
    pnpm test
    pnpm test:e2e
    pnpm test:mcp
    pnpm pack:check

## Release

Tag a validated commit with a version such as v1.0.1. The release workflow builds the package, runs checks, creates a GitHub release and attaches the tarball.
