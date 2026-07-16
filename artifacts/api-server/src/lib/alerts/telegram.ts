import { basename } from "node:path";
import { readFile } from "node:fs/promises";
import type { TelegramPublishResult } from "./types";

interface TelegramMessageResponse {
  ok?: boolean;
  result?: {
    message_id?: number;
  };
  description?: string;
}

interface TelegramButton {
  text: string;
  url?: string;
  callbackData?: string;
}

interface TelegramInlineButton {
  text: string;
  url?: string;
  callback_data?: string;
}

export interface TelegramPublishOptions {
  botToken?: string;
  chatId?: string;
  dryRun?: boolean;
  buttons?: Array<Array<TelegramButton>>;
}

export interface TelegramPhotoPublishOptions extends TelegramPublishOptions {
  photoPath?: string;
  photoUrl?: string;
  caption?: string;
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
  rows?: Array<Array<TelegramButton>>,
): Array<Array<TelegramInlineButton>> {
  if (!rows) return [];

  return rows
    .map((row) =>
      row
        .map<TelegramInlineButton | null>((button) => {
          if (button.url && isTelegramSafeButtonUrl(button.url)) {
            return {
              text: button.text,
              url: button.url,
            };
          }

          const callbackData = button.callbackData?.trim();
          if (callbackData && callbackData.length <= 64) {
            return {
              text: button.text,
              callback_data: callbackData,
            };
          }

          return null;
        })
        .filter((button): button is TelegramInlineButton => button !== null),
    )
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

export async function publishTelegramPhoto(
  options: TelegramPhotoPublishOptions = {},
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

  if (!options.photoPath && !options.photoUrl) {
    return {
      published: false,
      dryRun: true,
      chatId,
      reason: "Missing Telegram photo path or URL.",
    };
  }

  const form = new FormData();
  form.set("chat_id", chatId);

  if (options.caption) {
    form.set("caption", options.caption);
  }

  if (buttons.length > 0) {
    form.set(
      "reply_markup",
      JSON.stringify({
        inline_keyboard: buttons,
      }),
    );
  }

  if (options.photoUrl) {
    form.set("photo", options.photoUrl);
  } else if (options.photoPath) {
    const data = await readFile(options.photoPath);
    const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
    const blob = new Blob([arrayBuffer], { type: "image/jpeg" });
    form.set("photo", blob, basename(options.photoPath));
  }

  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
    method: "POST",
    body: form,
  });

  const responseData = (await response.json()) as TelegramMessageResponse;

  if (!response.ok || responseData.ok === false) {
    throw new Error(responseData.description ?? `Telegram sendPhoto failed with HTTP ${response.status}`);
  }

  return {
    published: true,
    dryRun: false,
    chatId,
    messageId: responseData.result?.message_id,
  };
}

export async function answerTelegramCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
  const botToken = process.env["TELEGRAM_BOT_TOKEN"];
  if (!botToken) return;

  await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      callback_query_id: callbackQueryId,
      ...(text ? { text } : {}),
    }),
  }).catch(() => {});
}
