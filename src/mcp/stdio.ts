
import { StdioServerTransport } from
  "@modelcontextprotocol/sdk/server/stdio.js";

import {
  createVerifyMcpServer,
  type VerifyChangesHandler
} from "./server.js";

export async function startMcpServer(
  runVerification: VerifyChangesHandler
): Promise<void> {
  const server = createVerifyMcpServer(runVerification);

  const transport = new StdioServerTransport();

  await server.connect(transport);
}
