/**
 * A simple LRU (Least Recently Used) cache backed by a Map.
 * Uses Map's insertion-order iteration: on `get()`, the accessed entry
 * is deleted and re-inserted to move it to the end (most recently used).
 * When `set()` pushes the size above `capacity`, the oldest entry (first
 * in iteration order) is evicted.
 */
export class LruMap<K, V> {
  private readonly map = new Map<K, V>();
  private readonly capacity: number;
  private readonly onEvict: ((key: K, value: V) => void) | undefined;

  constructor(capacity: number, onEvict?: (key: K, value: V) => void) {
    this.capacity = capacity;
    this.onEvict = onEvict;
  }

  get(key: K): V | undefined {
    const value = this.map.get(key);
    if (value !== undefined) {
      this.map.delete(key);
      this.map.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): this {
    if (this.map.has(key)) {
      this.map.delete(key);
    }
    this.map.set(key, value);
    while (this.map.size > this.capacity) {
      const first = this.map.keys().next();
      if (first.done) break;
      const evictedKey = first.value;
      const evictedValue = this.map.get(evictedKey);
      this.map.delete(evictedKey);
      if (evictedValue !== undefined) {
        this.onEvict?.(evictedKey, evictedValue);
      }
    }
    return this;
  }

  delete(key: K): boolean {
    return this.map.delete(key);
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  get size(): number {
    return this.map.size;
  }

  values(): MapIterator<V> {
    return this.map.values();
  }

  keys(): MapIterator<K> {
    return this.map.keys();
  }

  entries(): MapIterator<[K, V]> {
    return this.map.entries();
  }

  forEach(callback: (value: V, key: K) => void): void {
    this.map.forEach(callback);
  }
}

export function normalizeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

export function normalizeDate(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return new Date(value).toISOString();
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
  }
  return null;
}

export function clipPreview(value: string, limit = 220): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, Math.max(0, limit - 1))}…`;
}

export function compareIsoTimestamp(left: string, right: string): number {
  const leftTs = Date.parse(left || '') || 0;
  const rightTs = Date.parse(right || '') || 0;
  if (leftTs !== rightTs) return leftTs - rightTs;
  return left.localeCompare(right);
}

export function summarizeUnknown(value: unknown, limit = 220): string | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? clipPreview(trimmed, limit) : null;
  }
  try {
    const serialized = JSON.stringify(value);
    return serialized ? clipPreview(serialized, limit) : null;
  } catch {
    return clipPreview(String(value), limit);
  }
}
