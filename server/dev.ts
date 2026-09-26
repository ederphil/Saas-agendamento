import { spawn } from "node:child_process";
const children = [
  spawn(
    process.execPath,
    ["--env-file-if-exists=.env", "--import", "tsx", "server/index.ts"],
    { stdio: "inherit" },
  ),
  spawn(
    process.execPath,
    ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1"],
    { stdio: "inherit" },
  ),
];
let stopped = false;
const stop = () => {
  if (stopped) return;
  stopped = true;
  for (const child of children) child.kill("SIGTERM");
};
for (const child of children)
  child.on("exit", (code) => {
    stop();
    process.exitCode = code ?? 0;
  });
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
