import type { ConnectedWallet, LinkedAccountWithMetadata, User } from '@privy-io/react-auth';
import type { AlphaPointsAccount } from '@/lib/points';
import { getDicebearUserAvatarUrl } from '@/lib/avatar';

export interface ResolvedProfileField {
  value: string | null;
  source: string | null;
}

export interface AuthVerificationResponse {
  verified: boolean;
  verificationSource: 'access-token';
  session: {
    appId: string;
    issuer: string;
    issuedAt: number;
    expiration: number;
    sessionId: string;
    userId: string;
  };
  serverUser: {
    id: string;
    createdAt: string;
    linkedAccountCount: number;
    hasAcceptedTerms: boolean | null;
    isGuest: boolean;
    email: string | null;
    phone: string | null;
    wallet: string | null;
    googleEmail: string | null;
    twitterUsername: string | null;
    githubUsername: string | null;
    farcasterUsername: string | null;
    telegramUsername: string | null;
    linkedAccountTypes: string[];
    customMetadata: Record<string, unknown> | null;
    alphaPoints: AlphaPointsAccount;
  };
}

type WalletAccount = Extract<LinkedAccountWithMetadata, { type: 'wallet' }>;

function field(value: string | null | undefined, source: string): ResolvedProfileField {
  const normalized = value?.trim();
  return normalized ? { value: normalized, source } : { value: null, source: null };
}

function pickField(...fields: ResolvedProfileField[]): ResolvedProfileField {
  return fields.find((candidate) => candidate.value)?.value
    ? (fields.find((candidate) => candidate.value) as ResolvedProfileField)
    : { value: null, source: null };
}

