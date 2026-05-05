import { useState, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'agent';
  content: string;
  timestamp: Date;
}

const generateAgentResponse = (userInput: string): string => {
  const responses: Record<string, string> = {
    pepefun: 'PEPEFUN is showing strong momentum today with 67% bullish sentiment. Volume is up 38% in the last 24 hours. Consider placing a bet on the "Will PEPEFUN 2x in 24H?" market.',
    bitcoin: 'Bitcoin is consolidating around $45,200. Technical indicators suggest a potential breakout above $48,000. Watch for resistance at previous highs.',
    ethereum: 'ETH has been trending well with solid fundamentals. Gas fees are moderate. Consider the upcoming market predictions on our platform.',
    market: 'The overall crypto market is showing mixed signals. Top gainers include PEPEFUN (+67%), SMEW (+58%), and SAI16 (+67%). Risk management is key.',
    bet: 'To place a bet, go to the Markets tab and select a prediction market. Choose YES or NO, enter your bet amount in BXBT, and submit. Payouts are instant once the market resolves.',
    agent: 'We have several AI agents trading on the platform: BullBot (68.4% win rate), BantahBro (64.7%), and ChaosBot (59.2%). They compete in real-time battles.',
    strategy: 'Popular strategies include: 1) Following top agent signals, 2) Identifying support/resistance levels, 3) Trading on momentum with volume confirmation, 4) Managing risk with proper position sizing.',
    solana: 'SOL is trading at $145 with strong developer activity. The Polymarket signal shows 65% YES for SOL hitting $200 in May.',
    base: 'BASE ecosystem TVL is growing rapidly. The prediction market shows 71% YES for hitting $5B TVL. Layer 2s are the play right now.',
  };

  const lowerInput = userInput.toLowerCase();
  for (const [key, response] of Object.entries(responses)) {
    if (lowerInput.includes(key)) {
      return response;
    }
  }

  return "That's an interesting question! Based on current market data and my analysis, I'd recommend: 1) Check the Markets section for live prediction opportunities, 2) Monitor the top agents for trading signals, 3) Keep an eye on volume and sentiment indicators. What specific aspect would you like to explore further?";
};

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'agent',
      content: "Hey there! I'm your AI trading agent. Ask me about market trends, predictions, strategies, or anything crypto-related. How can I help you today?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    setTimeout(() => {
      const agentMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'agent',
        content: generateAgentResponse(input),
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, agentMessage]);
      setIsLoading(false);
    }, 800);
  };

  return (
    <div className="w-full h-full flex flex-col bg-background">
      <div className="border-b border-border bg-card px-3 sm:px-4 py-3 sm:py-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-2xl">🤖</span>
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-foreground">Trading Agent</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">Ask me anything about crypto markets & trading</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 sm:space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-xs sm:max-w-md px-3 sm:px-4 py-2 sm:py-3 rounded-lg text-sm sm:text-base ${
                message.role === 'user'
                  ? 'bg-accent text-background'
                  : 'bg-muted border border-border text-foreground'
              }`}
            >
              <p className="whitespace-pre-wrap">{message.content}</p>
              <span
                className={`text-xs mt-1 block ${
                  message.role === 'user' ? 'text-background/70' : 'text-muted-foreground'
                }`}
              >
                {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-muted border border-border text-foreground px-4 py-3 rounded-lg">
              <div className="flex gap-1">
                <div className="w-2 h-2 rounded-full bg-accent animate-bounce" />
                <div className="w-2 h-2 rounded-full bg-accent animate-bounce [animation-delay:100ms]" />
                <div className="w-2 h-2 rounded-full bg-accent animate-bounce [animation-delay:200ms]" />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-border bg-card p-3 sm:p-4 space-y-2">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask about markets, agents, strategies..."
            className="flex-1 bg-input border border-border rounded px-3 sm:px-4 py-2 text-sm sm:text-base text-foreground placeholder-muted-foreground focus:outline-none focus:border-accent"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="bg-accent text-background px-3 sm:px-4 py-2 rounded hover:opacity-90 disabled:opacity-50 transition flex items-center gap-1.5 font-bold text-sm sm:text-base"
          >
            <Send size={16} />
            <span className="hidden sm:inline">Send</span>
          </button>
        </div>
        <p className="text-xs text-muted-foreground">Try asking about: PEPEFUN, Bitcoin, strategies, or how to place bets</p>
      </div>
    </div>
  );
}
