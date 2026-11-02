# Dream Operator's Garage — Chrome extension

The Garage in your browser. Its first functionality is
**pathos.cloud :: history upload**: every page you visit in a Chrome profile
lands on your own [pathos.cloud](https://pathos.cloud) pathchain — one node
per address, one moment-stamped visit per visit — readable by you, private
by default, and never published by the extension.

## How it works

1. On pathos.cloud, open the identity window → **Keys** → *New key → Chrome
   history*. pathos.cloud mints (once) a **Chrome** alter-ego of yours,
   gives it a CHROME_HISTORY record, and shows you a key (`pcs_…`) once.
2. Paste the key in this extension's options page. It is stored in
   `chrome.storage.local` on this computer only — never synced.
3. Browse. The service worker queues each visit (`history.onVisited`), fills
   the page title when the tab finishes loading, and sends batches to
   `https://api.pathos.cloud/api/extensions/visits` every minute.

What the key can do is decided by the server, not by this code: it acts as
your Chrome alter-ego, may add visits to its own history and look up its own
links, and can never publish, grant access, message, or manage keys. You can
revoke it from the Keys well at any time; your root identity reads the whole
history through the alter-ego's delegation.

## What is never sent

- Incognito windows (the extension does not run there: `"incognito": "not_allowed"`).
- Anything that is not `http(s)`: `chrome://`, `file://`, extension pages.
- This machine: `localhost`, loopback addresses, `*.local`.
- pathos.cloud itself, and every domain you list under *Never record*
  (subdomains included).
- Reloads, sub-frames, and visits Chrome synced from your other devices.

The server applies the same exclusions again.

## YouTube (optional)

Switch it on in the options page and grant access to `www.youtube.com`: on a
watch page the extension also sends what the page says the video is — title,
channel, release date. pathos.cloud cross-checks the title and channel with
YouTube's own oEmbed endpoint and records a mismatch as disputed.

## Develop

```bash
npm test                 # unit tests (node --test, no dependencies)
npm run icons            # redraw icons/ (no dependencies)
npm run package          # dist/garage-chrome-extension-<version>.zip for the Web Store
```

Load it unpacked: `chrome://extensions` → Developer mode → *Load unpacked* →
this folder. In the options page choose *localhost:3000 (development)* to run
it against a local pathos.cloud API.

The end-to-end witness lives in the pathos repository:
`.claude/skills/run-pathos-claude/probe-extension-client.mjs` drives these
modules in Node and the unpacked extension in Chromium against a local API.

## Files

| | |
|---|---|
| `manifest.json` | MV3; permissions `history`, `storage`, `alarms`, `tabs`, `scripting`; host `api.pathos.cloud` (+ `localhost:3000` for development, stripped from the store package); optional `www.youtube.com` |
| `sw.js` | the service worker — events in, flushes out; no state in memory |
| `lib/queue.js` | the queue in `chrome.storage.local`: what queues, titles, YouTube pages, the one-writer chain |
| `lib/client.js` | the flush: one POST per batch, backoff, blocked on a refused key |
| `lib/linkKey.js` | vendored from pathos.cloud's API — the identity of a link |
| `lib/exclude.js` | what never leaves the browser |
| `content/youtube.js` | the optional YouTube reader |
| `options.*`, `popup.*`, `ui.css` | the two small pages |
| `PRIVACY.md`, `STORE.md` | the privacy statement and the Web Store listing |

License: MIT.
