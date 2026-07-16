import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export type VerificationChainRecord = "solana" | "ethereum" | "base" | "arbitrum";
export type VerificationTierRecord = "standard" | "priority";
export type VerificationStatusRecord = "received" | "under_review" | "auto_rejected" | "approved" | "rejected" | "flagged";
export type VerificationBadgeRecord = "verified" | "community_vouched" | "unverified_clone" | "flagged";
export type VerificationNotificationStateRecord = "queued" | "sent";
export type PointsTierRecord = "anon" | "degen" | "alpha" | "whale" | "gigabrain";
export type ReferralSourceRecord = "terminal" | "telegram";
export type ReferralTierRecord = "starter" | "builder" | "connector" | "amplifier" | "network";
export type WalletTrackerChainRecord = "solana" | "ethereum" | "base" | "arbitrum" | "bsc" | "polygon" | "optimism" | "sui" | "aptos";
export type WalletAlertModeRecord = "alerts_only" | "copy_ready" | "muted";
export type WalletTransactionTypeRecord = "buy" | "sell" | "transfer" | "mint" | "burn" | "unknown";
export type WalletAlertStatusRecord = "queued" | "sent" | "failed" | "skipped";
export type NotificationReadStateRecord = "unread" | "read" | "archived";
export type XAlertModeRecord = "all_posts" | "token_mentions" | "muted";
export type TradingSwapStatusRecord =
  | "quote_requested"
  | "quote_ready"
  | "approval_submitted"
  | "submitted"
  | "failed";
export type BundleLabelRecord = "bundled" | "organic" | "suspicious" | "unknown";

export interface VerificationTimelineDbEvent {
  code: string;
  label: string;
  at: string;
  detail?: string;
}

export type WatchlistMarketSnapshot = Record<string, unknown>;
export type PointsLedgerMetadata = Record<string, unknown>;
export type WalletTrackerMetadata = Record<string, unknown>;
export type WalletBackfillStatusRecord = "running" | "completed" | "failed";
export type NotificationPayload = Record<string, unknown>;
export type PushSubscriptionMetadata = Record<string, unknown>;
export type XAccountMetadata = Record<string, unknown>;
export type XPostMetrics = Record<string, unknown>;
export type XPostMetadata = Record<string, unknown>;
export type XWebhookPayload = Record<string, unknown>;
export type TradingQuotePayload = Record<string, unknown>;
export type TradingSafetyPayload = Record<string, unknown>;
export type BundleEvidencePayload = Record<string, unknown>;
export interface BundleReasonPayload {
  code: string;
  label: string;
  detail?: string;
  scoreImpact?: number;
  [key: string]: unknown;
}

export const verificationChainEnum = pgEnum("verification_chain", ["solana", "ethereum", "base", "arbitrum"]);
export const verificationTierEnum = pgEnum("verification_tier", ["standard", "priority"]);
export const verificationStatusEnum = pgEnum("verification_status", ["received", "under_review", "auto_rejected", "approved", "rejected", "flagged"]);
export const verificationBadgeEnum = pgEnum("verification_badge", ["verified", "community_vouched", "unverified_clone", "flagged"]);
export const verificationNotificationStateEnum = pgEnum("verification_notification_state", ["queued", "sent"]);
export const pointsTierEnum = pgEnum("points_tier", ["anon", "degen", "alpha", "whale", "gigabrain"]);
export const referralSourceEnum = pgEnum("referral_source", ["terminal", "telegram"]);
export const referralTierEnum = pgEnum("referral_tier", ["starter", "builder", "connector", "amplifier", "network"]);
export const walletTrackerChainEnum = pgEnum("wallet_tracker_chain", [
  "solana",
  "ethereum",
  "base",
  "arbitrum",
  "bsc",
  "polygon",
  "optimism",
  "sui",
  "aptos",
]);
export const walletAlertModeEnum = pgEnum("wallet_alert_mode", ["alerts_only", "copy_ready", "muted"]);
export const walletTransactionTypeEnum = pgEnum("wallet_transaction_type", ["buy", "sell", "transfer", "mint", "burn", "unknown"]);
export const walletAlertStatusEnum = pgEnum("wallet_alert_status", ["queued", "sent", "failed", "skipped"]);
export const walletBackfillStatusEnum = pgEnum("wallet_backfill_status", ["running", "completed", "failed"]);
export const notificationReadStateEnum = pgEnum("notification_read_state", ["unread", "read", "archived"]);
export const xAlertModeEnum = pgEnum("x_alert_mode", ["all_posts", "token_mentions", "muted"]);
export const tradingSwapStatusEnum = pgEnum("trading_swap_status", [
  "quote_requested",
  "quote_ready",
  "approval_submitted",
  "submitted",
  "failed",
]);
export const bundleLabelEnum = pgEnum("bundle_label", ["bundled", "organic", "suspicious", "unknown"]);

