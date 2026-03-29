# Browser Agent — Testing Strategy

This document describes the current test coverage, identifies gaps, and
proposes a testing strategy for the browser agent.

---

## Current State

### Test inventory

The browser agent has 13 test files in `packages/agents/browser/test/`:

| Area | Files | What's tested |
| ---- | ----- | ------------- |
| Service worker | `serviceWorker/index.test.ts` | Initialization, WebSocket connection, badge display |
| Service worker | `serviceWorker/websocket.test.ts` | WebSocket lifecycle |
| Service worker | `serviceWorker/contentDownloader.test.ts` | Status reporting, fetch fallback, invalid URLs |
| Service worker | `serviceWorker/contextMenu.test.ts` | Context menu handlers |
| Service worker | `serviceWorker/ui.test.ts` | UI state management |
| Search | `search/queryEnhancement.test.ts` | Query enhancement logic |
| Search | `search/answerEnhancement.test.ts` | Answer enhancement logic |
| PDF | `pdf/highlightCoordinates.test.ts` | PDF highlight positioning |
| Unit | `unit/graph/graphTraversal.test.ts` | Knowledge graph traversal |
| Unit | `unit/questions/questionGeneration.test.ts` | Question generation |
| Unit | `unit/answering/questionAnswering.test.ts` | Answer generation |

### Mock infrastructure

The test suite includes mocks in `test/mocks/`:
- `agent-rpc-channel.js`, `agent-rpc-rpc.js` — RPC channel/protocol mocks
- `contentScriptRpc-client.js`, `contentScriptRpc-types.js` — Content script RPC mocks
- `mockEmbeddings.ts` — Embedding model mock
- `mockKnowledgeStore.ts` — Knowledge store mock
- `mockLLMResponses.ts` — LLM response fixtures

### Test execution

```bash
# Build first (tests run against compiled output in dist/test/)
cd TypeAgent/ts
pnpm run build

# Run all browser agent tests
cd packages/agents/browser
npm run test

# Run specific test
pnpm run jest-esm --testPathPattern="websocket.test"
```

---

## Coverage Gaps

### Critical gaps (no test coverage)

| Component | Lines of code | Risk | Why it matters |
| --------- | ------------- | ---- | -------------- |
| Content script (`contentScript/`) | ~3,870 | **High** | Injected into every page; DOM interaction, recording, auto-indexing |
| HTML sanitization (`htmlUtils.ts`, `crossContextHtmlReducer.ts`) | ~600 | **High** | Security-critical; DOMPurify integration, innerHTML usage |
| WebFlow validation (`scriptValidator.mts`) | ~180 | **High** | Security-critical; prevents script escape from sandbox |
| WebFlow execution (`scriptExecutor.mts`) | ~120 | **Medium** | Sandbox isolation, timeout behavior |
| WebFlow generation (`scriptGenerator.mts`) | ~300 | **Medium** | LLM-dependent; schema validation, retry logic |
| Action discovery (`discovery/`) | ~500 | **Medium** | LLM-dependent; dynamic agent registration |
| Knowledge extraction (`knowledge/`) | ~1,200 | **Medium** | LLM-dependent; multi-step pipeline |
| Browser control server (`externalBrowserControlServer.ts`) | ~600 | **Medium** | RPC dispatch, content script injection recovery |
| RPC parameter validation | n/a | **Medium** | No validation exists; forwards params directly |
| WebAgent framework (`webagent/`) | ~800 | **Low** | Site-specific; port relay, registration |

### Missing test categories

| Category | Current coverage | What's needed |
| -------- | ---------------- | ------------- |
| **Security** | None | XSS payloads, script validator bypass, postMessage origin |
| **Integration** | None | Full RPC chain (SW → content script → DOM → response) |
| **E2E** | None | Extension loaded in real browser, scenario execution |
| **Performance** | None | Content script injection overhead, extraction token usage |
| **Snapshot/regression** | None | Recorded HTML → extraction output stability |

---

## Proposed Testing Strategy

### Layer 1: Unit tests (fast, no browser)

These run with Jest and jsdom (already a project dependency). No Chrome
APIs needed.

**Priority 1 — Security:**

```
test/security/
├── htmlSanitization.test.ts      # DOMPurify integration, XSS payloads
├── crossContextReducer.test.ts   # HTML reduction with malicious input
├── scriptValidator.test.ts       # Known bypass patterns (aliasing,
│                                 #   destructuring, encoded strings)
└── postMessageValidation.test.ts # Origin checking, message format
```

Test cases for `scriptValidator.mts`:
- Blocks direct `eval()`, `fetch()`, `document.*` usage
- Blocks aliased usage: `const F = fetch; F()`
- Blocks destructured usage: `const { fetch } = globalThis`
- Blocks dynamic import: `import("module")`
- Blocks `new Function()` construction
- Allows safe globals: `JSON.parse`, `Math.max`, `Promise.all`
- Detects unused parameters (warning, not error)