function safeDate(value: Date | string | number | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatPrivyDate(value: Date | string | number | null | undefined): string {
  const date = safeDate(value);
  if (!date) return 'Unknown';

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

export function formatPrivyDateTime(value: Date | string | number | null | undefined): string {
  const date = safeDate(value);
  if (!date) return 'Unknown';

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export function shortenAddress(value: string | null | undefined, leading = 6, trailing = 4): string {
  if (!value) return 'Unavailable';
  if (value.length <= leading + trailing + 3) return value;
  return `${value.slice(0, leading)}...${value.slice(-trailing)}`;
}

export function getPrimaryWalletAddress(user: User | null | undefined): string | null {
  return user?.wallet?.address ?? getLinkedWalletAccounts(user)[0]?.address ?? null;
}

export function getPrimaryContactField(user: User | null | undefined): ResolvedProfileField {
  return pickField(
    field(user?.email?.address, 'Email'),
    field(user?.phone?.number, 'Phone'),
    field(user?.google?.email, 'Google'),
    field(user?.apple?.email, 'Apple'),
    field(user?.github?.email, 'GitHub'),
    field(user?.linkedin?.email, 'LinkedIn'),
    field(user?.spotify?.email, 'Spotify'),
  );
}

export function getPrimaryContact(user: User | null | undefined): string | null {
  return getPrimaryContactField(user).value;
}

export function getUserDisplayField(user: User | null | undefined): ResolvedProfileField {
  const telegramName = [user?.telegram?.firstName, user?.telegram?.lastName].filter(Boolean).join(' ');
  const walletAddress = getPrimaryWalletAddress(user);

  return pickField(
    field(user?.farcaster?.displayName, 'Farcaster'),
    field(user?.twitter?.name, 'X / Twitter'),
    field(user?.google?.name, 'Google'),
    field(user?.github?.name, 'GitHub'),
    field(user?.linkedin?.name, 'LinkedIn'),
    field(user?.spotify?.name, 'Spotify'),
    field(telegramName, 'Telegram'),
    field(user?.telegram?.username ? `@${user.telegram.username}` : null, 'Telegram username'),
    field(user?.email?.address?.split('@')[0], 'Derived from email'),
    field(user?.phone?.number, 'Phone'),
    field(walletAddress ? shortenAddress(walletAddress, 8, 4) : null, 'Derived from primary wallet'),
    field(user?.id ? shortenAddress(user.id, 10, 8) : null, 'Derived from Privy DID'),
  );
}

export function getUserDisplayName(user: User | null | undefined): string {
  return getUserDisplayField(user).value ?? 'Privy user';
}

export function getUserHandleField(user: User | null | undefined): ResolvedProfileField {
  return pickField(
    field(user?.twitter?.username ? `@${user.twitter.username}` : null, 'X / Twitter'),
    field(user?.github?.username ? `github.com/${user.github.username}` : null, 'GitHub'),
    field(user?.telegram?.username ? `@${user.telegram.username}` : null, 'Telegram'),
    field(user?.instagram?.username ? `@${user.instagram.username}` : null, 'Instagram'),
    field(user?.tiktok?.username ? `@${user.tiktok.username}` : null, 'TikTok'),
    field(user?.linkedin?.vanityName ? `linkedin.com/in/${user.linkedin.vanityName}` : null, 'LinkedIn'),
    field(user?.farcaster?.username ? `@${user.farcaster.username}` : null, 'Farcaster'),
  );
}

export function getUserHandle(user: User | null | undefined): string | null {
  return getUserHandleField(user).value;
}

export function getUserAvatarUrl(user: User | null | undefined): string | null {
  const seed =
    user?.id ??
    getPrimaryWalletAddress(user) ??
    user?.email?.address ??
    user?.twitter?.username ??
    'anyalpha-user';

  return getDicebearUserAvatarUrl(seed);
}

export function getInitials(value: string): string {
  const parts = value
    .split(/[\s@._-]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) return 'AA';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
}

export function getLinkedWalletAccounts(user: User | null | undefined): WalletAccount[] {
  return (user?.linkedAccounts ?? []).filter(
    (account): account is WalletAccount => account.type === 'wallet',
  );
}

export function getNonWalletAccounts(user: User | null | undefined): LinkedAccountWithMetadata[] {
  return (user?.linkedAccounts ?? []).filter(
    (account) => account.type !== 'wallet' && account.type !== 'smart_wallet',
  );
}

export function getAccountLabel(account: LinkedAccountWithMetadata): string {
  switch (account.type) {
    case 'email':
      return 'Email';
    case 'phone':
      return 'Phone';
    case 'wallet':
      return account.walletClientType === 'privy' || account.walletClientType === 'privy-v2'
        ? 'Embedded Wallet'
        : 'External Wallet';
    case 'smart_wallet':
      return 'Smart Wallet';
    case 'google_oauth':
      return 'Google';
    case 'twitter_oauth':
      return 'X / Twitter';
    case 'discord_oauth':
      return 'Discord';
    case 'github_oauth':
      return 'GitHub';
    case 'spotify_oauth':
      return 'Spotify';
    case 'instagram_oauth':
      return 'Instagram';
    case 'tiktok_oauth':
      return 'TikTok';
    case 'line_oauth':
      return 'LINE';
    case 'linkedin_oauth':
      return 'LinkedIn';
    case 'apple_oauth':
      return 'Apple';
    case 'farcaster':
      return 'Farcaster';
    case 'telegram':
      return 'Telegram';
    case 'passkey':
      return 'Passkey';
    case 'custom_auth':
      return 'Custom Auth';
    case 'cross_app':
      return 'Cross App';
    default:
      return 'Linked Account';
  }
}

export function getAccountValue(account: LinkedAccountWithMetadata): string {
  switch (account.type) {
    case 'email':
      return account.address;
    case 'phone':
      return account.number;
    case 'wallet':
      return account.address;
    case 'smart_wallet':
      return account.address;
    case 'google_oauth':
      return account.email;
    case 'twitter_oauth':
      return account.username ? `@${account.username}` : account.subject;
    case 'discord_oauth':
      return account.username ?? account.email ?? account.subject;
    case 'github_oauth':
      return account.username ? `@${account.username}` : account.subject;
    case 'spotify_oauth':
      return account.name ?? account.email ?? account.subject;
    case 'instagram_oauth':
      return account.username ? `@${account.username}` : account.subject;
    case 'tiktok_oauth':
      return account.username ? `@${account.username}` : account.subject;
    case 'line_oauth':
      return account.name ?? account.email ?? account.subject;
    case 'linkedin_oauth':
      return account.name ?? account.email ?? account.subject;
    case 'apple_oauth':
      return account.email;
    case 'farcaster':
      return account.displayName ?? account.username ?? `FID ${account.fid ?? 'unknown'}`;
    case 'telegram':
      return account.username
        ? `@${account.username}`
        : [account.firstName, account.lastName].filter(Boolean).join(' ') || account.telegramUserId;
    case 'passkey':
      return account.authenticatorName ?? shortenAddress(account.credentialId, 10, 6);
    case 'custom_auth':
      return account.customUserId;
    case 'cross_app':
      return account.providerApp.name || 'Cross-app session';
    default:
      return 'Unavailable';
  }
}

export function getAccountMeta(account: LinkedAccountWithMetadata): string | null {
  switch (account.type) {
    case 'wallet':
      return [account.chainType.toUpperCase(), account.walletClientType ?? 'wallet'].join(' | ');
    case 'smart_wallet':
      return [account.smartWalletType, account.smartWalletVersion ?? 'Smart wallet'].join(' | ');
    case 'google_oauth':
    case 'twitter_oauth':
    case 'discord_oauth':
    case 'github_oauth':
    case 'spotify_oauth':
    case 'instagram_oauth':
    case 'tiktok_oauth':
    case 'line_oauth':
    case 'linkedin_oauth':
    case 'apple_oauth':
      return 'OAuth linked';
    case 'farcaster':
      return account.ownerAddress ? shortenAddress(account.ownerAddress) : null;
    case 'telegram':
      return `User ${account.telegramUserId}`;
    case 'passkey':
      return account.enrolledInMfa ? 'Enabled for MFA' : 'Sign-in only';
    case 'cross_app':
      return `${account.providerApp.name || 'Cross-app'} session`;
    default:
      return null;
  }
}

export function getConnectedWalletLabel(wallet: ConnectedWallet): string {
  return wallet.meta.name || wallet.walletClientType || 'Wallet';
}
