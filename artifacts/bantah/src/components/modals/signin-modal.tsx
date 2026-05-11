import { useState } from 'react';
import { X, Mail, ArrowRight, Check, Eye, EyeOff } from 'lucide-react';

interface SignInModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

type Step = 'choose' | 'email' | 'magic-sent';

const WALLETS = [
  { id: 'phantom',  name: 'Phantom',   icon: '👻', color: 'bg-purple-500/10 border-purple-500/30 hover:bg-purple-500/20' },
  { id: 'metamask', name: 'MetaMask',  icon: '🦊', color: 'bg-orange-500/10 border-orange-500/30 hover:bg-orange-500/20' },
  { id: 'coinbase', name: 'Coinbase',  icon: '🔵', color: 'bg-blue-500/10 border-blue-500/30 hover:bg-blue-500/20'       },
  { id: 'backpack', name: 'Backpack',  icon: '🎒', color: 'bg-zinc-500/10 border-zinc-500/30 hover:bg-zinc-500/20'       },
];

export default function SignInModal({ open, onOpenChange, onSuccess }: SignInModalProps) {
  const [step, setStep]           = useState<Step>('choose');
  const [email, setEmail]         = useState('');
  const [showPw, setShowPw]       = useState(false);
  const [password, setPassword]   = useState('');
  const [connecting, setConnecting] = useState<string | null>(null);

  if (!open) return null;

  const close = () => { onOpenChange(false); setStep('choose'); setEmail(''); setPassword(''); setConnecting(null); };

  const handleWallet = (id: string) => {
    setConnecting(id);
    setTimeout(() => { close(); onSuccess?.(); }, 1200);
  };

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setStep('magic-sent');
    setTimeout(() => { close(); onSuccess?.(); }, 2500);
  };

  const handleSocial = () => {
    setConnecting('social');
    setTimeout(() => { close(); onSuccess?.(); }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={close} />

      {/* Modal */}
      <div className="relative w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-border flex items-start justify-between">
          <div>
            <div className="text-lg font-black text-primary tracking-tight">anyAlpha</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {step === 'magic-sent' ? 'Check your inbox' : 'Sign in to your account'}
            </div>
          </div>
          <button onClick={close} className="p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-foreground transition">
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">

          {/* ── Step: choose ── */}
          {step === 'choose' && (
            <>
              {/* Social buttons */}
              <div className="space-y-2">
                <button
                  onClick={handleSocial}
                  className="w-full flex items-center gap-3 px-4 py-2.5 border border-border rounded-xl hover:bg-muted/40 transition text-sm font-semibold"
                >
                  <span className="text-xl">𝕏</span>
                  <span className="flex-1 text-left">Continue with X (Twitter)</span>
                  <ArrowRight size={14} className="text-muted-foreground" />
                </button>
                <button
                  onClick={handleSocial}
                  className="w-full flex items-center gap-3 px-4 py-2.5 border border-border rounded-xl hover:bg-muted/40 transition text-sm font-semibold"
                >
                  <span className="text-xl">G</span>
                  <span className="flex-1 text-left">Continue with Google</span>
                  <ArrowRight size={14} className="text-muted-foreground" />
                </button>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">or</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              {/* Email */}
              <button
                onClick={() => setStep('email')}
                className="w-full flex items-center gap-3 px-4 py-2.5 border border-border rounded-xl hover:bg-muted/40 transition text-sm font-semibold"
              >
                <Mail size={18} className="text-muted-foreground" />
                <span className="flex-1 text-left">Continue with Email</span>
                <ArrowRight size={14} className="text-muted-foreground" />
              </button>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">or connect wallet</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              {/* Wallets */}
              <div className="grid grid-cols-2 gap-2">
                {WALLETS.map(w => (
                  <button
                    key={w.id}
                    onClick={() => handleWallet(w.id)}
                    disabled={connecting !== null}
                    className={`flex items-center gap-2 px-3 py-2.5 border rounded-xl transition text-sm font-semibold ${w.color} ${connecting === w.id ? 'opacity-60' : ''}`}
                  >
                    <span className="text-lg leading-none">{w.icon}</span>
                    <span className="truncate">{connecting === w.id ? 'Connecting…' : w.name}</span>
                    {connecting === w.id && <Check size={13} className="text-green-400 shrink-0 animate-pulse" />}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* ── Step: email ── */}
          {step === 'email' && (
            <form onSubmit={handleEmailSubmit} className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Email address</label>
                <input
                  type="email"
                  autoFocus
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full bg-input border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary/50 transition"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Password</label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-input border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary/50 transition pr-10"
                  />
                  <button type="button" onClick={() => setShowPw(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
              <button type="submit" className="w-full bg-primary text-primary-foreground font-bold text-sm py-2.5 rounded-xl hover:opacity-90 transition flex items-center justify-center gap-2">
                Sign In <ArrowRight size={14} />
              </button>
              <button type="button" onClick={() => setStep('magic-sent')} className="w-full text-xs text-primary hover:underline">
                Send magic link instead →
              </button>
              <button type="button" onClick={() => setStep('choose')} className="w-full text-xs text-muted-foreground hover:text-foreground transition">
                ← Back
              </button>
            </form>
          )}

          {/* ── Step: magic link sent ── */}
          {step === 'magic-sent' && (
            <div className="text-center py-4 space-y-3">
              <div className="w-14 h-14 rounded-full bg-green-400/10 border border-green-400/20 flex items-center justify-center mx-auto">
                <Mail size={24} className="text-green-400" />
              </div>
              <div className="font-bold text-foreground">Magic link sent!</div>
              <div className="text-xs text-muted-foreground">
                We emailed a sign-in link to <span className="text-foreground font-semibold">{email || 'your address'}</span>.<br />
                Click the link to continue — this window will close automatically.
              </div>
              <div className="flex justify-center">
                <span className="flex gap-1">
                  {[0,1,2].map(i => (
                    <span key={i} className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 'choose' && (
          <div className="px-6 pb-5 text-center text-[10px] text-muted-foreground">
            By signing in you agree to anyAlpha's{' '}
            <button className="text-primary hover:underline">Terms</button> and{' '}
            <button className="text-primary hover:underline">Privacy Policy</button>.
          </div>
        )}
      </div>
    </div>
  );
}
