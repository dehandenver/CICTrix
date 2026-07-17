import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

interface RealtimeRefreshOptions {
  channel: string;              // unique channel name, e.g. 'pm-dashboard-ipcr'
  tables: string[];             // public-schema tables to watch (event: '*')
  onChange: () => void;         // debounced callback → call the surface's silent reloader
  debounceMs?: number;          // default 400 (matches PMIPCRManagement)
  enabled?: boolean;            // default true; lets surfaces subscribe only when visible
}

export function useRealtimeRefresh(options: RealtimeRefreshOptions): void {
  const {
    channel,
    tables,
    onChange,
    debounceMs = 400,
    enabled = true,
  } = options;

  // Keep the latest onChange in a ref so the subscription doesn't churn when callers pass unstable closures.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const tablesKey = tables.join(',');

  useEffect(() => {
    if (!enabled) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const triggerReload = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        onChangeRef.current();
      }, debounceMs);
    };

    // 1. Setup subscription
    let subscriptionChannel = (supabase as any).channel(channel);

    for (const table of tables) {
      subscriptionChannel = subscriptionChannel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        triggerReload
      );
    }

    subscriptionChannel.subscribe();

    // 2. Visibility change catch-up handler
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        triggerReload();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      void (supabase as any).removeChannel(subscriptionChannel);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [channel, tablesKey, debounceMs, enabled]);
}
