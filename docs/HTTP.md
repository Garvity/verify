# Local HTTP API

The optional HTTP wrapper calls the same deterministic verification engine as the CLI and MCP server.

Start it from the repository root:

    pnpm build
    pnpm http

For development, use pnpm http:dev. The server listens on loopback at 127.0.0.1:4318 by default. VERIFY_HTTP_PORT can change the port; VERIFY_HTTP_HOST accepts only loopback hostnames and addresses. The process intentionally refuses remote binding and requires no provider credentials.

## Endpoints

### POST /scan

Accepts an optional JSON body:

    {
      "base": "HEAD",
      "all": false,
      "runChecks": false
    }

Send the body with `Content-Type: application/json`. Other content types receive HTTP 415. The body is limited to 16 KiB. The response includes the structured verification result. Git base references beginning with a dash are rejected.

### GET /findings

Returns findings and the summary from the most recently completed scan in this server process. Before the first scan it returns an empty result.

There is no authentication layer. Keep this endpoint on loopback and do not proxy it onto a network interface.
