import { useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';

interface SignInModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function SignInModal({ open, onOpenChange }: SignInModalProps) {
  const { ready, login } = usePrivy();

  useEffect(() => {
    if (!open || !ready) return;

    login();
    onOpenChange(false);
  }, [login, onOpenChange, open, ready]);

  return null;
}
