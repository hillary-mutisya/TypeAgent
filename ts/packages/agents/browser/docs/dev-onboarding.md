# Browser Agent — Developer Onboarding Guide

This guide covers everything you need to build, run, debug, and develop
the TypeAgent browser agent. For architecture context, read
[browserAgent.md](../../../forAgent/features/browser-architecture/browserAgent.md)
first.

## Prerequisites

| Tool | Version | Purpose |
| ---- | ------- | ------- |
| Node.js | >= 20 | Runtime |
| pnpm | >= 10 | Package manager |
| Chrome or Edge | Latest | Extension host |
| VS Code | Latest | IDE (recommended) |

You also need a `.env` file at `TypeAgent/ts/.env` with Azure OpenAI API
keys. Ask the team for the current configuration.

---

## Initial setup

All commands run from the monorepo root at `TypeAgent/ts/`.

```bash
cd TypeAgent/ts

# Install all workspace dependencies
pnpm install

# Full build (all packages including browser agent)
pnpm run build

# Or build only the browser agent and its dependencies
pnpm run build browser-typeagent
```

The browser agent package is `browser-typeagent`, located at
`packages/agents/browser/`.

---

## Building the extension

The extension has its own build pipeline: TypeScript type-checking + Vite
bundling with esbuild.

```bash
cd packages/agents/browser

# Production build (minified, no sourcemaps)
npm run build:extension

# Development build (sourcemaps, no minification)
npm run build:extension:dev
```

### What the build produces

Output goes to `dist/extension/` (Chrome) and `dist/electron/` (Electron):

```
dist/extension/
├── manifest.json              # Chrome MV3 manifest
├── serviceWorker.js           # Background script (ESM format)
├── contentScript.js           # Main content script (IIFE)
├── webTypeAgentContentScript.js
├── webTypeAgentMain.js        # MAIN world script (IIFE)
├── uiEventsDispatcher.js      # UI event capture (IIFE)
├── sites/                     # Site-specific scripts
│   ├── crossword.js
│   ├── commerce.js
│   ├── instacart.js
│   ├── paleobiodb.js
│   └── webflow.js
├── offscreen/                 # Offscreen document
├── views/                     # Side panel, options, libraries
├── images/                    # Extension icons
├── vendor/                    # Third-party (bootstrap, cytoscape, etc.)
└── webagent/crossword/        # Compiled crossword grammar
```

### Build pipeline details

The build is orchestrated by Fluid Build with these steps:

1. **TypeScript type-checking** — `tsc` checks extension and common code
   (no emit; esbuild handles transpilation)
2. **Vite/esbuild bundling** — `scripts/buildExtension.mjs` builds both
   Chrome and Electron variants:
   - Service worker: bundled as ESM (`format: 'es'`) — required by MV3
   - Content scripts: bundled as IIFE (`format: 'iife'`, `inlineDynamicImports: true`) — self-contained for injection
   - Target: ES2022
3. **Static asset copy** — manifest, HTML views, CSS, images, vendor libs
4. **Grammar compilation** — `.agr` files compiled to `.ag.json` via `agc`

### Component-specific builds

```bash
# Agent business logic only
npm run tsc:agent

# Shared utilities only
npm run tsc:common

# Compile action grammar
npm run agc

# Build web views (PDF viewer, knowledge library UI)
npm run build:views

# Package extension as .crx/.zip for distribution
npm run package
```

---

## Loading the extension in Chrome

1. Navigate to `chrome://extensions`
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked**
4. Select `TypeAgent/ts/packages/agents/browser/dist/extension/`

The extension icon appears in the toolbar. A red badge indicates the
WebSocket connection to the agent is not established.

### After code changes

```bash
# Rebuild the extension
npm run build:extension:dev

# Then in Chrome:
# - Go to chrome://extensions
# - Click the refresh icon on the TypeAgent extension card
# - Reload any open tabs (content scripts need re-injection)
```

---

## Running the system

The browser agent needs a running dispatcher to function. You can run it
via the shell (Electron app) or CLI.

### Option A: Electron shell

```bash
cd TypeAgent/ts

# Development mode (with hot reload for shell UI)
pnpm run shell:dev

# Production mode
pnpm run shell
```

The shell starts the dispatcher, which starts the browser agent, which
starts the WebSocket server on port 8081. The extension auto-connects.

### Option B: CLI

```bash
cd TypeAgent/ts
pnpm run cli:dev
```

Then enable the browser agent:
```
@config agent browser
```

### Verifying the connection

