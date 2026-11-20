# Architecture

## Components

- CLI, MCP stdio server, and loopback HTTP API call a shared verification orchestrator.
- Git readers collect either the requested change set or an opt-in full scan; deterministic analyzers inspect secrets, sensitive files, risky patterns, deleted tests, dependencies, and infrastructure configuration.
- The policy engine applies protected-path rules. The quality runner executes explicitly enabled commands through argv allowlists, output limits, and timeouts.
- The optional AI reviewer receives sanitized changed lines through the reusable OpenAI-compatible gateway. It has no tools and cannot access or edit repository files.
- The result combines source-tagged deterministic and AI findings, validated evidence, confidence, and AI review status. Deterministic pass/fail status does not depend on provider availability.
- The evaluation runner uses immutable fixture workspaces and labeled expected findings to compare review models.

## Request flow

1. Load and validate `.verifyrc.json`.
2. Read the requested Git diff and run deterministic analyzers.
3. If requested, run configured quality commands.
4. If AI review is explicitly requested and the run is not a full-repository scan, redact and send changed lines to the configured reviewer.
5. Validate the model response against a strict schema and confirm each evidence excerpt maps to a submitted changed line.
6. Apply deterministic policy, compare any baseline, and return one structured report.

AI failures are captured as review metadata. They do not suppress deterministic findings or change deterministic status. AI findings are always non-blocking.

## Trust boundaries

- The reviewer receives only changed lines after path-based omission and pattern-based secret redaction. Full scans are not transmitted.
- The model response is untrusted. Findings must use supported fields and cite exact sanitized excerpts in files and lines that were sent.
- The reviewer has no file tools, shell, retry loop, or code-writing capability. External coding harnesses own investigation and fixes.
- Quality commands run on the host under repository configuration. They are executed without a shell and bounded by command allowlists, timeouts, and output limits.
- The HTTP process binds to loopback by default and has no authentication layer; do not expose it remotely.
- Pattern-based redaction cannot guarantee detection of every arbitrary credential. Do not treat it as a secure boundary for secrets deliberately embedded in code.

## Caching

Provider model discovery is cached in memory for 60 seconds using the gateway URL and a one-way API-key fingerprint. Verification, review, and evaluation outcomes are not reused.
