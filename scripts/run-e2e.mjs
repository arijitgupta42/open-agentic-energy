// Run the browser workflow tests (e2e/) with e2e's usage telemetry off, on every
// platform. Extra arguments go to `e2e run`, such as a test file or `--headed`.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const bin = fileURLToPath(new URL(`../node_modules/.bin/e2e${process.platform === "win32" ? ".cmd" : ""}`, import.meta.url));
const result = spawnSync(bin, ["run", ...process.argv.slice(2)], {
  stdio: "inherit",
  // A .cmd file needs a shell on Windows.
  shell: process.platform === "win32",
  env: {...process.env, E2E_TELEMETRY_DISABLED: "1", DO_NOT_TRACK: "1"},
});
process.exit(result.status ?? 1);
