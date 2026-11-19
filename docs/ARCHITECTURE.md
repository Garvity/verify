# Architecture

## Components

- CLI: parses commands and renders terminal, JSON or Markdown output.
- Git layer: reads tracked changes and non-ignored untracked files, then parses paths and changed lines.
- Analyzers: inspect secrets, sensitive paths, risky patterns, deleted tests and structural configuration changes.
- Quality execution: runs commands from validated configuration through an argv-based runner with time and output limits.
- Policy engine: applies protected-path rules and blocking behavior.
- Baseline comparator: classifies findings and check failures as introduced, persistent or resolved.
- MCP and HTTP adapters: expose the same orchestrator without duplicating verification logic.
- OpenAI-compatible gateway and agent: optional model requests, restricted file tools, bounded retries and deterministic re-verification.
- Evaluation runner: copies each task fixture into a separate temporary Git repository, runs explicit models, executes private tests and records results.

## Verification flow

1. Load and validate .verifyrc.json.
2. Read the requested Git diff or opt-in full repository scan.
3. Run configured analyzers.
4. Execute enabled quality checks when requested.
5. Apply policy rules and calculate status.
6. Compare against an optional baseline.
7. Return one structured VerificationResult to each interface.

The LLM cannot mark its own changes as passing. Only a passing result from the deterministic orchestrator does so.

## Trust boundaries

- The agent can read repository text except sensitive paths and can write only files under src/ outside verification controls.
- Verification policy, tests, analyzers, execution configuration and agent code are protected from agent writes.
- Quality commands are configured by the repository owner and executed without a shell under allowlist, timeout and output limits.
- Benchmark hidden tests live outside copied workspaces and are invoked as explicit Node test files.
- The HTTP process binds to loopback by default. It has no authentication layer and should not be exposed remotely.

## Caching and context

Only provider model discovery is cached, in memory, for 60 seconds using gateway URL and a one-way API-key fingerprint. Verification and benchmark outcomes are never reused. Context trimming keeps initial instructions, complete tool exchanges and the latest verification result while dropping older complete turns.
