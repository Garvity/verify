import { exec } from "node:child_process";

export function generateReport(name) {
  exec(`report-tool ${name}`);
}