export const verificationRequestsTable = pgTable(
  "verification_requests",
  {
    id: text("id").primaryKey(),
    projectName: text("project_name").notNull(),
    contractAddress: text("contract_address").notNull(),
    chain: verificationChainEnum("chain").notNull(),
    officialTwitter: text("official_twitter").notNull(),
    officialTelegram: text("official_telegram").notNull(),
    website: text("website").notNull(),
    description: text("description").notNull(),
    contact: text("contact").notNull(),
    tier: verificationTierEnum("tier").notNull(),
    status: verificationStatusEnum("status").notNull(),
    badge: verificationBadgeEnum("badge"),
    autoScanScore: integer("auto_scan_score").notNull(),
    rejectionReason: text("rejection_reason"),
    reviewWindowHours: integer("review_window_hours").notNull(),
    antiCloneProtection: boolean("anti_clone_protection").notNull().default(true),
    notificationState: verificationNotificationStateEnum("notification_state").notNull().default("queued"),
    timeline: jsonb("timeline").$type<VerificationTimelineDbEvent[]>().notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("verification_requests_chain_contract_idx").on(table.chain, table.contractAddress),
    index("verification_requests_status_idx").on(table.status),
    index("verification_requests_tier_idx").on(table.tier),
  ],
);

export const userAlphaPointsTable = pgTable("user_alpha_points", {
  userId: text("user_id").primaryKey(),
  balance: integer("balance").notNull(),
  welcomeGrant: integer("welcome_grant").notNull().default(100),
  awardedAt: timestamp("awarded_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userPointsTable = pgTable(
  "user_points",
  {
    userId: text("user_id").primaryKey(),
    referralCode: text("referral_code").notNull(),
    totalPoints: integer("total_points").notNull().default(0),
    lifetimePoints: integer("lifetime_points").notNull().default(0),
    tier: pointsTierEnum("tier").notNull().default("anon"),
    streakDays: integer("streak_days").notNull().default(0),
    lastLoginDate: date("last_login_date"),
    multiplierBps: integer("multiplier_bps").notNull().default(10000),
    multiplierExpiresAt: timestamp("multiplier_expires_at", { withTimezone: true }),
    terminalJoinedAt: timestamp("terminal_joined_at", { withTimezone: true }),
    telegramJoinedAt: timestamp("telegram_joined_at", { withTimezone: true }),
    firstWalletConnectedAt: timestamp("first_wallet_connected_at", { withTimezone: true }),
    firstWalletTrackedAt: timestamp("first_wallet_tracked_at", { withTimezone: true }),
    firstTelegramAlertAt: timestamp("first_telegram_alert_at", { withTimezone: true }),
    firstReferralAt: timestamp("first_referral_at", { withTimezone: true }),
    profileCompletedAt: timestamp("profile_completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("user_points_referral_code_idx").on(table.referralCode),
    index("user_points_total_points_idx").on(table.totalPoints),
    index("user_points_tier_idx").on(table.tier),
  ],
);

export const pointsLedgerTable = pgTable(
  "points_ledger",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull(),
    action: text("action").notNull(),
    source: text("source").notNull().default("system"),
    basePoints: integer("base_points").notNull(),
    multiplierBps: integer("multiplier_bps").notNull().default(10000),
    points: integer("points").notNull(),
    relatedUserId: text("related_user_id"),
    relatedEntityId: text("related_entity_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    metadata: jsonb("metadata").$type<PointsLedgerMetadata>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("points_ledger_user_idempotency_idx").on(table.userId, table.idempotencyKey),
    index("points_ledger_user_created_idx").on(table.userId, table.createdAt),
    index("points_ledger_action_created_idx").on(table.action, table.createdAt),
    index("points_ledger_related_user_idx").on(table.relatedUserId),
  ],
);

export const referralsTable = pgTable(
  "referrals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    referrerId: text("referrer_id").notNull(),
    refereeId: text("referee_id").notNull(),
    source: referralSourceEnum("source").notNull().default("terminal"),
    isActive: boolean("is_active").notNull().default(true),
    totalPassivePoints: integer("total_passive_points").notNull().default(0),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    active7dAwardedAt: timestamp("active_7d_awarded_at", { withTimezone: true }),
    active30dAwardedAt: timestamp("active_30d_awarded_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("referrals_referee_unique_idx").on(table.refereeId),
    uniqueIndex("referrals_referrer_referee_unique_idx").on(table.referrerId, table.refereeId),
    index("referrals_referrer_joined_idx").on(table.referrerId, table.joinedAt),
  ],
);

export const referralTiersTable = pgTable("referral_tiers", {
  userId: text("user_id").primaryKey(),
  tier: referralTierEnum("tier").notNull().default("starter"),
  totalReferrals: integer("total_referrals").notNull().default(0),
  activeReferrals: integer("active_referrals").notNull().default(0),
  bonusBps: integer("bonus_bps").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userWatchlistItemsTable = pgTable(
  "user_watchlist_items",
  {
    userId: text("user_id").notNull(),
    marketId: text("market_id").notNull(),
    market: jsonb("market").$type<WatchlistMarketSnapshot>().notNull(),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.marketId] }),
    index("user_watchlist_items_user_updated_idx").on(table.userId, table.updatedAt),
    index("user_watchlist_items_market_idx").on(table.marketId),
  ],
);

export const trackedWalletsTable = pgTable(
  "tracked_wallets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    chain: walletTrackerChainEnum("chain").notNull(),
    address: text("address").notNull(),
    addressNormalized: text("address_normalized").notNull(),
    label: text("label"),
    source: text("source").notNull().default("user"),
    score: integer("score"),
    riskLevel: text("risk_level"),
    tags: jsonb("tags").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    metadata: jsonb("metadata").$type<WalletTrackerMetadata>().notNull().default(sql`'{}'::jsonb`),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("tracked_wallets_chain_address_idx").on(table.chain, table.addressNormalized),
    index("tracked_wallets_source_idx").on(table.source),
    index("tracked_wallets_last_active_idx").on(table.lastActiveAt),
  ],
);

export const userTrackedWalletsTable = pgTable(
  "user_tracked_wallets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull(),
    walletId: uuid("wallet_id").notNull(),
    label: text("label"),
    alertMode: walletAlertModeEnum("alert_mode").notNull().default("alerts_only"),
    telegramEnabled: boolean("telegram_enabled").notNull().default(true),
    browserEnabled: boolean("browser_enabled").notNull().default(false),
    minUsdCents: integer("min_usd_cents").notNull().default(0),
    alertTypes: jsonb("alert_types").$type<WalletTransactionTypeRecord[]>().notNull().default(sql`'[]'::jsonb`),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("user_tracked_wallets_user_wallet_idx").on(table.userId, table.walletId),
    index("user_tracked_wallets_user_updated_idx").on(table.userId, table.updatedAt),
  ],
);

