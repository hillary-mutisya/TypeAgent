# Browser Agent — Troubleshooting Runbook

This guide maps common symptoms to root causes and fixes. For
architecture context, see
[browserAgent.md](../../../forAgent/features/browser-architecture/browserAgent.md).

---

## Quick Diagnosis

| Symptom | Likely cause | Section |
| ------- | ------------ | ------- |
| Red "!" badge on extension icon | Agent not running or WebSocket failed | [1](#1-red--badge-extension-not-connected) |
| Extension loaded but actions don't work | RPC not initialized or service worker crashed | [2](#2-actions-dont-execute) |
| Content script not responding | Script not injected or tab mismatch | [3](#3-content-script-not-responding) |
| Chat panel shows "Not connected" | Dispatcher not running (port 8999) | [4](#4-chat-panel-not-connected) |
| Knowledge extraction stuck | Extraction cache stale or LLM timeout | [5](#5-knowledge-extraction-stuck) |
| WebFlow recording lost | Service worker restarted mid-recording | [6](#6-webflow-recording-lost) |
| Duplicate connection warnings | Extension reloaded or multiple instances | [7](#7-duplicate-connection-warnings) |
| Page loads slowly with extension | Content script overhead | [8](#8-page-load-performance) |
| Screenshots fail | CDP/debugger permission issue | [9](#9-screenshots-fail) |
| Content download timeout | Network or offscreen document issue | [10](#10-content-download-timeout) |

---

## 1. Red "!" Badge (Extension Not Connected)

**What you see:** Red badge with "!" on the extension icon. No browser
control commands work.

**What's happening:** The extension's service worker cannot establish a
WebSocket connection to the agent server on port 8081.

**Causes (in order of likelihood):**
1. Agent/dispatcher process is not running
2. Agent started on a different port
3. Firewall blocking localhost:8081
4. `websocketHost` setting misconfigured

**Fix:**

```bash
# 1. Check if agent is listening
netstat -an | findstr 8081    # Windows
lsof -i :8081                 # macOS/Linux

# 2. Start the agent (pick one)
cd TypeAgent/ts
pnpm run shell:dev            # Electron shell (starts agent automatically)
pnpm run cli:dev              # CLI (then: @config agent browser)

# 3. Force extension reconnect
# Click the extension icon — triggers ensureWebsocketConnected()
# Or reload the extension at chrome://extensions
```

**If the agent IS running but the badge is still red:**
- Open extension options and verify `websocketHost` is `ws://localhost:8081/`
- Check for firewall rules blocking localhost WebSocket connections
- Check the service worker console for connection error details:
  `chrome://extensions` → TypeAgent → "Inspect views: service worker"

**Reconnection behavior:** The extension retries every 5 seconds
automatically. Once the agent starts, the connection should establish
within 5 seconds without manual intervention.

---

## 2. Actions Don't Execute

**What you see:** Badge is green (connected), but commands like
`@browser open google.com` don't do anything. No error displayed.

**Causes:**
1. RPC channels not initialized (connection established but channels
   failed to set up)
2. Active client not selected (agent has no preferred client)
3. Extension browser control not enabled

**Fix:**

```bash
# Check if external browser control is enabled
@browser external on

# Verify connection status in agent logs
DEBUG=typeagent:browser:* pnpm run cli:dev
```

**If using Electron shell:** The shell's `InlineBrowserControl` is
preferred over the extension. If the shell is running, browser actions
route through Electron, not the extension. If the shell's browser panel
isn't visible, actions may appear to do nothing.

**Debug steps:**
1. Open service worker DevTools → Console tab
2. Look for "Channel setup complete" or RPC initialization messages
3. Check for "No agent RPC connection" errors — indicates the
   `agentRpc` object was not created

---

## 3. Content Script Not Responding

**What you see:** Page-level actions fail (click, scroll, enter text).
The agent reports errors about not being able to reach the content script.

**Causes:**
1. Content script not injected (page doesn't match `https://*/*`)
2. Extension was reloaded but page wasn't refreshed
3. Content script crashed (check page DevTools console)
4. Target frame mismatch (RPC targets `frameId: 0` — main frame only)

**Fix:**
1. **Refresh the target page** — content scripts are injected on page
   load; after extension reload, existing pages don't have the script
2. **Check URL pattern** — content scripts only inject on `https://*/*`
   and `http://localhost:9000/`. Other schemes (`file://`, `chrome://`,
   `about:`) are excluded.
3. **Check page DevTools** — open F12 on the target page, look for
   errors from the content script in the Console tab
4. **Check Sources** — in page DevTools → Sources → Content scripts,
   verify the TypeAgent extension scripts are listed

**Auto-recovery:** The service worker automatically re-injects content
scripts when a `chrome.tabs.sendMessage()` call fails with "Could not
establish connection". This handles most cases transparently.

---

## 4. Chat Panel Not Connected

**What you see:** Side panel shows "Not connected" or commands typed in
the chat panel get no response.

**What's happening:** The chat panel connects to the dispatcher on a
separate WebSocket (port 8999), distinct from the agent connection (port
8081). Both must be running.

**Fix:**

```bash
# Check if dispatcher is listening
netstat -an | findstr 8999

# Start dispatcher (the shell does this automatically)
cd TypeAgent/ts
pnpm run shell:dev
```

**Verify in extension options:** `agentServerHost` should be
`ws://localhost:8999`.

**Note:** The chat panel and the browser agent use different connections:
- Chat panel → Dispatcher (port 8999) for NL commands
- Extension → Agent (port 8081) for browser control

Both must be active for full functionality.

---

## 5. Knowledge Extraction Stuck

**What you see:** Extraction starts but never completes. The dynamic
display shows a spinner indefinitely. Or extraction seems to complete but
no knowledge appears.

**Causes:**
1. LLM API call timed out or returned an error
2. Extraction cache has a stale entry (thinks extraction is still running)
3. Knowledge index is corrupted

**Fix:**

```bash
# 1. Check agent logs for LLM errors
DEBUG=typeagent:browser:* pnpm run cli:dev

# 2. Clear extraction cache (restart agent process)
# The cache is in-memory and resets on restart

# 3. Rebuild knowledge index
@browser extractKnowledge      # Re-extract current page
```

**Extraction cache behavior:** The `RunningExtractionsCache` prevents
duplicate extractions for the same URL. Entries become stale after 10
minutes. If an extraction silently failed, wait 10 minutes or restart
the agent to clear the cache.

**Deduplication window:** By default, the system won't re-extract a page
within 24 hours of the last extraction. Restarting the agent clears the
deduplication timestamps.

---

## 6. WebFlow Recording Lost

**What you see:** Started recording, performed actions, but the recording
data is gone (e.g., after switching tabs or after a service worker
restart).

**Causes:**
1. Service worker went idle and restarted (recording state should survive
   via `chrome.storage.session`, but content script module variables are
   lost on navigation)
2. Page navigation caused content script to reinitialize
3. Recording was not saved before stopping

**Fix:**
- **Check chrome.storage.session:** Open service worker DevTools, run:
  ```javascript
  chrome.storage.session.get(null, console.log)
  ```
  Look for `recordedActions`, `isCurrentlyRecording`, `actionIndex`
- **Recording should auto-restore:** On content script initialization,
  `restoreRecordingStateFromStorage()` reads from session storage and
  resumes. If this fails, the recording is lost.

**Prevention:** Recordings are synced to chrome.storage.session
periodically. Short recordings (< 1 second between actions) may not have
time to sync before a disruption.

---

## 7. Duplicate Connection Warnings

**What you see:** Agent logs show "Closing duplicate connection for
{clientId}" repeatedly.

**What's happening:** The agent server detected multiple connections with
the same client ID. It closes the older connection (code 1013, reason
"duplicate") and keeps the newer one.

**Causes:**
1. Extension was reloaded (creates new WebSocket before old one closed)
2. Multiple browser windows running the same extension
3. Rapid disconnect/reconnect cycle from network instability

**This is usually harmless.** The server handles it correctly by keeping
the newest connection. If you see constant cycling (every few seconds),
check:
- Is the extension being reloaded in a loop?
- Is there a network issue causing rapid WebSocket disconnects?

---

## 8. Page Load Performance

**What you see:** Pages load noticeably slower with the extension enabled.

**What's happening:** The content script (206 KB minified) is injected
into every HTTPS page. It initializes DOM observers, sets element IDs,
and potentially triggers auto-indexing.

**Mitigations:**
1. **Disable auto-indexing** if not needed — in extension options, turn
   off "Auto-index pages". This eliminates the post-navigation
   extraction work.
2. **Disable the extension on specific sites** — right-click extension
   icon → "This can read and change site data" → "When you click the
   extension" (restricts to on-demand only)
3. **Check for schema extraction** — site-specific scripts (crossword,
   commerce, etc.) run additional initialization. If you don't use these
   features, they still load but should be lightweight.

---

## 9. Screenshots Fail

**What you see:** `captureScreenshot()` returns an error or empty result.

**Causes:**
1. `debugger` permission not granted — the extension uses CDP
   (`chrome.debugger.attach()`) for screenshots
2. Chrome restricted page (chrome://, chrome-extension://, about:)
3. Another debugger is attached (only one debugger per tab)

**Fix:**
- Verify the `debugger` permission is in the manifest (it is by default)
- Check if another DevTools window is attached to the same tab — detach
  it and retry
- Restricted pages cannot be captured — navigate to a regular web page

**Timeout:** Screenshot capture has a 10-second timeout.

---

## 10. Content Download Timeout

**What you see:** Importing websites or downloading content fails with
timeout errors.

**Error codes:**
- `NETWORK_TIMEOUT` — Page didn't load within the timeout
- `OFFSCREEN_UNAVAILABLE` — Offscreen document not created
- `CONCURRENT_LIMIT_EXCEEDED` — Another download in progress
- `CONTENT_TOO_LARGE` — Response exceeds size limit

**Timeout values:**
- Default content timeout: 30 seconds
- Offscreen max load time: 45 seconds
- Content downloader timeout: 5 seconds (1-10 second range)

**Fix:**
1. Only one download processes at a time — wait for the current one
2. Check that the target URL is accessible (not behind auth or paywall)
3. For batch imports, the system processes sequentially with periodic
   saves every 10 items. If it fails mid-batch, restart the import —
   import state is saved to disk and can resume.

---

## System Timeouts Reference

| Component | Timeout | Purpose |
| --------- | ------- | ------- |
| WebSocket keep-alive | 20 seconds | Prevent service worker idle |
| WebSocket reconnect | 5 seconds (retry interval) | Auto-reconnection |
| Screenshot capture | 10 seconds | CDP screenshot |
| Content download | 30 seconds (default) | Page fetch via offscreen |
| Offscreen max load | 45 seconds | Maximum page processing |
| postMessage ack | 5 seconds | Content script ↔ MAIN world |
| MAIN world request | 10 seconds | Content script → MAIN world |
| Page stability wait | 3 seconds | DOM stabilization for continuations |
| WebFlow RPC | 30 seconds | WebFlow operations |
| WebAgent RPC | 60 seconds | General WebAgent calls |
| WebFlow script execution | 180 seconds | Script timeout |
| Extraction stale cleanup | 10 minutes | Cache eviction |
| Extraction dedup window | 24 hours | Prevent re-extraction |

---

## Debug Logging

Enable debug output by setting the `DEBUG` environment variable before
starting the agent:

```bash
# All browser agent logs
DEBUG=typeagent:browser:* pnpm run cli:dev

# Specific subsystems
DEBUG=typeagent:browser:serviceWorker pnpm run cli:dev
DEBUG=typeagent:browser:ws pnpm run cli:dev
DEBUG=typeagent:webAgent:proxy pnpm run cli:dev
DEBUG=typeagent:extension:dispatcher pnpm run cli:dev

# Everything
DEBUG=typeagent:* pnpm run cli:dev
```

For the extension service worker, open its DevTools console:
`chrome://extensions` → TypeAgent → "Inspect views: service worker"

For content scripts, open the page's DevTools (F12) → Console tab.
