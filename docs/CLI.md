# CLI reference

Run commands from the repository being checked. The development form is pnpm dev <command>; after building or installing, use verify <command>.

| Command | Purpose |
| --- | --- |
| init | Create .verifyrc.json; refuses to overwrite an existing file unless --force is supplied |
| scan | Analyze Git changes, or all non-ignored text files with --all |
| check | Scan changes and run enabled quality checks |
| rules | List implemented rule IDs and descriptions |
| models | List model IDs returned by the configured provider |
| agent | Run the restricted model coding loop |
| eval | Run the same benchmark tasks against two or three explicit models |
| report | Render a saved verification or evaluation JSON result |
| version | Display the package version |

## Scan and check

    verify scan [--base REF | --all] [--baseline RESULT.json] [--format terminal|json|markdown]
    verify check [--base REF | --all] [--baseline RESULT.json] [--format terminal|json|markdown]

Use --base for a Git reference comparison. --all and --base cannot be used together. A baseline JSON file is a prior VerificationResult.

## Agent and evaluation

    verify agent --task "instruction" [--base REF] [--model ID] [--task-type simple|coding|reasoning|security]
    verify eval --benchmark TASKS_DIR --models MODEL_A,MODEL_B[,MODEL_C] [--pricing PRICES.json] [--output PATH]

An explicit --model overrides task routing. Otherwise --task-type selects the matching VERIFY_MODEL_* value and falls back to VERIFY_MODEL.

## Reports

    verify report --input RESULT.json [--format terminal|json|markdown] [--output FILE]

The report command accepts verification and evaluation result files.