export const walletTransactionsTable = pgTable(
  "wallet_transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    walletId: uuid("wallet_id").notNull(),
    chain: walletTrackerChainEnum("chain").notNull(),
    signature: text("signature").notNull(),
    type: walletTransactionTypeEnum("type").notNull().default("unknown"),
    tokenAddress: text("token_address"),
    tokenSymbol: text("token_symbol"),
    tokenName: text("token_name"),
    amountRaw: text("amount_raw"),
    tokenAmount: text("token_amount"),
    amountUsdCents: integer("amount_usd_cents"),
    usdValueSource: text("usd_value_source"),
    tradeConfidence: integer("trade_confidence").notNull().default(0),
    realizedPnlUsdCents: integer("realized_pnl_usd_cents"),
    costBasisUsdCents: integer("cost_basis_usd_cents"),
    positionQuantityBefore: numeric("position_quantity_before", { precision: 48, scale: 18 }),
    positionQuantityAfter: numeric("position_quantity_after", { precision: 48, scale: 18 }),
    counterparty: text("counterparty"),
    dex: text("dex"),
    programId: text("program_id"),
    blockRef: text("block_ref"),
    metadata: jsonb("metadata").$type<WalletTrackerMetadata>().notNull().default(sql`'{}'::jsonb`),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("wallet_transactions_chain_signature_wallet_idx").on(table.chain, table.signature, table.walletId),
    index("wallet_transactions_wallet_occurred_idx").on(table.walletId, table.occurredAt),
    index("wallet_transactions_token_idx").on(table.tokenAddress),
    index("wallet_transactions_type_idx").on(table.type),
  ],
);

