const DICEBEAR_BASE_URL = 'https://api.dicebear.com/9.x';
const USER_AVATAR_STYLE = 'adventurer-neutral';
const WALLET_AVATAR_STYLE = 'bottts-neutral';

function normalizedSeed(seed: string | null | undefined, fallback: string) {
  const value = seed?.trim();
  return value && value.length > 0 ? value : fallback;
}

function dicebearUrl(style: string, seed: string, radius = 16) {
  const params = new URLSearchParams({
    seed,
    backgroundColor: '111827,0b0b0f,1f2937,f97316',
    radius: String(radius),
  });

  return `${DICEBEAR_BASE_URL}/${style}/svg?${params.toString()}`;
}

export function getDicebearUserAvatarUrl(seed: string | null | undefined) {
  return dicebearUrl(USER_AVATAR_STYLE, `user:${normalizedSeed(seed, 'anyalpha-user')}`, 18);
}

export function getDicebearWalletAvatarUrl(chain: string | null | undefined, address: string | null | undefined) {
  const walletSeed = `${normalizedSeed(chain, 'wallet')}:${normalizedSeed(address, 'anyalpha-wallet')}`;
  return dicebearUrl(WALLET_AVATAR_STYLE, `wallet:${walletSeed}`, 16);
}
