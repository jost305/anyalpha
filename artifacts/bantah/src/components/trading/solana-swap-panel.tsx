import { useEffect, useMemo, useState } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useConnectedStandardWallets, useStandardSignTransaction } from '@privy-io/react-auth/solana';
import { AlertTriangle, CheckCircle2, Loader2, Lock, RefreshCw, ShieldCheck, X, Zap } from 'lucide-react';
import { toast } from 'sonner';
import type { MarketToken } from '@/lib/market-data';
import {
  fetchEvmWalletBalances,
  fetchSolanaWalletBalances,
  reportEvmSwapTransaction,
  requestEvmSwapQuote,
  requestSolanaSwapQuote,
  submitSolanaSwapTransaction,
  type EvmSwapQuote,
  type EvmTransactionRequest,
  type EvmWalletBalances,
  type SolanaSwapQuote,
  type SolanaWalletBalances,
} from '@/lib/trading';
import { cn } from '@/lib/utils';

type SwapSide = 'buy' | 'sell';
type SupportedEvmChain = 'ethereum' | 'base';
type SwapQuote = SolanaSwapQuote | EvmSwapQuote;

const SLIPPAGE_OPTIONS = [
  { label: '0.5%', value: 50 },
  { label: '1%', value: 100 },
  { label: '3%', value: 300 },
];

const EVM_CHAIN_IDS: Record<SupportedEvmChain, number> = {
  ethereum: 1,
  base: 8453,
};

interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

function truncateMiddle(value: string, start = 5, end = 4) {
  if (!value) return 'n/a';
  if (value.length <= start + end + 3) return value;
  return `${value.slice(0, start)}...${value.slice(-end)}`;
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function cleanDecimalInput(value: string) {
  const cleaned = value.replace(/[^\d.]/g, '');
  const parts = cleaned.split('.');
  if (parts.length <= 2) return cleaned;
  return `${parts[0]}.${parts.slice(1).join('')}`;
}

function isPositiveAmount(value: string) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0;
}

function formatAmount(value?: string, compact = true) {
  if (!value) return '0';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  if (compact && numeric >= 1_000_000) return `${(numeric / 1_000_000).toFixed(2)}M`;
  if (compact && numeric >= 1_000) return `${(numeric / 1_000).toFixed(2)}K`;
  if (numeric >= 1) return numeric.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return numeric.toLocaleString(undefined, { maximumSignificantDigits: 5 });
}

function formatPriceImpact(value?: string) {
  if (!value) return 'n/a';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  return `${numeric.toFixed(numeric < 0.01 ? 4 : 2)}%`;
}

function pctOf(value: string | undefined, pct: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return '';
  const result = numeric * pct;
  if (result >= 1) return result.toFixed(6).replace(/\.?0+$/, '');
  return result.toPrecision(6).replace(/\.?0+$/, '');
}

function chainIsEvm(chainId: string): chainId is SupportedEvmChain {
  return chainId === 'ethereum' || chainId === 'base';
}

function evmTxForWallet(tx: EvmTransactionRequest, from: string) {
  return {
    from,
    to: tx.to,
    data: tx.data,
    value: tx.value ?? '0x0',
    gas: tx.gas ?? tx.gasLimit,
    gasPrice: tx.gasPrice,
  };
}

async function sendEvmTransaction(provider: Eip1193Provider, tx: EvmTransactionRequest, from: string) {
  const hash = await provider.request({
    method: 'eth_sendTransaction',
    params: [evmTxForWallet(tx, from)],
  });
  if (typeof hash !== 'string' || !/^0x[a-fA-F0-9]{64}$/.test(hash)) {
    throw new Error('Wallet did not return a valid transaction hash.');
  }
  return hash;
}

interface SolanaSwapPanelProps {
  token: MarketToken;
  compact?: boolean;
  initialSide?: SwapSide;
}

