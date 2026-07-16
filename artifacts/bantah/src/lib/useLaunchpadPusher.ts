import { useEffect } from 'react';
import Pusher from 'pusher-js';
import { useQueryClient } from '@tanstack/react-query';

export function useLaunchpadPusher() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let pusher: Pusher | null = null;
    let isCancelled = false;

    async function initPusher() {
      try {
        const res = await fetch('/api/realtime/public-config');
        if (!res.ok) return;
        const config = await res.json();
        
        if (isCancelled || !config.configured || !config.key || !config.cluster) return;

        pusher = new Pusher(config.key, {
          cluster: config.cluster,
          forceTLS: true,
        });

        const channel = pusher.subscribe('launchpad-events');
        
        channel.bind('TokenCreated', (data: any) => {
          console.log("TokenCreated event received via Pusher", data);
          queryClient.invalidateQueries({ queryKey: ['launchpad-tokens'] });
        });

        channel.bind('Trade', (data: any) => {
          console.log("Trade event received via Pusher", data);
          queryClient.invalidateQueries({ queryKey: ['launchpad-tokens'] });
          queryClient.invalidateQueries({ queryKey: ['launchpad-trades'] });
        });
      } catch (err) {
        console.error("Failed to initialize public pusher", err);
      }
    }

    initPusher();

    return () => {
      isCancelled = true;
      if (pusher) {
        pusher.unsubscribe('launchpad-events');
        pusher.disconnect();
      }
    };
  }, [queryClient]);
}
