# Model evaluation

The benchmark runner compares two or three explicit model IDs exposed by the configured OpenAI-compatible provider on the same task set. It gives every model/task pair a fresh copy of the same fixture, creates an isolated Git baseline, runs the minimal agent, then checks the final workspace with the deterministic verifier and private functional tests.

## Prepare a run

1. Store your provider's endpoint as **VERIFY_LLM_BASE_URL** and key as **VERIFY_LLM_API_KEY** in the project .env. Do not commit that file.
2. List available model IDs:

       pnpm dev models

3. Choose two or three explicit IDs. Prefer models that support function tool calls. Free model IDs often end in :free; availability and upstream routing can change.
4. Run the bundled benchmark:

       pnpm dev eval --benchmark benchmarks/tasks --models model-a,model-b

The command writes a JSON result and a Markdown comparison under benchmarks/results/. Each model/task pair starts from a separate temporary repository, and the temporary workspaces are removed after the run.

## Task definitions

Each JSON file in the task directory defines:

- id, description, and expectedOutcome.
- A fixture directory below benchmarks/fixtures/.
- Private Node test files below benchmarks/hidden-tests/.
- A correction retry limit and hidden-test timeout.
- Verification requirements, including any rule IDs that must be absent.

The task description is shown to the model. The expected outcome and hidden tests are not. Hidden tests execute with the temporary workspace as their current directory, so they can import the model's output without being copied into the model-accessible repository. The agent's file tools can edit only src/ files; it cannot edit the fixture's verifier configuration or tests.

Fixtures must include .verifyrc.json, keep all security analyzers enabled, and disable project quality commands. Hidden tests are Node.js .mjs files and run with node --test; task files cannot supply arbitrary shell commands.

## Pricing

Costs are reported as n/a unless an explicit pricing file is provided. Rates are assumptions supplied by the evaluator, not fetched from the provider:

    {
      "provider/model-id": {
        "inputPerMillionUsd": 0,
        "outputPerMillionUsd": 0,
        "assumption": "Free tier observed on 2026-11-19"
      }
    }

Pass the file with --pricing prices.json. The result stores the rates' assumptions alongside token counts and calculated costs. If the provider omits token usage, cost remains unknown.

## Reproducibility and interpretation

The JSON result records requested model IDs, served model IDs and providers when returned, task/fixture/hidden-test SHA-256 fingerprints, the temporary Git base commit per run, runtime versions, usage, latency, retry counts, and verification outcomes. Free-tier routing can change between runs, so compare the recorded served model and provider as well as the requested ID.

Metrics are deterministic: task completion, hidden-test pass rate, verifier pass rate, security findings, new baseline findings, retries, latency and token-based cost. Subjective code-quality scores are not included. A model is not marked complete unless the agent reports verified status, required verification passes, and configured hidden tests pass.

The runner executes benchmark fixtures and hidden test files as local code. Review those files before evaluating a benchmark set you did not create.
