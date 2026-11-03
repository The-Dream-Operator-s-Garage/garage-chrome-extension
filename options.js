import { load } from './lib/queue.js'
import { testKey } from './lib/client.js'

const $ = (id) => document.getElementById(id)
const storage = chrome.storage.local
const say = (text, cls = '') => { $('status').textContent = text; $('status').className = 'note ' + cls }

const read = () => ({
  enabled: $('enabled').checked,
  autoUpload: $('autoUpload').checked,
  key: $('key').value.trim(),
  apiOrigin: $('apiOrigin').value,
  profile: $('profile').value.trim() || 'Default',
  youtube: $('youtube').checked,
  blocklist: $('blocklist').value.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean)
})

const show = async () => {
  const { settings } = await load(storage)
  $('enabled').checked = !!settings.enabled
  $('autoUpload').checked = settings.autoUpload !== false
  $('key').value = settings.key || ''
  $('apiOrigin').value = settings.apiOrigin
  $('profile').value = settings.profile || ''
  $('youtube').checked = !!settings.youtube
  $('blocklist').value = (settings.blocklist || []).join('\n')
}

$('save').addEventListener('click', async () => {
  const next = read()
  if (next.key && !/^pcs_[0-9a-f]{48}$/.test(next.key)) { say('That is not a pathos.cloud key (pcs_ + 48 characters).', 'bad'); return }
  await storage.set({ settings: next })
  // check the key on Save too — it names the history My history opens
  const r = next.key ? await testKey(next) : null
  await chrome.runtime.sendMessage({ type: 'settings-changed', skeletonId: r?.ok ? r.skeleton?.id : null })
  if (!next.key) say('Saved — no key, nothing is recorded.', 'bad')
  else if (r.ok) say(`Saved — the key works. Pages you open from now on are recorded${next.autoUpload ? ' and uploaded as they load' : ' — press Send now to upload them'} (a page already open counts when you next open it).`, 'ok')
  else say(`Saved, but the key did not answer: ${r.message}`, 'bad')
})

$('test').addEventListener('click', async () => {
  const s = read()
  if (!s.key) { say('Paste your key first.', 'bad'); return }
  say('Testing…')
  const r = await testKey(s)
  say(r.ok ? `Works — ${r.total} visit(s) on ${r.skeleton?.name || 'your history'} #${r.skeleton?.id}.` : `No: ${r.message}`, r.ok ? 'ok' : 'bad')
})

// Switching the YouTube module on asks for youtube.com — from this click,
// as Chrome requires; switching it off gives the permission back.
$('youtube').addEventListener('change', async (e) => {
  if (e.target.checked) {
    const granted = await chrome.permissions.request({ origins: ['https://www.youtube.com/*'] })
    if (!granted) { e.target.checked = false; say('YouTube stays off — access was not granted.', 'bad'); return }
  } else {
    await chrome.permissions.remove({ origins: ['https://www.youtube.com/*'] }).catch(() => {})
  }
  const { settings } = await load(storage)
  await storage.set({ settings: { ...settings, youtube: e.target.checked } })
  await chrome.runtime.sendMessage({ type: 'settings-changed' })
  say(e.target.checked ? 'YouTube module on.' : 'YouTube module off.', 'ok')
})

show()
