/**
 * Provides a no-op, in-memory localStorage implementation for server/test
 * environments to prevent crashes when client-only code is executed during
 * prerender or Playwright runs.
 */
const hasWindow = typeof window !== "undefined";

if (!hasWindow) {
  const store = new Map<string, string>();

  const localStorageShim = {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    get length() {
      return store.size;
    },
  };

  // Install shim if missing or malformed.
  const current = (globalThis as any).localStorage;
  if (
    !current ||
    typeof current.getItem !== "function" ||
    typeof current.setItem !== "function"
  ) {
    (globalThis as any).localStorage = localStorageShim;
  }
}
