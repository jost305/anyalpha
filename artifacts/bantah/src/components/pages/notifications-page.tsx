import { useState, useEffect } from 'react';
import { Bell, TrendingUp, CheckCheck, Trash2, Zap, Swords, AlertTriangle, Info } from 'lucide-react';

type NType = 'price' | 'tx' | 'battle' | 'system' | 'signal';

interface Notification {
  id: string;
  type: NType;
  title: string;
  body: string;
  time: string;
  read: boolean;
  token?: string;
}

const TYPE_META: Record<NType, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  price:  { icon: TrendingUp,    color: 'text-green-400',  bg: 'bg-green-400/10',  label: 'Price Alert'  },
  tx:     { icon: CheckCheck,    color: 'text-blue-400',   bg: 'bg-blue-400/10',   label: 'Transaction'  },
  battle: { icon: Swords,        color: 'text-purple-400', bg: 'bg-purple-400/10', label: 'Battle'       },
  signal: { icon: Zap,           color: 'text-yellow-400', bg: 'bg-yellow-400/10', label: 'Signal'       },
  system: { icon: Info,          color: 'text-muted-foreground', bg: 'bg-muted',   label: 'System'       },
};

let _id = 100;
function uid() { return String(++_id); }

const SEED: Notification[] = [
  { id: uid(), type: 'price',  title: 'PEPEFUN hit target',      body: 'PEPE/SOL crossed $0.0000135 — your alert triggered.',          time: '2m ago',  read: false, token: 'PEPEFUN'  },
  { id: uid(), type: 'battle', title: 'Battle started: NADS vs GIGA', body: 'A new agent battle is live on Monad. 124 BXBT at stake.',  time: '5m ago',  read: false  },
  { id: uid(), type: 'signal', title: 'Strong BUY signal — BANTAH', body: 'Volume spike +340% detected on BANTAH/SOL.',                  time: '9m ago',  read: false, token: 'BANTAH'   },
  { id: uid(), type: 'tx',    title: 'Swap confirmed',            body: '0.5 SOL → 12,400 PEPEFUN · tx 7Kea...mp9B',                   time: '12m ago', read: true   },
  { id: uid(), type: 'price', title: 'DOGS approaching target',   body: 'DOGS/TON is 2.1% from your $0.000085 alert.',                 time: '18m ago', read: true,  token: 'DOGS'     },
  { id: uid(), type: 'system', title: 'Welcome to anyAlpha',      body: 'Your account is set up. Explore markets and set price alerts.', time: '1h ago',  read: true   },
  { id: uid(), type: 'battle', title: 'BullBot won the battle',   body: 'BullBot vs T6Agent — BullBot wins with +18.4% return.',        time: '2h ago',  read: true   },
  { id: uid(), type: 'signal', title: 'Bearish divergence — ETH', body: 'RSI divergence detected on AIGEN/ETH 4h chart.',              time: '3h ago',  read: true,  token: 'AIGEN'    },
  { id: uid(), type: 'tx',    title: 'Stake confirmed',           body: '200 BXBT staked to battle pool. Expected resolution: 24h.',   time: '5h ago',  read: true   },
  { id: uid(), type: 'price', title: 'BOLTAI alert triggered',    body: 'BOLTAI/SOL crossed $0.0051 upward.',                          time: '6h ago',  read: true,  token: 'BOLTAI'   },
];

const LIVE_POOL: Omit<Notification, 'id' | 'time' | 'read'>[] = [
  { type: 'price',  title: 'Price alert triggered',   body: 'Your tracked token crossed the target price.',        token: 'PEPEFUN' },
  { type: 'signal', title: 'Volume surge detected',   body: 'Unusual volume spike on a top-10 mover.'             },
  { type: 'battle', title: 'New battle opening',      body: 'An agent battle is forming. Stake BXBT to join.'     },
  { type: 'tx',    title: 'Transaction confirmed',    body: 'Your last on-chain transaction was confirmed.'        },
  { type: 'signal', title: 'Bullish crossover',       body: 'MA50 crossed MA200 on a SOL pair you follow.'        },
  { type: 'price',  title: 'PURR near target',        body: 'PURR/HYPE is within 1.5% of your alert level.',      token: 'PURR'    },
];

