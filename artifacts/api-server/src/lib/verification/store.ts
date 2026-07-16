import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { getBundleAnalysis } from "../bundle-detection/store";
import type { MarketBundleAnalysis } from "../markets/types";

const ACTIVE_STATUSES: VerificationStatus[] = ["received", "under_review", "approved", "flagged"];

export type VerificationChain = "solana" | "ethereum" | "base" | "arbitrum";
export type VerificationTier = "standard" | "priority";
export type VerificationStatus = "received" | "under_review" | "auto_rejected" | "approved" | "rejected" | "flagged";
export type VerificationBadge = "verified" | "community_vouched" | "unverified_clone" | "flagged";
export type NotificationState = "queued" | "sent";

export interface VerificationSubmissionInput {
  projectName: string;
  contractAddress: string;
  chain: VerificationChain;
  officialTwitter: string;
  officialTelegram: string;
  website: string;
  description: string;
  contact: string;
  tier: VerificationTier;
}

export interface VerificationTimelineEvent {
  code: string;
  label: string;
  at: string;
  detail?: string;
}

export interface VerificationRequest {
  id: string;
  projectName: string;
  contractAddress: string;
  chain: VerificationChain;
  officialTwitter: string;
  officialTelegram: string;
  website: string;
  description: string;
  tier: VerificationTier;
  status: VerificationStatus;
  badge?: VerificationBadge;
  autoScanScore: number;
  rejectionReason?: string;
  reviewWindowHours: number;
  reviewWindowLabel: string;
  antiCloneProtection: boolean;
  createdAt: string;
  updatedAt: string;
  notificationState: NotificationState;
  timeline: VerificationTimelineEvent[];
}

export interface VerificationOverview {
  totals: {
    submitted: number;
    underReview: number;
    approved: number;
    rejected: number;
    flagged: number;
    priority: number;
  };
  updatedAt: string;
}

type DbModule = typeof import("@workspace/db");
type VerificationRequestRow = import("@workspace/db").VerificationRequestRow;

let dbModulePromise: Promise<DbModule> | null = null;

async function getDbModule(): Promise<DbModule> {
  if (dbModulePromise) return dbModulePromise;

  dbModulePromise = (async () => {
    const databaseUrl = (process.env["DATABASE_URL"] ?? "").trim();

    if (!databaseUrl) {
      throw new Error("DATABASE_URL must be configured to use Supabase verification storage.");
    }

    return import("@workspace/db");
  })();

  return dbModulePromise;
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeChain(value: unknown): VerificationChain | undefined {
  const normalized = normalizeString(value)?.toLowerCase();
  if (
    normalized === "solana" ||
    normalized === "ethereum" ||
    normalized === "base" ||
    normalized === "arbitrum"
  ) {
    return normalized;
  }

  return undefined;
}

function normalizeTier(value: unknown): VerificationTier | undefined {
  const normalized = normalizeString(value)?.toLowerCase();
  if (normalized === "standard" || normalized === "priority") return normalized;
  return undefined;
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function normalizeTwitter(value: unknown): string | undefined {
  const raw = normalizeString(value);
  if (!raw) return undefined;

  if (raw.startsWith("@")) {
    const handle = raw.slice(1).trim();
    return handle ? `https://x.com/${handle}` : undefined;
  }

  if (!isValidHttpUrl(raw)) return undefined;

  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (host !== "x.com" && host !== "twitter.com") return undefined;
    return raw.replace(/\/+$/, "");
  } catch {
    return undefined;
  }
}

function normalizeTelegram(value: unknown): string | undefined {
  const raw = normalizeString(value);
  if (!raw) return undefined;

  if (raw.startsWith("@")) {
    const handle = raw.slice(1).trim();
    return handle ? `https://t.me/${handle}` : undefined;
  }

  if (!isValidHttpUrl(raw)) return undefined;

  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (host !== "t.me" && host !== "telegram.me") return undefined;
    return raw.replace(/\/+$/, "");
  } catch {
    return undefined;
  }
}

function normalizeWebsite(value: unknown): string | undefined {
  const raw = normalizeString(value);
  if (!raw || !isValidHttpUrl(raw)) return undefined;
  return raw.replace(/\/+$/, "");
}

function normalizeContact(value: unknown): string | undefined {
  const raw = normalizeString(value);
  if (!raw) return undefined;
  return raw.startsWith("@") ? raw : `@${raw}`;
}

