// The flush — one POST /api/extensions/visits per call, the key as Bearer.
// Called by the worker's alarm (every minute), by the queue reaching 20,
// and by the popup's Flush now. Everything it learns lands in `state`:
//   401 → blocked 'key'   (revoked or mistyped — nothing is sent again until
//                          the options page saves a key)
//   403 → blocked 'scope' / 409 → blocked 'target' (a key that cannot capture)
//   429 → nextAttemptAt from Retry-After
//   network / 5xx → exponential backoff, 1 min → 30 min
// A fetch is aborted after 20 s: Chrome kills a worker whose request runs
// past 30 s, and the batch's clientVisitIds make the retry idempotent.

import { load, readyBatch, settle, serial, patchState } from './queue.js'

export const FETCH_TIMEOUT_MS = 20 * 1000
const BACKOFF_MIN_MS = 60 * 1000
const BACKOFF_MAX_MS = 30 * 60 * 1000

// Whatever the flush learns is written on the queue's chain (patchState,
// serial) against a FRESH read: visits that queued while the request was in
// flight stay queued.

export async function flush (storage, { fetchImpl = globalThis.fetch, now = Date.now(), force = false } = {}) {
  const { settings, queue, state } = await load(storage)
  if (!settings.enabled) return { skipped: 'paused' }
  if (!settings.key) return { skipped: 'no key' }
  if (state.blocked) return { skipped: `blocked: ${state.blocked}` }
  if (!force && state.nextAttemptAt && now < state.nextAttemptAt) return { skipped: 'backing off' }
  const batch = readyBatch(queue, { now })
  if (!batch.length) return { skipped: 'nothing ready' }

  const ctl = typeof AbortController === 'function' ? new AbortController() : null
  const timer = ctl ? setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS) : null
  let res; let body = null
  try {
    res = await fetchImpl(`${settings.apiOrigin.replace(/\/+$/, '')}/api/extensions/visits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.key}` },
      body: JSON.stringify({
        visits: batch.map(({ clientVisitId, url, title, visitedAt, transition, page }) => ({ clientVisitId, url, title, visitedAt, transition, page }))
      }),
      signal: ctl?.signal
    })
    try { body = await res.json() } catch (_) { body = null }
  } catch (e) {
    const failures = Number(state.failures || 0) + 1
    const wait = Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** (failures - 1))
    await patchState(storage, { failures, nextAttemptAt: now + wait, lastError: `unreachable: ${e.message || e}` })
    return { error: 'network', retryInMs: wait }
  } finally { if (timer) clearTimeout(timer) }

  const msg = body?.error?.message || `HTTP ${res.status}`
  if (res.status === 401) { await patchState(storage, { blocked: 'key', lastError: msg }); return { error: 'key', status: 401 } }
  if (res.status === 403) { await patchState(storage, { blocked: 'scope', lastError: msg }); return { error: 'scope', status: 403 } }
  if (res.status === 409) { await patchState(storage, { blocked: 'target', lastError: msg }); return { error: 'target', status: 409 } }
  if (res.status === 429) {
    const after = Number(res.headers?.get?.('Retry-After')) || 60
    await patchState(storage, { nextAttemptAt: now + after * 1000, lastError: msg })
    return { error: 'rate', retryInMs: after * 1000 }
  }
  if (res.status === 400) {
    // the batch itself was refused — drop it rather than loop on it forever
    const drop = new Set(batch.map((v) => v.clientVisitId))
    await serial(async () => {
      const fresh = await load(storage)
      await storage.set({ queue: fresh.queue.filter((v) => !drop.has(v.clientVisitId)), state: { ...fresh.state, lastError: msg } })
    })
    return { error: 'refused', status: 400, dropped: batch.length }
  }
  if (!res.ok || !body?.success) {
    const failures = Number(state.failures || 0) + 1
    const wait = Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** (failures - 1))
    await patchState(storage, { failures, nextAttemptAt: now + wait, lastError: msg })
    return { error: 'server', status: res.status, retryInMs: wait }
  }
  const s = await serial(async () => {
    const fresh = await load(storage)
    const out = settle(fresh.queue, batch, body.results, { now, state: fresh.state })
    await storage.set({
      queue: out.queue,
      state: {
        ...fresh.state, failures: 0, nextAttemptAt: null, lastFlushAt: now, lastError: out.rejected ? `${out.rejected} visit(s) refused` : null,
        skeletonId: body.skeleton?.id ?? fresh.state.skeletonId ?? null, day: out.day, sentToday: out.sentToday
      }
    })
    return out
  })
  return { ok: true, sent: s.sent, rejected: s.rejected, kept: s.kept, results: body.results }
}

/** The options page's Test: GET /api/extensions/history with the key (its lookup scope). */
export async function testKey ({ apiOrigin, key }, { fetchImpl = globalThis.fetch } = {}) {
  try {
    const res = await fetchImpl(`${String(apiOrigin).replace(/\/+$/, '')}/api/extensions/history?limit=1`, { headers: { Authorization: `Bearer ${key}` } })
    const body = await res.json().catch(() => null)
    if (res.ok && body?.success) return { ok: true, skeleton: body.skeleton, total: body.total }
    return { ok: false, status: res.status, message: body?.error?.message || `HTTP ${res.status}` }
  } catch (e) { return { ok: false, message: `unreachable: ${e.message || e}` } }
}