const TABS = ['All', 'Price Alerts', 'Transactions', 'Battles', 'Signals', 'System'] as const;
type Tab = typeof TABS[number];

function tabMatchType(tab: Tab, type: NType): boolean {
  if (tab === 'All')          return true;
  if (tab === 'Price Alerts') return type === 'price';
  if (tab === 'Transactions') return type === 'tx';
  if (tab === 'Battles')      return type === 'battle';
  if (tab === 'Signals')      return type === 'signal';
  if (tab === 'System')       return type === 'system';
  return true;
}

function timeNow() {
  return 'Just now';
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>(SEED);
  const [tab, setTab] = useState<Tab>('All');

  const unread = notifications.filter(n => !n.read).length;

  // Auto-generate a new notification every ~12s
  useEffect(() => {
    const id = setInterval(() => {
      const template = LIVE_POOL[Math.floor(Math.random() * LIVE_POOL.length)];
      setNotifications(prev => [
        { ...template, id: uid(), time: timeNow(), read: false },
        ...prev,
      ]);
    }, 12000);
    return () => clearInterval(id);
  }, []);

  const markAllRead = () => setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  const clearAll    = () => setNotifications(prev => prev.filter(n => !n.read));
  const markRead    = (id: string) => setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  const dismiss     = (id: string) => setNotifications(prev => prev.filter(n => n.id !== id));

  const visible = notifications.filter(n => tabMatchType(tab, n.type));

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">

      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell size={16} className="text-primary" />
          <span className="font-bold text-sm">Notifications</span>
          {unread > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-destructive text-white animate-pulse">
              {unread} new
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={markAllRead}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition px-2 py-1 border border-border rounded hover:bg-muted"
          >
            <CheckCheck size={11} /> Mark all read
          </button>
          <button
            onClick={clearAll}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition px-2 py-1 border border-border rounded hover:bg-muted"
          >
            <Trash2 size={11} /> Clear read
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="shrink-0 flex items-center gap-0 border-b border-border overflow-x-auto">
        {TABS.map(t => {
          const count = t === 'All'
            ? notifications.filter(n => !n.read).length
            : notifications.filter(n => tabMatchType(t, n.type) && !n.read).length;
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex items-center gap-1.5 text-xs px-3 py-2 border-b-2 transition whitespace-nowrap shrink-0 ${
                tab === t
                  ? 'border-primary text-foreground font-bold'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t}
              {count > 0 && (
                <span className="text-[9px] font-bold px-1 py-0.5 rounded-full bg-destructive/80 text-white min-w-[14px] text-center">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
            <Bell size={28} className="opacity-20" />
            <span className="text-sm">No notifications here</span>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {visible.map(n => {
              const meta = TYPE_META[n.type];
              const Icon = meta.icon;
              return (
                <div
                  key={n.id}
                  onClick={() => markRead(n.id)}
                  className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition hover:bg-muted/40 ${
                    !n.read ? 'bg-primary/3' : ''
                  }`}
                >
                  {/* Icon */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${meta.bg}`}>
                    <Icon size={14} className={meta.color} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          {!n.read && (
                            <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                          )}
                          <span className="text-xs font-bold text-foreground">{n.title}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{n.body}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${meta.bg} ${meta.color}`}>
                            {meta.label}
                          </span>
                          {n.token && (
                            <span className="text-[10px] text-muted-foreground font-mono">{n.token}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">{n.time}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); dismiss(n.id); }}
                          className="text-muted-foreground hover:text-destructive transition opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-muted"
                          title="Dismiss"
                        >
                          <Trash2 size={10} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
