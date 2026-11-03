// The service worker — pathos.cloud :: history upload (the Garage
// extension's first functionality; docs in pathos-cloud-api
// docs/concepts/extensions.md). It does four things:
//   · history.onVisited → one queued visit (lib/queue.js decides: paused,
//     no key, synced from another device, a reload or a subframe, an
//     excluded host, a dwell — skipped);
//   · tabs.onUpdated(complete) → the tab's title onto that visit (onVisited
//     fires before the page loads; a visit waits up to 10 s for it);
//   · the YouTube module's message → the page's channel and date onto it;
//   · Upload automatically (0.2.0, on by default): a visit is sent as soon
//     as it is ready — its title arrived (and, on a YouTube watch page, the
//     module's channel + date), or its 10 s grace ran out — so the history
//     on pathos.cloud follows the browsing within seconds;
//   · an alarm every minute (the retry net), 20 queued, and the popup's
//     Send now → lib/client.js's flush.
// No state in memory: an MV3 worker dies after 30 s idle, so the queue and
// every counter live in chrome.storage.local (never sync — the key is a
// credential).

import { enqueueVisit, fillTitle, attachPage, load, patchState, nextReadyIn, DEFAULT_SETTINGS } from './lib/queue.js'
import { flush } from './lib/client.js'

const storage = chrome.storage.local
const ALARM = 'flush'
const FLUSH_AT = 20
const YT_SCRIPT = 'garage-youtube'

const ensureAlarm = async () => {
  if (!(await chrome.alarms.get(ALARM))) chrome.alarms.create(ALARM, { periodInMinutes: 1 })
}

const syncYoutubeScript = async () => {
  const { settings } = await load(storage)
  const granted = await chrome.permissions.contains({ origins: ['https://www.youtube.com/*'] })
  const have = (await chrome.scripting.getRegisteredContentScripts({ ids: [YT_SCRIPT] })).length > 0
  if (settings.youtube && granted && !have) {
    await chrome.scripting.registerContentScripts([{ id: YT_SCRIPT, matches: ['https://www.youtube.com/*'], js: ['content/youtube.js'], runAt: 'document_idle' }])
  } else if ((!settings.youtube || !granted) && have) {
    await chrome.scripting.unregisterContentScripts({ ids: [YT_SCRIPT] })
  }
}

// One flush in flight at a time: an automatic send, the alarm and Send now
// may all land together; the second waits for the first's answer and then
// runs on what is still queued (the batch ids make any overlap idempotent).
let inFlight = Promise.resolve()
const doFlush = (opts = {}) => {
  const run = inFlight.then(async () => {
    const r = await flush(storage, opts)
    await refreshBadge()
    return r
  })
  inFlight = run.catch(() => {})
  return run
}

// UPLOAD AUTOMATICALLY: send what is ready now; if a visit still waits for
// its title / page, look again when its grace runs out. The timer lives only
// as long as this worker — the minute alarm is the net when Chrome kills it.
let soonTimer = null
const sendSoon = async (delayMs = 300) => {
  const { settings } = await load(storage)
  if (settings.autoUpload === false || !settings.enabled || !settings.key) return
  clearTimeout(soonTimer)
  soonTimer = setTimeout(async () => {
    soonTimer = null
    await doFlush()
    const { queue } = await load(storage)
    const wait = nextReadyIn(queue)
    if (wait != null) sendSoon(wait + 250)
  }, delayMs)
}

const refreshBadge = async () => {
  const { state, queue } = await load(storage)
  const text = state.blocked ? '!' : (queue.length ? String(Math.min(queue.length, 999)) : '')
  await chrome.action.setBadgeText({ text })
  await chrome.action.setBadgeBackgroundColor({ color: state.blocked ? '#b71c1c' : '#00796b' })
}

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  const { settings } = await chrome.storage.local.get('settings')
  if (!settings) await storage.set({ settings: DEFAULT_SETTINGS, queue: [], state: {} })
  await ensureAlarm()
  if (reason === 'install') chrome.runtime.openOptionsPage()
})
chrome.runtime.onStartup.addListener(() => { ensureAlarm(); syncYoutubeScript() })

chrome.alarms.onAlarm.addListener((a) => { if (a.name === ALARM) doFlush() })

chrome.history.onVisited.addListener(async (item) => {
  let visit = null
  try {
    const visits = await chrome.history.getVisits({ url: item.url })
    visit = visits.reduce((a, b) => (!a || b.visitTime > a.visitTime ? b : a), null)
  } catch (_) { /* the item alone still names the page */ }
  const r = await enqueueVisit(storage, item, visit)
  if (!r.queued) return
  const { queue } = await load(storage)
  if (queue.length >= FLUSH_AT) doFlush()
  else { refreshBadge(); sendSoon() }   // titled already → now; else when the title (or its grace) comes
})

chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (info.status === 'complete' && tab?.url && tab.title && !tab.incognito) {
    if (await fillTitle(storage, tab.url, tab.title)) sendSoon()
  }
})

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg?.type === 'page' && sender.tab && !sender.tab.incognito) {
    attachPage(storage, msg.url, msg.page).then((attached) => { if (attached) sendSoon() })
    return false
  }
  if (msg?.type === 'flush') { doFlush({ force: true }).then(reply); return true }
  if (msg?.type === 'settings-changed') {
    // a fresh key starts clean; the options page's check names its history
    const fresh = { blocked: null, nextAttemptAt: null, failures: 0, lastError: null, lastSkip: null }
    if (msg.skeletonId) fresh.skeletonId = msg.skeletonId
    patchState(storage, fresh).then(async () => {
      await syncYoutubeScript()
      await refreshBadge()
      sendSoon()   // switching Upload automatically on sends what waited
      reply({ ok: true })
    })
    return true
  }
  return false
})

chrome.permissions.onAdded.addListener(() => syncYoutubeScript())
chrome.permissions.onRemoved.addListener(() => syncYoutubeScript())

// The witness's hand (probe-extension-client.mjs drives a real Chromium):
// the same flush the alarm runs, without waiting a minute.
self.__garageFlush = () => doFlush({ force: true })
