import { Megaphone, Send, Twitter } from 'lucide-react';

const adSlots = [
  {
    icon: '🔥',
    name: 'Hot Ticker Slot',
    tag: 'Ticker',
    description: 'Top bar visibility while traders scan live prices.',
    surface: 'anyAlpha',
    color: 'text-orange-400',
    border: 'border-orange-500/30',
    bg: 'bg-orange-500/5',
  },
  {
    icon: '📌',
    name: 'Sidebar Feature',
    tag: 'Sidebar',
    description: 'Persistent coin placement in the anyAlpha rail.',
    surface: 'anyAlpha',
    color: 'text-blue-400',
    border: 'border-blue-500/30',
    bg: 'bg-blue-500/5',
  },
  {
    icon: '📊',
    name: 'Market Spotlight',
    tag: 'Markets',
    description: 'Featured promo inside markets and prediction flows.',
    surface: 'anyAlpha',
    color: 'text-green-400',
    border: 'border-green-500/30',
    bg: 'bg-green-500/5',
  },
  {
    icon: '📰',
    name: 'Feed Boost',
    tag: 'Feed',
    description: 'Sponsored post placement in the activity feed.',
    surface: 'anyAlpha',
    color: 'text-primary',
    border: 'border-primary/30',
    bg: 'bg-primary/5',
  },
];

const adSlotEmoji: Record<string, string> = {
  'Hot Ticker Slot': '🔥',
  'Sidebar Feature': '📌',
  'Market Spotlight': '📊',
  'Feed Boost': '📰',
};

const partnerTypes = [
  {
    icon: '🚀',
    name: 'Launch Partners',
    desc: 'Co-market new tokens, agents, prediction markets, and community campaigns.',
  },
  {
    icon: '📡',
    name: 'Media Partners',
    desc: 'Bring anyAlpha placements into newsletters, Telegram rooms, X Spaces, and trading communities.',
  },
  {
    icon: '🔗',
    name: 'Ecosystem Partners',
    desc: 'Collaborate across chains, launchpads, DEX tools, market data, and creator networks.',
  },
];

const partnerEmoji: Record<string, string> = {
  'Launch Partners': '🚀',
  'Media Partners': '📡',
  'Ecosystem Partners': '🔗',
};

export default function AdvertisePage() {
  return (
    <div className="h-full overflow-y-auto bg-background text-foreground">
      <div className="mx-auto max-w-3xl space-y-8 px-4 pb-8 pt-4 md:space-y-10 md:py-8">

        {/* Hero */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/30 text-primary text-xs font-bold px-3 py-1 rounded-full">
            <Megaphone size={12} />
            SELF-SERVE ADS FROM $99
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Reach real crypto degens with<br />
            <span className="text-primary">anyAlpha Ads</span>
          </h1>
          <p className="text-muted-foreground text-sm max-w-lg mx-auto">
            Put your coin in front of active traders, market watchers, and agent users inside the anyAlpha terminal.
          </p>

          <div className="flex flex-wrap justify-center gap-3 pt-2">
            {[
              { label: 'Starter slots', value: 'From $99' },
              { label: 'Ad surfaces', value: '5 live areas' },
              { label: 'Audience', value: 'Crypto degens' },
              { label: 'Contact', value: '@anyalpha' },
            ].map((stat) => (
              <div key={stat.label} className="bg-card border border-border rounded-lg px-4 py-2 text-center min-w-[100px]">
                <div className="text-xs text-muted-foreground">{stat.label}</div>
                <div className="text-sm font-bold text-primary mt-0.5">{stat.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Ad Slots */}
        <section className="space-y-3">
          <h2 className="text-base font-bold text-muted-foreground uppercase tracking-widest border-b border-border pb-2">
            Ad Surfaces
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {adSlots.map((slot) => (
              <div key={slot.name} className={`rounded-lg border ${slot.border} ${slot.bg} p-4 space-y-2`}>
                <div className="flex items-start justify-between">
                  <span className="text-2xl">{adSlotEmoji[slot.name] ?? slot.icon}</span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded border ${slot.border} ${slot.color}`}>{slot.tag}</span>
                </div>
                <div className="font-bold text-sm">{slot.name}</div>
                <p className="text-xs text-muted-foreground">{slot.description}</p>
                <div className="text-xs text-muted-foreground/60 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                  {slot.surface}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Partnerships */}
        <section className="space-y-3">
          <h2 className="text-base font-bold text-muted-foreground uppercase tracking-widest border-b border-border pb-2">Partnerships</h2>
          <p className="text-xs text-muted-foreground">For teams that want more than a paid ad slot.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {partnerTypes.map((p) => (
              <div key={p.name} className="bg-card border border-border rounded-lg p-4 space-y-2">
                <div className="text-xl">{partnerEmoji[p.name] ?? p.icon}</div>
                <div className="text-sm font-bold">{p.name}</div>
                <p className="text-xs text-muted-foreground">{p.desc}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Pitch partnerships via Telegram or X.</p>
          <div className="flex gap-2">
            <a href="https://t.me/anyalpha" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-blue-500/10 border border-blue-500/30 text-blue-400 rounded hover:opacity-80 transition">
              <Send size={12} /> Telegram @anyalpha
            </a>
            <a href="https://x.com/anyalpha" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-muted border border-border text-muted-foreground rounded hover:opacity-80 transition">
              <Twitter size={12} /> X @anyalpha
            </a>
          </div>
        </section>

        {/* CTA */}
        <section className="bg-primary/5 border border-primary/20 rounded-xl p-6 text-center space-y-3">
          <div className="text-lg font-bold">Want a slot?</div>
          <p className="text-sm text-muted-foreground">Message anyAlpha and we will confirm placement, timing, and creative specs.</p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <a href="https://t.me/anyalpha" target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground font-bold text-sm px-5 py-2 rounded hover:opacity-80 transition">
              <Send size={14} /> Telegram
            </a>
            <a href="https://x.com/anyalpha" target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 bg-card border border-border text-foreground font-bold text-sm px-5 py-2 rounded hover:opacity-80 transition">
              <Twitter size={14} /> Twitter / X
            </a>
          </div>
        </section>

      </div>
    </div>
  );
}