Once the dispatcher is running and the extension is loaded:
- Extension badge turns green (connected)
- Side panel shows "Connected" status
- `@browser open google.com` in the shell/CLI should open a tab

---

## Debugging

The browser agent spans four processes, each with its own debugging
approach.

### Agent process (Node.js)

The agent runs inside the dispatcher process. Debug it like any Node.js
code.

**VS Code:** Use the "Shell (Main process)" launch config in
`TypeAgent/ts/.vscode/launch.json`, or attach to a running process:

```json
{
    "name": "Attach",
    "type": "node",
    "request": "attach",
    "port": 9229
}
```

**Debug logging:** Set the `DEBUG` environment variable:
```bash
# All browser agent logs
DEBUG=typeagent:browser:* pnpm run cli:dev

# Specific subsystems
DEBUG=typeagent:browser:serviceWorker pnpm run cli:dev
DEBUG=typeagent:webAgent:proxy pnpm run cli:dev
```

**Key files to set breakpoints:**
- `browserActionHandler.mts` — Action routing and execution
- `agentWebSocketServer.mts` — Client connections and RPC
- `externalBrowserControlClient.mts` — Outgoing RPC calls to extension

### Extension service worker

1. Go to `chrome://extensions`
2. Find the TypeAgent extension
3. Click **Inspect views: service worker** link
4. DevTools opens for the service worker context

The service worker has access to Chrome APIs but no DOM. Use `console.log`
or the `debug` package (logs appear in this DevTools console).

**Common issues:**
- Service worker goes idle after 30 seconds of inactivity (MV3 limitation).
  The WebSocket keep-alive (20s interval) prevents this during normal operation.
- After extension reload, the service worker restarts and re-establishes
  the WebSocket connection.

### Content script

1. Open DevTools on the target page (F12)
2. Go to **Sources** tab
3. Find the content script under `Content scripts` > extension ID
4. Set breakpoints in the content script code

Content scripts run in an **isolated world** — they share the page's DOM
but have their own JavaScript scope. MAIN world scripts
(`webTypeAgentMain.js`, `uiEventsDispatcher.js`) run in the page's
JavaScript context and can access page variables.

**Common issues:**
- Content script not loaded: check that the page URL matches the manifest
  `matches` patterns (`https://*/*`)
- RPC not responding: the service worker may have restarted — the
  extension auto-reinjects content scripts on RPC failure

### Electron main process

When running the shell, the Electron main process manages browser tabs
via `BrowserViewManager`.

**VS Code:** Use the "Shell (Main process)" launch config.

**Key files:**
- `packages/shell/src/main/browserViewManager.ts` — Tab management
- `packages/shell/src/main/browserIpc.ts` — WebSocket bridge
- `packages/shell/src/main/inlineBrowserControl.ts` — Direct browser control

### WebSocket traffic inspection

To see RPC messages between the agent and extension, add logging in
either endpoint:

```typescript
// In websocket.ts (extension side), onmessage handler:
console.log("WS received:", JSON.parse(event.data));

// In agentWebSocketServer.mts (agent side):
console.log("WS message from client:", message);
```

Or use the `DEBUG` environment variable:
```bash
DEBUG=typeagent:browser:* pnpm run cli:dev
```

---

## Testing

Tests are in `packages/agents/browser/test/` and run against compiled
output in `dist/test/`.

```bash
# Build first (tests run against dist/)
pnpm run build

# Run all browser agent tests
cd packages/agents/browser
npm run test

# Run a specific test file
pnpm run jest-esm --testPathPattern="websocket.test"

# Run a specific test by name
pnpm run jest-esm --testNamePattern="should connect"
```

### Test structure

```
test/
├── pdf/
│   └── highlightCoordinates.test.ts
├── search/
│   ├── answerEnhancement.test.ts
│   └── queryEnhancement.test.ts
├── serviceWorker/
│   ├── contentDownloader.test.ts
│   ├── contextMenu.test.ts
│   ├── index.test.ts
│   ├── ui.test.ts
│   └── websocket.test.ts
└── unit/
    ├── answering/questionAnswering.test.ts
    └── graph/graphTraversal.test.ts
```

Test timeout is 90 seconds (configured in root `jest.config.js`).

---

## Common development tasks

### Adding a new browser action

1. **Define the action type** in `browserActionSchema.mts`:
   ```typescript
   export type MyNewAction = {
       actionName: "MyNewAction";
       parameters: {
           param1: string;
           param2?: number;
       };
   };
   ```

2. **Add to the union type** — include `MyNewAction` in the `BrowserActions` union

