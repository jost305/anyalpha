import { getBearerToken, getPrivyClient, verifyPrivyAccessToken } from "./privy-auth";

export async function requireAuthenticatedUser(authorization: string | string[] | undefined) {
  const token = getBearerToken(authorization);

  if (!token) {
    return {
      ok: false as const,
      status: 401,
      body: { error: "Missing Privy access token." },
    };
  }

  if (!getPrivyClient()) {
    return {
      ok: false as const,
      status: 503,
      body: {
        error: "Privy is not configured on the server. Set VITE_PRIVY_APP_ID and PRIVY_APP_SECRET.",
      },
    };
  }

  try {
    const auth = await verifyPrivyAccessToken(token);

    if (!auth) {
      return {
        ok: false as const,
        status: 503,
        body: {
          error: "Privy is not configured on the server. Set VITE_PRIVY_APP_ID and PRIVY_APP_SECRET.",
        },
      };
    }

    return {
      ok: true as const,
      user: auth.user,
      claims: auth.claims,
    };
  } catch {
    return {
      ok: false as const,
      status: 401,
      body: { error: "Invalid or expired Privy access token." },
    };
  }
}
