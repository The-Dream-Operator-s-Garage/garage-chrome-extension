# Chrome Web Store — the listing (draft for allegue)

Publisher account: allegue's personal Google account (decided 2026-11-02);
publisher name **Dream Operator's Garage**. Visibility: **Unlisted** first
(pathos.cloud is invite-only). Package: `npm run package` →
`dist/garage-chrome-extension-<version>.zip` (the development host
`localhost:3000` is stripped).

## Store listing

- **Name:** Dream Operator's Garage
- **Summary (≤132; it IS `manifest.json`'s `description` — the store reads it from the zip, and `npm run package` refuses a longer one):** Your browsing history, on your own pathos.cloud pathchain — private by default, one node per page, one moment per visit.
- **Category:** Productivity
- **Language:** English
- **Description:**

  The Dream Operator's Garage brings pathos.cloud into your browser. Its first
  functionality, *history upload*, records the pages you visit to your own
  pathos.cloud pathchain: each address becomes one node, each visit one
  moment-stamped reference on a history record owned by your Chrome alter-ego.
  Only you read it.

  • Private by default — the extension's key can add visits and nothing else:
    it cannot publish, share, message, or manage keys.
  • You choose what is never recorded: incognito never is; neither is your own
    machine, pathos.cloud, or any domain you list.
  • Optional YouTube module: records a video's title, channel and release
    date, cross-checked by pathos.cloud with YouTube itself.
  • Revoke the key on pathos.cloud at any time and the extension stops.

  Requires a pathos.cloud account (invite-only). Source:
  https://github.com/The-Dream-Operator-s-Garage/garage-chrome-extension

- **Icon:** `icons/icon128.png`. **Screenshots (1280×800):** the options page;
  the popup; the Chrome history lane on pathos.cloud.
- **Homepage:** https://pathos.cloud/ · **Support:** the GitHub repository's issues.

## Privacy practices tab

- **Single purpose:** Records the pages you visit to your own pathos.cloud pathchain.
- **Permission justifications:**
  - `history` — to learn which page was visited and when (`history.onVisited`, `history.getVisits`); this is the extension's single purpose.
  - `storage` — to keep the user's key and the queue of visits not yet sent, on this computer only (`chrome.storage.local`).
  - `alarms` — to send queued visits once a minute; an MV3 service worker cannot keep a timer alive.
  - `tabs` — to read the title of the page a visit belongs to once the tab finishes loading (the history event fires before the title exists).
  - `scripting` — to register the optional YouTube reader only after the user switches it on and grants access to youtube.com.
  - Host `https://api.pathos.cloud/*` — the only server visits are sent to.
  - Optional host `https://www.youtube.com/*` — requested only when the user turns on the YouTube module; reads the video's title, channel and date from the watch page.
- **Remote code:** No. All code ships in the package.
- **Data usage — collected:** Web history; Authentication information (the user's pathos.cloud key, stored locally and sent as a bearer to pathos.cloud).
- **Certifications:** not sold to third parties; not used or transferred for purposes unrelated to the single purpose; not used for creditworthiness or lending.
- **Privacy policy URL:** https://pathos.cloud/privacy/

## Before submitting (allegue's hands)

1. Register the developer account with the personal Google account
   (2-Step Verification on; the one-time registration fee; the developer
   email cannot be changed later).
2. New item → upload the zip → fill the tabs above → Visibility: Unlisted →
   Submit for review.
3. Send the item's URL / id back: it goes into the extension's README and the
   pathos docs. No server change is needed — `/api/extensions` already answers
   any `chrome-extension://` origin, and an MV3 worker's request to a host in
   its `host_permissions` is not subject to CORS anyway.
