/**
 * Shared hook for fetching rack data from /api/olt/:id/rack
 * Used by all vendor rack diagram components.
 */

import { useState, useCallback, useEffect } from 'react';
import type { RackData } from '../types/rack';

export function useRackData(oltId: string) {
  const [data, setData] = useState<RackData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (forceRefresh = false) => {
    try {
      setError(null);
      const url = forceRefresh
        ? `/api/olt/${oltId}/rack?refresh=true`
        : `/api/olt/${oltId}/rack`;
      const res = await fetch(url, { credentials: 'include' });
      const result = await res.json();
      setData(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [oltId]);

  useEffect(() => {
    setLoading(true);
    loadData();
  }, [loadData]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await loadData(true);
  }, [loadData]);

  return { data, loading, refreshing, error, reload: loadData, refresh };
}
