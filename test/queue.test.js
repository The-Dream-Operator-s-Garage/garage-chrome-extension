import test from 'node:test'
import assert from 'node:assert/strict'
import { memoryStorage } from './memory-storage.js'
import { enqueueVisit, fillTitle, attachPage, readyBatch, settle, load } from '../lib/queue.js'
import { excluded } from '../lib/exclude.js'
import { linkKey } from '../lib/linkKey.js'
import { flush } from '../lib/client.js'

const KEY = 'pcs_' + 'a'.repeat(48)
const on = (extra = {}) => memoryStorage({ settings: { apiOrigin: 'http://api.test', key: KEY, enabled: true, blocklist: ['bank.example'], ...extra } })
const item = (url, title = '') => ({ url, title, lastVisitTime: Date.parse('2026-11-02T19:00:00Z') })
const visit = (t = 'link', isLocal = true, at = '2026-11-02T19:00:00Z') => ({ visitTime: Date.parse(at), transition: t, isLocal })

test('linkKey: scheme-blind, www-less, tracking-free, sorted — the API\'s grammar', () => {
  assert.equal(linkKey('https://www.Example.com/A/?utm_source=x&b=2&a=1#f'), 'url:example.com/A?a=1&b=2')
  assert.equal(linkKey('http://example.com/A'), linkKey('https://m.example.com/A/'))
  assert.equal(linkKey('chrome://settings'), null)
})

test('exclusions: this machine, pathos.cloud, the blocklist (subdomains too), non-http', () => {
  assert.equal(excluded('http://localhost:8080/x'), 'this machine')
  assert.equal(excluded('http://127.0.0.1/'), 'this machine')
  assert.equal(excluded('https://api.pathos.cloud/api/x'), 'blocked domain')
  assert.equal(excluded('https://news.bank.example/x', ['bank.example']), 'blocked domain')
  assert.equal(excluded('file:///etc/hosts'), 'not http(s)')
  assert.equal(excluded('https://example.org/'), null)
})

test('enqueue: paused, no key, synced, reload, subframe and excluded visits never queue', async () => {
  assert.equal((await enqueueVisit(on({ enabled: false }), item('https://a.example/'), visit())).reason, 'paused')
  assert.equal((await enqueueVisit(on({ key: '' }), item('https://a.example/'), visit())).reason, 'no key')
  assert.match((await enqueueVisit(on(), item('https://a.example/'), visit('link', false))).reason, /synced/)
  assert.match((await enqueueVisit(on(), item('https://a.example/'), visit('reload'))).reason, /reload/)
  assert.match((await enqueueVisit(on(), item('https://a.example/'), visit('auto_subframe'))).reason, /subframe/)
  assert.equal((await enqueueVisit(on(), item('https://bank.example/'), visit())).reason, 'blocked domain')
})

test('enqueue: a visit queues once, the fragment dropped; the same page within 30 min is a dwell', async () => {
  const s = on()
  assert.equal((await enqueueVisit(s, item('https://a.example/p#x', 'A'), visit())).queued, true)
  assert.equal((await enqueueVisit(s, item('https://www.a.example/p/', 'A'), visit('link', true, '2026-11-02T19:10:00Z'))).reason, 'dwell')
  assert.equal((await enqueueVisit(s, item('https://a.example/p', 'A'), visit('link', true, '2026-11-02T19:45:00Z'))).queued, true)
  const { queue } = await load(s)
  assert.equal(queue.length, 2)
  assert.equal(queue[0].url, 'https://a.example/p')
  assert.match(queue[0].clientVisitId, /^[A-Za-z0-9_-]{6,64}$/)
})

test('a skipped page is remembered with its reason (the popup says it); a queued one clears it; frames and browser pages never', async () => {
  const s = on({ key: '' })
  await enqueueVisit(s, item('https://www.youtube.com/watch?v=abc'), visit(), { now: 1000 })
  assert.deepEqual((await load(s)).state.lastSkip, { host: 'www.youtube.com', reason: 'no key', at: 1000 })
  await s.set({ settings: { ...(await load(s)).settings, key: KEY } })
  await enqueueVisit(s, item('https://a.example/x'), visit('auto_subframe'), { now: 2000 })
  await enqueueVisit(s, item('chrome-extension://abc/options.html'), visit('typed'), { now: 2500 })
  assert.equal((await load(s)).state.lastSkip.reason, 'no key')
  await enqueueVisit(s, item('https://a.example/x'), visit('reload'), { now: 3000 })
  assert.equal((await load(s)).state.lastSkip.reason, 'transition reload')
  await enqueueVisit(s, item('https://a.example/y'), visit(), { now: 4000 })
  assert.equal((await load(s)).state.lastSkip, null)
})

