import { cn } from '@/lib/utils';

type DocStatus = 'Live' | 'Upcoming' | 'Beta';

interface DocSection {
  id: string;
  title: string;
  eyebrow: string;
  status: DocStatus;
  emoji: string;
  summary: string;
  points: string[];
}

const statusClass: Record<DocStatus, string> = {
  Live: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-400',
  Beta: 'border-sky-400/25 bg-sky-400/10 text-sky-400',
  Upcoming: 'border-primary/25 bg-primary/10 text-primary',
};

const sections: DocSection[] = [
  {
    id: 'what-is-anyalpha',
    title: 'What is AnyAlpha?',
    eyebrow: 'Start here',
    status: 'Live',
    emoji: '📘',
    summary:
      'AnyAlpha is a crypto market terminal built to help traders spot live opportunities, understand context faster, and move from discovery to monitoring without bouncing between a dozen tabs.',
    points: [
      'It is different from a plain screener because discovery, launch activity, watchlists, signals, wallet intelligence, and upcoming social/AI workflows live in one compact workspace.',
      'The platform is organized around trader flow: find what is moving, inspect the setup, save what matters, monitor changes, and act only after reviewing context.',
      'AnyAlpha focuses on readable signal and workflow speed. It helps you see more clearly, but it does not replace your judgment or guarantee outcomes.',
    ],
  },
  {
    id: 'markets',
    title: 'Market Discovery',
    eyebrow: 'Find action fast',
    status: 'Live',
    emoji: '🔎',
    summary: 'Search and scan live token, pair, project, contract, and chain activity from one terminal view.',
    points: [
      'Use Trending, Fresh Pairs, 24h Movers, and High Volume modes to change the type of opportunity you are scanning.',
      'Filter by chain when a feed gets noisy or when you only want to focus on one ecosystem.',
      'Open any pair into a fuller token view when something deserves deeper review.',
    ],
  },
  {
    id: 'token-dashboard',
    title: 'Token Dashboard',
    eyebrow: 'Pair context',
    status: 'Live',
    emoji: '🎯',
    summary: 'A focused token view for price action, liquidity, volume, market cap, links, and signal context.',
    points: [
      'Track headline stats without leaving the terminal.',
      'Review liquidity, recent movement, market cap, and public token links in one place.',
      'Use the dashboard as the handoff point from discovery into a decision workflow.',
    ],
  },
  {
    id: 'launchpad',
    title: 'Trenches Pulse',
    eyebrow: 'New launches',
    status: 'Live',
    emoji: '🚀',
    summary: 'A compact launch feed for new pairs, bonding-stage tokens, and migrated pools.',
    points: [
      'Switch chains to focus on the launch ecosystems you actually trade.',
      'Compare New Pairs, Final Stretch, and Migrated columns without opening separate tools.',
      'Use quick security, holder, trader, volume, and bonding hints to decide what needs attention.',
    ],
  },
  {
    id: 'watchlist',
    title: 'Watchlist',
    eyebrow: 'Saved markets',
    status: 'Live',
    emoji: '⭐',
    summary: 'Keep high-interest tokens in a persistent personal list tied to your signed-in profile.',
    points: [
      'Save tokens from market tables and revisit them later.',
      'Use Watchlist as a cleaner workspace for names you are actively monitoring.',
      'Remove stale items when a setup no longer matters.',
    ],
  },
  {
    id: 'signals',
    title: 'Signals & Notifications',
    eyebrow: 'Market prompts',
    status: 'Live',
    emoji: '🔔',
    summary: 'Signal cards surface notable activity so you can catch movement without manually refreshing every feed.',
    points: [
      'See momentum, new-pair, volume, and market-context alerts in a compact stream.',
      'Use notifications as prompts for review, not automatic trade instructions.',
      'Signed-in users get a cleaner notification state across sessions.',
    ],
  },
  {
    id: 'points-referrals',
    title: 'AnyAlpha Rewards & Referrals',
    eyebrow: 'Growth ledger',
    status: 'Live',
    emoji: '\u{1F3C6}',
    summary: 'A signed-in rewards ledger for real platform activity, referrals, streaks, and wallet-tracker milestones.',
    points: [
      'Each user gets terminal and Telegram referral links tied to one referral code.',
      'Rewards are stored as ledger entries, then rolled into tier, streak, leaderboard, and referral-dashboard totals.',
      'Referrers earn direct join rewards plus passive points when referred users keep earning.',
    ],
  },
  {
    id: 'watcher',
    title: 'Watcher',
    eyebrow: 'Wallet intelligence',
    status: 'Beta',
    emoji: '🔭',
    summary: 'Watcher lets signed-in users save real wallet addresses and review recorded activity from one compact board.',
    points: [
      'Track Solana, Ethereum, Base, and Arbitrum wallets from your authenticated profile.',
      'Keep alert mode, label, chain, and activity history organized without browser-only mock state.',
      'Wallet activity appears from recorded provider/webhook transaction rows only.',
    ],
  },
  {
    id: 'twitter-track',
    title: 'Twitter Track',
    eyebrow: 'Social alpha',
    status: 'Upcoming',
    emoji: '🐦',
    summary: 'Twitter Track will connect token discovery with public market conversation and creator activity.',
    points: [
      'Monitor token mentions, creator chatter, and narrative shifts from the terminal.',
      'Connect social momentum with market context before opening a token dashboard.',
      'Separate broad attention from higher-signal activity as the feature matures.',
    ],
  },
  {
    id: 'ai-agent',
    title: 'AI Agent',
    eyebrow: 'Terminal copilot',
    status: 'Upcoming',
    emoji: '🤖',
    summary: 'The AI Agent will help summarize markets, explain signals, and turn messy context into clearer next steps.',
    points: [
      'Ask plain-language questions about tokens, watchlists, launch activity, and signal context.',
      'Get concise summaries that highlight what changed, what matters, and what still needs review.',
      'Use the agent for research support and workflow speed, not as financial advice.',
    ],
  },
  {
    id: 'verification',
    title: 'AnyAlpha Verification',
    eyebrow: 'Trust layer',
    status: 'Live',
    emoji: '✅',
    summary: 'Verification gives serious projects a real submission lane, public status tracking, and a clearer trust surface inside the terminal.',
    points: [
      'Projects can submit official contract and social surfaces, then track review status through a dedicated verification workflow.',
      'Trust badges make official projects easier to distinguish from clones, impersonators, and noisy copycats.',
      'Approved projects receive anti-clone protection and a cleaner legitimacy layer across AnyAlpha surfaces.',
    ],
  },
  {
    id: 'blinks',
    title: 'Blinks Actions',
    eyebrow: 'Portable actions',
    status: 'Upcoming',
    emoji: '🔗',
    summary: 'Blinks Actions will make selected AnyAlpha workflows easier to launch from shareable action surfaces.',
    points: [
      'Turn supported token, watchlist, alert, and discovery actions into lightweight entry points.',
      'Move from a shared signal into a relevant AnyAlpha workflow with less friction.',
      'Keep actions explicit so users can review context before doing anything meaningful.',
    ],
  },
  {
    id: 'what-we-use',
    title: 'What We Use',
    eyebrow: 'Platform ingredients',
    status: 'Live',
    emoji: '🛡️',
    summary: 'AnyAlpha combines live market context, wallet-aware workflows, public token metadata, and signal scoring into one workspace.',
    points: [
      'Market, pair, launch, wallet, social, and profile context are organized into user-facing terminal views.',
      'Wallet sign-in powers personal surfaces like Watchlist, notifications, and profile-aware workflows.',
      'Safety language is intentionally practical: the platform helps you review context, but it does not guarantee outcomes.',
    ],
  },
];

