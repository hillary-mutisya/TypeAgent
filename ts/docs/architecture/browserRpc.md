# Browser RPC & Messaging Protocol

> **Scope:** This document covers the RPC and messaging infrastructure
> that connects the browser agent's distributed components: channel
> multiplexing, message format, connection lifecycle, the content script
> RPC adapter, and type-safe contracts. For the component architecture,
> see `browserAgent.md`. For scenario walkthroughs, see
> `browserScenarios.md`.

## Overview

The browser agent spans four processes connected by three communication
transports. The `@typeagent/agent-rpc` package provides the foundation:
channel multiplexing over a shared transport, typed request-response RPC,
and fire-and-forget messaging.

```
┌─────────────┐  WebSocket   ┌──────────────┐  chrome.tabs   ┌──────────────┐
│ Browser     │◄────────────▶│  Extension    │  .sendMessage  │  Content     │
│ Agent       │  (port 8081) │  Service      │◄──────────────▶│  Script     │
│ (Node.js)  │              │  Worker       │  (per-tab)     │  (per-tab)  │
└──────┬──────┘              └──────────────┘               └──────────────┘
       │
       │  WebSocket (port 8081)
       │
┌──────▼──────┐  IPC          ┌──────────────┐
│ Electron    │  (ipcMain/    │  WebContents  │
│ Main        │  ipcRenderer) │  (per-tab)    │
│ Process     │◄─────────────▶│              │
└─────────────┘               └──────────────┘
```

---

## The agent-rpc package

All RPC communication in the browser agent is built on `@typeagent/agent-rpc`,
which provides four layers of abstraction.

### Layer 1: Channel adapter

A `ChannelAdapter` wraps any transport (WebSocket, IPC, Chrome messaging)
into a uniform event-emitter interface:

```typescript
function createChannelAdapter(
    sendFunc: (message: any, cb?: (err: Error | null) => void) => void
): {
    channel: RpcChannel;
    notifyMessage(message: any): void;
    notifyDisconnected(): void;
}
```

The `channel` property is an `RpcChannel` that supports:
- `on("message", handler)` / `off("message", handler)` — Listen for incoming messages
- `on("disconnect", handler)` — Listen for disconnection
- `send(message, cb?)` — Send a message via the wrapped transport

The `notifyMessage()` and `notifyDisconnected()` methods are called by the
transport layer when data arrives or the connection drops. This decouples
the RPC layer from any specific transport.

### Layer 2: Channel multiplexing

A `ChannelProviderAdapter` multiplexes multiple logical channels over a
single transport:

```typescript
function createChannelProviderAdapter(
    name: string,
    sendFunc: (message: any, cb?) => void
): {
    createChannel(name: string): RpcChannel;
    deleteChannel(name: string): void;
    notifyMessage(message: any): void;
    notifyDisconnected(): void;
}
```

**Multiplexing protocol:**

Outgoing messages are wrapped with a channel name:
```json
{ "name": "browserControl", "message": { "type": "invoke", "callId": 1, "name": "scrollDown", "args": [] } }
```

Incoming messages are routed by `message.name` to the corresponding
channel's listeners:
```
channelProvider.notifyMessage(rawMessage)
    → rawMessage.name === "browserControl"
    → route to browserControl channel adapter
    → channel.emit("message", rawMessage.message)
```

### Layer 3: Typed RPC

The `createRpc()` function implements typed request-response and
fire-and-forget messaging over a channel:

```typescript
function createRpc<
    InvokeTargetFunctions,     // Remote functions returning Promise
    CallTargetFunctions,        // Remote fire-and-forget functions
    InvokeHandlers,             // Local handlers for incoming invokes
    CallHandlers                // Local handlers for incoming calls
>(
    name: string,
    channel: RpcChannel,
    invokeHandlers?: InvokeHandlers,
    callHandlers?: CallHandlers
): {
    invoke(name: string, ...args: any[]): Promise<any>;
    send(name: string, ...args: any[]): void;
}
```

**Message types:**

