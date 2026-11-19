import { createVerifyHttpServer } from "./server.js";

function readPort(value: string | undefined): number {
  if (!value?.trim()) return 4318;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("VERIFY_HTTP_PORT must be an integer from 1 through 65535.");
  }
  return port;
}

const host = process.env.VERIFY_HTTP_HOST ?? "127.0.0.1";
if (host !== "127.0.0.1" && host !== "::1" && host !== "localhost") {
  throw new Error("The HTTP API binds only to loopback addresses.");
}

const port = readPort(process.env.VERIFY_HTTP_PORT);
const server = createVerifyHttpServer();
server.listen(port, host, () => {
  process.stderr.write("verify HTTP API listening on http://" + host + ":" + port + "\n");
});
