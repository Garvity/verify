# MCP integration

`verify` exposes the deterministic verification engine over the Model Context Protocol (MCP). The server uses stdio, so it does not open a network port and does not need an LLM gateway.

## Start the server

From the project directory, run the TypeScript entry point during development:

```sh
pnpm mcp:dev
```

For the compiled server:

```sh
pnpm build
pnpm mcp
```

Keep stdout reserved for MCP messages. Diagnostics are written to stderr.

## Configure Codex desktop

Codex desktop shares MCP configuration with Codex CLI and the IDE extension. You can add this server in the desktop settings:

1. Open **Settings → MCP servers → Add server**.
2. Name the server `verify` and select **STDIO**.
3. Set the command to `pnpm`.
4. Add these arguments in order:

   ```text
   --silent
   --dir
   /Users/garv/Projects/verify
   mcp:dev
   ```

   `--silent` keeps pnpm's command banner off stdout, where it would interfere with MCP messages.
5. Save the server and select **Restart**.
6. In the composer, enter `/mcp` and confirm `verify` is listed.
7. Call `verify_changes` with `base: "HEAD"`, then call `get_findings` to confirm both tools return structured output.

No API key or OAuth sign-in is needed. For another machine or checkout, replace the project path with that checkout's absolute path.

Codex can also read this equivalent user-level configuration from `~/.codex/config.toml`:

```toml
[mcp_servers.verify]
command = "pnpm"
args = ["--silent", "--dir", "/Users/garv/Projects/verify", "mcp:dev"]
enabled = true
```

## Configure other MCP clients

### OpenCode

The repository includes an OpenCode MCP configuration in `opencode.json`. Start OpenCode from the repository root with `opencode`, then use `/mcps` to confirm `verify` is connected and exposes `verify_changes` and `get_findings`. Select an active model with tool-calling support, then ask OpenCode to call `verify_changes` with `base: "HEAD"` to check the full client-to-server path.

The server starts with `pnpm --silent mcp:dev`. The `--silent` flag keeps pnpm's startup text off stdout, which is reserved for MCP messages.

### Clients using JSON `mcpServers`

For clients that use a JSON `mcpServers` configuration, use this stdio entry and replace the path with the absolute path to this checkout:

```json
{
  "mcpServers": {
    "verify": {
      "command": "pnpm",
      "args": ["--silent", "--dir", "/absolute/path/to/verify", "mcp:dev"]
    }
  }
}
```

Restart the client after changing its MCP configuration.

## Tools

### `verify_changes`

Runs verification against the current Git changes. It accepts an optional `base` Git reference and returns a structured result containing status, findings and summary counts. The result is produced by the same `runVerification` function used by the CLI.

### `get_findings`

Returns the findings from the most recent successful `verify_changes` call in this server process. Optional filters are `blockingOnly` and `severity` (`critical`, `high`, `medium`, `low` or `info`).

## Local MCP protocol check

The repository includes an in-memory MCP client/server integration test. Run it with:

```sh
pnpm test:mcp
```

For a client-level check, start `pnpm mcp:dev` through an MCP inspector or an existing coding agent and confirm that it lists both tools, calls `verify_changes`, and receives structured findings. No model provider credentials are needed for these tools.
