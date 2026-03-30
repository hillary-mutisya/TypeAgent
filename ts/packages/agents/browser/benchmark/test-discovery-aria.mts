// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Test: Compare action discovery in HTML vs ARIA representation modes.
 *
 * Prerequisites:
 *   - No other TypeAgent dispatcher running (this test binds port 8081)
 *   - Chrome extension or Electron shell ready to connect
 *   - A page open in the browser with WebFlows registered for its domain
 *
 * Usage:
 *   cd ts/packages/agents/browser
 *   npx tsx benchmark/test-discovery-aria.mts
 *
 * What it does:
 *   1. Creates a dispatcher with the browser agent on port 8081
 *   2. Waits for the Chrome extension / Electron shell to connect
 *   3. Runs @browser actions discover in HTML mode (baseline)
 *   4. Switches to ARIA mode, runs discovery again
 *   5. Switches to hybrid mode, runs discovery again
 *   6. Prints a side-by-side latency comparison
 */

import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync, readFileSync, rmSync, mkdirSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Enable debug output for perf and handler namespaces
import registerDebug from "debug";
registerDebug.enable(
    "typeagent:browser:discover:perf,typeagent:browser:discover:handler",
);

// Capture debug output programmatically
interface PerfEntry {
    namespace: string;
    message: string;
    timestamp: number;
}

const perfLog: PerfEntry[] = [];
const originalLog = registerDebug.log;
registerDebug.log = function (...args: any[]) {
    const msg = typeof args[0] === "string" ? args[0] : String(args[0]);
    // Capture perf lines
    if (msg.includes("discover:perf") || msg.includes("discover:handler")) {
        perfLog.push({
            namespace: "perf",
            message: msg.replace(/\x1b\[[0-9;]*m/g, ""), // strip ANSI
            timestamp: Date.now(),
        });
    }
    // Still print to console
    if (originalLog) {
        originalLog.apply(registerDebug, args);
    } else {
        console.error(...args);
    }
};

// Load .env
const envPath = join(__dirname, "..", "..", "..", ".env");
if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf-8").split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx < 0) continue;
        const key = trimmed.substring(0, eqIdx).trim();
        let val = trimmed.substring(eqIdx + 1).trim();
        if (
            (val.startsWith('"') && val.endsWith('"')) ||
            (val.startsWith("'") && val.endsWith("'"))
        ) {
            val = val.slice(1, -1);
        }
        if (!process.env[key]) {
            process.env[key] = val;
        }
    }
}

interface DiscoveryRun {
    mode: string;
    perfEntries: PerfEntry[];
    result: any;
    error?: string;
}

