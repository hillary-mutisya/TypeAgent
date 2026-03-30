// Minimal test: does the browser agent WebSocket server start?
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync, readFileSync, mkdirSync, rmSync } from "fs";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "..", "..", "..", ".env");
if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf-8").split("\n")) {
        const t = line.trim();
        if (!t || t.startsWith("#")) continue;
        const eq = t.indexOf("=");
        if (eq < 0) continue;
        const k = t.substring(0, eq).trim();
        let v = t.substring(eq + 1).trim();
        if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
        if (!process.env[k]) process.env[k] = v;
    }
}

const tsRoot = join(__dirname, "..", "..", "..", "..");
const imp = (p: string) =>
    import("file://" + join(tsRoot, p).replace(/\\/g, "/"));

const { createDispatcher } = await imp(
    "packages/dispatcher/dispatcher/dist/index.js",
);
const { getDefaultAppAgentProviders } = await imp(
    "packages/defaultAgentProvider/dist/defaultAgentProviders.js",
);
const { getFsStorageProvider } = await imp(
    "packages/dispatcher/nodeProviders/dist/index.js",
);

const persistDir = join(process.env.TEMP ?? "/tmp", "disc-ws-check");
const lockDir = persistDir + ".lock";
if (existsSync(persistDir)) rmSync(persistDir, { recursive: true, force: true });
if (existsSync(lockDir)) rmSync(lockDir, { recursive: true, force: true });
mkdirSync(persistDir, { recursive: true });

console.log("Creating dispatcher...");
const d = await createDispatcher("disc-ws-check", {
    appAgentProviders: getDefaultAppAgentProviders(undefined),
    agents: { actions: true, commands: true },
    execution: { history: false },
    collectCommandResult: true,
    portBase: 9200,
    persistDir,
    storageProvider: getFsStorageProvider(),
});
console.log("Dispatcher created.");

try {
    const schemas = await d.getActiveSchemas();
    console.log("Active schemas:", schemas);
} catch (e) {
    console.log("getActiveSchemas error:", e);
}

function checkPort(label: string) {
    try {
        const r = execSync("netstat -an", { encoding: "utf-8" });
        const lines = r
            .split("\n")
            .filter((l) => l.includes("8081"))
            .map((l) => l.trim());
        console.log(
            `[${label}] Port 8081: ${lines.length > 0 ? lines.join(" | ") : "NOT FOUND"}`,
        );
    } catch {}
}

checkPort("immediate");

for (let i = 1; i <= 6; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    checkPort(`${i * 5}s`);
}

console.log("Closing...");
await d.close();
