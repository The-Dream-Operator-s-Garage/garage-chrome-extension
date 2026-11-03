// The service worker — pathos.cloud :: history upload (the Garage
// extension's first functionality; docs in pathos-cloud-api
// docs/concepts/extensions.md). It does four things:
//   · history.onVisited → one queued visit (lib/queue.js decides: paused,
//     no key, synced from another device, a reload or a subframe, an
//     excluded host, a dwell — skipped);
//   · tabs.onUpdated(complete) → the tab's title onto that visit (onVisited
//     fires before the page loads; a visit waits up to 10 s for it);
//   · the YouTube module's message → the page's channel and date onto it;
//   · an alarm every minute (and 20 queued, and the popup's Flush now) →
//     lib/client.js's flush.
// No state in memory: an MV3 worker dies after 30 s idle, so the queue and
// every counter live in chrome.storage.local (never sync — the key is a
// credential).

import { enqueueVisit, fillTitle, attachPage, load, patchState, DEFAULT_SETTINGS } from './lib/queue.js'
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

const doFlush = async (opts = {}) => {
  const r = await flush(storage, opts)
  await refreshBadge()
  return r
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
  else refreshBadge()
})

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === 'complete' && tab?.url && tab.title && !tab.incognito) fillTitle(storage, tab.url, tab.title)
})

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg?.type === 'page' && sender.tab && !sender.tab.incognito) { attachPage(storage, msg.url, msg.page); return false }
  if (msg?.type === 'flush') { doFlush({ force: true }).then(reply); return true }
  if (msg?.type === 'settings-changed') {
    // a fresh key starts clean; the options page's check names its history
    const fresh = { blocked: null, nextAttemptAt: null, failures: 0, lastError: null, lastSkip: null }
    if (msg.skeletonId) fresh.skeletonId = msg.skeletonId
    patchState(storage, fresh).then(async () => {
      await syncYoutubeScript()
      await refreshBadge()
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
