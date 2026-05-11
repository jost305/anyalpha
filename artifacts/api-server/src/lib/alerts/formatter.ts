import type { ScoredAlert } from "./types";

export interface TelegramLinkButton {
  text: string;
  url: string;
}

const DEFAULT_ANYALPHA_PUBLIC_URL = "https://www.anyalpha.com";
const BLOCKED_HASHTAGS = new Set(["slopradar"]);

function hashString(value: string): number {
  let hash = 2166136261;

  for (const char of value) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function pickEmoji(alert: ScoredAlert, slot: string, options: readonly string[]): string {
  const seed = `${alert.id}:${alert.signal.token.symbol}:${alert.signal.trigger.kind}:${slot}`;
  return options[hashString(seed) % options.length] ?? options[0] ?? "";
}

function fmtCurrency(value?: number): string {
  if (typeof value !== "number") return "n/a";
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  if (value >= 1) return `$${value.toFixed(2)}`;
  return `$${value.toFixed(8)}`;
}

function fmtPct(value?: number): string {
  if (typeof value !== "number") return "n/a";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(1)}%`;
}

function fmtAmount(value?: number): string {
  if (typeof value !== "number") return "n/a";
  if (Math.abs(value) >= 1_000_000) return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (Math.abs(value) >= 1_000) return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (Math.abs(value) >= 1) return value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
  return value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 6 });
}

function titleCase(value: string): string {
  return value
    .split(/[_-]/g)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function rankBadge(score: number): string {
  if (score >= 90) return "🥇";
  if (score >= 80) return "🥈";
  if (score >= 70) return "🥉";
  return "⏺";
}

function scoreDots(score: number): string {
  const count = Math.max(2, Math.min(24, Math.round(score / 4)));
  return "🟢".repeat(count);
}

function explorerBase(chain: string): string | null {
  switch (chain) {
    case "solana":
      return "https://solscan.io";
    case "ethereum":
      return "https://etherscan.io";
    case "base":
      return "https://basescan.org";
    case "arbitrum":
      return "https://arbiscan.io";
    case "bsc":
      return "https://bscscan.com";
    default:
      return null;
  }
}

function walletLink(chain: string, address?: string): string | null {
  if (!address) return null;
  const base = explorerBase(chain);
  return base ? `${base}/address/${address}` : address;
}

function txLink(chain: string, txHash?: string): string | null {
  if (!txHash) return null;
  const base = explorerBase(chain);
  return base ? `${base}/tx/${txHash}` : txHash;
}

function isPrivateOrLoopbackHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();

  if (normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1") {
    return true;
  }

  const match = normalized.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return false;

  const first = Number(match[1]);
  const second = Number(match[2]);

  if (first === 10 || first === 127) return true;
  if (first === 192 && second === 168) return true;
  if (first === 172 && second >= 16 && second <= 31) return true;

  return false;
}

function anyAlphaBaseUrl(): string {
  const configured = (process.env["ANYALPHA_PUBLIC_URL"] ?? "").trim();

  if (!configured) {
    return DEFAULT_ANYALPHA_PUBLIC_URL;
  }

  try {
    const parsed = new URL(configured);
    if (isPrivateOrLoopbackHost(parsed.hostname)) {
      return DEFAULT_ANYALPHA_PUBLIC_URL;
    }

    return configured.replace(/\/+$/, "");
  } catch {
    return DEFAULT_ANYALPHA_PUBLIC_URL;
  }
}

function anyAlphaLink(chain: string, tokenAddress?: string): string | null {
  if (!tokenAddress) return null;
  return `${anyAlphaBaseUrl()}/?chain=${encodeURIComponent(chain)}&token=${encodeURIComponent(tokenAddress)}`;
}

function buyLink(chain: string, tokenAddress?: string): string | null {
  if (!tokenAddress) return null;

  switch (chain) {
    case "solana":
      return `https://jup.ag/swap/SOL-${encodeURIComponent(tokenAddress)}`;
    case "ethereum":
      return `https://app.uniswap.org/explore/tokens/ethereum/${encodeURIComponent(tokenAddress)}`;
    case "base":
      return `https://app.uniswap.org/explore/tokens/base/${encodeURIComponent(tokenAddress)}`;
    case "arbitrum":
      return `https://app.uniswap.org/explore/tokens/arbitrum/${encodeURIComponent(tokenAddress)}`;
    default:
      return null;
  }
}

