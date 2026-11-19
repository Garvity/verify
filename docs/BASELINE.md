# Baseline comparison

Save a full-repository result before an agent starts changing code:

```sh
pnpm dev check --all --format json > /tmp/verify-baseline.json
```

After the changes, compare the new result with that snapshot:

```sh
pnpm dev check --all --baseline /tmp/verify-baseline.json --format terminal
```

The report separates introduced, persistent, and resolved findings. When both runs include quality checks, it also compares failed checks by check ID and command. Finding identity includes its rule, category, severity, blocking state, file, and message; line numbers are ignored so moving code does not create a false regression.

Baseline comparison is informational. The result status and blocking count still describe the current run. Use the same `--all` mode and verification configuration for both snapshots.