| Type | Fields | Semantics |
| ---- | ------ | --------- |
| `invoke` | `callId`, `name`, `args[]` | Request expecting a response |
| `invokeResult` | `callId`, `result` | Successful response |
| `invokeError` | `callId`, `error`, `stack?` | Error response |
| `call` | `callId`, `name`, `args[]` | Fire-and-forget (no response) |

`callId` is an auto-incrementing integer per RPC endpoint. For `invoke`,
the sender tracks a pending promise map:

```typescript
pending = new Map<number, { resolve, reject }>();
// On send: pending.set(callId, { resolve, reject })
// On result: pending.get(callId)?.resolve(result)
// On error: pending.get(callId)?.reject(new Error(error))
// On disconnect: reject all pending with "Agent channel disconnected"
```

### Layer 4: Agent RPC client/server

For agents running out-of-process, the package provides:

- `createAgentRpcClient(name, channelProvider, agentInterface)` — Creates
  a proxy `AppAgent` that forwards all calls over RPC
- `createAgentRpcServer(name, agent, channelProvider)` — Wraps a local
  `AppAgent` and exposes it via RPC

These use an **object ID mapping** pattern to serialize `SessionContext`
and `ActionContext` objects across process boundaries:

```typescript
// Client side: maps context objects to numeric IDs
contextMap.getId(context) → 42

// Sent over RPC as:
{ contextId: 42, hasInstanceStorage: true, hasSessionStorage: true }

// Server side: reconstructs a context shim from the ID
createSessionContextShim(42, true, true) → SessionContext proxy
```

The context shim proxies storage operations back to the client via RPC
(`storageRead`, `storageWrite`, `storageList`).

---

## Communication tiers

### Tier 1: Agent ↔ Extension (WebSocket)

The primary communication channel between the browser agent (Node.js) and
the Chrome extension (service worker).

**Connection:**
```
Extension connects to: ws://localhost:8081/?channel=browser&role=client&clientId=<extensionId>
```

**Channel setup:**

Both sides create a `ChannelProviderAdapter` over the WebSocket, then
create two logical channels:

| Channel | Direction | Types | Purpose |
| ------- | --------- | ----- | ------- |
| `browserControl` | Agent → Extension | `BrowserControlInvokeFunctions`, `BrowserControlCallFunctions` | Browser automation commands |
| `agentService` | Extension → Agent | `BrowserAgentInvokeFunctions`, `BrowserAgentCallFunctions` | Knowledge, import, WebFlow operations |

**Agent side** (`agentWebSocketServer.mts`):

```typescript
// On client connection:
const channelProvider = createChannelProviderAdapter("browser", ws.send.bind(ws));

// Browser control: agent invokes, extension handles
const browserControlChannel = channelProvider.createChannel("browserControl");
client.browserControlRpc = createRpc(browserControlChannel, /* no local handlers */);

// Agent service: extension invokes, agent handles
const agentServiceChannel = channelProvider.createChannel("agentService");
client.agentRpc = createRpc(agentServiceChannel, agentInvokeHandlers, {
    importProgress(params) { /* forward to UI */ },
    knowledgeExtractionProgress(params) { /* forward to UI */ }
});
```

**Extension side** (`websocket.ts`):

```typescript
// On connection:
const channelProvider = createChannelProviderAdapter("browser", ws.send.bind(ws));

// Browser control: extension handles incoming commands
const browserControlChannel = channelProvider.createChannel("browserControl");
createExternalBrowserServer(browserControlChannel);

// Agent service: extension sends requests to agent
const agentServiceChannel = channelProvider.createChannel("agentService");
agentRpc = createRpc(agentServiceChannel, /* no local handlers */, {
    importProgress(params) { /* update UI */ },
    knowledgeExtractionProgress(params) { /* update UI */ }
});
```

**Message routing:**

```
ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "keepAlive") return;     // Ignore keep-alive
    channelProvider.notifyMessage(message);           // Route by message.name
};
```

### Tier 2: Service worker ↔ Content script (Chrome messaging)

Communication between the extension service worker and per-tab content
scripts for DOM interaction.

**Transport:** `chrome.tabs.sendMessage()` (service worker → content
script) and `chrome.runtime.sendMessage()` (content script → service
worker), targeting `frameId: 0` (main frame only).