async function main() {
    const tsRoot = join(__dirname, "..", "..", "..", "..");
    const dispatcherPath = join(
        tsRoot,
        "packages",
        "dispatcher",
        "dispatcher",
        "dist",
        "index.js",
    );
    const providerPath = join(
        tsRoot,
        "packages",
        "defaultAgentProvider",
        "dist",
        "defaultAgentProviders.js",
    );
    const nodeProvidersPath = join(
        tsRoot,
        "packages",
        "dispatcher",
        "nodeProviders",
        "dist",
        "index.js",
    );

    const { createDispatcher } = await import(
        "file://" + dispatcherPath.replace(/\\/g, "/")
    );
    const { getDefaultAppAgentProviders } = await import(
        "file://" + providerPath.replace(/\\/g, "/")
    );
    const { getFsStorageProvider } = await import(
        "file://" + nodeProvidersPath.replace(/\\/g, "/")
    );

    const persistDir = join(
        process.env.TEMP ?? "/tmp",
        "discovery-aria-test",
    );
    // Clean up persist dir and its lock directory from prior runs
    if (existsSync(persistDir)) {
        rmSync(persistDir, { recursive: true, force: true });
    }
    const lockDir = persistDir + ".lock";
    if (existsSync(lockDir)) {
        rmSync(lockDir, { recursive: true, force: true });
    }
    mkdirSync(persistDir, { recursive: true });

    console.log("=== Action Discovery: HTML vs ARIA Comparison ===\n");
    console.log(
        "Creating dispatcher (browser agent WebSocket on port 8081)...",
    );
    console.log(
        "Make sure no other TypeAgent instance is running.\n",
    );
    const dispatcher = await createDispatcher("discovery-aria-test", {
        appAgentProviders: getDefaultAppAgentProviders(undefined),
        agents: { actions: true, commands: true },
        execution: { history: false },
        collectCommandResult: true,
        portBase: 9100,
        persistDir,
        storageProvider: getFsStorageProvider(),
    });

    console.log("Dispatcher created. Waiting for browser agent to initialize...");
    console.log("(The browser agent WebSocket server should start on port 8081)");
    await new Promise((r) => setTimeout(r, 8000));

    console.log(
        "Waiting for browser extension to connect...",
    );
    console.log(
        "(Open/refresh a page in the Chrome extension or Electron shell now)\n",
    );

    // Poll for browser connection.
    // The extension connects to the WebSocket server on 8081. We verify
    // by toggling external control on (which sets browserControl) and
    // then running a command that uses it.
    const maxWaitMs = 120_000;
    const pollIntervalMs = 4_000;
    const waitStart = Date.now();
    let connected = false;
    while (Date.now() - waitStart < maxWaitMs) {
        const elapsed = Math.round((Date.now() - waitStart) / 1000);
        try {
            // Enable external browser control — sets up externalBrowserControl
            // from the WebSocket-connected extension client, and copies it
            // to agentContext.browserControl
            const extResult = await dispatcher.processCommand(
                "@browser external on",
            );
            const extErr = (extResult as any)?.lastError;
            if (extErr) {
                process.stdout.write(
                    `\r  @browser external on error: ${String(extErr).substring(0, 60)}  (${elapsed}s)`,
                );
                await new Promise((r) => setTimeout(r, pollIntervalMs));
                continue;
            }
        } catch (err) {
            process.stdout.write(
                `\r  Waiting for extension... (${elapsed}s)      `,
            );
            await new Promise((r) => setTimeout(r, pollIntervalMs));
            continue;
        }

        // Wait a moment for browserControl to propagate
        await new Promise((r) => setTimeout(r, 1000));

        // Now test discovery — this is the actual call path we're benchmarking
        try {
            const testResult = await dispatcher.processCommand(
                "@browser actions discover",
            );
            const lastErr = (testResult as any)?.lastError;
            if (
                lastErr &&
                String(lastErr).includes("No browser connection")
            ) {
                process.stdout.write(
                    `\r  browserControl still null after external on... (${elapsed}s)`,
                );
                // Try to diagnose: attempt a simpler browser command
                try {
                    const scrollResult =
                        await dispatcher.processCommand("scroll up");
                    const scrollErr = (scrollResult as any)?.lastError;
                    if (!scrollErr) {
                        // scroll worked — browserControl is set for actions
                        // but the discovery command handler has a stale ref?
                        console.log(
                            `\n  NOTE: scroll works but discovery doesn't see browserControl`,
                        );
                    }
                } catch {}
                await new Promise((r) => setTimeout(r, pollIntervalMs));
                continue;
            }
            connected = true;
            console.log(`\n  Browser connected! (discovery probe ok)\n`);
            break;
        } catch (err) {
            const msg = String(err);
            if (msg.includes("No connection to browser session")) {
                process.stdout.write(
                    `\r  Waiting for browserControl... (${elapsed}s)`,
                );
                await new Promise((r) => setTimeout(r, pollIntervalMs));
                continue;
            }
            connected = true;
            console.log(
                `\n  Browser connected! (discovery threw: ${msg.substring(0, 80)})\n`,
            );
            break;
        }
    }

    if (!connected) {
        console.error(
            "\nERROR: Browser extension did not connect within 2 minutes. Exiting.",
        );
        await dispatcher.close();
        process.exit(1);
    }

    // Give the page a moment to stabilize
    await new Promise((r) => setTimeout(r, 2000));

    // Ensure we start in HTML mode
    console.log("--- Setting HTML mode ---");
    await dispatcher.processCommand("@browser representation html");
    await new Promise((r) => setTimeout(r, 500));

    // Run 1: HTML mode
    console.log("\n========================================");
    console.log("  RUN 1: HTML MODE (baseline)");
    console.log("========================================\n");
    const htmlRun = await runDiscovery(dispatcher, "html");

    // Switch to ARIA mode
    console.log("\n--- Switching to ARIA mode ---");
    await dispatcher.processCommand("@browser representation aria");
    await new Promise((r) => setTimeout(r, 500));

    // Run 2: ARIA mode
    console.log("\n========================================");
    console.log("  RUN 2: ARIA MODE");
    console.log("========================================\n");
    const ariaRun = await runDiscovery(dispatcher, "aria");

    // Switch to hybrid mode
    console.log("\n--- Switching to hybrid mode ---");
    await dispatcher.processCommand("@browser representation hybrid");
    await new Promise((r) => setTimeout(r, 500));

    // Run 3: Hybrid mode
    console.log("\n========================================");
    console.log("  RUN 3: HYBRID MODE");
    console.log("========================================\n");
    const hybridRun = await runDiscovery(dispatcher, "hybrid");

    // Print comparison
    printComparison([htmlRun, ariaRun, hybridRun]);

    // Also run page summary comparison
    console.log("\n\n=== Page Summary Comparison ===\n");

    await dispatcher.processCommand("@browser representation html");
    await new Promise((r) => setTimeout(r, 300));
    console.log("--- HTML page summary ---");
    const htmlSummary = await runPageSummary(dispatcher, "html");

    await dispatcher.processCommand("@browser representation aria");
    await new Promise((r) => setTimeout(r, 300));
    console.log("--- ARIA page summary ---");
    const ariaSummary = await runPageSummary(dispatcher, "aria");

    printComparison([htmlSummary, ariaSummary]);

    // Reset to HTML mode
    await dispatcher.processCommand("@browser representation html");

    console.log("\nClosing dispatcher...");
    await dispatcher.close();
    console.log("Done.");
}

