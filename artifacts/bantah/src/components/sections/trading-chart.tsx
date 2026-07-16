import { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { Bell, Star } from 'lucide-react';
import { toast } from 'sonner';
import { ChartSkeleton } from '@/components/common/skeletons';
import { LiveBadge } from '@/components/common/chips';

interface ChartProps {
  token: string;
  onOpenPriceAlert?: () => void;
  onOpenWatchlist?: () => void;
}

const generateChartData = () => {
  const data = [];
  const now = new Date();
  for (let i = 24; i >= 0; i--) {
    const time = new Date(now.getTime() - i * 60 * 60 * 1000);
    const basePrice = 0.00001248;
    const variance = basePrice * (Math.random() * 0.1 - 0.05);
    const volume = Math.floor(Math.random() * 1000) + 200;
    data.push({
      time: time.getHours() + ':' + String(time.getMinutes()).padStart(2, '0'),
      price: basePrice + variance,
      volume,
    });
  }
  return data;
};

export default function TradingChart({ token, onOpenPriceAlert, onOpenWatchlist }: ChartProps) {
  const [chartData, setChartData] = useState(generateChartData());
  const [timeframe, setTimeframe] = useState('1m');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => {
      setChartData(generateChartData());
      setLoading(false);
    }, 600);
    return () => clearTimeout(timer);
  }, [token]);

  if (loading) {
    return <ChartSkeleton />;
  }

  const timeframes = ['5s', '10s', '1m', '5m', '15m', '1h', '4h', '1D'];
  const price = chartData[chartData.length - 1]?.price || 0;
  const prevPrice = chartData[0]?.price || 0;
  const change = ((price - prevPrice) / prevPrice) * 100;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="border-b border-border bg-background px-2 py-1.5 shrink-0">
        <div className="flex items-baseline justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-foreground">🐸 {token}</span>
            <span className="text-xs text-muted-foreground hidden sm:block">Pepe Token</span>
            <LiveBadge />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-base font-mono font-bold text-foreground">${price.toFixed(8)}</span>
            <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
              change >= 0 ? 'text-success bg-success/10' : 'text-destructive bg-destructive/10'
            }`}>
              {change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(2)}%
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={onOpenWatchlist}
                className="p-1 hover:text-yellow-400 text-muted-foreground transition"
                title="Add to watchlist"
              >
                <Star size={14} />
              </button>
              <button
                onClick={onOpenPriceAlert}
                className="p-1 hover:text-primary text-muted-foreground transition"
                title="Set price alert"
              >
                <Bell size={14} />
              </button>
            </div>
          </div>
        </div>
        <div className="flex gap-3 mt-1 text-xs flex-wrap">
          <div className="flex gap-1">
            <span className="text-muted-foreground">High:</span>
            <span className="font-mono text-foreground">$0.00001258</span>
          </div>
          <div className="flex gap-1">
            <span className="text-muted-foreground">Low:</span>
            <span className="font-mono text-foreground">$0.00001238</span>
          </div>
          <div className="flex gap-1">
            <span className="text-muted-foreground">Vol:</span>
            <span className="font-mono text-foreground">$12.45M</span>
          </div>
          <div className="hidden sm:flex gap-1">
            <span className="text-muted-foreground">Liq:</span>
            <span className="font-mono text-foreground">$3.21M</span>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center gap-1 px-2 py-1 border-b border-border bg-background text-xs font-mono shrink-0">
          {timeframes.map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-2 py-0.5 rounded transition ${
                timeframe === tf
                  ? 'bg-primary text-primary-foreground font-bold'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              {tf}
            </button>
          ))}
          <div className="ml-auto flex gap-1">
            <button className="px-1 py-0.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition">Indicators</button>
            <button className="px-1 py-0.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition">Tools</button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden bg-background">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#a855f7" stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#6b7280' }} stroke="#2a2f45" />
              <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} stroke="#2a2f45" width={50} />
              <Tooltip
                contentStyle={{ backgroundColor: '#0a0e27', border: '1px solid #a855f7', borderRadius: '4px', fontSize: '11px', padding: '6px' }}
                labelStyle={{ color: 'var(--foreground)', fontSize: '10px' }}
                formatter={(value: number) => [`$${value.toFixed(8)}`, 'Price']}
              />
              <Area type="monotone" dataKey="price" stroke="#22c55e" strokeWidth={1.5} fill="url(#colorPrice)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="h-14 border-t border-border bg-background shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
              <XAxis dataKey="time" tick={{ fontSize: 8, fill: '#6b7280' }} stroke="#2a2f45" />
              <Bar dataKey="volume" fill="#a855f7" opacity={0.4} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="border-t border-border bg-background px-2 py-1 flex items-center justify-between text-xs text-muted-foreground font-mono shrink-0">
        <span>12:45:30 (UTC)</span>
        <div className="flex gap-2">
          <button className="px-1 hover:text-foreground hover:bg-muted rounded transition">%</button>
          <button className="px-1 hover:text-foreground hover:bg-muted rounded transition">log</button>
          <button className="px-1 hover:text-foreground hover:bg-muted rounded transition">auto</button>
        </div>
      </div>
    </div>
  );
}
