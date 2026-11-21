# AI review evaluation

The benchmark runner compares two or three explicit reviewer model IDs against ten fixtures: nine labeled issues and one benign control. The fixtures cover JavaScript, Python, and Go, including SQL injection, path traversal, command injection, XSS, weak password hashing, authorization, correctness, and benign formatting. Each model/task pair receives its own immutable fixture copy. The reviewer sees only the fixture's changed lines, and the runner scores its structured findings against the task's expected findings.

## Prepare a run

1. Store credentials and endpoint in `.env` as `VERIFY_LLM_API_KEY` and `VERIFY_LLM_BASE_URL`, or override them with `VERIFY_REVIEW_*`. Do not commit that file.
2. List model IDs exposed by the review gateway:

       pnpm dev models --review

3. Choose two or three explicit IDs. Model availability and upstream routing can change.
4. Run the bundled benchmark:

       pnpm dev eval --benchmark benchmarks/tasks --models model-a,model-b

The command writes a JSON result and a Markdown comparison under `benchmarks/results/`. Each model/task pair starts from a separate temporary fixture repository, and the temporary workspaces are removed after the run.

## Task definitions

Each JSON file in the task directory defines:

- An ID, description, labeled `expectedFindings`, and a line tolerance.
- A fixture directory below `benchmarks/fixtures/`.
- Each finding label's file path, line, category, and severity.

The task description and source changes are shown to the reviewer; expected finding labels are not. Review runs are checked against fixture hashes before and after the call so accidental mutation is reported as an evaluation failure.

Fixtures must include `.verifyrc.json`, keep all security analyzers enabled, and disable project quality commands. Task definitions are strict JSON. Fixture paths, expected finding paths, and symlinks are validated before use.

## Pricing

Costs are `n/a` unless an explicit pricing file is provided. Rates are assumptions supplied by the evaluator, not fetched from the provider:

    {
      "provider/model-id": {
        "inputPerMillionUsd": 0,
        "outputPerMillionUsd": 0,
        "assumption": "Free tier observed on 2026-11-19"
      }
    }

Pass the file with `--pricing prices.json`. The result stores the rates' assumptions alongside token counts and calculated costs. If the provider omits token usage, cost remains unknown.

## Reproducibility and interpretation

The JSON result records requested and served model IDs and providers when returned, task/fixture SHA-256 fingerprints, runtime versions, usage, latency, and cost when explicit prices are configured. Free-tier routing can change between runs, so compare the recorded served model and provider as well as the requested ID.

Metrics are deterministic: finding precision, recall, F1, severity mismatches, review success rate, latency, and token-based cost. Findings match labels by file, category, and a configurable nearby-line tolerance; severity differences are recorded separately. Scores depend on the labeled benchmark's quality and coverage and are not a claim of general model quality.

The evaluator reads local fixture files and sends sanitized changed lines to the configured review provider. Review the fixture and task definitions before evaluating a benchmark set you did not create.
