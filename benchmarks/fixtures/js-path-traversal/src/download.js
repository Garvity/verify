import { readFileSync } from "node:fs";
import path from "node:path";

export function readDownload(root, userPath) {
  return readFileSync(path.join(root, userPath), "utf8");
}
