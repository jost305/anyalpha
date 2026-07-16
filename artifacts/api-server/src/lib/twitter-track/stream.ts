import { logger } from "../logger";
import { ingestXWebhook, syncXFilteredStreamRules } from "./store";

let started = false;

function streamEnabled(): boolean {
  return process.env["X_STREAM_ENABLED"] === "true";
}

function bearerToken(): string | null {
  return process.env["X_BEARER_TOKEN"]?.trim() || null;
}

function streamUrl(): string {
  const url = new URL("https://api.x.com/2/tweets/search/stream");
  url.searchParams.set("tweet.fields", "created_at,author_id,lang,public_metrics");
  url.searchParams.set("expansions", "author_id");
  url.searchParams.set("user.fields", "username,name,profile_image_url,verified,verified_type");
  return url.toString();
}

async function processStreamLine(line: string): Promise<void> {
  const trimmed = line.trim();
  if (!trimmed) return;

  const payload = JSON.parse(trimmed) as unknown;
  await ingestXWebhook(payload, { signatureVerified: true });
}

async function readStream(response: Response): Promise<void> {
  if (!response.body) throw new Error("X filtered stream response did not include a readable body.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      await processStreamLine(line);
    }
  }

  if (buffer.trim()) {
    await processStreamLine(buffer);
  }
}

async function runXStreamLoop(): Promise<void> {
  const token = bearerToken();
  if (!token) {
    logger.warn("X filtered stream is enabled but X_BEARER_TOKEN is not configured.");
    return;
  }

  let retryMs = 5_000;

  for (;;) {
    try {
      const ruleSync = await syncXFilteredStreamRules();
      if (ruleSync.activeHandles === 0) {
        logger.info("X filtered stream has no active handles; waiting before reconnect.");
        await new Promise((resolve) => setTimeout(resolve, 60_000));
        continue;
      }

      logger.info({ activeHandles: ruleSync.activeHandles, createdRules: ruleSync.createdRules }, "Connecting X filtered stream.");
      const response = await fetch(streamUrl(), {
        headers: {
          accept: "application/json",
          authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const payload = await response.text().catch(() => response.statusText);
        throw new Error(`X filtered stream failed (${response.status}): ${payload.slice(0, 500)}`);
      }

      retryMs = 5_000;
      await readStream(response);
      logger.warn("X filtered stream ended; reconnecting.");
    } catch (err) {
      logger.error({ err }, "X filtered stream loop failed.");
      await new Promise((resolve) => setTimeout(resolve, retryMs));
      retryMs = Math.min(retryMs * 2, 120_000);
    }
  }
}

export function startXFilteredStreamWorker(): void {
  if (started || !streamEnabled()) return;
  started = true;
  void runXStreamLoop();
}
