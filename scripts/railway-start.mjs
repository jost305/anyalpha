import { spawn } from "node:child_process";

const target = (process.env.SERVICE_TARGET ?? "api").trim().toLowerCase();

const command =
  process.platform === "win32" ? "pnpm.cmd" : "pnpm";

const targetArgs =
  target === "api"
    ? ["--filter", "@workspace/api-server", "start"]
    : target === "web"
      ? ["--filter", "@workspace/bantah", "start"]
      : null;

if (!targetArgs) {
  console.error(
    'SERVICE_TARGET must be "api" or "web" for Railway startup.',
  );
  process.exit(1);
}

const child = spawn(command, targetArgs, {
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
