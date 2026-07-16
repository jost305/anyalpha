import { PrivyClient } from "@privy-io/server-auth";

let privyClient: PrivyClient | null = null;

export function readRequiredPrivyEnv() {
  const appId = process.env.PRIVY_APP_ID?.trim() || process.env.VITE_PRIVY_APP_ID?.trim();
  const appSecret = process.env.PRIVY_APP_SECRET?.trim();

  if (!appId || !appSecret) {
    return null;
  }

  return { appId, appSecret };
}

export function getPrivyClient(): PrivyClient | null {
  if (privyClient) return privyClient;

  const credentials = readRequiredPrivyEnv();
  if (!credentials) return null;

  privyClient = new PrivyClient(credentials.appId, credentials.appSecret);
  return privyClient;
}

export function getBearerToken(header: string | string[] | undefined): string | null {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) return null;

  const match = /^Bearer\s+(.+)$/i.exec(value.trim());
  return match?.[1] ?? null;
}

export async function verifyPrivyAccessToken(token: string) {
  const client = getPrivyClient();
  if (!client) return null;

  const claims = await client.verifyAuthToken(token);
  const user = await client.getUserById(claims.userId);

  return { client, claims, user };
}
