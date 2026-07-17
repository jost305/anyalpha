import { useEffect, useState } from 'react';
import { usePrivy, useWallets, type LinkedAccountWithMetadata } from '@privy-io/react-auth';
import {
  ArrowUpRight,
  BadgeCheck,
  Bell,
  Check,
  Copy,
  ExternalLink,
  KeyRound,
  Link2,
  LoaderCircle,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Wallet,
} from 'lucide-react';
import {
  type AuthVerificationResponse,
  type ResolvedProfileField,
  formatPrivyDate,
  formatPrivyDateTime,
  getAccountLabel,
  getAccountMeta,
  getAccountValue,
  getConnectedWalletLabel,
  getInitials,
  getLinkedWalletAccounts,
  getNonWalletAccounts,
  getPrimaryContactField,
  getPrimaryWalletAddress,
  getUserAvatarUrl,
  getUserDisplayField,
  getUserHandleField,
  shortenAddress,
} from '@/lib/privy-profile';

type ProfileTab = 'identity' | 'accounts' | 'wallets' | 'security';

function normalizeValue(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

function normalizeDateValue(value: Date | string | number | null | undefined): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function formatPresence(value: boolean): string {
  return value ? 'Yes' : 'No';
}

function formatAlphaPoints(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Unavailable';
  return new Intl.NumberFormat('en-US').format(value);
}

function getServerDirectContact(serverProfile: AuthVerificationResponse | null): string | null {
  if (!serverProfile) return null;

  return (
    serverProfile.serverUser.email ??
    serverProfile.serverUser.phone ??
    serverProfile.serverUser.googleEmail ??
    null
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      onClick={copy}
      className="rounded-md border border-border bg-background/60 p-1 text-muted-foreground transition hover:text-foreground"
      title="Copy"
      type="button"
    >
      {copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
    </button>
  );
}

function SnapshotField({
  label,
  value,
  source,
  emptyText,
  emptySource,
  copyText,
  monospace = false,
}: {
  label: string;
  value: string | null;
  source?: string | null;
  emptyText: string;
  emptySource: string;
  copyText?: string | null;
  monospace?: boolean;
}) {
  const hasValue = Boolean(value);

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1.5 flex items-start justify-between gap-2">
        <div
          className={`min-w-0 break-all font-semibold text-foreground ${
            monospace ? 'font-mono text-xs' : 'text-sm'
          } ${!hasValue ? 'italic text-muted-foreground' : ''}`}
        >
          {hasValue ? value : emptyText}
        </div>
        {hasValue && copyText ? <CopyButton text={copyText} /> : null}
      </div>
      {hasValue && source ? (
        <div className="mt-1 text-[10px] text-muted-foreground">
          {source}
        </div>
      ) : null}
    </div>
  );
}

function ConsistencyRow({
  label,
  matches,
  clientValue,
  serverValue,
}: {
  label: string;
  matches: boolean;
  clientValue: string;
  serverValue: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </div>
        <span
          className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] ${
            matches
              ? 'border-success/30 bg-success/10 text-success'
              : 'border-destructive/30 bg-destructive/10 text-destructive'
          }`}
        >
          {matches ? 'Match' : 'Mismatch'}
        </span>
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Client</div>
          <div className="mt-0.5 break-all text-xs text-foreground">{clientValue}</div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Server</div>
          <div className="mt-0.5 break-all text-xs text-foreground">{serverValue}</div>
        </div>
      </div>
    </div>
  );
}

function AccountRow({ account }: { account: LinkedAccountWithMetadata }) {
  const value = getAccountValue(account);
  const meta = getAccountMeta(account);
  const copyable =
    account.type === 'email' ||
    account.type === 'phone' ||
    account.type === 'wallet' ||
    account.type === 'smart_wallet' ||
    account.type === 'custom_auth';

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
            {getAccountLabel(account)}
          </div>
          <div className="mt-1.5 break-all text-sm font-semibold text-foreground">{value}</div>
          {meta ? <div className="mt-0.5 text-xs text-muted-foreground">{meta}</div> : null}
        </div>
        {copyable ? <CopyButton text={value} /> : null}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
          First linked {formatPrivyDate(account.firstVerifiedAt)}
        </span>
        <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
          Last used {formatPrivyDate(account.latestVerifiedAt)}
        </span>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const {
    ready,
    authenticated,
    user,
    login,
    logout,
    linkEmail,
    linkGoogle,
    linkTwitter,
    linkWallet,
    getAccessToken,
  } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const [serverProfile, setServerProfile] = useState<AuthVerificationResponse | null>(null);
  const [serverLoading, setServerLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  async function loadServerProfile() {
    if (!authenticated) {
      setServerProfile(null);
      setServerError(null);
      return;
    }

    setServerLoading(true);
    setServerError(null);

    try {
      const token = await getAccessToken();

      if (!token) {
        throw new Error('No Privy access token was available for this session.');
      }

      const response = await fetch('/api/auth/me', {
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      const payload = (await response.json().catch(() => null)) as
        | AuthVerificationResponse
        | { error?: string }
        | null;

      if (!response.ok) {
        const payloadError = payload && 'error' in payload ? payload.error : undefined;
        throw new Error(payloadError ?? 'Unable to verify your session on the server.');
      }

      setServerProfile(payload as AuthVerificationResponse);
    } catch (error) {
      setServerProfile(null);
      setServerError(error instanceof Error ? error.message : 'Unable to verify your session on the server.');
    } finally {
      setServerLoading(false);
    }
  }

  useEffect(() => {
    if (!ready || !authenticated) {
      setServerProfile(null);
      setServerError(null);
      return;
    }

    void loadServerProfile();
  }, [authenticated, ready, user?.id, user?.linkedAccounts.length, user?.isGuest]);

  if (!ready) {
    return (
      <div className="h-full bg-background px-4 pt-4 md:flex md:items-center md:justify-center md:pt-0">
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-5 py-4 text-sm text-muted-foreground">
          <LoaderCircle size={18} className="animate-spin text-primary" />
          Preparing your authenticated workspace...
        </div>
      </div>
    );
  }

  if (!authenticated || !user) {
    return (
      <div className="h-full overflow-y-auto bg-background px-3 py-4 md:px-4">
        <div className="mx-auto flex min-h-full max-w-md items-center">
          <div className="w-full border-y border-border py-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">Profile</div>
            <h2 className="mt-2 text-xl font-black tracking-tight text-foreground">Sign in to view your profile</h2>
            <p className="mt-2 text-sm leading-5 text-muted-foreground">
              Access your linked wallets, Alpha Points, and account settings.
            </p>
            <button
              onClick={() => login()}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition hover:opacity-90 sm:w-auto"
              type="button"
            >
              <Sparkles size={15} />
              Sign In
            </button>
          </div>
        </div>
      </div>
    );
  }

  const displayField = getUserDisplayField(user);
  const handleField = getUserHandleField(user);
  const contactField = getPrimaryContactField(user);
  const userHandle = handleField.value;
  const avatarUrl = getUserAvatarUrl(user);
  const primaryContact = contactField.value;
  const primaryWallet = getPrimaryWalletAddress(user);
  const linkedWallets = getLinkedWalletAccounts(user);
  const nonWalletAccounts = getNonWalletAccounts(user);
  const linkedAccountTypes = Array.from(new Set(user.linkedAccounts.map((account) => account.type))).sort();
  const acceptedTerms = serverProfile?.serverUser.hasAcceptedTerms ?? user.hasAcceptedTerms;
  const serverDirectContact = getServerDirectContact(serverProfile);
  const serverLinkedAccountTypes = [...(serverProfile?.serverUser.linkedAccountTypes ?? [])].sort();
  const alphaPointsAccount = serverProfile?.serverUser.alphaPoints ?? null;
  const displayName =
    displayField.source?.startsWith('Derived') && alphaPointsAccount
      ? alphaPointsAccount.username
      : displayField.value ?? alphaPointsAccount?.username ?? shortenAddress(user.id, 10, 8);
  const alphaPointsBalance = alphaPointsAccount
    ? `${formatAlphaPoints(alphaPointsAccount.balance)} ${alphaPointsAccount.label}`
    : null;
  const consistencyChecks = serverProfile
    ? [
        {
          label: 'Privy DID',
          matches: user.id === serverProfile.serverUser.id,
          clientValue: user.id,
          serverValue: serverProfile.serverUser.id,
        },
        {
          label: 'Session user id',
          matches: user.id === serverProfile.session.userId,
          clientValue: user.id,
          serverValue: serverProfile.session.userId,
        },
        {
          label: 'Created at',
          matches: normalizeDateValue(user.createdAt) === normalizeDateValue(serverProfile.serverUser.createdAt),
          clientValue: new Date(user.createdAt).toISOString(),
          serverValue: new Date(serverProfile.serverUser.createdAt).toISOString(),
        },
        {
          label: 'Linked account count',
          matches: user.linkedAccounts.length === serverProfile.serverUser.linkedAccountCount,
          clientValue: `${user.linkedAccounts.length}`,
          serverValue: `${serverProfile.serverUser.linkedAccountCount}`,
        },
        {
          label: 'Linked account types',
          matches: linkedAccountTypes.join('|') === serverLinkedAccountTypes.join('|'),
          clientValue: linkedAccountTypes.join(', ') || 'None',
          serverValue: serverLinkedAccountTypes.join(', ') || 'None',
        },
        {
          label: 'Guest flag',
          matches: user.isGuest === serverProfile.serverUser.isGuest,
          clientValue: formatPresence(user.isGuest),
          serverValue: formatPresence(serverProfile.serverUser.isGuest),
        },
        {
          label: 'Primary wallet',
          matches: normalizeValue(primaryWallet) === normalizeValue(serverProfile.serverUser.wallet),
          clientValue: primaryWallet ?? 'No linked wallet',
          serverValue: serverProfile.serverUser.wallet ?? 'No linked wallet',
        },
        {
          label: 'Direct contact',
          matches: normalizeValue(primaryContact) === normalizeValue(serverDirectContact),
          clientValue: primaryContact ?? 'No direct contact linked',
          serverValue: serverDirectContact ?? 'No direct contact linked',
        },
      ]
    : [];

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <div className="relative shrink-0 border-b border-border">
        <div className="absolute inset-0 z-0 h-24 w-full bg-[radial-gradient(ellipse_at_top,rgba(var(--primary-rgb,245,46,43),0.1),transparent_70%)]" />
        <div className="relative z-10 px-4 pt-8 pb-3 md:px-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end">
            <div className="relative shrink-0">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={displayName}
                  className="h-16 w-16 rounded-xl border-2 border-background bg-card object-cover shadow-lg"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-xl border-2 border-background bg-card text-2xl font-black text-primary shadow-lg">
                  {getInitials(displayName)}
                </div>
              )}
              <div className="absolute -bottom-1 -right-1 rounded border border-background bg-success px-1.5 py-px text-[9px] font-black uppercase tracking-wider text-success-foreground shadow-sm">
                Live
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-black tracking-tight text-foreground">{displayName}</h2>
                {serverProfile?.verified ? (
                  <span className="inline-flex items-center gap-1 rounded border border-success/30 bg-success/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-success">
                    <ShieldCheck size={10} />
                    Verified
                  </span>
                ) : null}
              </div>

              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {userHandle ? <span>@{userHandle}</span> : null}
                {userHandle && primaryContact ? <span className="text-border">·</span> : null}
                {primaryContact ? <span>{primaryContact}</span> : null}
                {(userHandle || primaryContact) && primaryWallet ? <span className="text-border">·</span> : null}
                {primaryWallet ? (
                  <span className="inline-flex items-center gap-1 font-mono">
                    {shortenAddress(primaryWallet, 8, 4)}
                    <CopyButton text={primaryWallet} />
                  </span>
                ) : null}
                {((userHandle || primaryContact || primaryWallet) && <span className="text-border">·</span>)}
                <span>Joined {formatPrivyDate(user.createdAt)}</span>
              </div>
            </div>

            <button
              onClick={() => void logout()}
              className="flex w-fit items-center gap-1.5 rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-1.5 text-xs font-bold text-destructive transition hover:bg-destructive hover:text-destructive-foreground"
            >
              <LogOut size={13} />
              Sign Out
            </button>
          </div>

          <div className="mt-5 flex flex-wrap gap-x-8 gap-y-4 border-t border-border/50 pt-4">
            {[
              {
                label: 'Alpha Points',
                value: alphaPointsAccount
                  ? formatAlphaPoints(alphaPointsAccount.balance)
                  : serverLoading
                    ? '...'
                    : serverError
                      ? 'N/A'
                      : '—',
                sub: alphaPointsAccount
                  ? `${alphaPointsAccount.tierEmoji} ${alphaPointsAccount.tierLabel} · ${alphaPointsAccount.streakDays}d streak`
                  : 'pending',
                icon: <Sparkles size={12} />,
                accent: true,
              },
              {
                label: 'Linked',
                value: `${user.linkedAccounts.length}`,
                sub: `${linkedAccountTypes.length} type${linkedAccountTypes.length === 1 ? '' : 's'}`,
                icon: <Link2 size={12} />,
              },
              {
                label: 'Wallets',
                value: `${wallets.length}`,
                sub: walletsReady ? 'connected' : 'loading',
                icon: <Wallet size={12} />,
              },
              {
                label: 'Security',
                value: acceptedTerms ? 'Accepted' : 'Not accepted',
                sub: user.mfaMethods.length > 0 ? `${user.mfaMethods.length} MFA` : 'MFA off',
                icon: <KeyRound size={12} />,
              },
              {
                label: 'Session',
                value: serverProfile?.verified ? 'Verified' : serverLoading ? '...' : serverError ? 'Error' : '—',
                sub: serverProfile
                  ? shortenAddress(serverProfile.session.sessionId, 6, 4)
                  : 'awaiting check',
                icon: <BadgeCheck size={12} />,
              },
            ].map((item) => (
              <div key={item.label} className="flex flex-col gap-0.5 min-w-[120px]">
                <div className={`flex items-center gap-1.5 ${'accent' in item && item.accent ? 'text-primary' : 'text-muted-foreground'}`}>
                  {item.icon}
                  <div className="text-[10px] font-semibold uppercase tracking-[0.1em]">{item.label}</div>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <div className={`text-sm font-black tracking-tight ${'accent' in item && item.accent ? 'text-primary' : 'text-foreground'}`}>
                    {item.value}
                  </div>
                  <div className="text-[10px] text-muted-foreground">{item.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 md:px-4">
        <div className="space-y-3">
            {/* Quick Info — compact key-value rows */}
            <div className="rounded-xl border border-border bg-card px-3 py-2">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">Overview</div>
              <div className="divide-y divide-border">
                {[
                  { label: 'Display Name', value: displayField.value ?? 'Not set' },
                  { label: 'Handle', value: handleField.value ?? alphaPointsAccount?.username ?? 'Not set', prefix: '@' },
                  { label: 'Contact', value: contactField.value ?? 'No email / phone linked' },
                  { label: 'Primary Wallet', value: primaryWallet ? shortenAddress(primaryWallet, 10, 6) : 'None linked', mono: true, copy: primaryWallet },
                  { label: 'User ID', value: shortenAddress(user.id, 14, 8), mono: true, copy: user.id },
                  { label: 'Joined', value: formatPrivyDate(user.createdAt) },
                  { label: 'Alpha Points', value: alphaPointsBalance ?? (serverLoading ? 'Loading...' : 'Pending'), highlight: true },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between gap-3 py-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{row.label}</span>
                    <span className={`flex items-center gap-1 text-xs text-right ${'highlight' in row && row.highlight ? 'font-bold text-primary' : 'font-medium text-foreground'} ${'mono' in row && row.mono ? 'font-mono' : ''}`}>
                      {'prefix' in row && row.prefix && row.value !== 'Not set' ? row.prefix : ''}{row.value}
                      {'copy' in row && row.copy ? <CopyButton text={row.copy} /> : null}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Linked Accounts summary */}
            <div className="rounded-xl border border-border bg-card px-3 py-2">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">Linked Accounts</div>
              {user.linkedAccounts.length === 0 ? (
                <div className="py-2 text-xs text-muted-foreground">No linked accounts.</div>
              ) : (
                <div className="divide-y divide-border">
                  {user.linkedAccounts.slice(0, 4).map((account, index) => {
                    const val = getAccountValue(account);
                    const meta = getAccountMeta(account);
                    const copyable = ['email', 'phone', 'wallet', 'smart_wallet', 'custom_auth'].includes(account.type);
                    return (
                      <div key={`${account.type}-${index}`} className="flex items-center justify-between gap-2 py-1.5">
                        <div className="min-w-0">
                          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{getAccountLabel(account)}</span>
                          {meta ? <span className="ml-1.5 text-[10px] text-muted-foreground">· {meta}</span> : null}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="font-mono text-xs text-foreground">
                            {val.length > 24 ? shortenAddress(val, 8, 6) : val}
                          </span>
                          {copyable ? <CopyButton text={val} /> : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Server status — single compact row */}
            <div className="rounded-xl border border-border bg-card px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">Server</div>
                  {serverProfile?.verified ? (
                    <span className="inline-flex items-center gap-0.5 rounded border border-success/30 bg-success/10 px-1 py-px text-[9px] font-bold text-success">
                      <ShieldCheck size={9} /> Verified
                    </span>
                  ) : serverLoading ? (
                    <span className="text-[10px] text-muted-foreground">Checking...</span>
                  ) : serverError ? (
                    <span className="text-[10px] text-destructive">Error</span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">Not checked</span>
                  )}
                </div>
                <button
                  onClick={() => void loadServerProfile()}
                  className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[10px] font-semibold text-muted-foreground transition hover:text-foreground hover:bg-muted"
                  type="button"
                >
                  <RefreshCw size={10} className={serverLoading ? 'animate-spin' : ''} />
                  Verify
                </button>
              </div>
              {serverProfile ? (
                <div className="mt-1.5 text-[10px] text-muted-foreground">
                  Session {shortenAddress(serverProfile.session.sessionId, 6, 4)} · Expires {formatPrivyDateTime(serverProfile.session.expiration * 1000)}
                </div>
              ) : null}
            </div>

            {/* Connected Wallets summary */}
            <div className="rounded-xl border border-border bg-card px-3 py-2">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">Connected Wallets</div>
                <button onClick={() => linkWallet()} className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary hover:underline" type="button">
                  <Wallet size={10} /> Add
                </button>
              </div>
              {wallets.length === 0 ? (
                <div className="py-2 text-xs text-muted-foreground">No wallets connected.</div>
              ) : (
                <div className="divide-y divide-border">
                  {wallets.map((wallet) => (
                    <div key={`${wallet.address}-${wallet.walletClientType}`} className="flex items-center justify-between gap-2 py-1.5">
                      <div className="flex flex-col min-w-0">
                         <div className="flex items-center gap-1.5">
                           <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{getConnectedWalletLabel(wallet)}</span>
                           {wallet.linked ? <span className="rounded border border-success/30 bg-success/10 px-1 py-px text-[9px] font-semibold text-success">Linked</span> : null}
                         </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="font-mono text-xs text-foreground">
                          {shortenAddress(wallet.address, 8, 6)}
                        </span>
                        <CopyButton text={wallet.address} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="rounded-xl border border-border bg-card px-3 py-2">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">Actions</div>
              <div className="grid gap-1.5 sm:grid-cols-2">
                <button onClick={() => (user.email ? linkWallet() : linkEmail())} className="rounded-lg border border-border bg-background/70 px-2.5 py-2 text-left transition hover:bg-muted/40" type="button">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-foreground"><Bell size={11} className="text-primary" />{user.email ? 'Add wallet' : 'Link email'}</div>
                </button>
                <button onClick={() => linkWallet()} className="rounded-lg border border-border bg-background/70 px-2.5 py-2 text-left transition hover:bg-muted/40" type="button">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-foreground"><Wallet size={11} className="text-primary" />Link wallet</div>
                </button>
                {!nonWalletAccounts.some((a) => a.type === 'google_oauth') ? (
                  <button onClick={() => linkGoogle()} className="rounded-lg border border-border bg-background/70 px-2.5 py-2 text-left transition hover:bg-muted/40" type="button">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-foreground"><ArrowUpRight size={11} className="text-primary" />Link Google</div>
                  </button>
                ) : null}
                {!nonWalletAccounts.some((a) => a.type === 'twitter_oauth') ? (
                  <button onClick={() => linkTwitter()} className="rounded-lg border border-border bg-background/70 px-2.5 py-2 text-left transition hover:bg-muted/40" type="button">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-foreground"><ExternalLink size={11} className="text-primary" />Link X</div>
                  </button>
                ) : null}
                <button onClick={() => void loadServerProfile()} className="rounded-lg border border-border bg-background/70 px-2.5 py-2 text-left transition hover:bg-muted/40" type="button">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-foreground"><RefreshCw size={11} className="text-primary" />Re-verify</div>
                </button>
                <button onClick={() => void logout()} className="rounded-lg border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-left transition hover:bg-destructive/15" type="button">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-destructive"><LogOut size={11} />Sign out</div>
                </button>
              </div>
            </div>
          </div>
      </div>
    </div>
  );
}
