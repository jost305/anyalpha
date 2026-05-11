import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const candidateDirs = collectCandidateDirs([process.cwd(), moduleDir], 5);

for (const dir of candidateDirs) {
  loadIfPresent(path.join(dir, ".env.local"));
  loadIfPresent(path.join(dir, ".env"));
}

function loadIfPresent(filePath: string): void {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(trimmed);
    if (!match) continue;

    const [, key, rawValue] = match;
    const currentValue = process.env[key];

    // Keep caller-provided non-empty env values, but backfill missing or blank ones.
    if (typeof currentValue === "string" && currentValue.length > 0) continue;

    process.env[key] = parseEnvValue(rawValue);
  }
}

function parseEnvValue(rawValue: string): string {
  const value = rawValue.trim();

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    const unwrapped = value.slice(1, -1);
    return value.startsWith('"')
      ? unwrapped
          .replace(/\\n/g, "\n")
          .replace(/\\r/g, "\r")
          .replace(/\\"/g, '"')
      : unwrapped;
  }

  return value;
}

function collectCandidateDirs(startDirs: string[], maxDepth: number): string[] {
  const dirs: string[] = [];
  const seen = new Set<string>();

  for (const startDir of startDirs) {
    let currentDir = path.resolve(startDir);

    for (let depth = 0; depth <= maxDepth; depth += 1) {
      if (!seen.has(currentDir)) {
        seen.add(currentDir);
        dirs.push(currentDir);
      }

      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) break;
      currentDir = parentDir;
    }
  }

  return dirs;
}
