import { logger } from "../logger";
import { discoverPublicWallets, type PublicWalletDiscoveryChain } from "./store";

const state = {
  started: false,
  running: false,
  interval: null as ReturnType<typeof setInterval> | null,
};

function boolEnv(key: string, fallback = false): boolean {
  const raw = process.env[key]?.trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function numberEnv(key: string, fallback: number, min: number, max: number): number {
  const raw = Number(process.env[key] ?? fallback);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, Math.round(raw)));
}

function chainsEnv(): PublicWalletDiscoveryChain[] {
  const allowed = new Set<PublicWalletDiscoveryChain>(["solana", "base", "ethereum"]);
  const raw = process.env["WALLET_DISCOVERY_CHAINS"]?.trim();
  const values = raw ? raw.split(",").map((item) => item.trim().toLowerCase()) : ["solana", "base"];
  const chains = values.filter((item): item is PublicWalletDiscoveryChain => allowed.has(item as PublicWalletDiscoveryChain));
  return Array.from(new Set(chains.length > 0 ? chains : ["solana", "base"]));
}

async function runCycle(reason: string) {
  if (state.running) {
    logger.warn({ reason }, "Skipping public wallet discovery because the previous cycle is still running");
    return;
  }

  state.running = true;

  try {
    const result = await discoverPublicWallets({
      chains: chainsEnv(),
      maxWalletsPerChain: numberEnv("WALLET_DISCOVERY_MAX_WALLETS_PER_CHAIN", 8, 1, 50),
      backfillLimit: numberEnv("WALLET_DISCOVERY_BACKFILL_LIMIT", 20, 1, 100),
      solanaSignatureLimit: numberEnv("WALLET_DISCOVERY_SOLANA_SIGNATURE_LIMIT", 16, 1, 100),
      evmBlockLookback: numberEnv("WALLET_DISCOVERY_EVM_BLOCK_LOOKBACK", 3, 1, 25),
    });

    logger.info({ reason, totals: result.totals, chains: result.chains }, "Public wallet discovery completed");
  } catch (err) {
    logger.warn({ err, reason }, "Public wallet discovery failed");
  } finally {
    state.running = false;
  }
}

export function startPublicWalletDiscoveryWorker() {
  if (state.started) return;
  state.started = true;

  if (!boolEnv("WALLET_DISCOVERY_ENABLED", false)) {
    logger.info("Public wallet discovery worker disabled");
    return;
  }

  const intervalMs = numberEnv("WALLET_DISCOVERY_INTERVAL_MS", 10 * 60_000, 60_000, 24 * 60 * 60_000);
  logger.info({ intervalMs, chains: chainsEnv() }, "Starting public wallet discovery worker");

  if (boolEnv("WALLET_DISCOVERY_RUN_ON_START", true)) {
    void runCycle("startup");
  }

  state.interval = setInterval(() => {
    void runCycle("interval");
  }, intervalMs);
}
