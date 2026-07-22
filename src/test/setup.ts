// ═══════════════════════════════════════════════════════════════════════════
// Vitest setup
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Provide a deterministic in-memory Storage.
 *
 * Node 26 exposes an experimental global `localStorage` that shadows jsdom's and is
 * unavailable unless the process is started with --localstorage-file, so
 * `globalThis.localStorage` is `undefined` inside the jsdom environment. Several
 * modules persist there (launch pipeline, wizard form state, TxTracker), and relying
 * on that Node/jsdom interaction makes the suite sensitive to the runtime version.
 */
class MemoryStorage implements Storage {
  private map = new Map<string, string>()

  get length(): number {
    return this.map.size
  }

  clear(): void {
    this.map.clear()
  }

  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null
  }

  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null
  }

  removeItem(key: string): void {
    this.map.delete(key)
  }

  setItem(key: string, value: string): void {
    this.map.set(key, String(value))
  }
}

function install(name: 'localStorage' | 'sessionStorage') {
  const storage = new MemoryStorage()
  Object.defineProperty(globalThis, name, {
    value: storage,
    configurable: true,
    writable: true,
  })
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, name, {
      value: storage,
      configurable: true,
      writable: true,
    })
  }
}

install('localStorage')
install('sessionStorage')
