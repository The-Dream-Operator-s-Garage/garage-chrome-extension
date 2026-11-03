import { load } from './lib/queue.js'

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
  $('mode').textContent = !settings.key ? 'No key yet — open Options.' : settings.enabled ? `Recording · ${settings.profile}` : 'Paused'
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