**RPC setup** (`externalBrowserControlServer.ts`):

The service worker maintains a per-tab RPC map:

```typescript
const rpcMap = new Map<number, {
    channel: ChannelAdapter;
    contentScriptRpc: ContentScriptRpc;
}>();
```

On first use for a tab, it creates a channel adapter wrapping
`chrome.tabs.sendMessage()`:

```typescript
const { channel, notifyMessage } = createChannelAdapter(
    async (message, cb) => {
        try {
            await chrome.tabs.sendMessage(tabId, { type: "rpc", message }, { frameId: 0 });
        } catch (error) {
            // Content script missing — inject and retry
            await injectContentScripts(tabId);
            await chrome.tabs.sendMessage(tabId, { type: "rpc", message }, { frameId: 0 });
        }
    }
);
```

Incoming RPC responses are routed back by tab ID:

```typescript
chrome.runtime.onMessage.addListener((message, sender) => {
    if (message.type === "rpc") {
        rpcMap.get(sender.tab.id)?.channel.notifyMessage(message.message);
    }
});
```

**ContentScriptRpc interface:**

```typescript
type ContentScriptRpc = {
    scrollUp(): Promise<void>;
    scrollDown(): Promise<void>;
    getPageLinksByQuery(query: string): Promise<string | undefined>;
    getPageLinksByPosition(position: number): Promise<string | undefined>;
    clickOn(cssSelector: string): Promise<any>;
    setDropdown(cssSelector: string, optionLabel: string): Promise<any>;
    enterTextIn(textValue: string, cssSelector?: string, submitForm?: boolean): Promise<any>;
    awaitPageLoad(timeout?: number): Promise<string>;
    awaitPageInteraction(timeout?: number): Promise<void>;
    runPaleoBioDbAction(action: any): Promise<void>;
};
```

**Auto-injection:** If a `sendMessage` call fails because the content
script isn't loaded (extension was reloaded, new tab), the service worker
automatically injects `contentScript.js` via `chrome.scripting.executeScript()`
and retries.

### Tier 3: Agent ↔ Dispatcher (AppAgent interface)

The browser agent runs in-process with the dispatcher, so this tier uses
direct function calls rather than RPC. The dispatcher calls the agent's
`AppAgent` methods directly:

- `initializeAgentContext()` → `initializeBrowserContext()`
- `updateAgentContext()` → `updateBrowserContext()`
- `executeAction()` → `executeBrowserAction()`
- `resolveEntity()` → entity resolution for `WebPageMoniker`/`WebSearchResult`
- `getDynamicDisplay()` → live rendering of knowledge extraction progress
- `getDynamicGrammar()` → WebFlow grammar rules
- `getDynamicSchema()` → WebFlow action schemas

### Tier 4: Electron shell ↔ Agent (WebSocket listener)

The Electron shell connects to the same WebSocket server (port 8081) as a
secondary client, primarily for UI updates.

**Connection** (`browserIpc.ts`):

`BrowserAgentIpc` is a singleton that manages the shell's WebSocket
connection:

```typescript
class BrowserAgentIpc {
    static getInstance(): BrowserAgentIpc;
    async ensureWebsocketConnected(): Promise<WebSocket | undefined>;
    async send(message: WebSocketMessageV2): Promise<void>;
    isConnected(): boolean;

    onMessageReceived: ((message) => void) | null;   // Browser events
    onRpcReply: ((message) => void) | null;           // Agent context calls
    onSendNotification: ((message, id) => void) | null;
}
```

**Message routing:**

```
if (message.name === "agentService")     → onRpcReply (agent context)
if (schema starts with "browser")        → onMessageReceived (browser events)
if (method === "importProgress")         → onMessageReceived (progress)
```

**Message queue:** When the WebSocket is not connected, messages are
queued (up to 100) and flushed on reconnection.

**Reconnection:** Exponential backoff starting at 1 second, capping at
5 seconds.

### Tier 5: Electron main ↔ Content script (IPC)

When the Electron host provides browser control, DOM interactions use
Electron IPC instead of Chrome messaging:

