# Browser Extension — Quick Reference

A condensed reference for engineers working on the Chrome extension layer.
For the full architecture, see
[browserAgent.md](../../../forAgent/features/browser-architecture/browserAgent.md).
For the RPC protocol details, see
[browserRpc.md](../../../forAgent/features/browser-architecture/browserRpc.md).

---

## Manifest V3 structure

The extension uses Chrome Manifest V3 (`src/extension/manifest.json`).

### Permissions

| Permission | Why we need it |
| ---------- | -------------- |
| `activeTab` | Access current tab for content extraction |
| `tabs` | Create, close, query, zoom, navigate tabs |
| `webNavigation` | Detect page navigation events |
| `scripting` | Programmatic content script injection |
| `storage` | Persist settings, recording state, search history |
| `bookmarks` | Import bookmarks for knowledge indexing |
| `history` | Import history, URL resolution |
| `downloads` | Download images and exported data |
| `sidePanel` | Side panel UI for chat and libraries |
| `offscreen` | Offscreen document for HTML processing |
| `debugger` | CDP access (screenshots, fingerprint masking) |
| `contextMenus` | Right-click menu for knowledge extraction |
| `tts` | Text-to-speech for page reading |
| `search` | Search provider integration |
| `host_permissions: <all_urls>` | Content script injection on any site |

### Content script injection

Four injection strategies are used:

**1. Static (manifest-declared)**

Scripts that always run on matching pages:
```json
{
    "matches": ["https://*/*"],
    "js": ["contentScript.js"],
    "run_at": "document_start",
    "all_frames": true
}
```

**2. Static MAIN world**

Scripts that run in the page's JavaScript context (not isolated):
```json
{
    "matches": ["https://*/*"],
    "js": ["webTypeAgentMain.js"],
    "world": "MAIN",
    "run_at": "document_start"
}
```

MAIN world scripts can access page variables (`window.*`) but cannot use
`chrome.*` APIs. Used for WebAgent runtime and UI event capture.

**3. Site-specific (manifest-declared)**

Scripts targeting specific sites:
```json
{
    "matches": ["https://*.wsj.com/puzzles/crossword*", "https://*.nytimes.com/crosswords/*"],
    "js": ["sites/crossword.js"],
    "world": "MAIN"
}
```

**4. Programmatic (on-demand)**

The service worker injects scripts when needed:
```typescript
chrome.scripting.executeScript({
    target: { tabId },
    files: ["contentScript.js"]
});
```

Used as a fallback when content scripts aren't loaded (extension reload,
new tab race condition).

### Content scripts summary

| Script | World | Purpose |
| ------ | ----- | ------- |
| `contentScript.js` | Isolated | DOM interaction, RPC server, recording, auto-indexing |
| `webTypeAgentContentScript.js` | Isolated | WebAgent content script bridge |
| `webTypeAgentMain.js` | MAIN | WebAgent runtime, page variable access |
| `uiEventsDispatcher.js` | MAIN | UI event capture for recording |
| `sites/crossword.js` | MAIN | Crossword puzzle interaction |
| `sites/commerce.js` | Isolated | E-commerce site automation |
| `sites/instacart.js` | Isolated | Instacart grocery automation |
| `sites/paleobiodb.js` | Isolated | PaleoBioDB research tool |
| `sites/webflow.js` | Isolated | WebFlow execution in-page |

---

## Service worker lifecycle

### MV3 constraints

- **No persistent background page** — the service worker starts on
  events and can be terminated after ~30 seconds of inactivity
- **No DOM access** — cannot use `document`, `window`, or DOM APIs
- **ES module format** — loaded as `type: "module"` in manifest
- **State is ephemeral** — use `chrome.storage` for persistence

### How we handle the idle timeout

The WebSocket keep-alive sends a ping every 20 seconds, which counts as
activity and prevents the service worker from going idle during normal
operation. If the service worker does terminate:

1. Chrome restarts it on the next event (message, alarm, etc.)
2. `chrome.runtime.onStartup` triggers `ensureWebsocketConnected()`
3. WebSocket reconnects with 5-second retry interval
4. Message queue flushes any buffered messages

### Initialization flow

```
Service worker starts
    ↓
initialize()
    ├─ ensureWebsocketConnected()
    │   ├─ createWebSocket() → ws://localhost:8081/?channel=browser&...
    │   ├─ createChannelProviderAdapter()
    │   ├─ createExternalBrowserServer(browserControlChannel)
    │   └─ createRpc(agentServiceChannel) → agentRpc
    │
    ├─ createChromeRpcServer(createAllHandlers())
    │   └─ Registers 100+ RPC handlers for extension pages
    │
    └─ setupEventListeners()
        ├─ chrome.tabs.onActivated
        ├─ chrome.tabs.onUpdated
        ├─ chrome.tabs.onCreated
        ├─ chrome.tabs.onRemoved
        ├─ chrome.windows.onFocusChanged
        ├─ chrome.runtime.onMessage
        ├─ chrome.runtime.onConnect (WebAgent port)
        ├─ chrome.commands.onCommand
        ├─ chrome.contextMenus.onClicked
        ├─ chrome.storage.onChanged
        └─ chrome.action.onClicked
```

### Event listeners

