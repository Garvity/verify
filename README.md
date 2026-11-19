# verify

verify is a deterministic verification layer for AI-assisted code changes. It analyzes Git diffs, reports security and structural findings, runs configured quality checks, and exposes the same engine through a CLI and MCP server. Optional OpenAI-compatible provider tools provide a small self-correcting agent and a reproducible multi-model benchmark runner.

Verification does not depend on an LLM. The CLI, MCP tools, and local HTTP API work without provider credentials.

## Requirements

- Node.js 20.6 or newer
- pnpm 12.21.0
- Git

## Install and build

    pnpm install --frozen-lockfile
    pnpm build

In a project that does not already have a configuration file:

    pnpm dev init

## Use the CLI

    pnpm dev scan --base main
    pnpm dev check --base main
    pnpm dev scan --all --format json
    pnpm dev rules --format json
    pnpm dev version

Scan and check inspect Git changes by default. Use --all to opt into scanning all non-ignored text files. The check command also runs enabled, allowlisted tests, lint and typecheck commands.

Reports support terminal, JSON and Markdown output. Save a result with --format json, then render it later:

    pnpm dev report --input verify-result.json --format markdown

Exit codes are 0 for a pass, 1 for blocking findings, 2 for invalid input/configuration, and 3 for execution errors or an unverified agent result.

## MCP server

The stdio MCP server exposes verify_changes and get_findings. It has no dependency on the model gateway.

    pnpm mcp:dev

See docs/MCP.md for Codex desktop and OpenCode setup. The included opencode.json connects OpenCode to this checkout.

## Optional model agent

Copy .env.example to .env, then set VERIFY_LLM_API_KEY and VERIFY_LLM_BASE_URL for your OpenAI-compatible provider. Keep .env out of source control.

    pnpm dev models
    pnpm dev agent --task "Fix the bug described in the issue" --task-type coding

The integrated agent can read repository files and replace source files under src/. It cannot edit verification configuration, tests or its own controls. Verification remains deterministic and controls the agent's success status.

## Multi-model evaluation

The benchmark runner compares two or three explicit model IDs. Each task/model pair starts from an isolated fixture copy and Git baseline. Hidden tests remain outside the agent workspace.

    pnpm dev eval --benchmark benchmarks/tasks --models model-a,model-b

The command writes JSON and Markdown reports under benchmarks/results/. Provide --pricing with explicit input/output token rates to calculate costs; otherwise costs remain unknown. See docs/EVALUATION.md.

## Local HTTP API

    pnpm build
    pnpm http

The API binds to loopback only by default and exposes POST /scan and GET /findings. See docs/HTTP.md.

## Development checks

    pnpm build
    pnpm test
    pnpm test:e2e
    pnpm test:mcp
    pnpm pack:check

See CONTRIBUTING.md, docs/ARCHITECTURE.md, docs/CLI.md and docs/CONFIGURATION.md for details.

## Scope

The security analyzers are focused pattern checks and do not replace a full static-analysis or secret-scanning suite. Quality commands run on the host under configured command allowlists and timeouts. Review benchmark fixtures before running task sets you did not create.
