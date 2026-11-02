import { load } from './lib/queue.js'

const $ = (id) => document.getElementById(id)
const storage = chrome.storage.local
const dashboardOf = (apiOrigin) => (/localhost/.test(apiOrigin) ? 'http://localhost:8080' : 'https://pathos.cloud')
const ago = (t) => { if (!t) return '—'; const s = Math.round((Date.now() - t) / 1000); return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago` }

const show = async () => {
  const { settings, queue, state } = await load(storage)
  $('mode').textContent = !settings.key ? 'No key yet — open Options.' : settings.enabled ? `Recording · ${settings.profile}` : 'Paused'
  $('today').textContent = state.day === new Date().toISOString().slice(0, 10) ? String(state.sentToday || 0) : '0'
  $('queued').textContent = String(queue.length)
  $('last').textContent = ago(state.lastFlushAt)
  $('error').textContent = state.blocked === 'key' ? 'The key was refused (revoked?) — paste a new one in Options.' : (state.lastError || '')
  $('open').disabled = !state.skeletonId
}

$('flush').addEventListener('click', async () => {
  $('flush').disabled = true
  await chrome.runtime.sendMessage({ type: 'flush' })
  $('flush').disabled = false
  show()
})
$('open').addEventListener('click', async () => {
  const { settings, state } = await load(storage)
  if (state.skeletonId) chrome.tabs.create({ url: `${dashboardOf(settings.apiOrigin)}/#/skeletons/${state.skeletonId}` })
})
$('options').addEventListener('click', (e) => { e.preventDefault(); chrome.runtime.openOptionsPage() })

show()