| Event | Handler |
| ----- | ------- |
| `chrome.action.onClicked` | Toggle site translator, show connection status |
| `chrome.tabs.onActivated` | Toggle site translator for active tab |
| `chrome.tabs.onUpdated` | Send `addTabIdToIndex` on title change or load |
| `chrome.tabs.onCreated` | Broadcast `addTabIdToIndex` |
| `chrome.tabs.onRemoved` | Broadcast `deleteTabIdFromIndex` |
| `chrome.windows.onFocusChanged` | Reinitialize embeddings |
| `chrome.runtime.onStartup` | Ensure WebSocket connection |
| `chrome.commands.onCommand` | Open side panel on `open_action_index` |
| `chrome.contextMenus.onClicked` | Delegate to context menu handler |
| `chrome.storage.onChanged` | Reconnect WebSocket on host change |
| `chrome.runtime.onConnect` | WebAgent port relay (register/disconnect/relay) |
| `chrome.runtime.onMessage` | Handle `getTabId` requests, RPC responses |

---

## Side panel UI

The extension uses Chrome's Side Panel API (`chrome.sidePanel`) for its
primary UI. The default panel is `views/chatPanel.html`.

### Available panels/views

| View | File | Purpose |
| ---- | ---- | ------- |
| Chat | `views/chatPanel.html` | NL command input, conversation display |
| Knowledge Library | `views/knowledgeLibrary.html` | Browse indexed pages |
| Macros Library | `views/macrosLibrary.html` | Manage WebFlows |
| Annotations | `views/annotationsLibrary.html` | Page annotations |
| Entity Graph | `views/entityGraphView.html` | Entity relationship visualization |
| Topic Graph | `views/topicGraphView.html` | Topic hierarchy visualization |
| PDF Viewer | `views/pdfView.html` | Intercepted PDF display |
| Options | `views/options.html` | Extension settings |

### Side panel ↔ Service worker communication

Side panel pages communicate with the service worker via the Chrome RPC
server. Key methods:

```typescript
chatPanelConnect()                    // Connect to dispatcher
chatPanelProcessCommand({ command })  // Send NL command
chatPanelGetCompletions({ input })    // Autocomplete
chatPanelStartRecording()             // Start macro recording
chatPanelStopRecording()              // Stop and save recording
chatPanelCreateWebFlowFromRecording() // Generate WebFlow
```

---

## Chrome storage usage

The extension uses `chrome.storage.local` for persistent state:

| Key | Type | Purpose |
| --- | ---- | ------- |
| `websocketHost` | string | WebSocket server URL (default: `ws://localhost:8081/`) |
| `recordedActions` | object | Current recording state |
| `searchHistory` | array | Recent search queries |
| `autoIndexing` | boolean | Auto-index pages on navigation |
| `extractionSettings` | object | Knowledge extraction mode and options |
| `webFlowCache` | object | Locally cached WebFlow definitions |

Settings changes broadcast via `chrome.storage.onChanged` so all
extension contexts stay in sync.

---

## CDP (Chrome DevTools Protocol) integration

The extension uses CDP for two purposes:

### 1. Screenshots

```typescript
chrome.debugger.attach({ tabId }, "1.3");
chrome.debugger.sendCommand({ tabId }, "Page.captureScreenshot", {
    format: "png",
    quality: 80
});
chrome.debugger.detach({ tabId });
```

### 2. Fingerprint masking (Electron only)

The Electron host uses CDP to inject scripts before page load that mask
bot detection signals:

```typescript
// Via BrowserViewManager.setupCDP():
webContents.debugger.sendCommand("Page.addScriptToEvaluateOnNewDocument", {
    source: `
        // Remove webdriver flag
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        // Conditionally present as Firefox on Google domains
        // ... UA spoofing for Google auth
    `
});
```

This runs before any page JavaScript executes, making the automation
transparent to bot detection systems.

---

## Keyboard shortcuts

Defined in `manifest.json`:

| Shortcut | Command | Action |
| -------- | ------- | ------ |
| `Alt+B` | `_execute_action` | Toggle extension popup |
| `Ctrl+Shift+A` | `open_action_index` | Open side panel |

---

## Extension packaging

For distribution (not needed for development):

```bash
cd packages/agents/browser
npm run package
```

Produces:
- `deploy/extension.zip` — Standard archive
- `deploy/extension.crx` — Signed Chrome extension package

The signing key is auto-generated (RSA 2048-bit) and stored in `.env` as
`BROWSER_EXTENSION_PUBLISHING`.

---

## Offscreen document

The extension uses an offscreen document (`offscreen/contentProcessor.js`)
for HTML processing that requires DOM APIs unavailable in the service
worker. Created on demand via:

```typescript
chrome.offscreen.createDocument({
    url: "offscreen/offscreen.html",
    reasons: ["DOM_PARSER"],
    justification: "Parse HTML content for knowledge extraction"
});
```

---

## Custom protocol

The extension implements `typeagent-browser://` URLs that resolve to
extension views:

```
typeagent-browser://knowledgeLibrary.html
  → chrome-extension://<extensionId>/views/knowledgeLibrary.html

typeagent-browser://entityGraphView.html?entity=climate
  → chrome-extension://<extensionId>/views/entityGraphView.html?entity=climate
```

This allows the agent to open extension views via the same
`browserControl.openWebPage()` path used for regular URLs.
