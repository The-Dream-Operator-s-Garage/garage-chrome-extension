import { load } from './lib/queue.js'
import { pinCall } from './lib/client.js'
import { excluded, hostOf } from './lib/exclude.js'

const $ = (id) => document.getElementById(id)
const storage = chrome.storage.local
const dashboardOf = (apiOrigin) => (/localhost/.test(apiOrigin) ? 'http://localhost:8080' : 'https://pathos.cloud')
const ago = (t) => { if (!t) return '—'; const s = Math.round((Date.now() - t) / 1000); return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago` }

// Why a page was not queued, in the person's words (lib/queue.js reasons).
const WHY = {
  paused: 'recording is paused',
  'no key': 'no key was saved yet',
  'synced from another device': 'it came from another device',
  'transition reload': 'it was a reload',
  'transition auto_subframe': 'it was inside another page',
  'transition manual_subframe': 'it was inside another page',
  'not http(s)': 'it is not a web page',
  'this machine': 'it is on this computer',
  'blocked domain': 'its site is never recorded (your block list, or pathos.cloud)',
  dwell: 'you were already on it in the last 30 minutes'
}

const show = async () => {
  const { settings, queue, state } = await load(storage)
  $('mode').textContent = !settings.key ? 'No key yet — open Options.' : settings.enabled ? `Recording · ${settings.profile} · ${settings.autoUpload === false ? 'sends when you press Send now' : 'uploads automatically'}` : 'Paused'
  $('today').textContent = state.day === new Date().toISOString().slice(0, 10) ? String(state.sentToday || 0) : '0'
  $('queued').textContent = String(queue.length)
  $('last').textContent = ago(state.lastFlushAt)
  $('error').textContent = state.blocked === 'key' ? 'The key was refused (revoked?) — paste a new one in Options.' : (state.lastError || '')
  $('open').disabled = !state.skeletonId
  const s = state.lastSkip
  $('lastpage').textContent = s && Date.now() - s.at < 6 * 3600 * 1000
    ? `Last page not recorded${s.host ? ` (${s.host})` : ''}: ${WHY[s.reason] || s.reason}.`
    : (!queue.length && !state.lastFlushAt && settings.key ? 'Pages you open from now on are recorded — reloading a page does not count.' : '')
}

// What Send now did, said out loud (the worker's flush answer).
const told = (r = {}, queued) => {
  if (r.ok) return r.sent ? `Sent ${r.sent} visit(s).` : (r.rejected ? `${r.rejected} visit(s) refused.` : 'Sent — already recorded.')
  if (r.skipped === 'nothing ready') return queued ? 'Waiting a few seconds for the page title — try again.' : 'Nothing waiting — open a page and it queues here.'
  if (r.skipped === 'no key') return 'No key — paste one in Options.'
  if (r.skipped === 'paused') return 'Recording is paused (Options).'
  if (r.skipped?.startsWith('blocked')) return 'The key was refused — see above.'
  if (r.error === 'network') return 'Could not reach pathos.cloud — it retries by itself.'
  if (r.error === 'rate') return `Too many at once — it retries in ${Math.round(r.retryInMs / 1000)} s.`
  if (r.error === 'refused') return `pathos.cloud refused the batch (${r.dropped} dropped).`
  if (r.error) return `pathos.cloud answered HTTP ${r.status} — it retries by itself.`
  return ''
}

// THE PIN BUTTON (0.2.0): the page in front of you, pinned onto the
// pathos.cloud account your key belongs to (your root — the Chrome alter-ego
// writes the history, you pin from it). The page's node is the history's
// own: found, or minted exactly as its visit would mint it.
let tabPage = null   // { url, title }
const pinView = (r) => {
  const b = $('pin')
  if (!r) return
  if (r.ok) {
    b.disabled = false
    b.classList.toggle('on', r.pinned)
    $('pinword').textContent = r.pinned ? 'Pinned' : 'Pin'
    b.title = r.pinned ? 'Pinned — click to unpin' : 'Pin this page onto your pathos.cloud pins'
    const who = r.account?.display_name ? `${r.account.display_name}'s pins` : 'your pins'
    $('pinsaid').className = 'note ok'
    $('pinsaid').textContent = r.pinned ? `On ${who}.` : ''
    return
  }
  b.disabled = r.code === 40322 || r.status === 403
  $('pinsaid').textContent = r.code === 40322
    ? 'This key cannot pin yet — on pathos.cloud: identity window → Keys → switch on Pins beside it.'
    : r.status === 401 ? 'The key was refused — paste a new one in Options.' : `Pin: ${r.message}`
  $('pinsaid').className = 'note bad'
}
const showPin = async () => {
  const { settings } = await load(storage)
  // the page in front of you; `#tab=<id>` names one (the witness opens this
  // popup as a tab of its own, which would otherwise be the active page)
  const named = Number(new URLSearchParams(location.hash.slice(1)).get('tab')) || null
  const [tab] = named ? [await chrome.tabs.get(named).catch(() => null)] : await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => [])
  const url = tab?.url ? String(tab.url).split('#')[0] : null
  const host = url ? hostOf(url) : null
  $('pagetitle').textContent = tab?.title || host || 'This page'
  $('pagehost').textContent = host || ''
  if (!host) { $('pinsaid').textContent = 'Only web pages can be pinned.'; return }
  if (excluded(url, settings.blocklist)) { $('pinsaid').textContent = 'This page is never recorded, so it cannot be pinned.'; return }
  if (!settings.key) { $('pinsaid').textContent = 'Save a key in Options to pin.'; return }
  tabPage = { url, title: tab.title || null }
  pinView(await pinCall(settings, url, 'state'))
}
$('pin').addEventListener('click', async () => {
  if (!tabPage) return
  const { settings } = await load(storage)
  const on = $('pin').classList.contains('on')
  $('pin').disabled = true
  $('pinsaid').className = 'note'
  $('pinsaid').textContent = on ? 'Unpinning…' : 'Pinning…'
  pinView(await pinCall(settings, tabPage.url, on ? 'unpin' : 'pin'))
})

$('flush').addEventListener('click', async () => {
  $('flush').disabled = true
  $('said').textContent = 'Sending…'
  let r = null
  try { r = await chrome.runtime.sendMessage({ type: 'flush' }) } catch (e) { r = { error: 'worker', status: String(e.message || e) } }
  const { queue } = await load(storage)
  $('said').textContent = r?.error === 'worker' ? `The extension's worker did not answer (${r.status}).` : told(r || {}, queue.length)
  $('flush').disabled = false
  show()
})
$('open').addEventListener('click', async () => {
  const { settings, state } = await load(storage)
  if (state.skeletonId) chrome.tabs.create({ url: `${dashboardOf(settings.apiOrigin)}/#/skeletons/${state.skeletonId}` })
})
$('options').addEventListener('click', (e) => { e.preventDefault(); chrome.runtime.openOptionsPage() })

show()
showPin()