async function runDiscovery(
    dispatcher: any,
    mode: string,
): Promise<DiscoveryRun> {
    const startIdx = perfLog.length;
    const startTime = Date.now();

    let result: any;
    let error: string | undefined;

    try {
        result = await dispatcher.processCommand(
            "@browser actions discover",
        );
        console.log(
            `Discovery completed in ${Date.now() - startTime}ms`,
        );

        // Extract action info from result
        const actions = (result as any)?.actions ?? [];
        if (actions.length > 0) {
            const first = actions[0];
            console.log(
                `  Result: ${actions.length} action(s), first: ${first?.actionName ?? "?"}`,
            );
        } else {
            // Try to get display text
            const displayText =
                (result as any)?.displayContent?.content ??
                (result as any)?.displayText ??
                JSON.stringify(result)?.substring(0, 200);
            console.log(`  Result: ${displayText}`);
        }
    } catch (err) {
        error = String(err);
        console.error(`  ERROR: ${error}`);
    }

    const entries = perfLog.slice(startIdx);

    return { mode, perfEntries: entries, result, error };
}

async function runPageSummary(
    dispatcher: any,
    mode: string,
): Promise<DiscoveryRun> {
    const startIdx = perfLog.length;
    const startTime = Date.now();

    let result: any;
    let error: string | undefined;

    try {
        result = await dispatcher.processCommand(
            "@browser actions discover",
        );
        console.log(
            `Page summary completed in ${Date.now() - startTime}ms`,
        );
    } catch (err) {
        error = String(err);
        console.error(`  ERROR: ${error}`);
    }

    const entries = perfLog.slice(startIdx);
    return { mode, perfEntries: entries, result, error };
}

function printComparison(runs: DiscoveryRun[]) {
    console.log("\n┌─────────────────────────────────────────────────────┐");
    console.log("│           LATENCY COMPARISON                        │");
    console.log("├─────────────────────────────────────────────────────┤");

    for (const run of runs) {
        console.log(`│ Mode: ${run.mode.padEnd(46)}│`);
        if (run.error) {
            console.log(`│   ERROR: ${run.error.substring(0, 42).padEnd(42)}│`);
        }
        for (const entry of run.perfEntries) {
            // Extract just the timing info from the debug message
            const cleaned = entry.message
                .replace(/.*discover:perf\s*/, "")
                .trim();
            if (cleaned) {
                console.log(
                    `│   ${cleaned.substring(0, 49).padEnd(49)}│`,
                );
            }
        }
        console.log(
            "├─────────────────────────────────────────────────────┤",
        );
    }
    console.log(
        "└─────────────────────────────────────────────────────┘",
    );

    // Extract totals for quick comparison
    console.log("\nQuick Summary:");
    for (const run of runs) {
        const totalEntry = run.perfEntries.find((e) =>
            e.message.includes("total:"),
        );
        const captureEntry = run.perfEntries.find(
            (e) =>
                e.message.includes("getAriaSnapshot:") ||
                e.message.includes("getHtmlFragments:"),
        );
        const summaryEntry = run.perfEntries.find((e) =>
            e.message.includes("getPageSummary LLM:"),
        );
        const candidateEntry = run.perfEntries.find((e) =>
            e.message.includes("getCandidateUserActions LLM:"),
        );

        const extract = (entry: PerfEntry | undefined): string => {
            if (!entry) return "N/A";
            const match = entry.message.match(/(\d+)ms/);
            return match ? `${match[1]}ms` : "N/A";
        };

        console.log(`  ${run.mode.toUpperCase().padEnd(8)} | ` +
            `capture: ${extract(captureEntry).padEnd(8)} | ` +
            `summary LLM: ${extract(summaryEntry).padEnd(8)} | ` +
            `candidate LLM: ${extract(candidateEntry).padEnd(8)} | ` +
            `total: ${extract(totalEntry)}`);
    }
}

main().catch((err) => {
    console.error("Test failed:", err);
    process.exit(1);
});
