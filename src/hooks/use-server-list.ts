import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Client state for a server-filtered, server-paginated table (Phase 14).
 * The route loader supplies page 1 for the default filters; every later
 * filter/page change refetches from the server — nothing is ever loaded
 * whole and filtered in the browser. Filter changes reset to page 1, and
 * a stale response from an older request is discarded.
 */
export function useServerList<T, F extends Record<string, unknown>>({
  initial,
  initialFilters,
  fetcher,
}: {
  initial: T;
  initialFilters: F;
  fetcher: (params: F & { page: number }) => Promise<T>;
}) {
  const [data, setData] = useState<T>(initial);
  const [filters, setFiltersState] = useState<F>(initialFilters);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef(0);
  const first = useRef(true);

  const load = useCallback(
    async (nextFilters: F, nextPage: number) => {
      const id = ++requestId.current;
      setLoading(true);
      setError("");
      try {
        const result = await fetcher({ ...nextFilters, page: nextPage });
        if (id === requestId.current) setData(result);
      } catch {
        if (id === requestId.current) setError("Couldn't load this list. Please try again.");
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [fetcher],
  );

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    // Small debounce so typing in a search box doesn't fire per keystroke.
    const timer = setTimeout(() => void load(filters, page), 250);
    return () => clearTimeout(timer);
  }, [filters, page, load]);

  const setFilter = useCallback(<K extends keyof F>(key: K, value: F[K]) => {
    setPage(1);
    setFiltersState((prev) => ({ ...prev, [key]: value }));
  }, []);

  const reload = useCallback(() => load(filters, page), [load, filters, page]);

  return { data, filters, setFilter, page, setPage, loading, error, reload };
}
