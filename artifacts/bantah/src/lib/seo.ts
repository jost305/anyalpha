import type { MarketToken } from './market-data';
import { fmtCompact, fmtPct, fmtPrice, marketPairLabel, marketTokenUrl } from './market-data';

const SITE_NAME = 'AnyAlpha Terminal';
const DEFAULT_TITLE = 'AnyAlpha Terminal | Live Crypto Market Intelligence';
const DEFAULT_DESCRIPTION =
  'Search tokens, scan live pairs, track wallets, follow launch activity, and review market signals from one compact AnyAlpha terminal.';
const DEFAULT_IMAGE = '/opengraph.jpg';

export interface SeoMeta {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  type?: string;
}

function absoluteUrl(value: string | undefined): string {
  const fallback = DEFAULT_IMAGE;
  const raw = value?.trim() || fallback;

  if (/^https?:\/\//i.test(raw)) return raw;
  const path = raw.startsWith('/') ? raw : `/${raw}`;
  return `${window.location.origin}${path}`;
}

function setMeta(selector: { name?: string; property?: string }, content: string) {
  const attr = selector.property ? 'property' : 'name';
  const key = selector.property ?? selector.name;
  if (!key) return;

  let node = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);

  if (!node) {
    node = document.createElement('meta');
    node.setAttribute(attr, key);
    document.head.appendChild(node);
  }

  node.setAttribute('content', content);
}

function setCanonical(url: string) {
  let node = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');

  if (!node) {
    node = document.createElement('link');
    node.setAttribute('rel', 'canonical');
    document.head.appendChild(node);
  }

  node.setAttribute('href', url);
}

export function applySeoMeta(meta: SeoMeta = {}) {
  const title = meta.title ?? DEFAULT_TITLE;
  const description = meta.description ?? DEFAULT_DESCRIPTION;
  const image = absoluteUrl(meta.image);
  const url = absoluteUrl(meta.url ?? window.location.pathname + window.location.search);
  const type = meta.type ?? 'website';

  document.title = title;

  setMeta({ name: 'description' }, description);
  setMeta({ name: 'theme-color' }, '#0f1117');

  setMeta({ property: 'og:site_name' }, SITE_NAME);
  setMeta({ property: 'og:type' }, type);
  setMeta({ property: 'og:title' }, title);
  setMeta({ property: 'og:description' }, description);
  setMeta({ property: 'og:image' }, image);
  setMeta({ property: 'og:url' }, url);

  setMeta({ name: 'twitter:card' }, 'summary_large_image');
  setMeta({ name: 'twitter:title' }, title);
  setMeta({ name: 'twitter:description' }, description);
  setMeta({ name: 'twitter:image' }, image);

  setCanonical(url);
}

export function pageSeo(page: string): SeoMeta {
  const path = window.location.pathname + window.location.search;
  const pages: Record<string, SeoMeta> = {
    markets: {
      title: 'AnyAlpha Markets | Live Token Discovery',
      description: 'Scan trending pairs, fresh launches, high-volume tokens, and cross-chain market movement in AnyAlpha.',
    },
    launchpad: {
      title: 'AnyAlpha Trenches | Launch Feed',
      description: 'Track new pairs, final-stretch launches, and migrated pools from a compact AnyAlpha launch feed.',
    },
    watcher: {
      title: 'AnyAlpha Watcher | Wallet Intelligence',
      description: 'Follow wallets, organize trader activity, and receive alerts from the AnyAlpha wallet intelligence layer.',
    },
    'twitter-track': {
      title: 'AnyAlpha Twitter Track | Social Market Signals',
      description: 'Monitor tracked X accounts, token mentions, and social market activity inside AnyAlpha.',
    },
    verify: {
      title: 'AnyAlpha Verification | Trust Layer',
      description: 'Submit and review project verification requests through the AnyAlpha trust layer.',
    },
    watchlist: {
      title: 'AnyAlpha Watchlist | Saved Markets',
      description: 'Keep high-interest tokens in one live AnyAlpha workspace tied to your account.',
    },
    points: {
      title: 'AnyAlpha Rewards | Referrals & Points',
      description: 'Track AnyAlpha rewards, referrals, Telegram sync, and user activity points.',
    },
    leaderboard: {
      title: 'AnyAlpha Leaderboard | Rankings',
      description: 'View rankings across points, referrals, and market activity inside AnyAlpha.',
    },
    chat: {
      title: 'AnyAlpha AI Agent | Market Copilot',
      description: 'Use the AnyAlpha AI Agent to summarize market context, signals, watchlists, and token research.',
    },
    advertise: {
      title: 'Advertise on AnyAlpha',
      description: 'Reach active market participants through labeled AnyAlpha visibility placements.',
    },
    docs: {
      title: 'AnyAlpha Docs | Feature Guide',
      description: 'Learn how AnyAlpha Markets, Watcher, Verification, Rewards, Twitter Track, and upcoming tools work.',
    },
    notifications: {
      title: 'AnyAlpha Notifications | Market Alerts',
      description: 'Review live AnyAlpha notifications, market prompts, and account alerts.',
    },
    profile: {
      title: 'AnyAlpha Profile | Account',
      description: 'Manage your AnyAlpha account, wallet profile, Telegram sync, and connected identity surfaces.',
    },
    search: {
      title: 'AnyAlpha Search | Token, Pair, Chain',
      description: 'Search live tokens, pairs, contracts, projects, and chains from AnyAlpha.',
    },
  };

  return {
    ...(pages[page] ?? {}),
    url: path,
    image: DEFAULT_IMAGE,
  };
}

export function tokenSeo(token: MarketToken): SeoMeta {
  const pair = marketPairLabel(token);
  const change = fmtPct(token.priceChange.h24);
  const price = fmtPrice(token.priceUsd);
  const marketCap = fmtCompact(token.marketCap ?? token.fdv, { currency: true });
  const volume = fmtCompact(token.volume.h24, { currency: true });
  const title = `${pair} on AnyAlpha | ${price}`;
  const description = `${token.name} live token view. 24h ${change}, market cap ${marketCap}, volume ${volume}, chain ${token.chainLabel}.`;

  return {
    title,
    description,
    image: token.openGraph ?? token.imageUrl ?? DEFAULT_IMAGE,
    url: marketTokenUrl(token),
    type: 'website',
  };
}
