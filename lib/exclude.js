// What never leaves the browser (docs/plans/chrome-history-extension.md,
// decision "Exclusions"): anything but http(s); this machine (localhost,
// loopback, *.local); pathos.cloud itself; and every domain the person
// lists in the options page. The API refuses the same hosts again — this is
// the first fence, not the only one. Incognito never reaches the worker:
// the manifest says "incognito": "not_allowed".

const ALWAYS = ['pathos.cloud']

export function hostOf (url) {
  try {
    const u = new URL(url)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  } catch (_) { return null }
}

// `blocklist`: domains the person typed ('example.com' also blocks
// 'news.example.com').
export function excluded (url, blocklist = []) {
  const host = hostOf(url)
  if (!host) return 'not http(s)'
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') ||
      host === '127.0.0.1' || host === '::1' || host === '0.0.0.0') return 'this machine'
  const all = [...ALWAYS, ...blocklist.map((d) => String(d || '').trim().toLowerCase().replace(/^\*?\.?/, '')).filter(Boolean)]
  if (all.some((d) => host === d || host.endsWith('.' + d))) return 'blocked domain'
  return null
}

// Chrome's transition types that are not a person arriving at a page.
const SKIP_TRANSITIONS = new Set(['reload', 'auto_subframe', 'manual_subframe'])
export const skipTransition = (t) => SKIP_TRANSITIONS.has(String(t || ''))