const quickLinks = sections.map(({ emoji, id, title, status }) => ({ emoji, id, title, status }));

function StatusPill({ status }: { status: DocStatus }) {
  return (
    <span className={cn('shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.14em]', statusClass[status])}>
      {status}
    </span>
  );
}

function DocCard({ section }: { section: DocSection }) {
  return (
    <section id={section.id} className="scroll-mt-24 border-b border-border bg-card px-3 py-3 last:border-b-0 sm:px-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center border border-primary/25 bg-primary/10 text-lg leading-none">
          {section.emoji}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{section.eyebrow}</div>
              <h2 className="mt-0.5 truncate text-base font-black tracking-tight text-foreground">{section.title}</h2>
            </div>
            <StatusPill status={section.status} />
          </div>

          <p className="mt-1.5 max-w-3xl text-xs leading-5 text-muted-foreground sm:text-sm">{section.summary}</p>

          <div className="mt-2 grid gap-1.5 sm:grid-cols-3">
            {section.points.map((point) => (
              <div key={point} className="border border-border/75 bg-background/55 px-2.5 py-2 text-[11px] leading-4 text-muted-foreground">
                {point}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export default function DocsPage() {
  return (
    <div className="motion-stagger flex h-full min-h-0 flex-col overflow-hidden">
      <div className="surface-sheen flex min-h-0 flex-1 flex-col overflow-hidden rounded border border-border bg-card">
        <div className="shrink-0 border-b border-border bg-background px-3 py-2 sm:px-4">
          <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-primary">
                <span className="text-sm leading-none">📘</span>
                Docs
              </div>
            </div>
          </div>

          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5">
            {quickLinks.map((link) => (
              <a
                key={link.id}
                href={`#${link.id}`}
                className="tap-feedback inline-flex shrink-0 items-center gap-1.5 border border-border bg-card px-2.5 py-1 text-[11px] font-bold text-muted-foreground transition hover:border-primary/35 hover:text-foreground"
              >
                <span className="text-xs leading-none">{link.emoji}</span>
                <span>{link.title}</span>
                <span className={cn('h-1.5 w-1.5 rounded-full', link.status === 'Live' && 'bg-emerald-400', link.status === 'Beta' && 'bg-sky-400', link.status === 'Upcoming' && 'bg-primary')} />
              </a>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-background/40">
          <div className="mx-auto max-w-6xl border-x border-border/60 bg-card">
            {sections.map((section) => (
              <DocCard key={section.id} section={section} />
            ))}

            <div className="border-t border-border bg-background px-3 py-3 sm:px-4">
              <div className="flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm leading-none">🧭</span>
                  Docs explain product behavior and user workflows only.
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm leading-none">⚠️</span>
                  Nothing here is financial advice.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