```typescript
// Send to content script
webContents.send("inline-browser-rpc-call", message);

// Receive from content script
ipcMain.on("inline-browser-rpc-reply", (event, message) => {
    contentScriptRpcChannel.notifyMessage(message);
});
```

This uses the same `createChannelAdapter()` and `createContentScriptRpcClient()`
as the extension path, so the content script RPC interface is identical
regardless of which backend is active.

---

## Connection lifecycle

### Extension WebSocket connection

```
┌─────────────┐                    ┌─────────────────┐
│  Extension   │                    │  Agent Server    │
│  (SW)        │                    │  (port 8081)     │
└──────┬───────┘                    └────────┬────────┘
       │                                      │
       │──── WebSocket CONNECT ──────────────▶│
       │     ?channel=browser&role=client      │
       │     &clientId=<extensionId>          │
       │                                      │
       │◀─── welcome { connected: true } ─────│
       │                                      │
       │──── Channel setup ──────────────────▶│
       │     browserControl channel            │
       │     agentService channel              │
       │                                      │
       │◀──▶ RPC messages (multiplexed) ◀────▶│
       │                                      │
       │──── keepAlive (every 20s) ──────────▶│
       │                                      │
       │◀─── WebSocket CLOSE ─────────────────│
       │     reason: "duplicate" → no retry   │
       │     other → reconnect (5s interval)  │
       │                                      │
       │──── Reconnect attempt ──────────────▶│
       │     (repeat until success)           │
       └──────────────────────────────────────┘
```

### State management

**Extension side:**
```typescript
let webSocket: WebSocket | undefined;
let channelProvider: ChannelProviderAdapter | undefined;
let agentRpc: RpcProxy | undefined;
let connectionInProgress: boolean = false;
```

**Agent side:**
```typescript
// Per-client state
interface BrowserClient {
    id: string;
    type: "extension" | "electron";
    socket: WebSocket;
    connectedAt: Date;
    lastActivity: Date;
    channelProvider?: ChannelProviderAdapter;
    agentRpc?: RpcProxy;
    browserControlRpc?: RpcProxy;
}

// Server state
clients: Map<string, BrowserClient>;
activeClient: BrowserClient | null;
```

### Keep-alive protocol

The extension sends a `keepAlive` message every 20 seconds to prevent
WebSocket timeout:

```json
{ "method": "keepAlive", "params": {} }
```

The agent server filters these messages before routing to channel handlers.

### Status broadcasting

On connection state changes, the extension broadcasts to all open
extension pages (side panel, library views, options):

```typescript
broadcastConnectionStatus(connected: boolean): void
// Sends to all tabs: { type: "connectionStatusChanged", connected, timestamp }
```

---

## RPC function contracts

### BrowserAgentInvokeFunctions (Extension → Agent)

These are the methods the extension can call on the agent:

**Knowledge extraction and indexing:**
- `extractKnowledgeFromPage(params)` — Extract entities, topics, relationships
- `indexWebPageContent(params)` — Index page for search
- `checkPageIndexStatus(params)` — Check if page is indexed
- `getPageIndexedKnowledge(params)` — Retrieve indexed knowledge
- `getKnowledgeIndexStats(params)` — Index statistics

**Knowledge search:**
- `searchWebMemories(params)` — Keyword search with optional answer generation
- `searchByEntities(params)` — Entity-based search
- `searchByTopics(params)` — Topic-based search
- `hybridSearch(params)` — Combined search strategy

**Knowledge graph:**
- `buildKnowledgeGraph(params)` — Build graph from index
- `getGlobalGraphLayoutData(params)` — Graph visualization data
- `getEntityNeighborhood(params)` — Entity relationship subgraph
- `getHierarchicalTopics(params)` — Topic hierarchy

**Import/export:**
- `importWebsiteDataWithProgress(params)` — Import bookmarks/history
- `importHtmlFolder(params)` — Batch import HTML files
- `clearKnowledgeIndex(params)` — Clear all indexed data

**WebFlow management:**
- `createWebFlowFromRecording(params)` — Generate WebFlow from recording
- `getWebFlowsForDomain(params)` — List flows for a domain
- `getAllWebFlows(params)` — List all flows
- `deleteWebFlow(params)` — Delete a flow

