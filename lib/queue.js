// The capture queue — every piece of state the service worker needs lives
// in storage (an MV3 worker dies after 30 s idle and wakes on the next
// event with nothing in memory). Written against a tiny storage interface
// — `get(keys) → object`, `set(object)` — so the worker hands it
// `chrome.storage.local` and the Node witness hands it a Map.
//
//   settings  { apiOrigin, key, enabled, youtube, blocklist[], profile }
//   queue     [{ clientVisitId, url, title, visitedAt, transition, page?, enqueuedAt }]
//   state     { blocked: null|'key'|'scope'|'target', nextAttemptAt, failures,
//               lastFlushAt, lastError, skeletonId, day, sentToday, lastKey, lastKeyAt,
//               titles: [{ key, title, at }] — a tab's title that arrived before its visit }

import { linkKey } from './linkKey.js'
import { excluded, skipTransition } from './exclude.js'

export const DEFAULT_SETTINGS = {
  apiOrigin: 'https://api.pathos.cloud',
  key: '',
  enabled: true,
  youtube: false,
  blocklist: [],
  profile: 'Default'
}
export const QUEUE_MAX = 5000            // offline for days must not balloon storage
export const COLLAPSE_MS = 30 * 60 * 1000 // the server's dwell rule, mirrored
export const TITLE_GRACE_MS = 10 * 1000  // wait this long for the tab's title
const EARLY_TITLE_MS = 60 * 1000         // how long an early title waits for its visit
const EARLY_TITLES_MAX = 20

// ONE WRITER AT A TIME. Every change here is load → modify → save over the
// same two keys, and the worker's events interleave at every await
// (onVisited's getVisits, a tab's title, a flush's fetch): two mutations in
// flight would each save over the other's. Every mutation runs on this
// chain, in arrival order.
let chain = Promise.resolve()
export function serial (fn) {
  const run = chain.then(fn, fn)
  chain = run.catch(() => {})
  return run
}

const newId = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`)
const today = (now) => new Date(now).toISOString().slice(0, 10)

export async function load (storage) {
  const got = await storage.get(['settings', 'queue', 'state'])
  return {
    settings: { ...DEFAULT_SETTINGS, ...(got.settings || {}) },
    queue: Array.isArray(got.queue) ? got.queue : [],
    state: got.state || {}
  }
}

/**
 * One history visit → maybe one queued item. `item` = chrome's HistoryItem,
 * `visit` = the newest VisitItem of that URL (getVisits). → { queued, reason? }
 */
export function enqueueVisit (storage, item, visit, opts = {}) {
  return serial(() => _enqueueVisit(storage, item, visit, opts))
}
async function _enqueueVisit (storage, item, visit, { now = Date.now() } = {}) {
  const { settings, queue, state } = await load(storage)
  if (!settings.enabled) return { queued: false, reason: 'paused' }
  if (!settings.key) return { queued: false, reason: 'no key' }
  if (visit && visit.isLocal === false) return { queued: false, reason: 'synced from another device' }
  if (visit && skipTransition(visit.transition)) return { queued: false, reason: `transition ${visit.transition}` }
  const why = excluded(item.url, settings.blocklist)
  if (why) return { queued: false, reason: why }
  const url = String(item.url).split('#')[0]
  const visitedAt = new Date(visit?.visitTime || item.lastVisitTime || now).toISOString()
  // The same page again within 30 min of the last one is no new visit (the
  // server would collapse it; sparing it the request).
  const key = linkKey(url)
  if (key && state.lastKey === key && state.lastKeyAt && Date.parse(visitedAt) - state.lastKeyAt < COLLAPSE_MS) {
    return { queued: false, reason: 'dwell' }
  }
  // A fast page's tab can finish loading BEFORE this handler gets here
  // (getVisits + storage are async): its title waits in state.titles.
  const titles = (state.titles || []).filter((t) => now - t.at < EARLY_TITLE_MS)
  const early = key ? titles.find((t) => t.key === key) : null
  queue.push({
    clientVisitId: newId(), url, title: item.title || early?.title || null, visitedAt,
    transition: visit?.transition || null, enqueuedAt: now
  })
  while (queue.length > QUEUE_MAX) queue.shift()
  await storage.set({ queue, state: { ...state, lastKey: key, lastKeyAt: Date.parse(visitedAt), titles: titles.filter((t) => t !== early) } })
  return { queued: true }
}

const sameKey = (a, b) => { const ka = linkKey(a); return !!ka && ka === linkKey(b) }

/**
 * A tab finished loading: give its title to the newest queued visit of that
 * address still without one — or, when the visit has not queued yet (a fast
 * page beats the async onVisited handler), keep it a minute for that visit.
 */
export function fillTitle (storage, url, title, opts = {}) {
  return serial(() => _fillTitle(storage, url, title, opts))
}
async function _fillTitle (storage, url, title, { now = Date.now() } = {}) {
  if (!title) return false
  const { queue, state } = await load(storage)
  for (let i = queue.length - 1; i >= 0; i--) {
    if (!queue[i].title && sameKey(queue[i].url, url)) {
      queue[i].title = String(title).slice(0, 300)
      await storage.set({ queue })
      return true
    }
  }
  const key = linkKey(url)
  if (!key) return false
  const titles = [...(state.titles || []).filter((t) => now - t.at < EARLY_TITLE_MS && t.key !== key), { key, title: String(title).slice(0, 300), at: now }].slice(-EARLY_TITLES_MAX)
  await storage.set({ state: { ...state, titles } })
  return false
}

/** The YouTube module read the page: attach what it says to that address's newest queued visit. */
export function attachPage (storage, url, page) {
  return serial(() => _attachPage(storage, url, page))
}
async function _attachPage (storage, url, page) {
  const { queue } = await load(storage)
  for (let i = queue.length - 1; i >= 0; i--) {
    if (sameKey(queue[i].url, url)) {
      queue[i].page = { provider: 'youtube', ...page }
      if (!queue[i].title && page.title) queue[i].title = String(page.title).slice(0, 300)
      await storage.set({ queue })
      return true
    }
  }
  return false
}

/** The items ready to send: titled, or past the grace — at most `max`. */
export function readyBatch (queue, { now = Date.now(), max = 50 } = {}) {
  return queue.filter((v) => v.title || now - v.enqueuedAt >= TITLE_GRACE_MS).slice(0, max)
}

/**
 * Fold the API's answer into the queue: a visit the server wrote, replayed,
 * collapsed or skipped leaves; a server error (5xx) stays for the next
 * flush; a refusal of the visit itself (4xx) leaves and is counted.
 * → { sent, rejected, kept }
 */
export function settle (queue, batch, results = [], { now = Date.now(), state = {} } = {}) {
  const byId = new Map(results.map((r) => [r.clientVisitId, r]))
  const done = new Set()
  let sent = 0; let rejected = 0
  for (const v of batch) {
    const r = byId.get(v.clientVisitId)
    if (!r) continue
    if (r.error && Number(r.error.code) >= 50000) continue
    done.add(v.clientVisitId)
    if (r.error) rejected++
    else if (r.link_id && !r.replay) sent++
  }
  const day = today(now)
  const sentToday = (state.day === day ? Number(state.sentToday || 0) : 0) + sent
  return { queue: queue.filter((v) => !done.has(v.clientVisitId)), sent, rejected, kept: batch.length - done.size, day, sentToday }
}
