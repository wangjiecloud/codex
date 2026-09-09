export interface ScreenQuery {
  id: string;
  query: string;
  createdAt: number;
}

const STORAGE_KEY = "saved_screen_queries_v1";

export function loadScreenQueries(): ScreenQuery[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ScreenQuery[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveScreenQueries(queries: ScreenQuery[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queries));
}

export function addScreenQuery(
  queries: ScreenQuery[],
  query: string,
): ScreenQuery[] {
  const trimmed = query.trim();
  if (!trimmed) return queries;
  // dedupe: if same query exists, move it to top
  const filtered = queries.filter((q) => q.query !== trimmed);
  const newQuery: ScreenQuery = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    query: trimmed,
    createdAt: Date.now(),
  };
  const next = [newQuery, ...filtered].slice(0, 50);
  saveScreenQueries(next);
  return next;
}

export function updateScreenQuery(
  queries: ScreenQuery[],
  id: string,
  query: string,
): ScreenQuery[] {
  const next = queries.map((q) =>
    q.id === id ? { ...q, query: query.trim() } : q,
  );
  saveScreenQueries(next);
  return next;
}

export function removeScreenQuery(
  queries: ScreenQuery[],
  id: string,
): ScreenQuery[] {
  const next = queries.filter((q) => q.id !== id);
  saveScreenQueries(next);
  return next;
}