function normalizeContractAddress(chain: VerificationChain, value: unknown): string | undefined {
  const raw = normalizeString(value);
  if (!raw) return undefined;

  if (chain === "solana") {
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(raw) ? raw : undefined;
  }

  if (/^0x[a-fA-F0-9]{40}$/.test(raw)) {
    return raw.toLowerCase();
  }

  return undefined;
}

function normalizeInput(input: VerificationSubmissionInput): VerificationSubmissionInput {
  const chain = normalizeChain(input.chain);
  const tier = normalizeTier(input.tier);
  const projectName = normalizeString(input.projectName);
  const description = normalizeString(input.description);
  const twitter = normalizeTwitter(input.officialTwitter);
  const telegram = normalizeTelegram(input.officialTelegram);
  const website = normalizeWebsite(input.website);
  const contact = normalizeContact(input.contact);

  if (!chain) throw new Error("Choose a supported chain.");
  if (!tier) throw new Error("Choose a verification tier.");
  if (!projectName || projectName.length < 3) throw new Error("Project name must be at least 3 characters.");
  if (!description || description.length < 18) throw new Error("Add a clearer one-line project description.");
  if (!twitter) throw new Error("Enter a valid official Twitter or X profile.");
  if (!telegram) throw new Error("Enter a valid official Telegram link or handle.");
  if (!website) throw new Error("Enter a valid project website.");
  if (!contact || contact.length < 3) throw new Error("Add a Telegram contact handle for the submitter.");

  const contractAddress = normalizeContractAddress(chain, input.contractAddress);
  if (!contractAddress) throw new Error("Contract address format does not match the selected chain.");

  return {
    projectName,
    contractAddress,
    chain,
    officialTwitter: twitter,
    officialTelegram: telegram,
    website,
    description,
    contact,
    tier,
  };
}

function reviewWindowHours(tier: VerificationTier): number {
  return tier === "priority" ? 6 : 24;
}

function reviewWindowLabel(hours: number): string {
  return hours <= 6 ? "Target review within 6 hours." : "Target review within 24 hours.";
}

function projectSlug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function websiteHost(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return value.toLowerCase();
  }
}

function containsMemeOnlySignal(projectName: string, description: string): boolean {
  const text = `${projectName} ${description}`.toLowerCase();
  const memeTerms = /\b(meme|memecoin|shitcoin|cto|pump fun|pumpfun|degen)\b/;
  const utilityTerms = /\b(protocol|dex|tool|infra|wallet|agent|ai|yield|staking|dao|analytics|launchpad|payment|market|bridge|trading|data)\b/;
  return memeTerms.test(text) && !utilityTerms.test(text);
}

function autoScanScore(input: VerificationSubmissionInput): number {
  let score = 58;
  score += Math.min(14, Math.floor(input.description.length / 10));
  score += input.projectName.length >= 6 ? 6 : 2;
  score += input.tier === "priority" ? 6 : 0;
  score += input.chain === "solana" ? 4 : 6;
  return Math.max(1, Math.min(99, score));
}

function scoreWithBundleEvidence(score: number, bundle: MarketBundleAnalysis | null): number {
  if (!bundle || bundle.label === "unknown") return score;
  if (bundle.label === "organic") return Math.min(99, score + 10);
  if (bundle.label === "suspicious") return Math.max(1, score - 18);
  return Math.max(1, Math.min(score, 20));
}

function bundleVerificationTimeline(bundle: MarketBundleAnalysis | null, now: string): VerificationTimelineEvent | null {
  if (!bundle || bundle.label === "unknown") return null;

  if (bundle.label === "bundled") {
    return {
      code: "bundle_scan",
      label: "Bundle scan rejected the request",
      at: now,
      detail: `Bundled launch evidence detected. Score ${bundle.score}/100.`,
    };
  }

  if (bundle.label === "suspicious") {
    return {
      code: "bundle_scan",
      label: "Bundle scan flagged the request",
      at: now,
      detail: `Suspicious launch evidence detected. Score ${bundle.score}/100.`,
    };
  }

  return {
    code: "bundle_scan",
    label: "Organic launch evidence found",
    at: now,
    detail: `Organic launch classification supports review. Score ${bundle.score}/100.`,
  };
}

function createRequestId(now: string): string {
  const timePart = Date.parse(now).toString(36).slice(-6).toUpperCase();
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `AA-VRF-${timePart}${randomPart}`;
}

function normalizeTimelineEvent(value: unknown): VerificationTimelineEvent | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  const code = normalizeString(record.code);
  const label = normalizeString(record.label);
  const at = normalizeString(record.at);
  const detail = normalizeString(record.detail);

  if (!code || !label || !at) return null;

  return {
    code,
    label,
    at,
    ...(detail ? { detail } : {}),
  };
}