3. **Add grammar rules** in `browserSchema.agr`:
   ```agr
   <MyNewAction> =
       do my thing with $(param1:wildcard)
     | my thing $(param1:wildcard) ;
   ```

4. **Compile the grammar**: `npm run agc`

5. **Add the handler** in `browserActionHandler.mts` inside `executeBrowserAction()`:
   ```typescript
   case "MyNewAction": {
       const { param1, param2 } = action.parameters;
       // Implementation here
       break;
   }
   ```

6. **Build and test**: `npm run build && npm run test`

### Adding a new RPC method (agent → extension)

1. **Add to the interface** in `browserControl.mts`:
   ```typescript
   // In BrowserControlInvokeFunctions:
   myNewMethod(param: string): Promise<string>;
   ```

2. **Implement in the extension** — add handler in
   `externalBrowserControlServer.ts` inside the invoke handlers object

3. **Add the proxy** in `externalBrowserControlClient.mts` — delegate to
   `browserControlRpc.invoke("myNewMethod", param)`

4. **Rebuild both agent and extension**

### Adding a new content script RPC method

1. **Add to the type** in `contentScriptRpc/types.mts`:
   ```typescript
   myDomMethod(selector: string): Promise<any>;
   ```

2. **Add client call** in `contentScriptRpc/client.mts`

3. **Add handler** in the content script's RPC server (in
   `contentScript/eventHandlers.ts`)

4. **Rebuild extension**: `npm run build:extension:dev`

### Creating a new WebAgent for a specific site

See the crossword agent (`extension/webagent/crossword/`) as a reference:

1. Create a folder under `extension/webagent/yoursite/`
2. Define action types and grammar
3. Implement the WebAgent class extending `WebAgentContext`
4. Add site-specific content script entry in `extension/sites/yoursite.ts`
5. Add URL patterns to `manifest.json` content scripts
6. Rebuild extension

### Adding a new extension view

1. Create HTML file in `extension/views/yourview.html`
2. Create TypeScript in `extension/views/yourview.ts`
3. Add the view to `web_accessible_resources` in `manifest.json` if
   needed
4. Register any RPC handlers in `serviceWorkerRpcHandlers.ts`
5. Rebuild extension

---

## Key file map

Quick reference for finding code by responsibility:

| What you're looking for | Where to find it |
| ----------------------- | ---------------- |
| Action types and schemas | `src/agent/browserActionSchema.mts` |
| Grammar rules (NL patterns) | `src/agent/browserSchema.agr` |
| Main action handler/router | `src/agent/browserActionHandler.mts` |
| Agent manifest and sub-schemas | `src/agent/manifest.json` |
| BrowserControl interface | `src/common/browserControl.mts` |
| RPC type definitions | `src/common/serviceTypes.mts` |
| WebSocket server (agent side) | `src/agent/agentWebSocketServer.mts` |
| RPC proxy to extension | `src/agent/rpc/externalBrowserControlClient.mts` |
| Extension service worker entry | `src/extension/serviceWorker/index.ts` |
| WebSocket client (extension) | `src/extension/serviceWorker/websocket.ts` |
| Extension RPC handlers | `src/extension/serviceWorker/serviceWorkerRpcHandlers.ts` |
| Browser control server (ext) | `src/extension/serviceWorker/externalBrowserControlServer.ts` |
| Content script entry | `src/extension/contentScript/index.ts` |
| DOM interaction | `src/extension/contentScript/elementInteraction.ts` |
| Recording system | `src/extension/contentScript/recording/` |
| Knowledge extraction | `src/agent/knowledge/` |
| WebFlow system | `src/agent/webFlows/` |
| Action discovery | `src/agent/discovery/` |
| WebAgent framework | `src/extension/webagent/` |
| Electron tab manager | `packages/shell/src/main/browserViewManager.ts` |
| Electron WebSocket bridge | `packages/shell/src/main/browserIpc.ts` |
| Electron browser control | `packages/shell/src/main/inlineBrowserControl.ts` |

---

## Conventions

- **4-space indentation** for TypeScript/JavaScript, **2-space** for JSON
- **LF** line endings
- Every `.ts`/`.js` file starts with the MIT license header:
  ```typescript
  // Copyright (c) Microsoft Corporation.
  // Licensed under the MIT License.
  ```
- Internal packages use `"workspace:*"` in `package.json`
- Format with Prettier: `pnpm run prettier:fix`
- Agent code uses `.mts` extension (ES module); extension code uses `.ts`
