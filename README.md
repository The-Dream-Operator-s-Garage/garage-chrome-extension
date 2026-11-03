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
   the page title when the tab finishes loading, and — with **Upload
   automatically** on (the default, 0.2.0) — sends it to
   `https://api.pathos.cloud/api/extensions/visits` as soon as it is ready,
   within a second or two of the page loading. A minute alarm retries
   whatever could not go. Switch the option off and visits wait in the
   extension until you press *Send now* in its window.
4. **Pin** (0.2.0): the extension's window shows the page in front of you and
   a *Pin* button that pins it onto your pathos.cloud pins — your root
   account's, the one your Chrome alter-ego belongs to. If pathos.cloud
   already holds that page (a post's link, an earlier visit) the pin and
   every visit reference that same node; nothing is minted twice.

What the key can do is decided by the server, not by this code: it acts as
your Chrome alter-ego, may add visits to its own history, look up its own
links and — with the `pin` scope — pin pages onto your pins, and can never
publish, grant access, message, or manage keys. A key minted before 0.2.0
pins once you switch on **Pins** beside it in the Keys well. You can
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
| `lib/client.js` | the flush: one POST per batch, backoff, blocked on a refused key; `pinCall` — the Pin button's three calls |
| `lib/linkKey.js` | vendored from pathos.cloud's API — the identity of a link |
| `lib/exclude.js` | what never leaves the browser |
| `content/youtube.js` | the optional YouTube reader |
| `options.*`, `popup.*`, `ui.css` | the two small pages |
| `PRIVACY.md`, `STORE.md` | the privacy statement and the Web Store listing |

License: MIT.