test('titles and pages find their visit by the link key', async () => {
  const s = on()
  await enqueueVisit(s, item('https://www.youtube.com/watch?v=abc'), visit())
  assert.equal(await fillTitle(s, 'https://youtube.com/watch?v=abc&si=share', 'A video - YouTube'), true)
  assert.equal(await attachPage(s, 'https://www.youtube.com/watch?v=abc', { id: 'abc', channel: 'Ch', publishedAt: '2024-05-01' }), true)
  const { queue } = await load(s)
  assert.equal(queue[0].title, 'A video - YouTube')
  assert.deepEqual(queue[0].page, { provider: 'youtube', id: 'abc', channel: 'Ch', publishedAt: '2024-05-01' })
})

test('a title that arrives BEFORE its visit waits for it (a fast page beats onVisited)', async () => {
  const s = on()
  assert.equal(await fillTitle(s, 'https://fast.example/p', 'Fast page'), false)
  await enqueueVisit(s, item('https://www.fast.example/p/'), visit())
  const { queue, state } = await load(s)
  assert.equal(queue[0].title, 'Fast page')
  assert.equal((state.titles || []).length, 0, 'the early title is spent')
})

test('mutations in flight together all land (one writer at a time)', async () => {
  const s = on()
  await Promise.all([
    enqueueVisit(s, item('https://a.example/1'), visit('link', true, '2026-11-02T19:00:00Z')),
    fillTitle(s, 'https://b.example/2', 'B early'),
    enqueueVisit(s, item('https://c.example/3'), visit('link', true, '2026-11-02T19:01:00Z')),
    enqueueVisit(s, item('https://b.example/2'), visit('link', true, '2026-11-02T19:02:00Z'))
  ])
  const { queue } = await load(s)
  assert.deepEqual(queue.map((v) => v.url), ['https://a.example/1', 'https://c.example/3', 'https://b.example/2'])
  assert.equal(queue[2].title, 'B early')
})

test('a visit that queues while a flush is in flight survives the flush', async () => {
  const s = on()
  await enqueueVisit(s, item('https://a.example/1', 'One'), visit())
  let release
  const gate = new Promise((r) => { release = r })
  const slow = async (url, init) => {
    await gate
    return { ok: true, status: 200, headers: new Map(), json: async () => ({ success: true, results: JSON.parse(init.body).visits.map((v) => ({ clientVisitId: v.clientVisitId, link_id: 1 })) }) }
  }
  const f = flush(s, { fetchImpl: slow })
  await new Promise((r) => setTimeout(r, 10))
  await enqueueVisit(s, item('https://a.example/2', 'Two'), visit('link', true, '2026-11-02T20:00:00Z'))
  release()
  assert.equal((await f).sent, 1)
  assert.deepEqual((await load(s)).queue.map((v) => v.url), ['https://a.example/2'])
})

test('readyBatch waits 10 s for a title; settle keeps 5xx, drops the rest', () => {
  const now = 1_000_000
  const q = [
    { clientVisitId: 'aaaaaa1', title: 'T', enqueuedAt: now },
    { clientVisitId: 'aaaaaa2', title: null, enqueuedAt: now - 2000 },
    { clientVisitId: 'aaaaaa3', title: null, enqueuedAt: now - 11000 }
  ]
  assert.deepEqual(readyBatch(q, { now }).map((v) => v.clientVisitId), ['aaaaaa1', 'aaaaaa3'])
  const s = settle(q, [q[0], q[2]], [{ clientVisitId: 'aaaaaa1', link_id: 9 }, { clientVisitId: 'aaaaaa3', error: { code: 50000 } }], { now, state: {} })
  assert.deepEqual(s.queue.map((v) => v.clientVisitId), ['aaaaaa2', 'aaaaaa3'])
  assert.equal(s.sent, 1); assert.equal(s.kept, 1); assert.equal(s.sentToday, 1)
})

