import { randomUUID } from "node:crypto";
import { buildTelegramButtons, formatTelegramAlert } from "./formatter";
import { scoreAlert } from "./scoring";
import { publishTelegramMessage, type TelegramPublishOptions } from "./telegram";
import type { AlertSignal, ScoredAlert, TelegramPublishResult } from "./types";

export interface AlertPublishResult {
  alert: ScoredAlert;
  message: string;
  telegram: TelegramPublishResult;
}

export async function publishAlertSignal(
  signal: AlertSignal,
  options: TelegramPublishOptions = {},
): Promise<AlertPublishResult> {
  const createdAt = new Date().toISOString();
  const alert = scoreAlert(
    {
      ...signal,
      observedAt: signal.observedAt ?? createdAt,
    },
    randomUUID(),
    createdAt,
  );
  const message = formatTelegramAlert(alert);
  const buttons = buildTelegramButtons(alert);
  const telegram = await publishTelegramMessage(message, {
    ...options,
    buttons,
  });

  return {
    alert,
    message,
    telegram,
  };
}
