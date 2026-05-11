import type { TelegramPublishResult } from "./types";

interface TelegramMessageResponse {
  ok?: boolean;
  result?: {
    message_id?: number;
  };
  description?: string;
}

export interface TelegramPublishOptions {
  botToken?: string;
  chatId?: string;
  dryRun?: boolean;
  buttons?: Array<Array<{ text: string; url: string }>>;
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

function isPrivateIpv4(hostname: string): boolean {
  const match = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return false;

  const [first, second] = [Number(match[1]), Number(match[2])];

  if (first === 10) return true;
  if (first === 127) return true;
  if (first === 192 && second === 168) return true;
  if (first === 172 && second >= 16 && second <= 31) return true;

  return false;
}

function isTelegramSafeButtonUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return false;
    }

    if (isLoopbackHost(url.hostname) || isPrivateIpv4(url.hostname)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

function sanitizeButtons(
  rows?: Array<Array<{ text: string; url: string }>>,
): Array<Array<{ text: string; url: string }>> {
  if (!rows) return [];

  return rows
    .map((row) => row.filter((button) => isTelegramSafeButtonUrl(button.url)))
    .filter((row) => row.length > 0);
}

function envChatId(): string | undefined {
  return (
    process.env["TELEGRAM_ALERT_CHAT_ID"] ??
    process.env["TELEGRAM_CHANNEL_ID"] ??
    process.env["TELEGRAM_ALERT_CHANNEL"]
  );
}

export async function publishTelegramMessage(
  text: string,
  options: TelegramPublishOptions = {},
): Promise<TelegramPublishResult> {
  const botToken = options.botToken ?? process.env["TELEGRAM_BOT_TOKEN"];
  const chatId = options.chatId ?? envChatId();
  const dryRun = options.dryRun ?? false;
  const buttons = sanitizeButtons(options.buttons);

  if (dryRun) {
    return {
      published: false,
      dryRun: true,
      chatId,
      reason: "Dry run requested.",
    };
  }

  if (!botToken || !chatId) {
    return {
      published: false,
      dryRun: true,
      chatId,
      reason: "Missing TELEGRAM_BOT_TOKEN or TELEGRAM_ALERT_CHAT_ID.",
    };
  }

  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
      ...(buttons.length > 0
        ? {
            reply_markup: {
              inline_keyboard: buttons,
            },
          }
        : {}),
    }),
  });

  const data = (await response.json()) as TelegramMessageResponse;

  if (!response.ok || data.ok === false) {
    throw new Error(data.description ?? `Telegram sendMessage failed with HTTP ${response.status}`);
  }

  return {
    published: true,
    dryRun: false,
    chatId,
    messageId: data.result?.message_id,
  };
}
