import type { AlertMarket, AlertSignal, RiskLevel, ScoredAlert } from "./types";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function buyPressure(market: AlertMarket): number | undefined {
  if (typeof market.buyPressurePct === "number") {
    return market.buyPressurePct;
  }

  if (
    typeof market.buys24h === "number" &&
    typeof market.sells24h === "number" &&
    market.buys24h + market.sells24h > 0
  ) {
    return (market.buys24h / (market.buys24h + market.sells24h)) * 100;
  }

  return undefined;
}

function scoreLiquidity(value?: number): number {
  if (!value || value <= 0) return -8;
  if (value >= 500_000) return 18;
  if (value >= 100_000) return 13;
  if (value >= 25_000) return 7;
  return -4;
}

function scoreVolume(value?: number): number {
  if (!value || value <= 0) return 0;
  if (value >= 2_000_000) return 16;
  if (value >= 500_000) return 11;
  if (value >= 100_000) return 6;
  return 2;
}

function scoreMomentum(value?: number): number {
  if (typeof value !== "number") return 0;
  if (value >= 100) return 14;
  if (value >= 30) return 10;
  if (value >= 10) return 6;
  if (value <= -25) return -8;
  return 0;
}

function scoreHolders(value?: number): number {
  if (!value || value <= 0) return 0;
  if (value >= 10_000) return 10;
  if (value >= 2_000) return 7;
  if (value >= 500) return 4;
  return 1;
}

function scoreAge(value?: number): number {
  if (typeof value !== "number") return 0;
  if (value <= 60) return 8;
  if (value <= 24 * 60) return 5;
  if (value <= 7 * 24 * 60) return 2;
  return 0;
}

function gradeFor(score: number): ScoredAlert["grade"] {
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  if (score >= 45) return "C";
  return "D";
}

function riskLevel(score: number, riskFlags: string[], market: AlertMarket): RiskLevel {
  if (riskFlags.length >= 3) return "high";
  if (!market.liquidityUsd || market.liquidityUsd < 25_000) return "high";
  if (score < 45 || riskFlags.length > 0) return "medium";
  return "low";
}

function buildReasons(signal: AlertSignal, pressure?: number): string[] {
  const market = signal.market ?? {};
  const reasons: string[] = [];

  if (signal.trigger.kind === "large_buy" && signal.trigger.amountUsd) {
    reasons.push(`Large buy detected around $${Math.round(signal.trigger.amountUsd).toLocaleString()}.`);
  }

  if (signal.trigger.kind === "new_pair") {
    reasons.push("Fresh pair detected before wider market discovery.");
  }

  if (market.volume24hUsd && market.volume24hUsd >= 100_000) {
    reasons.push("Meaningful 24h volume is already forming.");
  }

  if (typeof market.priceChange24hPct === "number" && market.priceChange24hPct >= 10) {
    reasons.push("Price momentum is above the alert threshold.");
  }

  if (typeof pressure === "number" && pressure >= 60) {
    reasons.push("Buy pressure is tilted toward buyers.");
  }

  if (market.liquidityUsd && market.liquidityUsd >= 100_000) {
    reasons.push("Liquidity is deep enough to watch without treating it as pure noise.");
  }

  return reasons.length > 0 ? reasons : ["Signal passed the current AnyAlpha scoring filters."];
}

export function scoreAlert(signal: AlertSignal, id: string, createdAt: string): ScoredAlert {
  const market = signal.market ?? {};
  const pressure = buyPressure(market);

  let score = 30;
  score += scoreLiquidity(market.liquidityUsd);
  score += scoreVolume(market.volume24hUsd);
  score += scoreMomentum(market.priceChange24hPct);
  score += scoreHolders(market.holderCount);
  score += scoreAge(market.ageMinutes);

  if (typeof pressure === "number") {
    score += pressure >= 70 ? 10 : pressure >= 60 ? 6 : pressure <= 40 ? -5 : 0;
  }

  if (signal.trigger.kind === "large_buy") score += 8;
  if (signal.trigger.kind === "volume_spike") score += 7;
  if (signal.trigger.kind === "new_pair") score += 5;

  const riskFlags = signal.riskFlags ?? [];
  score -= riskFlags.length * 6;
  score = Math.round(clamp(score, 0, 100));

  return {
    id,
    signal,
    score,
    grade: gradeFor(score),
    riskLevel: riskLevel(score, riskFlags, market),
    reasons: buildReasons(signal, pressure),
    riskFlags,
    createdAt,
  };
}
