import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Bot, MessageCircle, Send, X } from 'lucide-react';

type ChatMessage = {
  id: string;
  role: 'system' | 'user';
  content: string;
  createdAt: string;
};

interface FloatingChatAgentProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function messageTime(timestamp: string) {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function FloatingChatAgent({ open, onOpenChange }: FloatingChatAgentProps) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'agent-status',
      role: 'system',
      content:
        'AnyAlpha Agent window is ready. The live AI runtime is not connected yet, so messages are held in this session until we wire the real agent backend.',
      createdAt: new Date().toISOString(),
    },
  ]);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, open]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const content = input.trim();
    if (!content) return;

    setMessages((current) => [
      ...current,
      {
        id: `${Date.now()}-${current.length}`,
        role: 'user',
        content,
        createdAt: new Date().toISOString(),
      },
    ]);
    setInput('');
  }

  return (
    <>
      {open ? (
        <section className="fixed inset-x-2 bottom-[calc(4.35rem+env(safe-area-inset-bottom))] z-50 flex max-h-[72svh] flex-col overflow-hidden border border-border bg-card shadow-[0_24px_80px_-34px_rgba(0,0,0,0.75)] md:inset-auto md:right-4 md:bottom-4 md:h-[520px] md:w-[390px]">
          <div className="flex shrink-0 items-center justify-between border-b border-border bg-background px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center border border-primary/35 bg-primary/10 text-primary">
                <Bot size={17} />
              </span>
              <div className="min-w-0 leading-tight">
                <div className="truncate text-sm font-black text-foreground">AnyAlpha Agent</div>
                <div className="truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Runtime pending
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="tap-feedback flex h-8 w-8 items-center justify-center text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground"
              aria-label="Close AnyAlpha Agent"
            >
              <X size={17} />
            </button>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[86%] border px-3 py-2 text-xs leading-5 ${
                    message.role === 'user'
                      ? 'border-primary/45 bg-primary/15 text-foreground'
                      : 'border-border bg-background text-muted-foreground'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>
                  <div className="mt-1 text-[9px] font-semibold uppercase tracking-[0.14em] opacity-60">
                    {message.role === 'user' ? 'You' : 'Status'} · {messageTime(message.createdAt)}
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSubmit} className="shrink-0 border-t border-border bg-background p-2">
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder="Message the agent..."
                rows={1}
                className="min-h-9 flex-1 resize-none border border-border bg-input px-3 py-2 text-xs text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary"
              />
              <button
                type="submit"
                disabled={!input.trim()}
                className="tap-feedback flex h-9 w-9 shrink-0 items-center justify-center bg-primary text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Send message"
              >
                <Send size={15} />
              </button>
            </div>
            <p className="mt-1.5 text-[10px] leading-4 text-muted-foreground">
              Live replies, market tools, and account actions will connect when the agent backend is ready.
            </p>
          </form>
        </section>
      ) : (
        <button
          type="button"
          onClick={() => onOpenChange(true)}
          className="tap-feedback fixed right-3 bottom-[calc(4.55rem+env(safe-area-inset-bottom))] z-50 flex h-12 w-12 items-center justify-center border border-primary/45 bg-primary text-primary-foreground shadow-[0_18px_52px_-22px_rgba(249,149,61,0.95)] transition hover:scale-[1.03] hover:opacity-95 md:right-4 md:bottom-4"
          aria-label="Open AnyAlpha Agent"
        >
          <MessageCircle size={21} />
        </button>
      )}
    </>
  );
}
