import { useState, useEffect, useCallback } from "react";
import { apiUrl, apiHeaders } from "./useAuth";

export function useApi<T>(path: string, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(apiUrl(path), { headers: apiHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json() as T);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [path, ...deps]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}

export async function postApi<T>(path: string, body: object): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json() as { error: string };
    throw new Error(err.error);
  }
  return res.json() as Promise<T>;
}
