type CacheEntry<T> = {
  value: T;
  createdAt: number;
};

const store = new Map<string, CacheEntry<unknown>>();
const TTL_MS = 60_000;

export function getCached<T>(key: string): T | null {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() - hit.createdAt > TTL_MS) {
    store.delete(key);
    return null;
  }
  return hit.value as T;
}

export function setCached<T>(key: string, value: T): void {
  store.set(key, { value, createdAt: Date.now() });
}

export function invalidatePublicCache(): void {
  for (const key of store.keys()) {
    if (key.startsWith("public:")) {
      store.delete(key);
    }
  }
}