function normalizeTimeline(value: unknown): VerificationTimelineEvent[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    const normalized = normalizeTimelineEvent(entry);
    return normalized ? [normalized] : [];
  });
}

function toIsoString(value: string | Date | null | undefined): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return new Date().toISOString();
}

function toPublicRequest(row: VerificationRequestRow): VerificationRequest {
  return {
    id: row.id,
    projectName: row.projectName,
    contractAddress: row.contractAddress,
    chain: row.chain as VerificationChain,
    officialTwitter: row.officialTwitter,
    officialTelegram: row.officialTelegram,
    website: row.website,
    description: row.description,
    tier: row.tier as VerificationTier,
    status: row.status as VerificationStatus,
    ...(row.badge ? { badge: row.badge as VerificationBadge } : {}),
    autoScanScore: row.autoScanScore,
    ...(row.rejectionReason ? { rejectionReason: row.rejectionReason } : {}),
    reviewWindowHours: row.reviewWindowHours,
    reviewWindowLabel: reviewWindowLabel(row.reviewWindowHours),
    antiCloneProtection: row.antiCloneProtection,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
    notificationState: row.notificationState as NotificationState,
    timeline: normalizeTimeline(row.timeline),
  };
}

async function duplicateContractExists(input: VerificationSubmissionInput): Promise<boolean> {
  const { db, verificationRequestsTable } = await getDbModule();

  const rows = await db
    .select({ id: verificationRequestsTable.id })
    .from(verificationRequestsTable)
    .where(
      and(
        eq(verificationRequestsTable.chain, input.chain),
        eq(verificationRequestsTable.contractAddress, input.contractAddress),
        inArray(verificationRequestsTable.status, ACTIVE_STATUSES),
      ),
    )
    .limit(1);

  return rows.length > 0;
}

async function matchingVerifiedProject(input: VerificationSubmissionInput): Promise<VerificationRequestRow | null> {
  const { db, verificationRequestsTable } = await getDbModule();
  const slug = projectSlug(input.projectName);
  const host = websiteHost(input.website);

  const rows = await db
    .select()
    .from(verificationRequestsTable)
    .where(
      and(
        eq(verificationRequestsTable.status, "approved"),
        eq(verificationRequestsTable.chain, input.chain),
        ne(verificationRequestsTable.contractAddress, input.contractAddress),
      ),
    )
    .orderBy(desc(verificationRequestsTable.updatedAt));

  const match = rows.find(
    (row) => projectSlug(row.projectName) === slug || websiteHost(row.website) === host,
  );

  return match ?? null;
}

async function getVerificationRequestRow(requestId: string): Promise<VerificationRequestRow | null> {
  const { db, verificationRequestsTable } = await getDbModule();
  const normalizedId = requestId.trim().toUpperCase();

  const rows = await db
    .select()
    .from(verificationRequestsTable)
    .where(eq(verificationRequestsTable.id, normalizedId))
    .limit(1);

  return rows[0] ?? null;
}

