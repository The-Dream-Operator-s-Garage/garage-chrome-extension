# Privacy — Dream Operator's Garage (Chrome extension)

The full privacy policy of pathos.cloud applies and is the authority:
**https://pathos.cloud/privacy/**. This page says what the extension itself
does with data.

**What it collects.** When *history upload* is on and a key is set: the
address and title of each page you visit in the profile where the extension
is installed, the time of the visit, and Chrome's transition type (typed, a
link, …). With the optional YouTube module on: the title, channel and release
date a YouTube watch page states about its video.

**What it never collects.** Incognito browsing, page contents, form data,
passwords, cookies, `chrome://` and `file://` pages, your own machine
(`localhost`), pathos.cloud, and domains you exclude in the options.

**Where it goes.** Only to `https://api.pathos.cloud`, over HTTPS, authenticated
by the key you minted — into a record owned by your own Chrome alter-ego on
your pathchain. It is private to that alter-ego and to you (your root reads
it through a delegation you can revoke). The extension cannot publish it; the
key it holds has no publishing power. pathos.cloud does not sell this data or
use it for advertising.

**What stays on your computer.** The key and the queue of visits not yet
sent live in `chrome.storage.local` — never Chrome sync.

**Your controls.** Pause or switch off history upload in the options page;
list domains never to record; revoke the key on pathos.cloud (identity window
→ Keys), which stops the extension at once. Removing a visit from Chrome's
history does not remove it from your pathchain.