export default function SolanaSwapPanel({ token, compact = false, initialSide = 'buy' }: SolanaSwapPanelProps) {
  const { authenticated, getAccessToken, login, ready } = usePrivy();
  const { ready: solWalletsReady, wallets: solWallets } = useConnectedStandardWallets();
  const { ready: evmWalletsReady, wallets: evmWallets } = useWallets();
  const { signTransaction } = useStandardSignTransaction();
  const [side, setSide] = useState<SwapSide>(initialSide);
  const [amount, setAmount] = useState('');
  const [slippageBps, setSlippageBps] = useState(100);
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [solBalances, setSolBalances] = useState<SolanaWalletBalances | null>(null);
  const [evmBalances, setEvmBalances] = useState<EvmWalletBalances | null>(null);
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [balancesRefresh, setBalancesRefresh] = useState(0);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewAccepted, setReviewAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);

  const normalizedChain = token.chainId.toLowerCase();
  const isSolana = normalizedChain === 'solana';
  const isEvm = chainIsEvm(normalizedChain);
  const supported = isSolana || isEvm;
  const solWallet = solWallets[0] ?? null;
  const evmWallet = evmWallets.find((wallet) => wallet.type === 'ethereum') ?? null;
  const walletAddress = isSolana ? solWallet?.address ?? '' : evmWallet?.address ?? '';
  const walletReady = isSolana ? solWalletsReady : evmWalletsReady;
  const inputSymbol =
    side === 'buy'
      ? isSolana
        ? 'SOL'
        : 'ETH'
      : isSolana
        ? solBalances?.token.symbol ?? token.symbol
        : evmBalances?.token.symbol ?? token.symbol;
  const outputSymbol = quote?.output.symbol ?? (side === 'buy' ? token.symbol : isSolana ? 'SOL' : 'ETH');
  const spendBalance =
    side === 'buy'
      ? isSolana
        ? solBalances?.sol.amount
        : evmBalances?.native.amount
      : isSolana
        ? solBalances?.token.amount
        : evmBalances?.token.amount;
  const spendBalanceLabel = `${formatAmount(spendBalance)} ${inputSymbol}`;
  const amountFitsBalance =
    !spendBalance || !isPositiveAmount(amount) ? true : Number(amount) <= Number(spendBalance);
  const canQuote =
    ready &&
    authenticated &&
    walletReady &&
    Boolean(walletAddress) &&
    supported &&
    isPositiveAmount(amount) &&
    amountFitsBalance;

  useEffect(() => {
    setSide(initialSide);
  }, [initialSide, token.id]);

  useEffect(() => {
    setQuote(null);
    setSignatureUrl(null);
    setError(null);
    setReviewOpen(false);
    setReviewAccepted(false);
  }, [amount, side, slippageBps, token.tokenAddress, walletAddress]);

  useEffect(() => {
    setAmount('');
    setQuote(null);
    setSignatureUrl(null);
    setReviewOpen(false);
  }, [side, token.tokenAddress]);

  useEffect(() => {
    if (!supported || !authenticated || !walletAddress) {
      setSolBalances(null);
      setEvmBalances(null);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    async function loadBalances() {
      setBalancesLoading(true);
      setBalanceError(null);
      try {
        const accessToken = await getAccessToken();
        if (!accessToken) throw new Error('Sign in again to refresh balances.');

        if (isSolana) {
          const next = await fetchSolanaWalletBalances(walletAddress, token.tokenAddress, accessToken, controller.signal);
          if (!cancelled) setSolBalances(next);
        } else if (isEvm) {
          const next = await fetchEvmWalletBalances(normalizedChain, walletAddress, token.tokenAddress, accessToken, controller.signal);
          if (!cancelled) setEvmBalances(next);
        }
      } catch (err) {
        if (!cancelled && !controller.signal.aborted) {
          setSolBalances(null);
          setEvmBalances(null);
          setBalanceError(err instanceof Error ? err.message : 'Could not load wallet balances.');
        }
      } finally {
        if (!cancelled) setBalancesLoading(false);
      }
    }

    void loadBalances();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [authenticated, balancesRefresh, getAccessToken, isEvm, isSolana, normalizedChain, supported, token.tokenAddress, walletAddress]);

  const statusCopy = useMemo(() => {
    if (!supported) return 'Trading for this chain is not enabled yet. Solana, Ethereum, and Base are the first live routes.';
    if (!ready) return 'Preparing wallet session.';
    if (!authenticated) return 'Sign in to quote and sign swaps with your wallet.';
    if (!walletReady) return 'Loading connected wallets.';
    if (!walletAddress) return `Connect or create a ${isSolana ? 'Solana' : 'EVM'} wallet to trade.`;
    return `Wallet ${truncateMiddle(walletAddress)} - AnyAlpha never sees your private key.`;
  }, [authenticated, isSolana, ready, supported, walletAddress, walletReady]);

  const routeLabel = useMemo(() => {
    if (!quote) return isSolana ? 'Jupiter route' : 'LI.FI route';
    if (quote.provider === 'jupiter') return quote.quote.routeLabels.length ? quote.quote.routeLabels.join(' + ') : 'Jupiter route';
    return quote.quote.toolName ?? quote.quote.tool ?? 'LI.FI route';
  }, [isSolana, quote]);

  const safetyWarnings = useMemo(() => {
    const warnings = new Set<string>();
    if (!amountFitsBalance) warnings.add(`Amount exceeds available ${inputSymbol} balance.`);
    if (slippageBps > 100) warnings.add('Slippage is above 1%; use this only when the pair is moving fast.');
    if (token.security?.mintAuthorityDisabled === false) warnings.add('Mint authority is still active.');
    if (token.security?.freezeAuthorityDisabled === false) warnings.add('Freeze authority is still active.');
    if (token.security?.buyTax && token.security.buyTax !== '0') warnings.add(`Buy tax reported: ${token.security.buyTax}.`);
    if (token.security?.sellTax && token.security.sellTax !== '0') warnings.add(`Sell tax reported: ${token.security.sellTax}.`);
    token.riskFlags.slice(0, 3).forEach((flag) => warnings.add(flag));
    quote?.safety.warnings.forEach((warning) => warnings.add(warning));
    return Array.from(warnings);
  }, [amountFitsBalance, inputSymbol, quote?.safety.warnings, slippageBps, token.riskFlags, token.security]);

  async function handleQuote() {
    if (!supported) return;
    if (!authenticated) {
      login();
      return;
    }
    if (!walletAddress) {
      setError(`No connected ${isSolana ? 'Solana' : 'EVM'} wallet found for signing.`);
      return;
    }
    if (!isPositiveAmount(amount)) {
      setError(`Enter a ${inputSymbol} amount greater than zero.`);
      return;
    }
    if (!amountFitsBalance) {
      setError(`Amount exceeds available ${inputSymbol} balance.`);
      return;
    }

    setQuoteLoading(true);
    setError(null);

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) throw new Error('Your session is missing an access token. Sign in again.');

      const nextQuote = isSolana
        ? await requestSolanaSwapQuote(
            {
              side,
              tokenAddress: token.tokenAddress,
              pairAddress: token.pairAddress,
              walletAddress,
              amount,
              slippageBps,
            },
            accessToken,
          )
        : await requestEvmSwapQuote(
            {
              chainId: normalizedChain as SupportedEvmChain,
              side,
              tokenAddress: token.tokenAddress,
              pairAddress: token.pairAddress,
              walletAddress,
              amount,
              slippageBps,
            },
            accessToken,
          );
      setQuote(nextQuote);
      toast.success(`${nextQuote.provider === 'jupiter' ? 'Jupiter' : 'LI.FI'} quote ready`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to build swap quote.');
    } finally {
      setQuoteLoading(false);
    }
  }

  async function handleSubmit() {
    if (!quote) return;
    setSubmitting(true);
    setError(null);
    setSignatureUrl(null);

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) throw new Error('Your session is missing an access token. Sign in again.');

      if (quote.provider === 'jupiter') {
        if (!solWallet) throw new Error('No connected Solana wallet found for signing.');
        const transactionBytes = base64ToBytes(quote.transaction.serialized);
        const signed = await signTransaction({
          transaction: transactionBytes,
          wallet: solWallet,
          chain: 'solana:mainnet',
        });

        const submitted = await submitSolanaSwapTransaction(quote.audit.id, bytesToBase64(signed.signedTransaction), accessToken);
        setSignatureUrl(submitted.explorerUrl);
      } else {
        if (!evmWallet) throw new Error('No connected EVM wallet found for signing.');
        const targetChain = EVM_CHAIN_IDS[quote.chainId];
        await evmWallet.switchChain(targetChain);
        const provider = (await evmWallet.getEthereumProvider()) as Eip1193Provider;
        let approvalHash: string | undefined;

        if (quote.approval?.required) {
          approvalHash = await sendEvmTransaction(provider, quote.approval.transaction, evmWallet.address);
          await reportEvmSwapTransaction(
            {
              auditId: quote.audit.id,
              chainId: quote.chainId,
              stage: 'approval_submitted',
              transactionHash: approvalHash,
            },
            accessToken,
          );
          toast.success('Approval submitted');
        }

        const swapHash = await sendEvmTransaction(provider, quote.transaction, evmWallet.address);
        const reported = await reportEvmSwapTransaction(
          {
            auditId: quote.audit.id,
            chainId: quote.chainId,
            stage: 'submitted',
            transactionHash: swapHash,
            approvalTransactionHash: approvalHash,
          },
          accessToken,
        );
        setSignatureUrl(reported.explorerUrl);
      }

      setReviewOpen(false);
      setReviewAccepted(false);
      setBalancesRefresh((tick) => tick + 1);
      toast.success('Swap submitted');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Swap signing or submission failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={cn('border border-border bg-background/70', compact ? 'p-2' : 'p-3')}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.16em] text-primary">
            <Zap size={13} />
            Live Swap
          </div>
          <div className="mt-1 text-[11px] leading-snug text-muted-foreground">{statusCopy}</div>
        </div>
        <span
          className={cn(
            'shrink-0 border px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em]',
            supported ? 'border-green-400/25 bg-green-400/10 text-green-400' : 'border-border bg-muted text-muted-foreground',
          )}
        >
          {isSolana ? 'Solana' : isEvm ? normalizedChain : 'Locked'}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 border border-border text-sm font-black">
        {(['buy', 'sell'] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setSide(item)}
            disabled={!supported}
            className={cn(
              'px-3 py-2 transition disabled:opacity-50',
              item === 'sell' && 'border-l border-border',
              side === item
                ? item === 'buy'
                  ? 'bg-green-400/10 text-green-400'
                  : 'bg-red-400/10 text-red-400'
                : 'text-muted-foreground hover:bg-card hover:text-foreground',
            )}
          >
            {item === 'buy' ? 'Buy' : 'Sell'}
          </button>
        ))}
      </div>

      {walletAddress && supported ? (
        <div className="mt-2 grid grid-cols-[1fr_auto] items-center gap-2 border-y border-border/70 py-1.5 text-[11px]">
          <div className="min-w-0 text-muted-foreground">
            Balance:{' '}
            <span className="font-mono font-black text-foreground">
              {balancesLoading ? 'loading...' : spendBalanceLabel}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setBalancesRefresh((tick) => tick + 1)}
            className="inline-flex items-center gap-1 text-muted-foreground transition hover:text-foreground"
          >
            <RefreshCw size={12} className={balancesLoading ? 'animate-spin text-primary' : ''} />
            Refresh
          </button>
        </div>
      ) : null}

      <div className="mt-3 grid gap-2">
        <label className="grid gap-1">
          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
            Amount in {inputSymbol}
          </span>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(cleanDecimalInput(event.target.value))}
            placeholder={side === 'buy' ? (isSolana ? '0.05' : '0.01') : `100 ${token.symbol}`}
            disabled={!supported}
            className="h-10 border border-border bg-card px-3 font-mono text-sm font-black text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary"
          />
        </label>

        {side === 'buy' ? (
          <div className="grid grid-cols-3 gap-1">
            {(isSolana ? ['0.05', '0.1', '0.5'] : ['0.01', '0.05', '0.1']).map((quickAmount) => (
              <button
                key={quickAmount}
                type="button"
                disabled={!supported}
                onClick={() => setAmount(quickAmount)}
                className="border border-border bg-card px-2 py-1.5 text-xs font-bold text-muted-foreground transition hover:border-primary/35 hover:text-foreground disabled:opacity-50"
              >
                {quickAmount} {isSolana ? 'SOL' : 'ETH'}
              </button>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1">
            {[
              ['25%', 0.25],
              ['50%', 0.5],
              ['100%', 1],
            ].map(([label, pct]) => (
              <button
                key={label}
                type="button"
                disabled={!supported || !spendBalance}
                onClick={() => setAmount(pctOf(spendBalance, Number(pct)))}
                className="border border-border bg-card px-2 py-1.5 text-xs font-bold text-muted-foreground transition hover:border-primary/35 hover:text-foreground disabled:opacity-50"
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <div>
          <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Slippage</div>
          <div className="grid grid-cols-3 gap-1">
            {SLIPPAGE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setSlippageBps(option.value)}
                disabled={!supported}
                className={cn(
                  'border px-2 py-1.5 text-xs font-bold transition disabled:opacity-50',
                  slippageBps === option.value
                    ? 'border-primary bg-primary/12 text-primary'
                    : 'border-border bg-card text-muted-foreground hover:border-primary/35 hover:text-foreground',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={handleQuote}
          disabled={!supported || quoteLoading || (!canQuote && authenticated)}
          className="inline-flex h-10 items-center justify-center gap-2 border border-primary/35 bg-primary px-3 text-sm font-black text-primary-foreground transition hover:brightness-110 disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground"
        >
          {quoteLoading ? <Loader2 size={15} className="animate-spin" /> : authenticated ? <ShieldCheck size={15} /> : <Lock size={15} />}
          {authenticated ? `Get ${side} quote` : 'Sign in to trade'}
        </button>
      </div>

      {quote ? (
        <div className="mt-3 border border-green-400/20 bg-green-400/5 p-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold text-green-400">Estimated receive</span>
            <span className="font-mono font-black text-foreground">
              {formatAmount(quote.output.amount)} {outputSymbol}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-2 text-muted-foreground">
            <span>Route</span>
            <span className="truncate text-right">{routeLabel}</span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-2 text-muted-foreground">
            <span>Impact / Slippage</span>
            <span>
              {formatPriceImpact(quote.quote.priceImpactPct)} / {(quote.quote.slippageBps / 100).toFixed(2)}%
            </span>
          </div>
          {quote.provider === 'lifi' && quote.approval?.required ? (
            <div className="mt-1 text-yellow-200">Approval required before swap. AnyAlpha uses exact-amount approval.</div>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setReviewAccepted(false);
              setReviewOpen(true);
            }}
            disabled={submitting}
            className={cn(
              'mt-2 inline-flex h-10 w-full items-center justify-center gap-2 border px-3 text-sm font-black transition disabled:opacity-60',
              side === 'buy'
                ? 'border-green-400/30 bg-green-400/15 text-green-300 hover:bg-green-400/20'
                : 'border-red-400/30 bg-red-400/15 text-red-300 hover:bg-red-400/20',
            )}
          >
            <CheckCircle2 size={15} />
            Review before signing
          </button>
        </div>
      ) : null}

      {signatureUrl ? (
        <a
          href={signatureUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-2 block border border-green-400/25 bg-green-400/10 px-2 py-2 text-center text-xs font-bold text-green-300 transition hover:bg-green-400/15"
        >
          View submitted transaction
        </a>
      ) : null}

      {balanceError ? (
        <div className="mt-2 flex gap-2 border border-yellow-400/25 bg-yellow-400/10 px-2 py-2 text-xs text-yellow-200">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{balanceError}</span>
        </div>
      ) : null}

      {error ? (
        <div className="mt-2 flex gap-2 border border-red-400/25 bg-red-400/10 px-2 py-2 text-xs text-red-300">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="mt-2 text-[10px] leading-snug text-muted-foreground">
        Quotes and submissions are stored to your AnyAlpha audit trail. Review every wallet prompt before signing.
      </div>

      {reviewOpen && quote ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 p-2 backdrop-blur sm:items-center">
          <div className="w-full max-w-md border border-border bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <div>
                <div className="text-sm font-black">Review Swap</div>
                <div className="text-[11px] text-muted-foreground">
                  {side.toUpperCase()} {token.symbol} on {token.chainLabel || token.chainId}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReviewOpen(false)}
                className="border border-border p-1 text-muted-foreground transition hover:text-foreground"
              >
                <X size={15} />
              </button>
            </div>

            <div className="space-y-2 p-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div className="border border-border bg-background/60 p-2">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">You spend</div>
                  <div className="mt-1 font-mono font-black text-foreground">
                    {formatAmount(quote.input.amount, false)} {quote.input.symbol ?? inputSymbol}
                  </div>
                </div>
                <div className="border border-border bg-background/60 p-2">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">You receive est.</div>
                  <div className="mt-1 font-mono font-black text-foreground">
                    {formatAmount(quote.output.amount, false)} {quote.output.symbol ?? outputSymbol}
                  </div>
                </div>
              </div>

              <div className="grid gap-1 border border-border bg-background/50 p-2 text-muted-foreground">
                <div className="flex justify-between gap-2">
                  <span>Provider</span>
                  <span className="font-bold text-foreground">{quote.provider === 'jupiter' ? 'Jupiter' : 'LI.FI'}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span>Route</span>
                  <span className="truncate text-right font-bold text-foreground">{routeLabel}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span>Price impact</span>
                  <span className="font-bold text-foreground">{formatPriceImpact(quote.quote.priceImpactPct)}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span>Max slippage</span>
                  <span className="font-bold text-foreground">{(quote.quote.slippageBps / 100).toFixed(2)}%</span>
                </div>
              </div>

              {safetyWarnings.length ? (
                <div className="border border-yellow-400/25 bg-yellow-400/10 p-2 text-yellow-100">
                  <div className="mb-1 flex items-center gap-1 font-black">
                    <AlertTriangle size={14} />
                    Safety checks
                  </div>
                  <div className="space-y-1">
                    {safetyWarnings.map((warning) => (
                      <div key={warning}>- {warning}</div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="border border-green-400/20 bg-green-400/10 p-2 text-green-200">
                  No elevated route warnings detected. Still confirm the wallet prompt carefully.
                </div>
              )}

              <label className="flex items-start gap-2 border border-border bg-background/60 p-2 text-muted-foreground">
                <input
                  type="checkbox"
                  checked={reviewAccepted}
                  onChange={(event) => setReviewAccepted(event.target.checked)}
                  className="mt-0.5"
                />
                <span>I reviewed the amount, route, slippage, approvals, and wallet prompt risk.</span>
              </label>

              <button
                type="button"
                onClick={handleSubmit}
                disabled={!reviewAccepted || submitting}
                className={cn(
                  'inline-flex h-10 w-full items-center justify-center gap-2 border px-3 text-sm font-black transition disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground',
                  side === 'buy'
                    ? 'border-green-400/35 bg-green-400/15 text-green-300 hover:bg-green-400/20'
                    : 'border-red-400/35 bg-red-400/15 text-red-300 hover:bg-red-400/20',
                )}
              >
                {submitting ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
                {quote.provider === 'lifi' && quote.approval?.required ? `Approve then ${side}` : `Sign and ${side}`}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