export async function createVerificationRequest(input: VerificationSubmissionInput): Promise<VerificationRequest> {
  const normalized = normalizeInput(input);

  if (await duplicateContractExists(normalized)) {
    throw new Error("An active verification request already exists for this contract.");
  }

  const { db, verificationRequestsTable } = await getDbModule();
  const now = new Date().toISOString();
  const cloneMatch = await matchingVerifiedProject(normalized);
  const bundleAnalysis = await getBundleAnalysis(normalized.chain, normalized.contractAddress).catch(() => null);
  const score = scoreWithBundleEvidence(autoScanScore(normalized), bundleAnalysis);
  const hours = reviewWindowHours(normalized.tier);

  let status: VerificationStatus = "under_review";
  let badge: VerificationBadge | undefined = score >= 80 ? "community_vouched" : undefined;
  let rejectionReason: string | undefined;

  if (bundleAnalysis?.label === "bundled") {
    status = "auto_rejected";
    badge = undefined;
    rejectionReason = "Verification is not available while bundled launch evidence is active for this contract.";
  } else if (bundleAnalysis?.label === "suspicious") {
    status = "flagged";
    badge = "flagged";
    rejectionReason = "Suspicious bundle evidence requires manual review before verification can continue.";
  } else if (containsMemeOnlySignal(normalized.projectName, normalized.description)) {
    status = "auto_rejected";
    badge = undefined;
    rejectionReason = "Verification is not available for meme coins without a utility or product claim.";
  } else if (cloneMatch) {
    status = "flagged";
    badge = "unverified_clone";
    rejectionReason = `Potential clone of verified project ${cloneMatch.projectName}.`;
  }

  const timeline: VerificationTimelineEvent[] = [
    {
      code: "received",
      label: "Submission received",
      at: now,
      detail: normalized.tier === "priority" ? "Priority review requested." : "Standard review requested.",
    },
    {
      code: "auto_scan",
      label:
        status === "auto_rejected"
          ? "Auto-scan rejected the request"
          : status === "flagged"
            ? "Auto-scan flagged the request for clone review"
            : "Auto-scan passed and queued for review",
      at: now,
      detail:
        status === "auto_rejected"
          ? rejectionReason
          : status === "flagged"
            ? rejectionReason
            : `Score ${score}/100. ${reviewWindowLabel(hours)}`,
    },
  ];
  const bundleEvent = bundleVerificationTimeline(bundleAnalysis, now);
  if (bundleEvent) timeline.push(bundleEvent);

  const createdAt = new Date(now);
  const updatedAt = new Date(now);

  const rows = await db
    .insert(verificationRequestsTable)
    .values({
      id: createRequestId(now),
      projectName: normalized.projectName,
      contractAddress: normalized.contractAddress,
      chain: normalized.chain,
      officialTwitter: normalized.officialTwitter,
      officialTelegram: normalized.officialTelegram,
      website: normalized.website,
      description: normalized.description,
      contact: normalized.contact,
      tier: normalized.tier,
      status,
      badge,
      autoScanScore: score,
      rejectionReason,
      reviewWindowHours: hours,
      antiCloneProtection: status !== "auto_rejected",
      notificationState: "queued",
      timeline,
      createdAt,
      updatedAt,
    })
    .returning();

  const request = rows[0];

  if (!request) {
    throw new Error("Verification request could not be stored.");
  }

  return toPublicRequest(request);
}

export async function getVerificationRequest(requestId: string): Promise<VerificationRequest | null> {
  const row = await getVerificationRequestRow(requestId);
  return row ? toPublicRequest(row) : null;
}

export async function getVerificationOverview(): Promise<VerificationOverview> {
  const { db, verificationRequestsTable } = await getDbModule();
  const rows = await db
    .select({
      status: verificationRequestsTable.status,
      tier: verificationRequestsTable.tier,
      updatedAt: verificationRequestsTable.updatedAt,
    })
    .from(verificationRequestsTable);

  const latestUpdatedAt =
    rows
      .map((row) => toIsoString(row.updatedAt))
      .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? new Date().toISOString();

  return {
    totals: {
      submitted: rows.length,
      underReview: rows.filter((row) => row.status === "received" || row.status === "under_review").length,
      approved: rows.filter((row) => row.status === "approved").length,
      rejected: rows.filter((row) => row.status === "auto_rejected" || row.status === "rejected").length,
      flagged: rows.filter((row) => row.status === "flagged").length,
      priority: rows.filter((row) => row.tier === "priority").length,
    },
    updatedAt: latestUpdatedAt,
  };
}

export async function markVerificationNotificationSent(requestId: string, detail?: string): Promise<VerificationRequest | null> {
  return appendVerificationEvent(
    requestId,
    {
      code: "team_notified",
      label: "AnyAlpha team notified",
      detail: detail ?? "Review queue received the submission.",
    },
    "sent",
  );
}

export async function markVerificationNotificationQueued(requestId: string, detail?: string): Promise<VerificationRequest | null> {
  return appendVerificationEvent(
    requestId,
    {
      code: "notification_queued",
      label: "Notification queued",
      detail: detail ?? "Submission was stored even though direct notification is not configured yet.",
    },
    "queued",
  );
}

async function appendVerificationEvent(
  requestId: string,
  event: Omit<VerificationTimelineEvent, "at">,
  notificationState?: NotificationState,
): Promise<VerificationRequest | null> {
  const { db, verificationRequestsTable } = await getDbModule();
  const request = await getVerificationRequestRow(requestId);

  if (!request) return null;

  const now = new Date().toISOString();
  const timeline = [
    ...normalizeTimeline(request.timeline),
    {
      ...event,
      at: now,
    },
  ];

  const rows = await db
    .update(verificationRequestsTable)
    .set({
      updatedAt: new Date(now),
      notificationState: notificationState ?? request.notificationState,
      timeline,
    })
    .where(eq(verificationRequestsTable.id, request.id))
    .returning();

  return rows[0] ? toPublicRequest(rows[0]) : null;
}
