# CLI reference

Run commands from the repository being checked. During development use `pnpm dev <command>`; after building or installing, use `verify <command>`.

| Command | Purpose |
| --- | --- |
| init | Create `.verifyrc.json`; refuses to overwrite an existing file |
| scan | Run deterministic analysis on Git changes, or all non-ignored text files with `--all` |
| check | Scan changes and run enabled quality checks |
| review | Combine deterministic verification with the read-only AI reviewer |
| rules | List implemented rule IDs and descriptions |
| models | List model IDs; `--review` uses the dedicated review gateway |
| eval | Compare two or three review models against labeled fixtures |
| report | Render a saved verification or evaluation JSON result |
| version | Display the package version |

## Scan and check

```text
verify scan [--base REF | --all] [--baseline RESULT.json] [--format terminal|json|markdown]
verify check [--base REF | --all] [--baseline RESULT.json] [--format terminal|json|markdown]
```

Use `--base` to compare against a Git reference. `--all` and `--base` cannot be used together. A baseline JSON file is a prior verification result. `check` runs enabled tests, lint, and typecheck commands configured in `.verifyrc.json`.

## AI review

```text
verify review [--base REF] [--checks] [--format terminal|json|markdown]
```

`review` runs deterministic verification and requests the independent AI review. `--checks` also runs configured quality commands. The review requires `VERIFY_REVIEW_API_KEY`; if configuration or the provider is unavailable, deterministic results are still returned with an `aiReview` status explaining the outcome. AI findings are non-blocking and include confidence and validated evidence.

## Model evaluation and reports

```text
verify eval --benchmark TASKS_DIR --models MODEL_A,MODEL_B[,MODEL_C] [--pricing PRICES.json] [--output PATH]
verify report --input RESULT.json [--format terminal|json|markdown] [--output FILE]
```

Evaluation compares model reviewers against labeled, immutable benchmark changes. Use `verify models --review` to list IDs for that gateway. The report command accepts verification and evaluation result files.