export const walletTokenPositionsTable = pgTable(
  "wallet_token_positions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    walletId: uuid("wallet_id").notNull(),
    chain: walletTrackerChainEnum("chain").notNull(),
    tokenAddress: text("token_address").notNull(),
    tokenSymbol: text("token_symbol"),
    tokenName: text("token_name"),
    quantity: numeric("quantity", { precision: 48, scale: 18 }).notNull().default("0"),
    costBasisUsdCents: integer("cost_basis_usd_cents").notNull().default(0),
    realizedPnlUsdCents: integer("realized_pnl_usd_cents").notNull().default(0),
    buyVolumeUsdCents: integer("buy_volume_usd_cents").notNull().default(0),
    sellVolumeUsdCents: integer("sell_volume_usd_cents").notNull().default(0),
    buyCount: integer("buy_count").notNull().default(0),
    sellCount: integer("sell_count").notNull().default(0),
    winningSellCount: integer("winning_sell_count").notNull().default(0),
    lastTradeAt: timestamp("last_trade_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("wallet_token_positions_wallet_token_idx").on(table.walletId, table.chain, table.tokenAddress),
    index("wallet_token_positions_wallet_updated_idx").on(table.walletId, table.updatedAt),
    index("wallet_token_positions_token_idx").on(table.tokenAddress),
  ],
);

export const walletAlertLogTable = pgTable(
  "wallet_alert_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull(),
    walletId: uuid("wallet_id").notNull(),
    transactionId: uuid("transaction_id"),
    channel: text("channel").notNull(),
    status: walletAlertStatusEnum("status").notNull().default("queued"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (table) => [
    index("wallet_alert_log_user_created_idx").on(table.userId, table.createdAt),
    index("wallet_alert_log_status_idx").on(table.status),
  ],
);

export const walletBackfillRunsTable = pgTable(
  "wallet_backfill_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull(),
    walletId: uuid("wallet_id").notNull(),
    provider: text("provider").notNull(),
    chain: walletTrackerChainEnum("chain").notNull(),
    status: walletBackfillStatusEnum("status").notNull().default("running"),
    requestedLimit: integer("requested_limit").notNull(),
    received: integer("received").notNull().default(0),
    insertedTransactions: integer("inserted_transactions").notNull().default(0),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    index("wallet_backfill_runs_user_started_idx").on(table.userId, table.startedAt),
    index("wallet_backfill_runs_wallet_started_idx").on(table.walletId, table.startedAt),
    index("wallet_backfill_runs_status_idx").on(table.status),
  ],
);

