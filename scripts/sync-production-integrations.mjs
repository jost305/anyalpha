const baseUrl = (process.env.PUBLIC_API_BASE_URL || process.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");
const adminSecret = process.env.ANYALPHA_ADMIN_SECRET || "";

if (!baseUrl) {
  throw new Error("PUBLIC_API_BASE_URL or VITE_API_BASE_URL is required.");
}

if (!adminSecret) {
  throw new Error("ANYALPHA_ADMIN_SECRET is required.");
}

async function post(path) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "x-anyalpha-admin-secret": adminSecret,
    },
  });
  const payload = await response.json().catch(() => null);

  return {
    ok: response.ok,
    status: response.status,
    path,
    payload,
  };
}

const targets = [
  "/api/wallet-tracker/provider-sync/helius?chain=solana",
  "/api/wallet-tracker/provider-sync/alchemy?chain=ethereum",
  "/api/wallet-tracker/provider-sync/alchemy?chain=base",
  "/api/wallet-tracker/provider-sync/alchemy?chain=arbitrum",
  "/api/wallet-tracker/provider-sync/alchemy?chain=bsc",
  "/api/wallet-tracker/provider-sync/alchemy?chain=polygon",
  "/api/wallet-tracker/provider-sync/alchemy?chain=optimism",
  "/api/twitter-track/provider-sync/x",
];

for (const target of targets) {
  const result = await post(target);
  const payload = result.payload && typeof result.payload === "object" ? result.payload : {};
  const summary = {
    path: result.path,
    status: result.status,
    ok: result.ok,
    source: payload.source,
    provider: payload.provider,
    chain: payload.chain,
    mode: payload.mode,
    addressCount: payload.addressCount,
    activeHandles: payload.activeHandles,
    createdRules: payload.createdRules,
    error: payload.error,
  };

  console.log(JSON.stringify(summary));
}
