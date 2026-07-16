import { useEffect } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import Sidebar from './sidebar';
import { softHaptic } from '@/lib/mobile-feedback';

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onMenuClick?: (label: string) => void;
  unreadCount?: number;
}

export default function MobileDrawer({
  isOpen,
  onClose,
  onMenuClick,
  unreadCount = 0,
}: MobileDrawerProps) {
  const reduceMotion = useReducedMotion();
  const drawerTransition = reduceMotion
    ? { duration: 0 }
    : { type: 'spring', stiffness: 420, damping: 38, mass: 0.82 } as const;

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen ? (
        <>
          <motion.div
            key="mobile-drawer-backdrop"
            className="mobile-drawer-backdrop fixed inset-0 z-40 bg-black/50 md:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.18 }}
            onClick={() => {
              softHaptic(5);
              onClose();
            }}
          />

          <motion.aside
            key="mobile-drawer-panel"
            className="surface-sheen mobile-drawer-panel fixed bottom-0 left-0 top-0 z-50 w-64 bg-sidebar md:hidden"
            initial={{ x: '-100%', opacity: 0.76 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '-100%', opacity: 0.82 }}
            transition={drawerTransition}
          >
            <div className="flex h-full flex-col overflow-hidden">
              <div className="flex items-center justify-between border-b border-border p-2">
                <div className="flex min-w-0 items-center gap-2">
                  <img
                    src="/anyalpha-logo.png?v=20260523"
                    alt="anyAlpha"
                    className="h-8 w-8 shrink-0 rounded-xl object-contain ring-1 ring-primary/25"
                  />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-black text-primary">anyAlpha</div>
                    <div className="truncate text-[10px] text-muted-foreground">anyAlpha Terminal</div>
                  </div>
                </div>
                <button
                  onPointerDown={() => softHaptic(5)}
                  onClick={onClose}
                  className="tap-feedback rounded p-1 transition hover:bg-sidebar-accent"
                  aria-label="Close menu"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <Sidebar
                  hideHeader
                  showCollapseToggle={false}
                  onMenuClick={(label) => {
                    softHaptic(7);
                    onMenuClick?.(label);
                    onClose();
                  }}
                  unreadCount={unreadCount}
                />
              </div>
            </div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}
