// The IDENTITY of a web link — vendored from pathos-cloud-api
// `api/utils/linkKey.js` (2026-11-02). Two addresses that name the same
// object answer the same key: scheme-blind, host lowercased without
// www./m./mobile., default port, fragment and trailing slash dropped,
// share / ad tracking params dropped, the rest sorted; the path keeps its
// case. The server's copy also knows the EMBED_RULEs (every YouTube dialect
// is one video); this one does not need to — it only spares the API a visit
// it would collapse anyway. The server re-keys everything; it is the truth.
//
// Keep the two in step: a change to the API's TRACKING_RE belongs here too.

export const TRACKING_RE = /^(?:utm_[a-z0-9_]+|igsh|igshid|si|ref_src|ref_url|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|_ga|_gl)$/i

const HOST_PREFIX_RE = /^(?:www|m|mobile)\./i

export function linkKey (raw) {
  let u
  try { u = new URL(String(raw == null ? '' : raw).trim()) } catch (_) { return null }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  if (!u.hostname || !u.hostname.includes('.')) return null
  const host = u.hostname.toLowerCase().replace(HOST_PREFIX_RE, '')
  const port = u.port && u.port !== '80' && u.port !== '443' ? `:${u.port}` : ''
  const path = u.pathname.replace(/\/+$/, '') || '/'
  const params = [...u.searchParams.entries()]
    .filter(([k]) => !TRACKING_RE.test(k))
    .sort(([a, av], [b, bv]) => (a === b ? (av < bv ? -1 : av > bv ? 1 : 0) : (a < b ? -1 : 1)))
  const query = params.length ? `?${new URLSearchParams(params).toString()}` : ''
  return `url:${host}${port}${path}${query}`
}
