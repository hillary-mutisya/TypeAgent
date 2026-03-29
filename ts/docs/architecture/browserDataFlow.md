# Browser Agent — Data Flow & State Management

> **Scope:** This document maps all state storage locations in the
> browser agent, their persistence models, synchronization patterns, and
> what triggers reads and writes. For the component architecture, see
> `browserAgent.md`.

## Overview

The browser agent's state is distributed across five storage tiers, from
ephemeral in-memory maps to permanent file system storage. Understanding
where state lives is critical for debugging, since a stale cache in one
tier can cause confusing behavior in another.

```
┌─────────────────────────────────────────────────────────────────┐
│  Tier 1: In-Memory (ephemeral, lost on process restart)         │
│  ├─ Agent process: extraction cache, retry counters, RPC maps   │
│  ├─ Service worker: RPC map, navigation dedup, callbacks        │
│  ├─ Content script: recording state, DOM element IDs            │
│  └─ Electron: BrowserViewManager tab map                        │
├─────────────────────────────────────────────────────────────────┤
│  Tier 2: Chrome Storage Session (survives SW restart, not       │
│          browser restart)                                       │
│  └─ Recording state: actions, HTML, screenshots, index          │
├─────────────────────────────────────────────────────────────────┤
│  Tier 3: Chrome Storage Sync/Local (permanent, synced across    │
│          devices for sync)                                      │
│  └─ Settings: websocketHost, autoIndexing, extractionMode       │
│  └─ Search history                                              │
├─────────────────────────────────────────────────────────────────┤
│  Tier 4: File System — User Data (~/.typeagent/)                │
│  ├─ Knowledge index: entity/topic graphs, website collection    │
│  ├─ WebFlow store: flow definitions, scripts, registry index    │
│  ├─ Shell settings: window state, user preferences              │
│  ├─ Import state: progress, backups                             │
│  └─ PDF storage: annotations, URL mappings                      │
├─────────────────────────────────────────────────────────────────┤
│  Tier 5: File System — Instance Storage (agent context)         │
│  └─ Per-agent session data managed via agent SDK                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Tier 1: In-Memory State

These are lost when the owning process restarts. They are the most common
source of "it worked a moment ago" debugging scenarios.

### Agent process (Node.js)

| State | Type | Location | Purpose | Lifetime |
| ----- | ---- | -------- | ------- | -------- |
| Running extractions | `Map<url, RunningExtraction>` | `extractionCache.mts` | Prevents duplicate parallel extractions | 10-min stale cleanup |
| Extraction timestamps | `Map<url, number>` | `extractionCache.mts` | Deduplication (24-hour re-extraction window) | Session |
| Action context cache | `Map<url, ActionContextCacheEntry>` | `actionContextCache.mts` | Caches ActionContext for tab interactions | 30-min max age, LRU, max 50 entries |
| Active extractions | `Map<url, ActiveKnowledgeExtraction>` | `extractKnowledgeCommand.mts` | Tracks in-flight extraction progress | Until extraction completes |
| Dynamic display retry | `Map<displayId, count>` | `browserActionHandler.mts` | Retry tracking for live UI updates | Session, periodic cleanup |
| Discovery schemas | `Map<name, ActionSchemaTypeDefinition>` | `discovery/actionHandler.mts` | Generated action schemas for dynamic agents | Session, regenerated on demand |
| WebSocket clients | `Map<clientId, BrowserClient>` | `agentWebSocketServer.mts` | Connected extension/Electron clients | Until client disconnects |
| WebFlow store (loaded) | In-memory index + flow cache | `webFlowStore.mts` | Loaded from disk on init, mutated in memory | Session, written to disk on save |

### Extension service worker

| State | Type | Location | Purpose | Lifetime |
| ----- | ---- | -------- | ------- | -------- |
| Content script RPC map | `Map<tabId, { channel, rpc }>` | `externalBrowserControlServer.ts` | Per-tab RPC connections | Until tab closes |
| Knowledge callbacks | `Map<extractionId, callback>` | `messageHandlers.ts` | Extraction completion handlers | Until callback fires |
| Recent navigations | `Map<url, timestamp>` | `serviceWorker/index.ts` | Prevents duplicate knowledge extraction | Session |
| WebSocket + RPC refs | Module-level variables | `websocket.ts` | Active connection state | Until disconnect |
| Current settings | `Record<string, any>` | `websocket.ts` | Cached extension settings | Session |

### Content script (per-tab)

| State | Type | Location | Purpose | Lifetime |
| ----- | ---- | -------- | ------- | -------- |
| Recording state | Module variables | `recording/index.ts` | Active recording: actions, HTML, screenshots | Tab lifetime, synced to chrome.storage.session |
| Element IDs | Assigned via DOM | `domUtils.ts` | Synthetic IDs (`id_<day>_<frame>_<index>`) on DOM elements | Until page navigation |
| WebAgent flow cache | `Map<name, WebFlowDefinition>` | `webflow/WebFlowAgent.ts` | Locally cached WebFlow definitions | Session, refreshed on server message |

### Electron main process

| State | Type | Location | Purpose | Lifetime |
| ----- | ---- | -------- | ------- | -------- |
| Browser tabs | `Map<tabId, BrowserViewContext>` | `browserViewManager.ts` | Active `WebContentsView` instances | Until tab closed |
| Message queue | `Array<WebSocketMessageV2>` (max 100) | `browserIpc.ts` | Buffered messages during WebSocket outage | Until flushed on reconnect |

---

## Tier 2: Chrome Storage Session

Survives service worker restarts but not browser restarts. Used for
recording state that must persist across service worker idle cycles.

| Key | Type | Purpose | Read trigger | Write trigger |
| --- | ---- | ------- | ------------ | ------------- |
| `recordedActions` | `RecordedAction[]` | Captured user interactions | `getRecordedActions()` on SW restart | `saveRecordedActions()` during recording |
| `recordedActionPageHTML` | `string` | HTML snapshot at each recording step | Recording restore | Recording capture |
| `annotatedScreenshot` | `string` (base64) | Screenshot with element annotations | Recording restore | Recording capture |
| `actionIndex` | `number` | Current action counter | Recording restore | Each recorded action |
| `isCurrentlyRecording` | `boolean` | Recording active flag | Recording restore | Start/stop recording |

**Synchronization pattern:**
```
Content script captures action
  → Updates module-level variables
  → Calls saveRecordedActions()
  → chrome.storage.session.set({ recordedActions, ... })

