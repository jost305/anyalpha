import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';

const menuItems = [
  { emoji: '\u{1F4CA}', label: 'Markets' },
  { emoji: '\u{1F573}\uFE0F', label: 'Trenches' },
  { emoji: '\u{1F680}', label: 'Launcher' },
  { emoji: '\u2B50', label: 'Watchlist' },
  { emoji: '\u{1F52D}', label: 'Watcher' },
  { emoji: '\u{1F426}', label: 'Twitter Track' },
  { emoji: '\u{1F3C6}', label: 'Rewards', pulse: true },
  { emoji: '\u{1F947}', label: 'Leaderboard' },
  { emoji: '\u{1F4BC}', label: 'Portfolio' },
];

const toolItems = [
  { label: 'Verify', emoji: '\u2705' },
  { emoji: '\u{1F4E3}', label: 'Advertise' },
  { emoji: '\u{1F4D8}', label: 'Docs' },
];

interface SidebarProps {
  onMenuClick?: (label: string) => void;
  unreadCount?: number;
  hideHeader?: boolean;
  showCollapseToggle?: boolean;
}

function BrandAvatar({ sizeClass }: { sizeClass: string }) {
  return (
    <img
      src="/anyalpha-logo.png?v=20260523"
      alt="anyAlpha"
      className={`${sizeClass} shrink-0 rounded-xl object-contain ring-1 ring-primary/25`}
    />
  );
}

export default function Sidebar({
  onMenuClick,
  unreadCount = 0,
  hideHeader = false,
  showCollapseToggle = true,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [toolsSlide, setToolsSlide] = useState(0);
  const ToggleIcon = collapsed ? ChevronRight : ChevronLeft;

  useEffect(() => {
    if (collapsed) return;

    const timer = window.setInterval(() => {
      setToolsSlide((slide) => (slide + 1) % 2);
    }, 6500);

    return () => window.clearInterval(timer);
  }, [collapsed]);

  const MenuItem = ({ emoji, label, extra, pulse }: { emoji: string; label: string; extra?: React.ReactNode; pulse?: boolean }) => (
    <button
      onClick={() => onMenuClick?.(label)}
      title={collapsed ? label : undefined}
      className={`tap-feedback w-full text-left text-sm py-1.5 hover:bg-sidebar-accent hover:text-accent-foreground transition flex items-center gap-2 text-sidebar-foreground relative ${
        collapsed ? 'justify-center px-0' : 'px-3'
      }`}
    >
      <span className={`${collapsed ? 'text-base' : 'text-sm'} ${pulse ? 'alpha-points-menu-emoji' : ''} shrink-0 leading-none`}>{emoji}</span>
      {!collapsed && <span className="flex-1 truncate">{label}</span>}
      {!collapsed && extra}
    </button>
  );

  void unreadCount;

  return (
    <div
      className={`relative bg-sidebar border-r border-border flex flex-col overflow-visible transition-all duration-200 ease-in-out shrink-0 ${
        collapsed ? 'w-12' : 'w-52'
      }`}
    >
      {showCollapseToggle ? (
        <button
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="tap-feedback absolute right-[-14px] top-3 z-20 flex h-7 w-7 items-center justify-center border border-border bg-background text-primary shadow-[0_10px_24px_-18px_rgba(249,149,61,0.75)] transition hover:border-primary/60 hover:bg-primary hover:text-primary-foreground"
        >
          <ToggleIcon size={15} strokeWidth={3} />
        </button>
      ) : null}

      {!hideHeader ? (
        <div className="p-2 border-b border-border flex items-center justify-between gap-1 min-h-[72px]">
          {!collapsed ? (
            <div className="flex flex-1 min-w-0 items-center gap-2">
              <BrandAvatar sizeClass="h-9 w-9" />
              <div className="min-w-0">
                <div className="text-sm font-black text-primary truncate tracking-tight">anyAlpha</div>
                <div className="text-xs text-muted-foreground truncate">anyAlpha Terminal</div>
              </div>
            </div>
          ) : (
            <BrandAvatar sizeClass="h-8 w-8" />
          )}
          {!collapsed ? <div className="w-5 shrink-0" aria-hidden="true" /> : null}
        </div>
      ) : null}

      <div className="flex-1 overflow-y-auto">
        <div className="py-1">
          {!collapsed && (
            <div className="text-xs font-bold text-muted-foreground px-3 py-1 mt-1 uppercase tracking-wider">Main</div>
          )}
          {menuItems.map((item) => (
            <MenuItem key={item.label} emoji={item.emoji} label={item.label} pulse={item.pulse} />
          ))}
        </div>

        <div className="border-t border-border py-1">
          {collapsed ? (
            toolItems.map((item) => (
              <button
                key={item.label}
                onClick={() => onMenuClick?.(item.label)}
                title={item.label}
                className="tap-feedback flex w-full items-center justify-center px-0 py-1.5 text-left text-sm text-sidebar-foreground transition hover:bg-sidebar-accent hover:text-accent-foreground"
              >
                <span className="text-base leading-none">{item.emoji}</span>
              </button>
            ))
          ) : (
            <div className="px-2 py-1">
              <div className="overflow-hidden">
                <div
                  className="flex transition-transform duration-500 ease-out"
                  style={{ transform: `translateX(-${toolsSlide * 100}%)` }}
                >
                  <div className="min-w-full">
                    <div className="px-1 py-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">Tools</div>
                    {toolItems.map((item) => (
                      <button
                        key={item.label}
                        onClick={() => onMenuClick?.(item.label)}
                        className="tap-feedback flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-left text-sm text-sidebar-foreground transition hover:bg-sidebar-accent hover:text-accent-foreground"
                      >
                        <span className="text-sm leading-none">{item.emoji}</span>
                        <span className="flex-1 truncate">{item.label}</span>
                      </button>
                    ))}
                  </div>

                  <div className="min-w-full px-1 pt-1">
                    <button
                      onClick={() => onMenuClick?.('Advertise')}
                      className="tap-feedback w-full rounded-lg bg-primary/10 px-3 py-2.5 text-left text-sidebar-foreground transition hover:bg-primary/15"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-lg leading-none" aria-hidden="true">
                          {toolItems[1].emoji}
                        </span>
                        <span className="text-[10px] font-black uppercase tracking-[0.16em] text-primary">Ads banner</span>
                      </div>
                      <div className="mt-1 text-sm font-black leading-snug text-foreground">Put your launch in front of active traders.</div>
                      <div className="mt-2 text-[10px] font-bold uppercase tracking-[0.14em] text-primary">Advertise</div>
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-2 flex items-center justify-center gap-1" aria-label="Tools slides">
                {[0, 1].map((slide) => (
                  <button
                    key={slide}
                    onClick={() => setToolsSlide(slide)}
                    aria-label={slide === 0 ? 'Show tools menu' : 'Show ads banner'}
                    className={`h-1.5 rounded-full transition-all ${
                      toolsSlide === slide ? 'w-4 bg-primary' : 'w-1.5 bg-muted-foreground/35 hover:bg-muted-foreground/60'
                    }`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-border p-2 text-center">
        {collapsed ? (
          <BrandAvatar sizeClass="mx-auto h-8 w-8" />
        ) : (
          <>
            <div className="text-xs font-bold text-primary mb-0.5">SEE IT. CALL IT.</div>
            <div className="flex items-center justify-center gap-2 text-xs">
              <BrandAvatar sizeClass="h-6 w-6" />
              <div className="text-left">
                <div className="font-black text-primary leading-none">anyAlpha</div>
                <div className="text-[10px] text-muted-foreground leading-none mt-0.5">Terminal</div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
