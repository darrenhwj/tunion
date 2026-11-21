import { useEffect, useState } from 'react';
import { useDemoAuth } from './demoAuth';

export function useApiQuery<T>(key: string, load: (key: string, signal: AbortSignal) => Promise<T>) {
  const { current } = useDemoAuth();
  const [revision, setRevision] = useState(0);
  const requestKey = JSON.stringify([key, current?.id]);
  const [result, setResult] = useState<{ key: string; revision: number; data?: T; error?: string }>();

  useEffect(() => {
    const controller = new AbortController();
    load(key, controller.signal).then(
      (data) => { if (!controller.signal.aborted) setResult({ key: requestKey, revision, data }); },
      (error: unknown) => { if (!controller.signal.aborted) setResult({ key: requestKey, revision, error: errorMessage(error) }); },
    );
    return () => controller.abort();
  }, [key, load, requestKey, revision]);

  return {
    data: result?.key === requestKey ? result.data : undefined,
    error: result?.key === requestKey ? result.error : undefined,
    loading: result?.key !== requestKey,
    refreshing: result?.key === requestKey && result.revision !== revision,
    refresh: () => setRevision((previous) => previous + 1),
  };
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'The request failed.';
}