function hashtags(tags: string[] | undefined, chain: string): string {
  const merged = [...(tags ?? []), chain]
    .map((tag) => tag.trim().replace(/^#/, ""))
    .filter(Boolean)
    .map((tag) => tag.replace(/\s+/g, "").toLowerCase())
    .filter((tag) => !BLOCKED_HASHTAGS.has(tag));

  return [...new Set(merged)].map((tag) => `#${tag}`).join(" ");
}

function isLargeBuyAlert(kind: string): boolean {
  return kind === "large_buy";
}

export function formatTelegramAlert(alert: ScoredAlert): string {
  const { signal } = alert;
  const market = signal.market ?? {};
  const chain = signal.token.chain;
  const headlineName = signal.token.name ?? signal.token.symbol;
  const header = `${rankBadge(alert.score)} | ${headlineName} / ${signal.token.symbol}`;
  const buyerUrl = walletLink(chain, signal.trigger.walletAddress);
  const transactionUrl = txLink(chain, signal.trigger.txHash);
  const appUrl = anyAlphaLink(chain, signal.token.address);
  const tradeUrl = buyLink(chain, signal.token.address);
  const tags = hashtags(signal.narrativeTags, chain);
  const flowEmoji = pickEmoji(alert, "flow", ["🔀", "🚨", "⚡", "🚀"]);
  const tokenEmoji = pickEmoji(alert, "token", ["🪙", "💎", "🎯", "🧪"]);
  const buyerEmoji = pickEmoji(alert, "buyer", ["👤", "🔎", "🕵️", "📡"]);
  const marketCapEmoji = pickEmoji(alert, "market-cap", ["💸", "💰", "💵", "🤑"]);
  const priceEmoji = pickEmoji(alert, "price", ["📈", "🚀", "⚡", "🚨"]);
  const volumeEmoji = pickEmoji(alert, "volume", ["⚡", "🌊", "💧", "📊"]);
  const chainEmoji = pickEmoji(alert, "chain", ["⛓️", "🌐", "🛰️", "🧭"]);
  const insightEmoji = pickEmoji(alert, "insight", ["🧠", "🤖", "🚨", "📣"]);
  const riskEmoji = pickEmoji(alert, "risk", ["⚠️", "🚨", "🛑", "☢️"]);
  const lines = [header, scoreDots(alert.score), ""];

  if (isLargeBuyAlert(signal.trigger.kind)) {
    const flowLine =
      typeof signal.trigger.quoteAmount === "number" && signal.trigger.quoteSymbol
        ? `${flowEmoji} ${fmtCurrency(signal.trigger.amountUsd)} (${fmtAmount(signal.trigger.quoteAmount)} ${signal.trigger.quoteSymbol})`
        : `${flowEmoji} ${fmtCurrency(signal.trigger.amountUsd)}`;
    lines.push(flowLine);

    if (typeof signal.trigger.tokenAmount === "number") {
      lines.push(`${tokenEmoji} ${fmtAmount(signal.trigger.tokenAmount)} ${signal.token.symbol}`);
    }

    if (buyerUrl || transactionUrl) {
      lines.push(`${buyerEmoji} Buyer flow below`);
    }

    if (typeof market.marketCapUsd === "number") {
      lines.push(`${marketCapEmoji} Market Cap ${fmtCurrency(market.marketCapUsd)}`);
    }

    if (signal.trigger.description) {
      lines.push(`${insightEmoji} ${signal.trigger.description}`);
    }
  } else {
    if (typeof market.marketCapUsd === "number") {
      lines.push(`${marketCapEmoji} MC ${fmtCurrency(market.marketCapUsd)}`);
    }
    if (typeof market.priceChange24hPct === "number") {
      lines.push(`${priceEmoji} ${fmtPct(market.priceChange24hPct)} (24h)`);
    }
    if (typeof market.liquidityUsd === "number" || typeof market.volume24hUsd === "number") {
      lines.push(`${volumeEmoji} Liq ${fmtCurrency(market.liquidityUsd)} | ${pickEmoji(alert, "volume-secondary", ["⚡", "🌩️", "🚀", "📡"])} Vol ${fmtCurrency(market.volume24hUsd)}`);
    }
    lines.push(`${chainEmoji} ${titleCase(chain)}`);

    if (signal.trigger.description) {
      lines.push(`${insightEmoji} ${signal.trigger.description}`);
    } else if (alert.reasons[0]) {
      lines.push(`${insightEmoji} ${alert.reasons[0]}`);
    }
  }

  if (alert.riskFlags.length > 0) {
    lines.push(`${riskEmoji} ${alert.riskFlags.join(", ")}`);
  }

  lines.push("");

  if (tags) {
    lines.push(tags);
  }

  return lines.join("\n");
}

export function buildTelegramButtons(alert: ScoredAlert): TelegramLinkButton[][] {
  const { signal } = alert;
  const chain = signal.token.chain;
  const appUrl = anyAlphaLink(chain, signal.token.address);
  const tradeUrl = buyLink(chain, signal.token.address);
  const buyerUrl = walletLink(chain, signal.trigger.walletAddress);
  const transactionUrl = txLink(chain, signal.trigger.txHash);
  const rows: TelegramLinkButton[][] = [];
  const appButtonEmoji = pickEmoji(alert, "button-app", ["⚡", "🚀", "🤖", "🌐"]);
  const buyButtonEmoji = pickEmoji(alert, "button-buy", ["🛒", "💸", "🚀", "⚡"]);
  const buyerButtonEmoji = pickEmoji(alert, "button-buyer", ["👤", "🕵️", "🔎", "📡"]);
  const txButtonEmoji = pickEmoji(alert, "button-tx", ["🧾", "🔗", "⚙️", "📜"]);

  const primaryRow = [
    appUrl ? { text: `${appButtonEmoji} AnyAlpha`, url: appUrl } : null,
    tradeUrl ? { text: `${buyButtonEmoji} Buy`, url: tradeUrl } : null,
  ].filter((button): button is TelegramLinkButton => button !== null);

  if (primaryRow.length > 0) {
    rows.push(primaryRow);
  }

  const secondaryRow = [
    buyerUrl ? { text: `${buyerButtonEmoji} Buyer`, url: buyerUrl } : null,
    transactionUrl ? { text: `${txButtonEmoji} TX`, url: transactionUrl } : null,
  ].filter((button): button is TelegramLinkButton => button !== null);

  if (secondaryRow.length > 0) {
    rows.push(secondaryRow);
  }

  return rows;
}
