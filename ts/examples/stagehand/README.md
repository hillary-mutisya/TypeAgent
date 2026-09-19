# Stagehand TypeAgent Prototype

This example runs Stagehand V4 browser automation while routing its model requests through `@typeagent/aiclient`. TypeAgent continues to select the provider, authenticate, pool endpoints, retry requests, and record model telemetry. Stagehand receives a host-side `ClientLLM` callback, so provider credentials are not sent to its browser extension.

The prototype covers product search and extraction, add-to-cart verification, crossword clue extraction, and answer entry. It does not purchase products, submit payment, or use production credentials.

## Setup

From the `ts` workspace root:

```powershell
pnpm install
pnpm --filter stagehand-typeagent-prototype build
pnpm --filter stagehand-typeagent-prototype test
```

TypeAgent loads model settings from `ts/config.local.yaml` and the normal environment-variable fallback. The default model name is `GPT_5_MINI`; override it with `--model` when the active provider uses another configured model mapping.

Use a dedicated browser profile when a target site requires a test login:

```powershell
pnpm --filter stagehand-typeagent-prototype start -- commerce-search --url https://example.com --query "running shoes" --user-data-dir ./browser-data
```

The browser is visible by default. Add `--headless` for unattended runs.

## Commands

```powershell
pnpm --filter stagehand-typeagent-prototype start -- commerce-inspect --url https://example.com
pnpm --filter stagehand-typeagent-prototype start -- commerce-add-to-cart --url https://example.com --product "Product name"
pnpm --filter stagehand-typeagent-prototype start -- crossword-inspect --url https://example.com/crossword
pnpm --filter stagehand-typeagent-prototype start -- crossword-enter --url https://example.com/crossword --clue "1 Across" --answer "TEST"
```

Each successful run writes a timestamped JSON file to `artifacts/`. It includes the scenario result, final URL, duration, and Stagehand accessibility snapshot. The `artifacts/` and `browser-data/` directories are ignored by Git.

## Current Limits

- The adapter supports text, images, and JSON-schema output. It rejects Stagehand tool calls and stop sequences.
- `GPT_5_MINI` is fixed at temperature `1`, which is the only value supported by that endpoint.
- Commerce and crossword sites differ substantially. These scenarios intentionally use semantic instructions rather than site-specific selectors.
- Crossword entry assumes clicking the observed clue or cell focuses the answer input and that letter key events advance through cells.
