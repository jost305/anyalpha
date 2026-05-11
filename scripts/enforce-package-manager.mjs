import { existsSync, rmSync } from "node:fs";

for (const lockfile of ["package-lock.json", "yarn.lock"]) {
  if (existsSync(lockfile)) {
    rmSync(lockfile, { force: true });
  }
}

const userAgent = process.env.npm_config_user_agent ?? "";
const allowByEnvironment =
  process.env.RAILWAY_PROJECT_ID ||
  process.env.RAILWAY_ENVIRONMENT ||
  process.env.CI === "true";

if (!allowByEnvironment && !userAgent.includes("pnpm/")) {
  console.error("Use pnpm instead");
  process.exit(1);
}
