export function readSessionCache<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { expiresAt?: number; value?: T };
    if (!parsed.expiresAt || parsed.expiresAt < Date.now()) {
      sessionStorage.removeItem(key);
      return null;
    }
    return parsed.value ?? null;
  } catch {
    return null;
  }
}

export function writeSessionCache<T>(
  key: string,
  value: T,
  ttlMs: number,
): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      key,
      JSON.stringify({ value, expiresAt: Date.now() + ttlMs }),
    );
  } catch {}
}

export function clearSessionCache(key: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(key);
  } catch {}
}

export function clearSessionCacheByPrefix(prefix: string): void {
  if (typeof window === "undefined") return;
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(prefix)) {
        sessionStorage.removeItem(key);
      }
    }
  } catch {}
}
