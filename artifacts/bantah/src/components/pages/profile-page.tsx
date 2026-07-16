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
    <div className="rounded-2xl border border-border bg-background/50 p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 flex items-start justify-between gap-3">
        <div
          className={`min-w-0 break-all font-semibold text-foreground ${
            monospace ? 'font-mono text-xs sm:text-sm' : 'text-sm'
          }`}
        >
          {hasValue ? value : emptyText}
        </div>
        {hasValue && copyText ? <CopyButton text={copyText} /> : null}
      </div>
      <div className="mt-2 text-xs text-muted-foreground">
        {hasValue ? source ?? 'Direct Privy user data' : emptySource}
      </div>
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
    <div className="rounded-2xl border border-border bg-background/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] ${
            matches
              ? 'border border-success/20 bg-success/10 text-success'
              : 'border border-destructive/30 bg-destructive/10 text-destructive'
          }`}
        >
          {matches ? 'Match' : 'Mismatch'}
        </span>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Client
          </div>
          <div className="mt-1 break-all text-xs text-foreground">{clientValue}</div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Server
          </div>
          <div className="mt-1 break-all text-xs text-foreground">{serverValue}</div>
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
    <div className="rounded-2xl border border-border bg-card/80 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
            {getAccountLabel(account)}
          </div>
          <div className="mt-2 break-all text-sm font-semibold text-foreground">{value}</div>
          {meta ? <div className="mt-1 text-xs text-muted-foreground">{meta}</div> : null}
        </div>
        {copyable ? <CopyButton text={value} /> : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
        <span className="rounded-full border border-border px-2 py-0.5">
          First linked {formatPrivyDate(account.firstVerifiedAt)}
        </span>
        <span className="rounded-full border border-border px-2 py-0.5">
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
  const [tab, setTab] = useState<ProfileTab>('identity');
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
      <div className="shrink-0 border-b border-border bg-[radial-gradient(circle_at_top_left,rgba(245,46,43,0.18),transparent_28%),linear-gradient(180deg,rgba(245,46,43,0.06),transparent_72%)] px-4 py-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
          <div className="relative shrink-0">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={displayName}
                className="h-18 w-18 rounded-[22px] border border-primary/25 object-cover shadow-lg"
              />
            ) : (
              <div className="flex h-18 w-18 items-center justify-center rounded-[22px] border border-primary/25 bg-primary/15 text-2xl font-black text-primary shadow-lg">
                {getInitials(displayName)}
              </div>
            )}
            <div className="absolute -bottom-2 -right-2 rounded-full border border-border bg-card px-2 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-success">
              Live
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-black tracking-tight text-foreground">{displayName}</h2>
              {serverProfile?.verified ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-success/20 bg-success/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-success">
                  <ShieldCheck size={11} />
                  Server Verified
                </span>
              ) : null}
              <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
                Privy User
              </span>
              <button
                onClick={() => void logout()}
                className="ml-auto flex items-center gap-1.5 rounded-xl bg-destructive/10 px-3 py-1.5 text-xs font-bold text-destructive transition hover:bg-destructive/20"
              >
                <LogOut size={13} />
                Sign Out
              </button>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {userHandle ? <span>{userHandle}</span> : null}
              {userHandle && primaryContact ? <span>|</span> : null}
              {primaryContact ? <span>{primaryContact}</span> : null}
              {(userHandle || primaryContact) && primaryWallet ? <span>|</span> : null}
              {primaryWallet ? (
                <span className="inline-flex items-center gap-1 font-mono">
                  {shortenAddress(primaryWallet, 8, 4)}
                  <CopyButton text={primaryWallet} />
                </span>
              ) : null}
              {((userHandle || primaryContact || primaryWallet) && <span>|</span>)}
              <span>Joined {formatPrivyDate(user.createdAt)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:min-w-[560px] xl:grid-cols-5">
            {[
              {
                label: 'Alpha Points',
                value: alphaPointsAccount
                  ? formatAlphaPoints(alphaPointsAccount.balance)
                  : serverLoading
                    ? 'Checking'
                    : serverError
                      ? 'Unavailable'
                      : 'Pending',
                sub: alphaPointsAccount
                  ? `${alphaPointsAccount.tierEmoji} ${alphaPointsAccount.tierLabel} tier | ${alphaPointsAccount.streakDays}d streak`
                  : 'server-backed balance',
                icon: <Sparkles size={12} />,
              },
              {
                label: 'Linked',
                value: `${user.linkedAccounts.length}`,
                sub: `${linkedAccountTypes.length} account type${linkedAccountTypes.length === 1 ? '' : 's'}`,
                icon: <Link2 size={12} />,
              },
              {
                label: 'Wallets',
                value: `${wallets.length}`,
                sub: walletsReady ? 'browser session' : 'loading session',
                icon: <Wallet size={12} />,
              },
              {
                label: 'Security',
                value: acceptedTerms ? 'Accepted' : 'Not accepted',
                sub: user.mfaMethods.length > 0 ? `${user.mfaMethods.length} MFA method(s)` : 'MFA off',
                icon: <KeyRound size={12} />,
              },
              {
                label: 'Session',
                value: serverProfile?.verified ? 'Verified' : serverLoading ? 'Checking' : serverError ? 'Error' : 'Not checked',
                sub: serverProfile
                  ? shortenAddress(serverProfile.session.sessionId, 6, 4)
                  : serverError
                    ? 'verification failed'
                    : 'awaiting server check',
                icon: <BadgeCheck size={12} />,
              },
            ].map((item) => (
              <div key={item.label} className="relative overflow-hidden rounded-2xl border border-border/50 bg-background/40 px-3 py-3 backdrop-blur-xl shadow-sm transition hover:bg-background/60 hover:shadow-md">
                <div className="flex items-center gap-1 text-primary">{item.icon}</div>
                <div className="mt-2 text-sm font-black text-foreground">{item.value}</div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{item.label}</div>
                <div className="mt-1 text-[11px] text-muted-foreground">{item.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="shrink-0 flex items-center overflow-x-auto border-b border-border">
        {([
          { key: 'identity', label: 'Identity' },
          { key: 'accounts', label: 'Linked Accounts' },
          { key: 'wallets', label: 'Wallets' },
          { key: 'security', label: 'Security' },
        ] as { key: ProfileTab; label: string }[]).map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            className={`border-b-2 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] transition ${
              tab === item.key
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'identity' ? (
          <div className="grid gap-4 xl:grid-cols-[1.2fr,0.8fr]">
            <div className="space-y-4">
              <div className="rounded-[28px] border border-border bg-card p-5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">
                  Identity Snapshot
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <SnapshotField
                    label="Display Name"
                    value={displayField.value}
                    source={displayField.source}
                    emptyText="No profile display name is available"
                    emptySource="Privy did not return a name-like field for this user"
                  />
                  <SnapshotField
                    label="Handle"
                    value={handleField.value ?? alphaPointsAccount?.username ?? null}
                    source={handleField.source ?? (alphaPointsAccount ? 'AnyAlpha username' : null)}
                    emptyText="No public username loaded"
                    emptySource="AnyAlpha has not returned a username for this account yet"
                  />
                  <SnapshotField
                    label="Direct Contact"
                    value={contactField.value}
                    source={contactField.source}
                    emptyText="No email or phone contact linked"
                    emptySource="Wallets are shown separately and are not treated as contact methods"
                    copyText={contactField.value}
                  />
                  <SnapshotField
                    label="Primary Wallet"
                    value={primaryWallet}
                    source={primaryWallet ? 'Privy wallet record' : null}
                    emptyText="No primary wallet linked"
                    emptySource="This authenticated user has not linked a primary wallet"
                    copyText={primaryWallet}
                    monospace
                  />
                  <SnapshotField
                    label="Privy DID"
                    value={user.id}
                    source="Canonical Privy user id"
                    emptyText="Unavailable"
                    emptySource="Privy did not return a user id"
                    copyText={user.id}
                    monospace
                  />
                  <SnapshotField
                    label="Joined"
                    value={formatPrivyDate(user.createdAt)}
                    source="Privy user.createdAt"
                    emptyText="Unknown"
                    emptySource="Privy did not return a creation date"
                  />
                  <SnapshotField
                    label="Alpha Points"
                    value={alphaPointsBalance}
                    source={alphaPointsAccount ? 'Server-backed anyAlpha points ledger' : null}
                    emptyText="Not loaded yet"
                    emptySource="Run server verification to retrieve the live Alpha Points balance"
                  />
                  <SnapshotField
                    label="Terms Accepted"
                    value={acceptedTerms ? 'Yes' : 'No'}
                    source={
                      serverProfile?.serverUser.hasAcceptedTerms !== null
                        ? 'Server-verified Privy field'
                        : 'Privy client user object'
                    }
                    emptyText="Unknown"
                    emptySource="Terms acceptance could not be determined"
                  />
                  <SnapshotField
                    label="Guest Account"
                    value={user.isGuest ? 'Yes' : 'No'}
                    source="Privy user.isGuest"
                    emptyText="Unknown"
                    emptySource="Privy did not return a guest state"
                  />
                </div>
              </div>

              <div className="rounded-[28px] border border-border bg-card p-5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">
                  Primary Linked Accounts
                </div>
                <div className="mt-4 grid gap-3">
                  {user.linkedAccounts.length === 0 ? (
                    <div className="rounded-2xl border border-border bg-background/60 p-4 text-sm text-muted-foreground">
                      No linked accounts were returned by Privy for this user.
                    </div>
                  ) : (
                    user.linkedAccounts.slice(0, 6).map((account, index) => {
                      const value = getAccountValue(account);
                      const meta = getAccountMeta(account);
                      const copyable =
                        account.type === 'email' ||
                        account.type === 'phone' ||
                        account.type === 'wallet' ||
                        account.type === 'smart_wallet' ||
                        account.type === 'custom_auth';

                      return (
                        <div key={`${account.type}-${index}-${value}`} className="rounded-2xl border border-border bg-background/60 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
                                {getAccountLabel(account)}
                              </div>
                              <div className="mt-2 break-all text-sm font-semibold text-foreground">
                                {value}
                              </div>
                              {meta ? (
                                <div className="mt-1 text-xs text-muted-foreground">{meta}</div>
                              ) : null}
                            </div>
                            {copyable ? <CopyButton text={value} /> : null}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-[28px] border border-border bg-card p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">
                      Server Session
                    </div>
                    <div className="mt-2 text-sm text-muted-foreground">
                      The API verifies your Privy access token before returning this block.
                    </div>
                  </div>
                  <button
                    onClick={() => void loadServerProfile()}
                    className="inline-flex items-center gap-2 rounded-xl border border-border bg-background/70 px-3 py-2 text-xs font-semibold text-foreground transition hover:bg-muted/50"
                    type="button"
                  >
                    <RefreshCw size={13} className={serverLoading ? 'animate-spin' : ''} />
                    Refresh
                  </button>
                </div>

                <div className="mt-4 space-y-3">
                  {serverLoading ? (
                    <div className="rounded-2xl border border-border bg-background/60 p-4 text-sm text-muted-foreground">
                      Verifying your session with the server...
                    </div>
                  ) : serverError ? (
                    <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-foreground">
                      {serverError}
                    </div>
                  ) : serverProfile ? (
                    <>
                      <div className="rounded-2xl border border-success/20 bg-success/10 p-4">
                        <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                          <ShieldCheck size={15} className="text-success" />
                          Session verified for {shortenAddress(serverProfile.session.userId, 10, 8)}
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">
                          App {serverProfile.session.appId} | Expires{' '}
                          {formatPrivyDateTime(serverProfile.session.expiration * 1000)}
                        </div>
                      </div>
                      <div className="grid gap-3">
                        {[
                          {
                            label: 'Session ID',
                            value: shortenAddress(serverProfile.session.sessionId, 10, 8),
                          },
                          {
                            label: 'Issued',
                            value: formatPrivyDateTime(serverProfile.session.issuedAt * 1000),
                          },
                          {
                            label: 'Server user record',
                            value: formatPrivyDate(serverProfile.serverUser.createdAt),
                          },
                          {
                            label: 'Alpha Points',
                            value: `${formatAlphaPoints(serverProfile.serverUser.alphaPoints.balance)} balance`,
                          },
                        ].map((field) => (
                          <div key={field.label} className="rounded-2xl border border-border bg-background/60 p-4">
                            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                              {field.label}
                            </div>
                            <div className="mt-2 text-sm font-semibold text-foreground">{field.value}</div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="rounded-2xl border border-border bg-background/60 p-4 text-sm text-muted-foreground">
                      Session verification has not been loaded yet.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-[28px] border border-border bg-card p-5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">
                  Client vs Server
                </div>
                <div className="mt-2 text-sm text-muted-foreground">
                  These checks compare the browser session user to the API-verified Privy user.
                </div>
                <div className="mt-4 space-y-3">
                  {serverProfile ? (
                    consistencyChecks.map((check) => (
                      <ConsistencyRow
                        key={check.label}
                        label={check.label}
                        matches={check.matches}
                        clientValue={check.clientValue}
                        serverValue={check.serverValue}
                      />
                    ))
                  ) : (
                    <div className="rounded-2xl border border-border bg-background/60 p-4 text-sm text-muted-foreground">
                      Run server verification to compare client and server identity fields.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-[28px] border border-border bg-card p-5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">
                  Custom Metadata
                </div>
                <div className="mt-4 rounded-2xl border border-border bg-background/70 p-4">
                  {serverProfile?.serverUser.customMetadata ? (
                    <pre className="overflow-x-auto text-xs leading-6 text-muted-foreground">
                      {JSON.stringify(serverProfile.serverUser.customMetadata, null, 2)}
                    </pre>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      No custom Privy metadata is attached to this user yet.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {tab === 'accounts' ? (
          user.linkedAccounts.length === 0 ? (
            <div className="rounded-[28px] border border-border bg-card p-5 text-sm text-muted-foreground">
              Privy did not return any linked accounts for this authenticated user.
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {user.linkedAccounts.map((account, index) => (
                <AccountRow key={`${account.type}-${index}-${getAccountValue(account)}`} account={account} />
              ))}
            </div>
          )
        ) : null}

        {tab === 'wallets' ? (
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-[28px] border border-border bg-card p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">
                    Connected Wallets
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground">
                    Wallets currently available to this browser session.
                  </div>
                </div>
                <button
                  onClick={() => linkWallet()}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground transition hover:opacity-90"
                  type="button"
                >
                  <Wallet size={13} />
                  Add Wallet
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {wallets.length === 0 ? (
                  <div className="rounded-2xl border border-border bg-background/60 p-4 text-sm text-muted-foreground">
                    No wallets are connected to this browser session yet.
                  </div>
                ) : (
                  wallets.map((wallet) => (
                    <div key={`${wallet.address}-${wallet.walletClientType}`} className="rounded-2xl border border-border bg-background/60 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-sm font-bold text-foreground">{getConnectedWalletLabel(wallet)}</div>
                            <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                              {wallet.type}
                            </span>
                            {wallet.linked ? (
                              <span className="rounded-full border border-success/20 bg-success/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-success">
                                Linked
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-2 font-mono text-xs text-muted-foreground">{wallet.address}</div>
                          <div className="mt-2 text-xs text-muted-foreground">
                            {(wallet.walletClientType ?? 'unknown wallet client')} |{' '}
                            {(wallet.connectorType ?? 'unknown connector')} | Connected{' '}
                            {formatPrivyDateTime(wallet.connectedAt)}
                          </div>
                        </div>
                        <CopyButton text={wallet.address} />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-[28px] border border-border bg-card p-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">
                Linked Wallet Inventory
              </div>
              <div className="mt-2 text-sm text-muted-foreground">
                Wallets permanently attached to the authenticated Privy user.
              </div>
              <div className="mt-4 space-y-3">
                {linkedWallets.length === 0 ? (
                  <div className="rounded-2xl border border-border bg-background/60 p-4 text-sm text-muted-foreground">
                    No wallet identities are linked to this user yet.
                  </div>
                ) : (
                  linkedWallets.map((wallet) => (
                    <div key={`${wallet.address}-${wallet.walletClientType ?? 'wallet'}`} className="rounded-2xl border border-border bg-background/60 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-foreground">
                            {wallet.walletClientType === 'privy' || wallet.walletClientType === 'privy-v2'
                              ? 'Embedded wallet'
                              : wallet.walletClientType ?? 'Wallet'}
                          </div>
                          <div className="mt-2 font-mono text-xs text-muted-foreground">{wallet.address}</div>
                          <div className="mt-2 text-xs text-muted-foreground">
                            {wallet.chainType.toUpperCase()} | {wallet.imported ? 'Imported' : 'Native'} | First linked{' '}
                            {formatPrivyDate(wallet.firstVerifiedAt)}
                          </div>
                        </div>
                        <CopyButton text={wallet.address} />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : null}

        {tab === 'security' ? (
          <div className="grid gap-4 xl:grid-cols-[0.9fr,1.1fr]">
            <div className="rounded-[28px] border border-border bg-card p-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">
                Security Status
              </div>
              <div className="mt-4 space-y-3">
                {[
                  {
                    label: 'Terms accepted',
                    value: acceptedTerms ? 'Yes' : 'No',
                  },
                  {
                    label: 'Guest account',
                    value: user.isGuest ? 'Yes' : 'No',
                  },
                  {
                    label: 'MFA methods',
                    value: user.mfaMethods.length > 0 ? user.mfaMethods.join(', ') : 'None enabled',
                  },
                  {
                    label: 'Server verification',
                    value: serverProfile?.verified ? 'Verified' : serverLoading ? 'Checking...' : 'Not verified yet',
                  },
                  {
                    label: 'Direct contact match',
                    value: serverProfile
                      ? normalizeValue(primaryContact) === normalizeValue(serverDirectContact)
                        ? 'Yes'
                        : 'No'
                      : 'Not checked',
                  },
                ].map((field) => (
                  <div key={field.label} className="rounded-2xl border border-border bg-background/60 p-4">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      {field.label}
                    </div>
                    <div className="mt-2 text-sm font-semibold text-foreground">{field.value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[28px] border border-border bg-card p-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">
                Account Actions
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <button
                  onClick={() => (user.email ? linkWallet() : linkEmail())}
                  className="rounded-2xl border border-border bg-background/70 p-4 text-left transition hover:bg-muted/40"
                  type="button"
                >
                  <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                    <Bell size={15} className="text-primary" />
                    {user.email ? 'Add another wallet' : 'Link email'}
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground">
                    {user.email
                      ? 'Open Privy and attach another wallet identity to this account.'
                      : 'Attach an email address for recovery and cross-device sign-in.'}
                  </div>
                </button>

                <button
                  onClick={() => linkWallet()}
                  className="rounded-2xl border border-border bg-background/70 p-4 text-left transition hover:bg-muted/40"
                  type="button"
                >
                  <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                    <Wallet size={15} className="text-primary" />
                    Link wallet
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground">
                    Connect and link an EVM or Solana wallet through the Privy modal.
                  </div>
                </button>

                {!nonWalletAccounts.some((account) => account.type === 'google_oauth') ? (
                  <button
                    onClick={() => linkGoogle()}
                    className="rounded-2xl border border-border bg-background/70 p-4 text-left transition hover:bg-muted/40"
                    type="button"
                  >
                    <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                      <ArrowUpRight size={15} className="text-primary" />
                      Link Google
                    </div>
                    <div className="mt-2 text-sm text-muted-foreground">
                      Add a Google identity you can use for future logins.
                    </div>
                  </button>
                ) : null}

                {!nonWalletAccounts.some((account) => account.type === 'twitter_oauth') ? (
                  <button
                    onClick={() => linkTwitter()}
                    className="rounded-2xl border border-border bg-background/70 p-4 text-left transition hover:bg-muted/40"
                    type="button"
                  >
                    <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                      <ExternalLink size={15} className="text-primary" />
                      Link X
                    </div>
                    <div className="mt-2 text-sm text-muted-foreground">
                      Attach your X account for a richer public identity profile.
                    </div>
                  </button>
                ) : null}

                <button
                  onClick={() => void loadServerProfile()}
                  className="rounded-2xl border border-border bg-background/70 p-4 text-left transition hover:bg-muted/40"
                  type="button"
                >
                  <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                    <RefreshCw size={15} className="text-primary" />
                    Re-verify session
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground">
                    Refresh the API-verified session block with a fresh Privy access token.
                  </div>
                </button>

                <button
                  onClick={() => void logout()}
                  className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-left transition hover:bg-destructive/15"
                  type="button"
                >
                  <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                    <LogOut size={15} className="text-destructive" />
                    Sign out
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground">
                    End the current Privy session and clear this browser's authenticated state.
                  </div>
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
