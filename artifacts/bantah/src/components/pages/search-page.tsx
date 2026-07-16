import { type MarketToken } from '@/lib/market-data';
import MarketSearch from '@/components/search/market-search';

interface SearchPageProps {
  onBack?: () => void;
  onSelectToken?: (token: MarketToken) => void;
}

export default function SearchPage({ onBack, onSelectToken }: SearchPageProps) {
  return <MarketSearch mode="page" onBack={onBack} onSelectToken={onSelectToken} />;
}