test('flush: 200 empties what landed; 401 blocks; network errors back off', async () => {
  const s = on()
  await enqueueVisit(s, item('https://a.example/1', 'One'), visit())
  const ok = async (url, init) => ({ ok: true, status: 200, headers: new Map(), json: async () => ({ success: true, skeleton: { id: 7 }, results: JSON.parse(init.body).visits.map((v) => ({ clientVisitId: v.clientVisitId, link_id: 1 })) }) })
  const r = await flush(s, { fetchImpl: ok })
  assert.equal(r.sent, 1)
  assert.equal((await load(s)).queue.length, 0)
  assert.equal((await load(s)).state.skeletonId, 7)

  await enqueueVisit(s, item('https://a.example/2', 'Two'), visit('link', true, '2026-11-02T20:00:00Z'))
  const down = async () => { throw new Error('offline') }
  const n = await flush(s, { fetchImpl: down, now: 5000 })
  assert.equal(n.error, 'network')
  assert.equal((await flush(s, { fetchImpl: ok, now: 6000 })).skipped, 'backing off')
  assert.equal((await flush(s, { fetchImpl: ok, now: 6000 + 61000 })).sent, 1)

  await enqueueVisit(s, item('https://a.example/3', 'Three'), visit('link', true, '2026-11-02T21:00:00Z'))
  const revoked = async () => ({ ok: false, status: 401, headers: new Map(), json: async () => ({ success: false, error: { code: 40111, message: 'revoked' } }) })
  assert.equal((await flush(s, { fetchImpl: revoked })).error, 'key')
  assert.equal((await flush(s, { fetchImpl: ok })).skipped, 'blocked: key')
  assert.equal((await load(s)).queue.length, 1, 'the visit waits for a new key')
})

test('0.2.0 upload automatically: on by default; the alarm skips when it is off, Send now still sends', async () => {
  const { DEFAULT_SETTINGS } = await import('../lib/queue.js')
  assert.equal(DEFAULT_SETTINGS.autoUpload, true)
  const s = on({ autoUpload: false })
  await enqueueVisit(s, item('https://a.example/x', 'X'), visit())
  let posted = 0
  const fetchImpl = async () => { posted++; return { status: 200, ok: true, headers: { get: () => null }, json: async () => ({ success: true, skeleton: { id: 9 }, results: [] }) } }
  assert.deepEqual(await flush(s, { fetchImpl }), { skipped: 'manual' })
  assert.equal(posted, 0)
  await flush(s, { fetchImpl, force: true })
  assert.equal(posted, 1)
})

test('0.2.0 a YouTube watch visit waits for the module (or its grace) before it is ready; nextReadyIn says when', async () => {
  const { nextReadyIn } = await import('../lib/queue.js')
  const s = on({ youtube: true })
  await enqueueVisit(s, item('https://www.youtube.com/watch?v=abc', 'A video - YouTube'), visit(), { now: 1000 })
  await enqueueVisit(s, item('https://a.example/', 'A'), visit('link', true, '2026-11-02T19:01:00Z'), { now: 1000 })
  let { queue } = await load(s)
  assert.equal(queue[0].expectsPage, true)
  assert.deepEqual(readyBatch(queue, { now: 2000 }).map((v) => v.url), ['https://a.example/'])
  assert.equal(nextReadyIn(queue, { now: 2000 }), 9000)
  await attachPage(s, 'https://youtube.com/watch?v=abc', { id: 'abc', channel: 'C' })
  queue = (await load(s)).queue
  assert.equal(readyBatch(queue, { now: 2000 }).length, 2)
  assert.equal(nextReadyIn(queue, { now: 2000 }), null)
  assert.equal(readyBatch(queue, { now: 11001 }).length, 2, 'the grace still sends it without the module')
})

test('0.2.0 the pin call: state / pin / unpin, the URL in the body never the query string', async () => {
  const { pinCall } = await import('../lib/client.js')
  const calls = []
  const fetchImpl = async (u, init) => { calls.push({ u, method: init.method, body: JSON.parse(init.body) }); return { status: 200, ok: true, json: async () => ({ success: true, pinned: init.method !== 'DELETE', account: { id: 1, display_name: 'Me' } }) } }
  const st = { apiOrigin: 'http://api.test/', key: KEY }
  assert.equal((await pinCall(st, 'https://a.example/p?q=1', 'state', { fetchImpl })).pinned, true)
  await pinCall(st, 'https://a.example/p?q=1', 'pin', { fetchImpl })
  assert.equal((await pinCall(st, 'https://a.example/p?q=1', 'unpin', { fetchImpl })).pinned, false)
  assert.deepEqual(calls.map((c) => `${c.method} ${c.u}`), ['POST http://api.test/api/extensions/pins/state', 'POST http://api.test/api/extensions/pins', 'DELETE http://api.test/api/extensions/pins'])
  assert.ok(calls.every((c) => c.body.url === 'https://a.example/p?q=1' && !c.u.includes('?')))
  const refused = await pinCall(st, 'https://a.example/', 'pin', { fetchImpl: async () => ({ status: 403, ok: false, json: async () => ({ success: false, error: { code: 40322, message: 'scope' } }) }) })
  assert.deepEqual([refused.ok, refused.code], [false, 40322])
})
