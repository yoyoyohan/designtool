import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const api = spawn(process.execPath, [path.join(root, "server/index.mjs")], {
  cwd: root,
  env: { ...process.env, PORT: process.env.DESK_PORT || "8787" },
  stdio: "inherit",
});
const vite = spawn("npx", ["vite", ...process.argv.slice(2)], {
  cwd: root,
  stdio: "inherit",
  shell: true,
});

function stop() {
  api.kill();
  vite.kill();
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
api.on("exit", (code) => {
  if (code && code !== 0) process.exit(code);
});
vite.on("exit", (code) => {
  process.exit(code ?? 0);
});
