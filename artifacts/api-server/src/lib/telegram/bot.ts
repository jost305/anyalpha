import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { getOrCreateAlphaPointsAccount, getPointsDashboard } from "../auth/alpha-points-store";
import { answerTelegramCallbackQuery, publishTelegramMessage, publishTelegramPhoto } from "../alerts/telegram";
import { getMarketListings } from "../markets/dexscreener";
import type { MarketToken } from "../markets/types";
import { listUserNotifications } from "../notifications/store";
import { listTwitterTrack, trackXAccount } from "../twitter-track/store";
import { addTrackedWallet, listWalletTracker, type WalletTrackerChain } from "../wallet-tracker/store";
import { consumeTelegramLinkCode } from "./linking";

interface TelegramUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
}

interface TelegramChat {
  id: number | string;
  type?: string;
}

interface TelegramMessage {
  message_id?: number;
  text?: string;
  from?: TelegramUser;
  chat?: TelegramChat;
}

interface TelegramCallbackQuery {
  id: string;
  data?: string;
  from?: TelegramUser;
  message?: TelegramMessage;
}

export interface TelegramUpdate {
  update_id?: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

export interface TelegramBotResult {
  handled: boolean;
  reason?: string;
  chatId?: string;
  pointsUserId?: string;
}

type DbModule = typeof import("@workspace/db");

let dbModulePromise: Promise<DbModule> | null = null;

async function getDbModule(): Promise<DbModule> {
  if (dbModulePromise) return dbModulePromise;

  dbModulePromise = (async () => {
    const databaseUrl = (process.env["DATABASE_URL"] ?? "").trim();

    if (!databaseUrl) {
      throw new Error("DATABASE_URL must be configured to use Telegram account storage.");
    }

    return import("@workspace/db");
  })();

  return dbModulePromise;
}

function cleanReferralCode(value: string | null | undefined): string | null {
  const normalized = value?.trim().replace(/^ref_/i, "");
  if (!normalized || !/^[a-zA-Z0-9_-]{3,32}$/.test(normalized)) return null;
  return normalized;
}

function commandFromText(text: string): { command: string; args: string[] } {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  const rawCommand = parts[0]?.split("@")[0]?.toLowerCase() ?? "";

  return {
    command: rawCommand,
    args: parts.slice(1),
  };
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function shortId(value: string): string {
  if (value.length <= 16) return value;
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function helpText(): string {
  return [
    "AnyAlpha Bot",
    "",
    "Commands:",
    "/menu - open the main bot menu",
    "/scan QUERY - scan a token, pair, symbol, contract, or chain",
    "/watch CHAIN WALLET [LABEL] - track a wallet on your linked AnyAlpha account",
    "/wallets - list tracked wallets",
    "/trackx @handle - track an X account on Twitter Track",
    "/xfeed - latest posts from tracked X accounts",
    "/mentions TOKEN - posts mentioning a token or contract",
    "/alerts - show recent account alerts",
    "/points - view your Alpha Points balance",
    "/link CODE - sync Telegram with your AnyAlpha account",
    "/mylink - get your referral links",
    "/referrals - view referral stats",
    "/settings - view sync and trading status",
    "/leaderboard - top Alpha Points accounts",
    "/help - show this menu",
  ].join("\n");
}

async function upsertTelegramAccount(message: TelegramMessage, referralCode: string | null) {
  const from = message.from;
  const chat = message.chat;

  if (!from || !chat) {
    throw new Error("Telegram update is missing sender or chat metadata.");
  }

  const { db, telegramAccountsTable } = await getDbModule();
  const telegramUserId = String(from.id);
  const chatId = String(chat.id);
  const pointsUserId = `telegram:${telegramUserId}`;
  const now = new Date();
  const rows = await db
    .insert(telegramAccountsTable)
    .values({
      telegramUserId,
      pointsUserId,
      chatId,
      username: from.username ?? null,
      firstName: from.first_name ?? null,
      lastName: from.last_name ?? null,
      pendingReferralCode: referralCode,
      updatedAt: now,
      lastCommandAt: now,
    })
    .onConflictDoUpdate({
      target: telegramAccountsTable.telegramUserId,
      set: {
        chatId,
        username: from.username ?? null,
        firstName: from.first_name ?? null,
        lastName: from.last_name ?? null,
        pendingReferralCode: referralCode,
        updatedAt: now,
        lastCommandAt: now,
      },
    })
    .returning();

  const account = rows[0];
  if (!account) {
    const existing = await db
      .select()
      .from(telegramAccountsTable)
      .where(eq(telegramAccountsTable.telegramUserId, telegramUserId))
      .limit(1);

    if (!existing[0]) throw new Error("Telegram account could not be saved.");
    return existing[0];
  }

  return account;
}

async function reply(chatId: string, text: string) {
  await publishTelegramMessage(text, { chatId });
}

function botBannerPath(): string | null {
  const configured = process.env["TELEGRAM_BOT_BANNER_PATH"]?.trim();
  const candidates = configured
    ? [resolve(process.cwd(), configured)]
    : [
        resolve(process.cwd(), "assets/telegram-bot-banner.jpg"),
        resolve(process.cwd(), "artifacts/api-server/assets/telegram-bot-banner.jpg"),
      ];

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function mainMenuButtons() {
  return [
    [
      { text: "\u{1F50E} Scan", callbackData: "menu:scan" },
      { text: "\u{1F441} Watch", callbackData: "menu:watch" },
    ],
    [
      { text: "\u{1F4BC} Wallets", callbackData: "menu:wallets" },
      { text: "\u{1F514} Alerts", callbackData: "menu:alerts" },
    ],
    [
      { text: "\u{2728} Points", callbackData: "menu:points" },
      { text: "\u{1F517} Referrals", callbackData: "menu:referrals" },
    ],
    [
      { text: "\u{2699} Settings", callbackData: "menu:settings" },
      { text: "\u{1F512} Buy/Sell Locked", callbackData: "menu:trade_locked" },
    ],
  ];
}

async function sendMainMenu(chatId: string, linked: boolean) {
  const caption = [
    "\u{1F44B} Welcome to AnyAlpha Terminal!",
    "",
    linked
      ? "\u{2705} Your Telegram is synced with your AnyAlpha account."
      : "\u{26A1} Start with live scans now. Sync from the web app to unlock account features.",
    "",
    "Here are some features you can use:",
    "\u{1F680} Fast token and pair discovery",
    "\u{1F6E1} Live risk and market context",
    "\u{1F4BC} Wallet tracking and trader watchlists",
    "\u{1F4CA} Charts, liquidity, volume, and stats",
    "\u{1F514} Telegram alerts for tracked activity",
    "\u{2728} AnyAlpha Points and referrals",
    "\u{1F517} Telegram-web account sync",
    "",
    "\u{1F4D8} Use /menu to open the command panel.",
    "\u{1F9ED} Use /scan PEPE, /scan base, or paste a contract below.",
    "",
    "\u{1F512} Buy/Sell is locked until trading security is ready.",
    "",
    "Ready to find alpha?",
    "Enter a contract address, token name, ticker, wallet, or command below \u{1F447}",
  ].join("\n");
  const buttons = mainMenuButtons();
  const photoPath = botBannerPath();

  if (photoPath) {
    try {
      await publishTelegramPhoto({
        chatId,
        photoPath,
        caption,
        buttons,
      });
      return;
    } catch {
      // If Telegram rejects the image upload, keep the bot usable with the text menu.
    }
  }

  await publishTelegramMessage(caption, {
    chatId,
    buttons,
  });
}

function fmtCompact(value: number | null | undefined, currency = false): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/a";
  const formatted = new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
  return currency ? `$${formatted}` : formatted;
}

function fmtPct(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/a";
  return `${value >= 0 ? "+" : ""}${value.toFixed(Math.abs(value) >= 100 ? 0 : 1)}%`;
}

function marketLabel(token: MarketToken): string {
  return `${token.symbol}/${token.quoteSymbol || token.chainLabel}`;
}

function tokenDashboardUrl(token: MarketToken): string {
  const base =
    process.env["ANYALPHA_PUBLIC_URL"]?.trim() ??
    process.env["PUBLIC_APP_URL"]?.trim() ??
    "https://anyalpha.xyz";
  const normalizedBase = /^https?:\/\//i.test(base) ? base.replace(/\/+$/, "") : `https://${base.replace(/\/+$/, "")}`;

  return `${normalizedBase}?chain=${encodeURIComponent(token.chainId)}&token=${encodeURIComponent(token.tokenAddress)}`;
}

async function sendScan(chatId: string, query: string) {
  const trimmed = query.trim();
  if (!trimmed) {
    await publishTelegramMessage(
      ["Scan", "", "Send a symbol, chain, project, pair, or contract:", "", "/scan PEPE", "/scan base", "/scan <contract>"].join("\n"),
      { chatId },
    );
    return;
  }

  const markets = await getMarketListings({ q: trimmed, limit: 5, enrich: true });
  const top = markets.data.slice(0, 5);

  if (top.length === 0) {
    await reply(chatId, `No live market matches found for "${trimmed}".`);
    return;
  }

  const lines = ["Scan results", "", ...top.map((token, index) => {
    return [
      `${index + 1}. ${marketLabel(token)} on ${token.chainLabel}`,
      `Price ${token.priceUsd ? `$${token.priceUsd}` : "n/a"} | 24h ${fmtPct(token.priceChange.h24)} | Vol ${fmtCompact(token.volume.h24, true)}`,
      `Liq ${fmtCompact(token.liquidityUsd, true)} | MCap ${fmtCompact(token.marketCap ?? token.fdv, true)} | Score ${token.signalScore}`,
    ].join("\n");
  })];

  await publishTelegramMessage(lines.join("\n\n"), {
    chatId,
    buttons: top.slice(0, 3).map((token) => [
      { text: `Open ${token.symbol}`, url: tokenDashboardUrl(token) },
    ]),
  });
}

function parseChain(value: string | undefined): WalletTrackerChain | null {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "sol" || normalized === "solana") return "solana";
  if (normalized === "eth" || normalized === "ethereum") return "ethereum";
  if (normalized === "base") return "base";
  if (normalized === "arb" || normalized === "arbitrum") return "arbitrum";
  if (normalized === "bsc" || normalized === "bnb" || normalized === "binance") return "bsc";
  if (normalized === "poly" || normalized === "polygon" || normalized === "matic") return "polygon";
  if (normalized === "op" || normalized === "opt" || normalized === "optimism") return "optimism";
  if (normalized === "sui") return "sui";
  if (normalized === "apt" || normalized === "aptos") return "aptos";
  return null;
}

function requireLinkedUser(chatId: string, linkedUserId: string | null): linkedUserId is string {
  if (linkedUserId) return true;

  void publishTelegramMessage(
    [
      "Sync required",
      "",
      "This action needs your Telegram linked to your AnyAlpha account.",
      "Open AnyAlpha > Points > Telegram Sync > Generate, then send /link CODE here.",
    ].join("\n"),
    { chatId },
  ).catch(() => {});

  return false;
}

async function sendWatch(chatId: string, linkedUserId: string | null, args: string[]) {
  if (!requireLinkedUser(chatId, linkedUserId)) return;

  const chain = parseChain(args[0]);
  const address = args[1]?.trim();
  const label = args.slice(2).join(" ").trim() || null;

  if (!chain || !address) {
    await reply(
      chatId,
      [
        "Watch",
        "",
        "Track a wallet on your linked AnyAlpha account:",
        "/watch solana <wallet> Smart Money",
        "/watch base <wallet> Base whale",
        "/watch bsc <wallet> BSC whale",
        "/watch sui <wallet> Sui wallet",
        "",
        "Supported chains: solana, ethereum, base, arbitrum, bsc, polygon, optimism, sui, aptos.",
      ].join("\n"),
    );
    return;
  }

  const wallet = await addTrackedWallet(linkedUserId, {
    chain,
    address,
    label,
    alertMode: "alerts_only",
  });

  await reply(
    chatId,
    [
      "Wallet added to Watcher",
      "",
      `${wallet.label ?? wallet.address}`,
      `${wallet.chain} | ${shortId(wallet.address)}`,
      "",
      "You will receive Telegram alerts here after provider webhooks detect activity.",
    ].join("\n"),
  );
}

async function sendWallets(chatId: string, linkedUserId: string | null) {
  if (!requireLinkedUser(chatId, linkedUserId)) return;

  const snapshot = await listWalletTracker(linkedUserId);
  if (snapshot.wallets.length === 0) {
    await reply(chatId, ["Wallets", "", "No tracked wallets yet.", "Add one with /watch solana <wallet> Label"].join("\n"));
    return;
  }

  await reply(
    chatId,
    [
      `Tracked wallets (${snapshot.total})`,
      "",
      ...snapshot.wallets.slice(0, 12).map((wallet, index) => {
        const activity = wallet.lastActiveAt ? `last active ${new Date(wallet.lastActiveAt).toLocaleString("en-US")}` : "waiting for activity";
        const pnl = fmtCompact(wallet.performance.realizedPnlUsdCents / 100, true);
        const winRate = wallet.performance.winRate === null ? "n/a" : `${wallet.performance.winRate}%`;
        return `${index + 1}. ${wallet.label ?? shortId(wallet.address)}\n${wallet.chain} | ${shortId(wallet.address)} | ${activity}\nPnL ${pnl} | win ${winRate} | buys ${wallet.performance.buyCount} / sells ${wallet.performance.sellCount}`;
      }),
    ].join("\n\n"),
  );
}

function formatXMentions(mentions: Array<{ tokenSymbol: string | null; contractAddress: string | null }>): string {
  const labels = mentions
    .map((mention) => mention.tokenSymbol ? `$${mention.tokenSymbol}` : mention.contractAddress ? shortId(mention.contractAddress) : null)
    .filter((label): label is string => Boolean(label));

  return labels.length > 0 ? labels.slice(0, 4).join(", ") : "no token mentions";
}

function formatXPostLine(
  post: {
    authorHandle: string | null;
    text: string;
    url: string | null;
    postedAt: string;
    mentions: Array<{ tokenSymbol: string | null; contractAddress: string | null }>;
  },
  index: number,
): string {
  const trimmed = post.text.length > 180 ? `${post.text.slice(0, 177)}...` : post.text;
  const date = new Date(post.postedAt).toLocaleString("en-US");
  return [
    `${index + 1}. ${post.authorHandle ?? "Tracked X account"} | ${date}`,
    trimmed,
    `Mentions: ${formatXMentions(post.mentions)}`,
    post.url ?? null,
  ].filter((line): line is string => Boolean(line)).join("\n");
}

async function sendTrackX(chatId: string, linkedUserId: string | null, args: string[]) {
  if (!requireLinkedUser(chatId, linkedUserId)) return;

  const handle = args[0]?.trim();
  if (!handle) {
    await reply(
      chatId,
      [
        "Twitter Track",
        "",
        "Track an X account on your linked AnyAlpha account:",
        "/trackx @handle",
        "",
        "Alerts are token-mention focused by default so the bot stays useful instead of noisy.",
      ].join("\n"),
    );
    return;
  }

  try {
    const account = await trackXAccount(linkedUserId, {
      handle,
      alertMode: "token_mentions",
      telegramEnabled: true,
      browserEnabled: true,
    });

    await reply(
      chatId,
      [
        "X account tracked",
        "",
        `${account.handle}`,
        "Telegram + browser alerts are on for token mentions.",
        "",
        "Use /xfeed for captured posts or /mentions TOKEN for a token-specific view.",
      ].join("\n"),
    );
  } catch (err) {
    await reply(chatId, err instanceof Error ? err.message : "That X account could not be tracked.");
  }
}

async function sendXFeed(chatId: string, linkedUserId: string | null) {
  if (!requireLinkedUser(chatId, linkedUserId)) return;

  const snapshot = await listTwitterTrack(linkedUserId);
  if (snapshot.accounts.length === 0) {
    await reply(chatId, ["Twitter Track", "", "No X accounts tracked yet.", "Add one with /trackx @handle"].join("\n"));
    return;
  }

  if (snapshot.posts.length === 0) {
    await reply(
      chatId,
      [
        "Twitter Track",
        "",
        `Tracking ${snapshot.accounts.length} account(s), but no live X posts have been ingested yet.`,
        "Posts will appear here after the official X webhook or stream delivers activity.",
      ].join("\n"),
    );
    return;
  }

  await reply(chatId, ["Latest X Track posts", "", ...snapshot.posts.slice(0, 6).map(formatXPostLine)].join("\n\n"));
}

async function sendXMentions(chatId: string, linkedUserId: string | null, args: string[]) {
  if (!requireLinkedUser(chatId, linkedUserId)) return;

  const rawQuery = args[0]?.trim();
  if (!rawQuery) {
    await reply(chatId, ["Token mentions", "", "Search captured X Track posts by symbol or contract:", "/mentions PEPE", "/mentions 0x..."].join("\n"));
    return;
  }

  const query = rawQuery.replace(/^\$/, "").toLowerCase();
  const snapshot = await listTwitterTrack(linkedUserId);
  const matches = snapshot.posts.filter((post) =>
    post.mentions.some((mention) => {
      const symbolMatch = mention.tokenSymbol?.toLowerCase() === query;
      const contractMatch = mention.contractAddress?.toLowerCase() === rawQuery.toLowerCase();
      return symbolMatch || contractMatch;
    }),
  );

  if (matches.length === 0) {
    await reply(
      chatId,
      [
        "Token mentions",
        "",
        `No captured X Track posts mention ${rawQuery} yet.`,
        "This only searches real ingested posts from accounts you track.",
      ].join("\n"),
    );
    return;
  }

  await reply(chatId, [`Mentions for ${rawQuery}`, "", ...matches.slice(0, 8).map(formatXPostLine)].join("\n\n"));
}

async function sendAlerts(chatId: string, linkedUserId: string | null) {
  if (!requireLinkedUser(chatId, linkedUserId)) return;

  const notifications = await listUserNotifications(linkedUserId, 8);
  if (notifications.length === 0) {
    await reply(chatId, ["Alerts", "", "No account alerts yet. Wallet and market alerts will appear here after live events are captured."].join("\n"));
    return;
  }

  await reply(
    chatId,
    [
      "Recent alerts",
      "",
      ...notifications.map((notification, index) => {
        return `${index + 1}. ${notification.title}\n${notification.body}\n${new Date(notification.createdAt).toLocaleString("en-US")}`;
      }),
    ].join("\n\n"),
  );
}

async function sendSettings(chatId: string, linkedUserId: string | null, pointsUserId: string) {
  await reply(
    chatId,
    [
      "Settings",
      "",
      `Account sync: ${linkedUserId ? "Linked" : "Not linked"}`,
      `Bot identity: ${linkedUserId ? "AnyAlpha account" : pointsUserId}`,
      "Trading: Locked until Buy/Sell security is ready",
      "Alerts: Telegram delivery enabled after sync",
      "",
      linkedUserId ? "Use /wallets and /alerts to manage account activity." : "Use /link CODE from the web Points page to sync.",
    ].join("\n"),
  );
}

async function sendDashboard(chatId: string, pointsUserId: string) {
  const dashboard = await getPointsDashboard(pointsUserId);
  const nextTier = dashboard.account.nextTier
    ? `Next: ${dashboard.account.nextTier.label} in ${formatNumber(dashboard.account.nextTier.pointsRemaining)} pts`
    : "Top tier reached";

  await reply(
    chatId,
    [
      "Alpha Points",
      "",
      `Balance: ${formatNumber(dashboard.account.balance)} pts`,
      `Tier: ${dashboard.account.tierLabel}`,
      `Streak: ${formatNumber(dashboard.account.streakDays)} day(s)`,
      nextTier,
      "",
      `Username: ${dashboard.account.username}`,
    ].join("\n"),
  );
}

async function sendReferralLinks(chatId: string, pointsUserId: string) {
  const dashboard = await getPointsDashboard(pointsUserId);
  const lines = [
    "Your AnyAlpha referral links",
    "",
    `Terminal: ${dashboard.referralLinks.terminal}`,
  ];

  if (dashboard.referralLinks.telegram) {
    lines.push(`Telegram: ${dashboard.referralLinks.telegram}`);
  }

  lines.push("", `Username: ${dashboard.account.username}`);
  await reply(chatId, lines.join("\n"));
}

async function sendReferralStats(chatId: string, pointsUserId: string) {
  const dashboard = await getPointsDashboard(pointsUserId);

  await reply(
    chatId,
    [
      "Referral stats",
      "",
      `Total referrals: ${formatNumber(dashboard.referralStats.totalReferrals)}`,
      `Active referrals: ${formatNumber(dashboard.referralStats.activeReferrals)}`,
      `Referral tier: ${dashboard.referralStats.referralTierLabel}`,
      `Referral points: ${formatNumber(dashboard.referralStats.referralPoints)}`,
      `Passive points: ${formatNumber(dashboard.referralStats.passivePoints)}`,
    ].join("\n"),
  );
}

async function sendLeaderboard(chatId: string, pointsUserId: string) {
  const dashboard = await getPointsDashboard(pointsUserId);
  const rows = dashboard.leaderboard.map(
    (row) => `${row.rank}. ${row.display || shortId(row.userId)} - ${formatNumber(row.totalPoints)} pts`,
  );

  await reply(chatId, ["Alpha Points leaderboard", "", ...rows].join("\n"));
}

export async function handleTelegramUpdate(update: TelegramUpdate): Promise<TelegramBotResult> {
  if (update.callback_query) {
    const callback = update.callback_query;
    const callbackMessage = callback.message;

    if (!callbackMessage?.chat || !callback.from) {
      return {
        handled: false,
        reason: "No callback chat found.",
      };
    }

    const syntheticMessage: TelegramMessage = {
      chat: callbackMessage.chat,
      from: callback.from,
      text: "/menu",
    };
    const account = await upsertTelegramAccount(syntheticMessage, null);
    const chatId = account.chatId;
    const linkedUserId = account.linkedUserId;
    const pointsUserId = linkedUserId ?? account.pointsUserId;

    await answerTelegramCallbackQuery(callback.id);

    switch (callback.data) {
      case "menu:scan":
        await sendScan(chatId, "");
        break;
      case "menu:watch":
        await sendWatch(chatId, linkedUserId, []);
        break;
      case "menu:wallets":
        await sendWallets(chatId, linkedUserId);
        break;
      case "menu:alerts":
        await sendAlerts(chatId, linkedUserId);
        break;
      case "menu:points":
        await sendDashboard(chatId, pointsUserId);
        break;
      case "menu:referrals":
        await sendReferralStats(chatId, pointsUserId);
        break;
      case "menu:settings":
        await sendSettings(chatId, linkedUserId, pointsUserId);
        break;
      case "menu:trade_locked":
        await reply(chatId, "Buy/Sell is not enabled yet. We will only unlock trading after wallet custody, confirmations, slippage, limits, and abuse controls are production-ready.");
        break;
      default:
        await sendMainMenu(chatId, Boolean(linkedUserId));
        break;
    }

    return {
      handled: true,
      chatId,
      pointsUserId,
    };
  }

  const message = update.message ?? update.edited_message;

  if (!message?.text || !message.from || !message.chat) {
    return {
      handled: false,
      reason: "No command message found.",
    };
  }

  const { command, args } = commandFromText(message.text);
  const startArg = command === "/start" ? args[0] : null;
  const linkCode =
    command === "/link"
      ? args[0]
      : typeof startArg === "string" && startArg.toLowerCase().startsWith("link_")
        ? startArg
        : null;
  const referralCode = command === "/start" && !linkCode ? cleanReferralCode(args[0]) : null;
  const account = await upsertTelegramAccount(message, referralCode);
  const chatId = account.chatId;
  let pointsUserId = account.linkedUserId ?? account.pointsUserId;

  if (linkCode) {
    const result = await consumeTelegramLinkCode(linkCode, account.telegramUserId);

    if (!result.ok) {
      await reply(
        chatId,
        result.reason === "expired"
          ? "That AnyAlpha sync code has expired. Generate a fresh code from the Points page."
          : "That AnyAlpha sync code is not valid. Generate a fresh code from the Points page and try again.",
      );

      return {
        handled: true,
        chatId,
        pointsUserId,
      };
    }

    pointsUserId = result.userId ?? pointsUserId;
    await reply(
      chatId,
      [
        "Telegram synced.",
        "",
        "This chat is now linked to your AnyAlpha account for personal alerts, wallet tracker notifications, and Alpha Points commands.",
        "",
        "Use /points to check your account.",
      ].join("\n"),
    );

    return {
      handled: true,
      chatId,
      pointsUserId,
    };
  }

  await getOrCreateAlphaPointsAccount(pointsUserId, {
    referralCode: referralCode ?? account.pendingReferralCode,
    referralSource: "telegram",
  });

  switch (command) {
    case "/start":
      if (referralCode) {
        await reply(chatId, "Referral credit was captured from your start link.");
      }

      await sendMainMenu(chatId, Boolean(account.linkedUserId));
      break;
    case "/menu":
      await sendMainMenu(chatId, Boolean(account.linkedUserId));
      break;
    case "/scan":
      await sendScan(chatId, args.join(" "));
      break;
    case "/watch":
      await sendWatch(chatId, account.linkedUserId, args);
      break;
    case "/wallets":
      await sendWallets(chatId, account.linkedUserId);
      break;
    case "/trackx":
      await sendTrackX(chatId, account.linkedUserId, args);
      break;
    case "/xfeed":
      await sendXFeed(chatId, account.linkedUserId);
      break;
    case "/mentions":
      await sendXMentions(chatId, account.linkedUserId, args);
      break;
    case "/alerts":
      await sendAlerts(chatId, account.linkedUserId);
      break;
    case "/points":
      await sendDashboard(chatId, pointsUserId);
      break;
    case "/mylink":
      await sendReferralLinks(chatId, pointsUserId);
      break;
    case "/referrals":
      await sendReferralStats(chatId, pointsUserId);
      break;
    case "/settings":
      await sendSettings(chatId, account.linkedUserId, pointsUserId);
      break;
    case "/buy":
    case "/sell":
      await reply(chatId, "Buy/Sell is not enabled yet. Trading will stay locked until wallet security, confirmations, slippage, and risk controls are ready.");
      break;
    case "/leaderboard":
      await sendLeaderboard(chatId, pointsUserId);
      break;
    case "/help":
      await reply(chatId, helpText());
      break;
    default:
      await reply(chatId, helpText());
      break;
  }

  return {
    handled: true,
    chatId,
    pointsUserId,
  };
}