**Navigation:**
- `handlePageNavigation(params)` — Notify agent of page navigation

### BrowserAgentCallFunctions (Agent → Extension, fire-and-forget)

- `importProgress(params)` — Import progress update
- `knowledgeExtractionProgress(params)` — Extraction progress update

### BrowserControlInvokeFunctions (Agent → Extension)

All methods from the `BrowserControl` interface (see `browserAgent.md`
for the full list): navigation, content access, element interaction,
view control, settings.

### BrowserControlCallFunctions (Agent → Extension, fire-and-forget)

- `setAgentStatus(isBusy, message)` — Update extension badge/status

### ExtensionLocalInvokeFunctions (internal to extension)

Methods handled entirely within the service worker:
- `checkWebSocketConnection()` — Connection status
- `initialize()` — Trigger initialization
- `takeScreenshot()` — Capture via CDP
- `saveRecordedActions(params)` / `getRecordedActions()` — Recording state
- `settingsUpdated(params)` — Apply new settings
- `autoIndexSettingChanged(params)` — Toggle auto-indexing

### ChatPanelInvokeFunctions (Side panel → Service worker)

- `chatPanelConnect()` — Connect to dispatcher
- `chatPanelProcessCommand(params)` — Send NL command
- `chatPanelGetCompletions(params)` — Get autocomplete suggestions
- `chatPanelStartRecording()` / `chatPanelStopRecording()` — Recording control
- `chatPanelCreateWebFlowFromRecording(params)` — Generate WebFlow

---

## Custom protocol handling

The extension implements a custom `typeagent-browser://` protocol for
internal navigation:

```typescript
function resolveCustomProtocolUrl(url: string): string
// Maps: typeagent-browser://knowledgeLibrary.html
//    → chrome-extension://<extensionId>/views/knowledgeLibrary.html
// Preserves query parameters
```

This allows the agent to open extension views (knowledge library, graph
views) via the same `openWebPage()` mechanism used for regular URLs.

---

## Error handling patterns

### Content script injection recovery

When a `chrome.tabs.sendMessage()` call fails because the content script
isn't loaded:

```
1. sendMessage fails with "Could not establish connection"
2. Service worker calls chrome.scripting.executeScript({
       target: { tabId },
       files: ["contentScript.js"]
   })
3. Retry the original sendMessage
```

### WebSocket reconnection

On unexpected WebSocket close (not "duplicate" reason):

```
1. Clear channel provider and RPC state
2. Start reconnection timer (5-second interval)
3. Update badge to show disconnected state
4. Broadcast connectionStatusChanged(false) to extension pages
5. On successful reconnect: flush message queue, restore state
```

### RPC timeout and disconnect

When the WebSocket disconnects while RPC calls are pending:

```
1. channelProvider.notifyDisconnected() fires
2. All pending invoke promises are rejected with "Agent channel disconnected"
3. Callers receive the rejection and can retry or report to user
```

---

## WebAgent relay protocol

WebAgents communicate with the dispatcher through a relay chain:

```
WebAgent (MAIN world)
    ↓ chrome.runtime.connect({ name: "typeagent" })
Service Worker (port listener)
    ↓ WebSocket message
Browser Agent
    ↓ handleWebAgentRpc() / addDynamicAgent()
Dispatcher
```

### Port protocol messages

| Method | Direction | Payload |
| ------ | --------- | ------- |
| `webAgent/register` | WebAgent → Dispatcher | `{ agentName, url, tabId, frameId, schema, grammar }` |
| `webAgent/disconnect` | WebAgent → Dispatcher | `{ agentNames[] }` |
| (other) | Bidirectional | Relayed verbatim between WebAgent and dispatcher |

The service worker injects `tabId` and `frameId` into registration
messages from the `sender` metadata provided by `chrome.runtime.onConnect`.

### Message type guards

```typescript
isWebAgentMessage(message)               // Messages FROM a WebAgent
isWebAgentMessageFromDispatcher(message) // Messages FROM the dispatcher TO a WebAgent
```

These guards are used to filter and route messages at the service worker
relay point.