Test cases for HTML sanitization:
- Strips `<script>` tags in all forms (`<script>`, `<SCRIPT>`, `<scr\0ipt>`)
- Strips event handlers (`onclick`, `onerror`, `onload`)
- Strips `javascript:` URIs
- Preserves semantic content (headings, paragraphs, lists)
- Handles malformed HTML gracefully

**Priority 2 — Content script logic:**

```
test/contentScript/
├── domUtils.test.ts          # Element ID assignment, CSS selector generation
├── htmlUtils.test.ts         # HTML fragment extraction, compression modes
├── pageContent.test.ts       # Text extraction via Readability
├── messaging.test.ts         # Message format, timeout handling
└── recording.test.ts         # Action capture, state management
```

These use jsdom to create a mock DOM. Chrome API calls are mocked via
the existing `test/mocks/` infrastructure.

**Priority 3 — WebFlow pipeline:**

```
test/webFlows/
├── scriptValidator.test.ts   # (see security above)
├── scriptExecutor.test.ts    # Sandbox isolation, timeout, frozen API
├── recordingNormalizer.test.ts  # Action dedup, text merge, scroll handling
└── webFlowStore.test.ts      # Save/load/delete, index integrity
```

### Layer 2: Integration tests (mock RPC, no browser)

Test the RPC chain with mocked transports. The existing mock
infrastructure supports this.

```
test/integration/
├── browserControlChain.test.ts    # Agent → ExternalBrowserClient → mock extension
├── contentScriptRpc.test.ts       # SW RPC handler → content script adapter → mock DOM
├── knowledgeExtraction.test.ts    # Page HTML → extraction pipeline → mock LLM → index
└── webFlowLifecycle.test.ts       # Record → normalize → generate (mock LLM) → store → execute
```

For LLM-dependent tests, use the existing `mockLLMResponses.ts` fixtures
to provide deterministic responses.

### Layer 3: Snapshot tests (deterministic regression)

Record real page HTML and extraction outputs as fixtures. On each test
run, re-process the HTML and compare against the snapshot.

```
test/snapshots/
├── fixtures/
│   ├── news-article.html         # Saved page HTML
│   ├── ecommerce-product.html
│   └── crossword-puzzle.html
├── extraction.snapshot.test.ts   # HTML → extraction → compare to snapshot
├── htmlReduction.snapshot.test.ts # HTML → reduced HTML → compare
└── recording.snapshot.test.ts    # Recorded actions → normalized → compare
```

Snapshot tests detect unintended changes in extraction output when
refactoring the pipeline.

### Layer 4: E2E tests (real browser, optional)

Use Playwright to load the extension in Chromium and test core scenarios.
These are slow and require a running agent, so they run separately from
the main test suite.

```
test/e2e/
├── setup.ts                      # Launch Chromium with extension loaded
├── browserControl.e2e.test.ts    # Open page, click link, scroll, screenshot
├── knowledgeExtraction.e2e.test.ts # Navigate to page, extract, search
└── webFlowRecording.e2e.test.ts  # Record actions, generate flow, replay
```

Run with: `pnpm run test:e2e` (separate from `test:local`)

---

## Implementation Plan

| Phase | Tests | Effort | Blocks |
| ----- | ----- | ------ | ------ |
| **Phase 1** | Security tests (sanitization, validator) | 2-3 days | Nothing |
| **Phase 2** | Content script unit tests (domUtils, htmlUtils) | 3-4 days | jsdom setup |
| **Phase 3** | WebFlow pipeline tests (executor, normalizer, store) | 2-3 days | Nothing |
| **Phase 4** | Integration tests (RPC chain, extraction) | 3-4 days | Mock LLM fixtures |
| **Phase 5** | Snapshot tests (extraction regression) | 2-3 days | Fixture collection |
| **Phase 6** | E2E tests (Playwright) | 5-7 days | Playwright setup, running agent |

Phases 1-3 can proceed in parallel since they have no dependencies on
each other. Phase 4 depends on having the mock infrastructure from Phases
1-3. Phase 5 requires fixture collection from real pages. Phase 6 is
independent but requires the most infrastructure.

---

## Test Conventions

- **File naming:** `*.test.ts` for integration/live tests, `*.spec.ts`
  for unit tests
- **Location:** `packages/agents/browser/test/`
- **Build before test:** Tests run against `dist/test/` — always build
  first
- **Timeout:** 90 seconds per test (Jest config)
- **Mocks:** Use `test/mocks/` for shared mock infrastructure
- **Fixtures:** Use `test/snapshots/fixtures/` for HTML/data fixtures
- **No network in unit tests:** Mock all LLM and API calls
