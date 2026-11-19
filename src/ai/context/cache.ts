interface CacheEntry<T> {
  expiresAt: number;
  promise: Promise<T>;
}

/** Small process-local TTL cache with request coalescing and bounded entries. */
export class AsyncResultCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();

  constructor(
    private readonly maxEntries = 128,
    private readonly clock: () => number = Date.now
  ) {
    if (!Number.isInteger(maxEntries) || maxEntries < 1) throw new Error("maxEntries must be a positive integer.");
  }

  async getOrLoad(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
    if (!key.trim()) throw new Error("Cache key must not be empty.");
    if (!Number.isInteger(ttlMs) || ttlMs < 1) throw new Error("ttlMs must be a positive integer.");

    const now = this.clock();
    const cached = this.entries.get(key);
    if (cached && cached.expiresAt > now) {
      this.touch(key, cached);
      return cached.promise;
    }
    if (cached) this.entries.delete(key);

    const promise = Promise.resolve().then(load);
    const entry = { expiresAt: now + ttlMs, promise };
    this.entries.set(key, entry);
    this.evictExpiredAndOldest(now);

    try {
      return await promise;
    } catch (error) {
      if (this.entries.get(key) === entry) this.entries.delete(key);
      throw error;
    }
  }

  delete(key: string): boolean {
    return this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }

  private touch(key: string, entry: CacheEntry<T>): void {
    this.entries.delete(key);
    this.entries.set(key, entry);
  }

  private evictExpiredAndOldest(now: number): void {
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key);
    }
    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value as string | undefined;
      if (oldestKey === undefined) return;
      this.entries.delete(oldestKey);
    }
  }
}
