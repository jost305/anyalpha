import "./lib/load-env";
import app from "./app";
import { startMarketAlertWorker } from "./lib/alerts/market-watcher";
import { startMobulaGlobalAggregateWorker } from "./lib/markets/mobula-global";
import { logger } from "./lib/logger";
import { startTelegramWebhook } from "./lib/telegram/startup";
import { startXFilteredStreamWorker } from "./lib/twitter-track/stream";
import { startPublicWalletDiscoveryWorker } from "./lib/wallet-tracker/discovery-worker";
import { startLaunchpadIndexer } from "./lib/launchpad/indexer-worker";
import { startTwitterTrendsWorker } from "./lib/twitter-trends/worker";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  void startTelegramWebhook();
  startMarketAlertWorker();
  startMobulaGlobalAggregateWorker();
  startXFilteredStreamWorker();
  startPublicWalletDiscoveryWorker();
  startLaunchpadIndexer();
  startTwitterTrendsWorker();
});
