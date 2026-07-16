import { logger } from "../logger";

interface TelegramApiResponse {
  ok?: boolean;
  description?: string;
  result?: unknown;
}

const BOT_COMMANDS = [
  { command: "menu", description: "Open AnyAlpha bot menu" },
  { command: "scan", description: "Scan a token, pair, contract, or chain" },
  { command: "watch", description: "Track a wallet after account sync" },
  { command: "wallets", description: "List tracked wallets and performance" },
  { command: "trackx", description: "Track an X account after account sync" },
  { command: "xfeed", description: "Show tracked X posts" },
  { command: "mentions", description: "Search captured token mentions" },
  { command: "alerts", description: "Show recent account alerts" },
  { command: "points", description: "View Alpha Points" },
  { command: "referrals", description: "View referral stats" },
  { command: "leaderboard", description: "View rankings" },
  { command: "settings", description: "View sync and trading status" },
];

const BOT_SHORT_DESCRIPTION = "Discover tokens early, track wallets, receive alerts, and earn AnyAlpha Points.";

const BOT_DESCRIPTION = [
  "Welcome to AnyAlpha Terminal.",
  "",
  "Use Telegram to scan tokens, follow market activity, track wallets, receive alerts, view points, and manage referrals.",
  "",
  "Sync your AnyAlpha account from the web app to unlock account-aware Watcher, Wallets, Alerts, Points, and Referrals.",
  "",
  "Buy/Sell actions stay locked until AnyAlpha trading security is ready.",
].join("\n");

function telegramWebhookUrl(): string | null {
  const configured = process.env["TELEGRAM_WEBHOOK_URL"]?.trim();
  if (configured) return configured;

  const publicApiBase = process.env["PUBLIC_API_BASE_URL"]?.trim();
  if (publicApiBase) return `${publicApiBase.replace(/\/+$/, "")}/api/telegram/webhook`;

  const railwayDomain = process.env["RAILWAY_PUBLIC_DOMAIN"]?.trim();
  if (railwayDomain) {
    return `https://${railwayDomain.replace(/^https?:\/\//i, "").replace(/\/+$/, "")}/api/telegram/webhook`;
  }

  return null;
}

async function callTelegram(token: string, method: string, body: Record<string, unknown>): Promise<TelegramApiResponse> {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as TelegramApiResponse;

  if (!response.ok || payload.ok === false) {
    throw new Error(payload.description ?? `Telegram ${method} failed with HTTP ${response.status}`);
  }

  return payload;
}

export async function startTelegramWebhook(): Promise<void> {
  const token = process.env["TELEGRAM_BOT_TOKEN"]?.trim();
  const secret = process.env["TELEGRAM_WEBHOOK_SECRET"]?.trim();
  const webhookUrl = telegramWebhookUrl();

  if (!token) {
    logger.warn("Telegram bot token is not configured; webhook startup skipped.");
    return;
  }

  if (!secret) {
    logger.warn("Telegram webhook secret is not configured; webhook startup skipped.");
    return;
  }

  if (!webhookUrl) {
    logger.warn("Telegram webhook URL is not configured; webhook startup skipped.");
    return;
  }

  try {
    await callTelegram(token, "setMyShortDescription", {
      short_description: BOT_SHORT_DESCRIPTION,
    });
    await callTelegram(token, "setMyDescription", {
      description: BOT_DESCRIPTION,
    });
    await callTelegram(token, "setMyCommands", {
      commands: BOT_COMMANDS,
    });
    await callTelegram(token, "setWebhook", {
      url: webhookUrl,
      secret_token: secret,
      allowed_updates: ["message", "edited_message", "callback_query"],
      drop_pending_updates: false,
    });
    logger.info({ webhookUrl }, "Telegram webhook registered.");
  } catch (err) {
    logger.error({ err }, "Telegram webhook startup failed.");
  }
}
