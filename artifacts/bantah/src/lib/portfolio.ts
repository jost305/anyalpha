function apiUrl(path: string) {
  const rawBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
  const baseUrl = rawBaseUrl ? rawBaseUrl.replace(/\/+$/, '') : '';
  return baseUrl ? `${baseUrl}${path}` : path;
}

export interface PortfolioToken {
  chainId: string;
  tokenAddress: string;
  symbol?: string;
  name?: string;
  decimals: number;
  balance: number;
  logoUrl?: string;
  priceUsd?: number;
  valueUsd?: number;
  priceChange24h?: number;
}

export interface PortfolioResponse {
  chain: string;
  address: string;
  tokens: PortfolioToken[];
}
export async function fetchPortfolio(
  accessToken: string,
  chain: string,
  address: string,
  signal?: AbortSignal
): Promise<PortfolioResponse> {
  const response = await fetch(
    apiUrl(`/api/portfolio?chain=${encodeURIComponent(chain)}&address=${encodeURIComponent(address)}`),
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      signal,
    }
  );

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error ?? data?.message ?? `Failed to fetch portfolio: ${response.status}`);
  }

  return response.json();
}