export const telegramAccountsTable = pgTable(
  "telegram_accounts",
  {
    telegramUserId: text("telegram_user_id").primaryKey(),
    pointsUserId: text("points_user_id").notNull(),
    linkedUserId: text("linked_user_id"),
    chatId: text("chat_id").notNull(),
    username: text("username"),
    firstName: text("first_name"),
    lastName: text("last_name"),
    pendingReferralCode: text("pending_referral_code"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    lastCommandAt: timestamp("last_command_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("telegram_accounts_points_user_idx").on(table.pointsUserId),
    index("telegram_accounts_linked_user_idx").on(table.linkedUserId),
    index("telegram_accounts_chat_idx").on(table.chatId),
  ],
);

export const telegramLinkCodesTable = pgTable(
  "telegram_link_codes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull(),
    codeHash: text("code_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    usedByTelegramUserId: text("used_by_telegram_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("telegram_link_codes_hash_idx").on(table.codeHash),
    index("telegram_link_codes_user_created_idx").on(table.userId, table.createdAt),
  ],
);

export const userNotificationsTable = pgTable(
  "user_notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull(),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    readState: notificationReadStateEnum("read_state").notNull().default("unread"),
    payload: jsonb("payload").$type<NotificationPayload>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (table) => [
    index("user_notifications_user_created_idx").on(table.userId, table.createdAt),
    index("user_notifications_user_state_idx").on(table.userId, table.readState),
  ],
);

export const userPushSubscriptionsTable = pgTable(
  "user_push_subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull(),
    endpoint: text("endpoint").notNull(),
    endpointHash: text("endpoint_hash").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    contentEncoding: text("content_encoding").notNull().default("aes128gcm"),
    userAgent: text("user_agent"),
    metadata: jsonb("metadata").$type<PushSubscriptionMetadata>().notNull().default(sql`'{}'::jsonb`),
    isEnabled: boolean("is_enabled").notNull().default(true),
    failureCount: integer("failure_count").notNull().default(0),
    lastError: text("last_error"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSentAt: timestamp("last_sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("user_push_subscriptions_user_endpoint_idx").on(table.userId, table.endpointHash),
    index("user_push_subscriptions_user_enabled_idx").on(table.userId, table.isEnabled),
    index("user_push_subscriptions_updated_idx").on(table.updatedAt),
  ],
);

export const tradingSwapAuditsTable = pgTable(
  "trading_swap_audits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull(),
    provider: text("provider").notNull(),
    chainId: text("chain_id").notNull(),
    walletAddress: text("wallet_address").notNull(),
    tokenAddress: text("token_address").notNull(),
    pairAddress: text("pair_address"),
    side: text("side").notNull(),
    inputSymbol: text("input_symbol"),
    outputSymbol: text("output_symbol"),
    inputAmount: text("input_amount").notNull(),
    inputAmountRaw: text("input_amount_raw"),
    outputAmount: text("output_amount"),
    outputAmountRaw: text("output_amount_raw"),
    slippageBps: integer("slippage_bps").notNull(),
    priceImpactPct: text("price_impact_pct"),
    status: tradingSwapStatusEnum("status").notNull().default("quote_requested"),
    quotePayload: jsonb("quote_payload").$type<TradingQuotePayload>().notNull().default(sql`'{}'::jsonb`),
    safetyPayload: jsonb("safety_payload").$type<TradingSafetyPayload>().notNull().default(sql`'{}'::jsonb`),
    approvalTransactionHash: text("approval_transaction_hash"),
    transactionHash: text("transaction_hash"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
  },
  (table) => [
    index("trading_swap_audits_user_created_idx").on(table.userId, table.createdAt),
    index("trading_swap_audits_wallet_created_idx").on(table.walletAddress, table.createdAt),
    index("trading_swap_audits_chain_token_idx").on(table.chainId, table.tokenAddress),
    index("trading_swap_audits_status_idx").on(table.status),
  ],
);

export const walletWebhookEventsTable = pgTable(
  "wallet_webhook_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    provider: text("provider").notNull(),
    eventId: text("event_id").notNull(),
    chain: walletTrackerChainEnum("chain").notNull(),
    matchedWalletCount: integer("matched_wallet_count").notNull().default(0),
    signatureVerified: boolean("signature_verified").notNull().default(false),
    providerDeliveryId: text("provider_delivery_id"),
    payload: jsonb("payload").$type<WalletTrackerMetadata>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("wallet_webhook_events_provider_event_idx").on(table.provider, table.eventId),
    index("wallet_webhook_events_chain_created_idx").on(table.chain, table.createdAt),
  ],
);

export const bundleAnalysisTable = pgTable(
  "bundle_analysis",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    chain: text("chain").notNull(),
    tokenAddress: text("token_address").notNull(),
    tokenAddressNormalized: text("token_address_normalized").notNull(),
    pairAddress: text("pair_address"),
    label: bundleLabelEnum("label").notNull().default("unknown"),
    score: integer("score").notNull().default(0),
    coordinatedWallets: integer("coordinated_wallets").notNull().default(0),
    supplySnipedPct: numeric("supply_sniped_pct", { precision: 9, scale: 4 }).notNull().default("0"),
    sniperWallets: integer("sniper_wallets").notNull().default(0),
    deployerRugs: integer("deployer_rugs").notNull().default(0),
    bundleWalletsPnl: numeric("bundle_wallets_pnl", { precision: 12, scale: 4 }),
    retailAvgPnl: numeric("retail_avg_pnl", { precision: 12, scale: 4 }),
    bundleStillHolding: boolean("bundle_still_holding").notNull().default(true),
    evidence: jsonb("evidence").$type<BundleEvidencePayload>().notNull().default(sql`'{}'::jsonb`),
    reasons: jsonb("reasons").$type<BundleReasonPayload[]>().notNull().default(sql`'[]'::jsonb`),
    analyzedAt: timestamp("analysed_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("bundle_analysis_chain_token_idx").on(table.chain, table.tokenAddressNormalized),
    index("bundle_analysis_label_idx").on(table.label),
    index("bundle_analysis_score_idx").on(table.score),
    index("bundle_analysis_updated_idx").on(table.updatedAt),
  ],
);

export const bundleWalletsTable = pgTable(
  "bundle_wallets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    analysisId: uuid("analysis_id"),
    chain: text("chain").notNull(),
    tokenAddress: text("token_address").notNull(),
    tokenAddressNormalized: text("token_address_normalized").notNull(),
    walletAddress: text("wallet_address").notNull(),
    walletAddressNormalized: text("wallet_address_normalized").notNull(),
    blockNumber: numeric("block_number", { precision: 30, scale: 0 }),
    buyAmountNative: numeric("buy_amount_native", { precision: 48, scale: 18 }),
    buyAmountUsdCents: integer("buy_amount_usd_cents"),
    supplyPct: numeric("supply_pct", { precision: 9, scale: 4 }),
    fundingSource: text("funding_source"),
    walletAgeDays: integer("wallet_age_days"),
    isBot: boolean("is_bot").notNull().default(false),
    hasExited: boolean("has_exited").notNull().default(false),
    exitPnlPct: numeric("exit_pnl_pct", { precision: 12, scale: 4 }),
    detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("bundle_wallets_chain_token_wallet_idx").on(
      table.chain,
      table.tokenAddressNormalized,
      table.walletAddressNormalized,
    ),
    index("bundle_wallets_analysis_idx").on(table.analysisId),
    index("bundle_wallets_wallet_idx").on(table.chain, table.walletAddressNormalized),
    index("bundle_wallets_exit_idx").on(table.hasExited),
  ],
);

export const holderPnlSnapshotsTable = pgTable(
  "holder_pnl_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    chain: text("chain").notNull(),
    tokenAddress: text("token_address").notNull(),
    tokenAddressNormalized: text("token_address_normalized").notNull(),
    inProfitPct: numeric("in_profit_pct", { precision: 9, scale: 4 }),
    breakevenPct: numeric("breakeven_pct", { precision: 9, scale: 4 }),
    inLossPct: numeric("in_loss_pct", { precision: 9, scale: 4 }),
    bundlePnl: numeric("bundle_pnl", { precision: 12, scale: 4 }),
    retailPnl: numeric("retail_pnl", { precision: 12, scale: 4 }),
    snapshotAt: timestamp("snapshot_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("holder_pnl_snapshots_token_time_idx").on(table.chain, table.tokenAddressNormalized, table.snapshotAt),
  ],
);

export const sniperRegistryTable = pgTable(
  "sniper_registry",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    chain: text("chain").notNull(),
    walletAddress: text("wallet_address").notNull(),
    walletAddressNormalized: text("wallet_address_normalized").notNull(),
    snipeCount: integer("snipe_count").notNull().default(1),
    rugRate: numeric("rug_rate", { precision: 9, scale: 4 }),
    isBot: boolean("is_bot").notNull().default(false),
    firstSeen: timestamp("first_seen", { withTimezone: true }).notNull().defaultNow(),
    lastSeen: timestamp("last_seen", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("sniper_registry_chain_wallet_idx").on(table.chain, table.walletAddressNormalized),
    index("sniper_registry_last_seen_idx").on(table.lastSeen),
    index("sniper_registry_snipe_count_idx").on(table.snipeCount),
  ],
);

export const xTrackedAccountsTable = pgTable(
  "x_tracked_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    handle: text("handle").notNull(),
    handleNormalized: text("handle_normalized").notNull(),
    xUserId: text("x_user_id"),
    displayName: text("display_name"),
    avatarUrl: text("avatar_url"),
    profileUrl: text("profile_url"),
    source: text("source").notNull().default("user"),
    metadata: jsonb("metadata").$type<XAccountMetadata>().notNull().default(sql`'{}'::jsonb`),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastPostAt: timestamp("last_post_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("x_tracked_accounts_handle_idx").on(table.handleNormalized),
    index("x_tracked_accounts_user_id_idx").on(table.xUserId),
    index("x_tracked_accounts_last_post_idx").on(table.lastPostAt),
  ],
);

export const userXAccountSubscriptionsTable = pgTable(
  "user_x_account_subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull(),
    xAccountId: uuid("x_account_id").notNull(),
    alertMode: xAlertModeEnum("alert_mode").notNull().default("token_mentions"),
    telegramEnabled: boolean("telegram_enabled").notNull().default(true),
    browserEnabled: boolean("browser_enabled").notNull().default(true),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("user_x_account_subscriptions_user_account_idx").on(table.userId, table.xAccountId),
    index("user_x_account_subscriptions_user_updated_idx").on(table.userId, table.updatedAt),
  ],
);

