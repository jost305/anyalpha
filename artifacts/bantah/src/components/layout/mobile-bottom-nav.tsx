import { LayoutGroup, motion, useReducedMotion } from 'framer-motion';
import { softHaptic } from '@/lib/mobile-feedback';
import { cn } from '@/lib/utils';

interface MobileBottomNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export default function MobileBottomNav({ activeTab, onTabChange }: MobileBottomNavProps) {
  const reduceMotion = useReducedMotion();
  const spring = reduceMotion
    ? { duration: 0 }
    : { type: 'spring', stiffness: 540, damping: 34, mass: 0.62 } as const;
  const tabs: Array<{ id: string; label: string; emoji: string }> = [
    { id: 'markets', label: 'Markets', emoji: '\u{1F4CA}' },
    { id: 'launchpad', label: 'Launchpad', emoji: '🚀' },
    { id: 'trenches', label: 'Trenches', emoji: '🕳️' },
    { id: 'search', label: 'Search', emoji: '\u{1F50D}' },
    { id: 'watcher', label: 'Watcher', emoji: '\u{1F52D}' },
    { id: 'leaderboard', label: 'Leaderboard', emoji: '\u{1F947}' },
  ];

  return (
    <div className="mobile-nav-shell fixed inset-x-0 bottom-0 z-40 border-t border-border/90 bg-card/95 pb-[env(safe-area-inset-bottom)] md:hidden">
      <LayoutGroup id="mobile-bottom-nav">
        <div className="mx-auto flex h-[3.75rem] max-w-[560px] items-center justify-around gap-1 px-2">
          {tabs.map((tab) => {
            const active = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                type="button"
                aria-current={active ? 'page' : undefined}
                onPointerDown={() => softHaptic(6)}
                onClick={() => onTabChange(tab.id)}
                className={cn(
                  'tap-feedback relative flex-1 overflow-hidden rounded-2xl px-2 py-2',
                  active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {active ? (
                  <motion.span
                    layoutId="mobile-nav-active-dot"
                    className="absolute bottom-1.5 left-1/2 h-1 w-5 -ml-2.5 rounded-full bg-primary/85 shadow-[0_0_16px_rgba(249,149,61,0.28)]"
                    transition={spring}
                  />
                ) : null}
                <motion.span
                  className="relative z-10 flex flex-col items-center justify-center gap-1"
                  animate={{ y: active ? -2 : 0 }}
                  transition={spring}
                >
                  <motion.span
                    className={cn('text-[18px] leading-none', active ? 'mobile-nav-icon-pop' : '')}
                    animate={{ scale: active ? 1.08 : 1, opacity: active ? 1 : 0.74 }}
                    transition={spring}
                    aria-hidden="true"
                  >
                    {tab.emoji}
                  </motion.span>
                  <motion.span
                    className="text-[9px] font-bold leading-none"
                    animate={{ opacity: active ? 1 : 0.72 }}
                    transition={spring}
                  >
                    {tab.label}
                  </motion.span>
                </motion.span>
              </button>
            );
          })}
        </div>
      </LayoutGroup>
    </div>
  );
}