Service worker restarts
  → Calls getRecordedActions()
  → chrome.storage.session.get()
  → Restores content script state via message
```

---

## Tier 3: Chrome Storage (Permanent)

### chrome.storage.sync (synced across devices)

| Key | Type | Default | Purpose |
| --- | ---- | ------- | ------- |
| `websocketHost` | `string` | `"ws://localhost:8081/"` | Agent WebSocket server URL |
| `agentServerHost` | `string` | `"ws://localhost:8999"` | Dispatcher WebSocket URL |
| `autoIndexing` | `boolean` | `false` | Auto-index pages on navigation |
| `defaultExtractionMode` | `string` | `"content"` | Knowledge extraction mode |
| `maxConcurrentExtractions` | `number` | `1` | Concurrent extraction limit |
| `qualityThreshold` | `number` | `0.5` | Minimum quality for indexing |
| `enableIntelligentAnalysis` | `boolean` | `true` | AI-enhanced extraction |

**Change propagation:**
```
Options page → chrome.storage.sync.set()
  → chrome.storage.onChanged fires in service worker
  → Service worker applies settings (e.g., reconnects WebSocket)
  → ExtensionStorageManager mirrors to ~/.typeagent/shell/extensionStorage.json
```

### chrome.storage.local

| Key | Type | Purpose |
| --- | ---- | ------- |
| `searchHistory` | `string[]` | Recent search queries for autocomplete |

---

## Tier 4: File System Storage

All permanent data under `~/.typeagent/` (or configured instance directory).

### Knowledge index

**Path:** `~/.typeagent/browser/` (via agent instanceStorage)

| File | Format | Contents | Read | Write |
| ---- | ------ | -------- | ---- | ----- |
| `entityGraph.graphology.json` | JSON (Graphology) | Entity nodes with metadata, relationships | Agent init, graph queries | After extraction, graph build |
| `topicGraph.graphology.json` | JSON (Graphology) | Directed topic hierarchy | Agent init, topic queries | After extraction, graph build |
| `graphology.metadata.json` | JSON | Graph metadata | Agent init | After graph changes |
| Website collection index | Binary/JSON | Indexed website content for search | Agent init | After indexing, every 10 websites in batch |

### WebFlow store

**Path:** Via agent instanceStorage

| File | Format | Contents | Read | Write |
| ---- | ------ | -------- | ---- | ----- |
| `registry/webflow-index.json` | JSON | Central index of all flows | Store init | On save/delete |
| `flows/global/{name}.json` | JSON | Global flow metadata (name, params, scope) | On get | On save |
| `flows/sites/{domain}/{name}.json` | JSON | Site-scoped flow metadata | On get, listForDomain | On save |
| `scripts/{name}.js` | JavaScript | Flow script source code | On get, execute | On save |

### Shell settings

**Path:** `~/.typeagent/shell/`

| File | Format | Contents | Read | Write |
| ---- | ------ | -------- | ---- | ----- |
| `shellSettings.json` | JSON | Window geometry, zoom, devtools state, active tab | Shell startup | Shell shutdown, window state changes |
| `extensionStorage.json` | JSON | Mirror of chrome.storage.sync settings | Shell startup | On chrome.storage.sync changes |

### Import state

**Path:** Working directory (`.import-states/`, `.collection-backups/`)

| File | Format | Contents | Read | Write |
| ---- | ------ | -------- | ---- | ----- |
| `.import-states/{importId}.json` | JSON | Import progress (processed count, failed URLs, save points) | Resume import | Periodic during import |
| `.collection-backups/{importId}_{savePoint}.json` | JSON | Collection snapshot for rollback | Recovery | At save points |

### PDF storage

**Path:** `~/.typeagent/browser/viewstore/` (or `$TYPEAGENT_BROWSER_FILES`)

| File | Format | Contents | Read | Write |
| ---- | ------ | -------- | ---- | ----- |
| `url-mappings.json` | JSON | URL → document ID mapping | PDF service init | On new PDF URL |
| `annotations/{docId}/*.json` | JSON | Per-document annotations | PDF viewer load | User annotation actions |

---

## Key Synchronization Flows

### 1. Recording lifecycle

```
User clicks "Start Recording"
  → Service worker sets isCurrentlyRecording=true in chrome.storage.session
  → Content script begins capturing events

User interacts with page
  → Content script: recordClick/recordInput/recordNavigation
  → Module variables updated (recordedActions, actionIndex, etc.)
  → Periodic sync to chrome.storage.session

User clicks "Stop Recording"
  → Content script: stopRecording() → final save to chrome.storage.session
  → Service worker reads recorded data
  → Forwards to agent via WebSocket (createWebFlowFromRecording)
  → Agent: recordingNormalizer → scriptGenerator (LLM) → scriptValidator
  → WebFlowStore.save() → writes to disk (flows/ + scripts/)
  → Dynamic grammar/schema regenerated
  → Service worker notified to refresh local cache
```

### 2. Knowledge extraction lifecycle

```
Page navigation detected (or user triggers extraction)
  → Content script captures HTML fragments + text
  → Service worker forwards to agent via agentService RPC

Agent receives extraction request
  → extractionCache checks for duplicate/recent extraction
  → If new: starts extraction pipeline
    → AI model processes content → entities, topics, relationships
    → Progress events sent back via knowledgeExtractionProgress callback
  → Results indexed in websiteCollection (in-memory)
  → Graphs updated (entityGraph, topicGraph) in memory
  → Periodic/final save to disk (graphology JSON files)
```

### 3. Settings propagation

```
User changes setting in Options page
  → chrome.storage.sync.set({ key: value })
  → chrome.storage.onChanged fires in service worker
  → Service worker applies change:
    - websocketHost change → reconnects WebSocket
    - autoIndexing change → enables/disables content script auto-indexing
  → ExtensionStorageManager.set() → writes extensionStorage.json
  → Shell reads extensionStorage.json on next access
```

### 4. WebFlow cache invalidation

```
Agent saves/deletes a WebFlow
  → WebFlowStore mutates disk files + in-memory index
  → Agent sends refreshFlowCache message to extension client
  → Service worker relays to WebFlow WebAgent (content script)
  → WebFlowAgent.fetchAndCacheFlows() → requests fresh flow list
  → flowsByName map updated with current data
  → Dynamic grammar/schema regenerated at agent
```

---

## State Recovery on Restart

| Component restart | What's lost | What's recovered | Recovery mechanism |
| ----------------- | ----------- | ---------------- | ------------------ |
| **Agent process** | All in-memory caches, WebSocket clients | Knowledge index, WebFlow store, settings | Loaded from disk on `updateBrowserContext()` |
| **Service worker** | RPC map, navigation dedup, callbacks | Recording state, settings | chrome.storage.session, chrome.storage.sync |
| **Content script** (navigation) | DOM element IDs, module variables | Recording state (if active) | `restoreRecordingStateFromStorage()` |
| **Electron shell** | Tab map, message queue | Window geometry, active tab | `shellSettings.json` on startup |
| **Browser restart** | All chrome.storage.session data | chrome.storage.sync/local, all disk data | Extension re-initializes, agent reconnects |
