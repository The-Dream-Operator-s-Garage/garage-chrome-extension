// chrome.storage.local, as far as lib/ uses it — for tests and the witness.
export function memoryStorage (seed = {}) {
  const m = new Map(Object.entries(seed))
  return {
    async get (keys) { const out = {}; for (const k of [].concat(keys)) if (m.has(k)) out[k] = structuredClone(m.get(k)); return out },
    async set (obj) { for (const [k, v] of Object.entries(obj)) m.set(k, structuredClone(v)) },
    dump () { return Object.fromEntries(m) }
  }
}