export const xPostsTable = pgTable(
  "x_posts",
  {
    id: text("id").primaryKey(),
    xAccountId: uuid("x_account_id"),
    authorId: text("author_id"),
    authorHandle: text("author_handle"),
    text: text("text").notNull(),
    url: text("url"),
    lang: text("lang"),
    publicMetrics: jsonb("public_metrics").$type<XPostMetrics>().notNull().default(sql`'{}'::jsonb`),
    metadata: jsonb("metadata").$type<XPostMetadata>().notNull().default(sql`'{}'::jsonb`),
    postedAt: timestamp("posted_at", { withTimezone: true }).notNull(),
    ingestedAt: timestamp("ingested_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("x_posts_account_posted_idx").on(table.xAccountId, table.postedAt),
    index("x_posts_author_idx").on(table.authorHandle),
    index("x_posts_posted_idx").on(table.postedAt),
  ],
);

export const xTokenMentionsTable = pgTable(
  "x_token_mentions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    postId: text("post_id").notNull(),
    tokenSymbol: text("token_symbol"),
    contractAddress: text("contract_address"),
    chain: text("chain"),
    confidence: integer("confidence").notNull().default(50),
    source: text("source").notNull().default("regex"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("x_token_mentions_post_idx").on(table.postId),
    index("x_token_mentions_symbol_idx").on(table.tokenSymbol),
    index("x_token_mentions_contract_idx").on(table.contractAddress),
  ],
);

export const xSocialAlertsTable = pgTable(
  "x_social_alerts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull(),
    xAccountId: uuid("x_account_id"),
    postId: text("post_id"),
    mentionId: uuid("mention_id"),
    channel: text("channel").notNull(),
    status: walletAlertStatusEnum("status").notNull().default("queued"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (table) => [
    index("x_social_alerts_user_created_idx").on(table.userId, table.createdAt),
    index("x_social_alerts_post_idx").on(table.postId),
  ],
);

export const xWebhookEventsTable = pgTable(
  "x_webhook_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: text("event_id").notNull(),
    signatureVerified: boolean("signature_verified").notNull().default(false),
    payload: jsonb("payload").$type<XWebhookPayload>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("x_webhook_events_event_idx").on(table.eventId),
    index("x_webhook_events_created_idx").on(table.createdAt),
  ],
);

export type VerificationRequestRow = typeof verificationRequestsTable.$inferSelect;
export type UserAlphaPointsRow = typeof userAlphaPointsTable.$inferSelect;
export type UserPointsRow = typeof userPointsTable.$inferSelect;
export type PointsLedgerRow = typeof pointsLedgerTable.$inferSelect;
export type ReferralRow = typeof referralsTable.$inferSelect;
export type ReferralTierRow = typeof referralTiersTable.$inferSelect;
export type UserWatchlistItemRow = typeof userWatchlistItemsTable.$inferSelect;
export type TrackedWalletRow = typeof trackedWalletsTable.$inferSelect;
export type UserTrackedWalletRow = typeof userTrackedWalletsTable.$inferSelect;
export type WalletTransactionRow = typeof walletTransactionsTable.$inferSelect;
export type WalletTokenPositionRow = typeof walletTokenPositionsTable.$inferSelect;
export type WalletAlertLogRow = typeof walletAlertLogTable.$inferSelect;
export type WalletBackfillRunRow = typeof walletBackfillRunsTable.$inferSelect;
export type TelegramAccountRow = typeof telegramAccountsTable.$inferSelect;
export type TelegramLinkCodeRow = typeof telegramLinkCodesTable.$inferSelect;
export type UserNotificationRow = typeof userNotificationsTable.$inferSelect;
export type UserPushSubscriptionRow = typeof userPushSubscriptionsTable.$inferSelect;
export type TradingSwapAuditRow = typeof tradingSwapAuditsTable.$inferSelect;
export type WalletWebhookEventRow = typeof walletWebhookEventsTable.$inferSelect;
export type BundleAnalysisRow = typeof bundleAnalysisTable.$inferSelect;
export type BundleWalletRow = typeof bundleWalletsTable.$inferSelect;
export type HolderPnlSnapshotRow = typeof holderPnlSnapshotsTable.$inferSelect;
export type SniperRegistryRow = typeof sniperRegistryTable.$inferSelect;
export type XTrackedAccountRow = typeof xTrackedAccountsTable.$inferSelect;
export type UserXAccountSubscriptionRow = typeof userXAccountSubscriptionsTable.$inferSelect;
export type XPostRow = typeof xPostsTable.$inferSelect;
export type XTokenMentionRow = typeof xTokenMentionsTable.$inferSelect;
export type XSocialAlertRow = typeof xSocialAlertsTable.$inferSelect;
export type XWebhookEventRow = typeof xWebhookEventsTable.$inferSelect;
