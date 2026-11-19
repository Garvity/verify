# Contributing

## Set up

    pnpm install --frozen-lockfile
    pnpm build
    pnpm test
    pnpm test:e2e

MCP changes should also pass pnpm test:mcp. Provider credentials are optional and must stay in the ignored .env file. Do not use live provider calls in automated tests.

## Make changes

- Keep verification deterministic and independent from model responses.
- Keep tool access narrow; never add arbitrary shell execution to the integrated agent.
- Add regression coverage for fixes and targeted adversarial cases for security boundaries.
- For benchmark tasks, isolate fixtures, keep hidden tests outside the model workspace, and record SHA-256 input fingerprints.
- Use conventional commits. Changes that complete a roadmap phase should use a phase-scoped message such as feat(phase 8): add evaluation reports.

## Validate a change

    pnpm build
    pnpm test
    pnpm test:e2e
    pnpm test:mcp
    pnpm pack:check

## Release

Tag a validated commit with a version such as v1.0.1. The release workflow builds the package, runs checks, creates a GitHub release and attaches the tarball.
