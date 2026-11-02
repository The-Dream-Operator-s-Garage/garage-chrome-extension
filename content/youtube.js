// The YouTube module (optional — registered only after the person switches
// it on and grants youtube.com in the options page). On a watch page it
// reads what the page says the video is — title, channel, release date —
// and hands it to the worker for that visit. pathos.cloud cross-checks the
// title and channel against YouTube's oEmbed itself; the date has no public
// oracle and is recorded as the page claims it.
//
// A content script cannot see the page's JS variables, so it reads the
// microdata the watch page carries (meta[itemprop]) and, after YouTube's
// in-app navigations (`yt-navigate-finish`), the rendered channel link.

(() => {
  const idOf = (u) => { try { return new URL(u).searchParams.get('v') } catch (_) { return null } }
  const meta = (p) => document.querySelector(`meta[itemprop="${p}"]`)?.getAttribute('content') || null
  const read = () => {
    const url = location.href
    const id = idOf(url)
    if (!/\/watch$/.test(location.pathname) || !id) return
    const metaId = meta('identifier') || meta('videoId')
    const fresh = !metaId || metaId === id   // after an in-app navigation the head may still describe the last video
    const channelLink = document.querySelector('ytd-video-owner-renderer ytd-channel-name a, #owner ytd-channel-name a')
    const page = {
      id,
      title: (fresh && meta('name')) || document.title.replace(/\s*-\s*YouTube\s*$/, '') || null,
      channel: (fresh && document.querySelector('span[itemprop="author"] link[itemprop="name"]')?.getAttribute('content')) || channelLink?.textContent?.trim() || null,
      channelUrl: channelLink?.href || null,
      publishedAt: fresh ? (meta('uploadDate') || meta('datePublished')) : null
    }
    chrome.runtime.sendMessage({ type: 'page', url, page }).catch(() => {})
  }
  read()
  document.addEventListener('yt-navigate-finish', () => setTimeout(read, 1500))
})()
