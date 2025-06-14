#!/usr/bin/env node

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { fork } from "child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "fs";

// Parse command line arguments
const args = process.argv.slice(2);
let filePath = "";
let port = 3000;

// Parse arguments
for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--file" || arg === "-f") {
        filePath = args[i + 1];
        i++; // Skip next argument since it's the value
    } else if (arg === "--port" || arg === "-p") {
        port = parseInt(args[i + 1]) || 3000;
        i++; // Skip next argument since it's the value
    } else if (arg === "--help" || arg === "-h") {
        console.log(`
Markdown Viewer Dev Server

Usage: npm run dev -- --file <path> [--port <port>]

Options:
  --file, -f <path>    Path to the markdown file to view (required)
  --port, -p <port>    Port to run the server on (default: 3000)
  --help, -h          Show this help message

Examples:
  npm run dev -- --file ./README.md
  npm run dev -- --file ./docs/guide.md --port 3001
  npm run dev -- -f ./example.md -p 8080
        `);
        process.exit(0);
    } else if (!filePath && !arg.startsWith("-")) {
        // If no --file specified, treat first non-flag argument as file path
        filePath = arg;
    }
}

// Validate file path
if (!filePath) {
    console.error("Error: No file path specified.");
    console.error("Use 'npm run dev -- --help' for usage information.");
    process.exit(1);
}

// Convert to absolute path
filePath = path.resolve(filePath);

// Check if file exists
if (!fs.existsSync(filePath)) {
    console.error(`Error: File does not exist: ${filePath}`);
    process.exit(1);
}

// Check if it's a markdown file
if (!filePath.match(/\.(md|markdown)$/i)) {
    console.warn(`Warning: File does not have a markdown extension: ${filePath}`);
}

console.log(`Starting markdown viewer...`);
console.log(`File: ${filePath}`);
console.log(`Port: ${port}`);
console.log(`URL: http://localhost:${port}`);

// Start the service
try {
    const serviceScript = fileURLToPath(
        new URL("../dist/view/route/service.js", import.meta.url)
    );

    // Check if the built service exists
    if (!fs.existsSync(serviceScript)) {
        console.error("Error: Service script not found. Please run 'npm run build' first.");
        process.exit(1);
    }

    const childProcess = fork(serviceScript, [port.toString()]);

    childProcess.send({
        type: "setFile",
        filePath: filePath,
    });

    childProcess.on("message", function (message) {
        if (message === "Success") {
            console.log(`✅ Markdown viewer started successfully!`);
            console.log(`📝 Open http://localhost:${port} in your browser`);
            console.log(`📄 Viewing: ${path.basename(filePath)}`);
            console.log(`🔄 File changes will be reflected automatically`);
            console.log(`⚡ Press Ctrl+C to stop the server`);
        } else if (message === "Failure") {
            console.error("❌ Failed to start markdown viewer");
            process.exit(1);
        }
    });

    childProcess.on("exit", (code) => {
        console.log(`\n📝 Markdown viewer stopped (exit code: ${code})`);
        process.exit(code || 0);
    });

    childProcess.on("error", (error) => {
        console.error("❌ Error starting markdown viewer:", error);
        process.exit(1);
    });

    // Handle process termination
    process.on("SIGINT", () => {
        console.log("\n🛑 Stopping markdown viewer...");
        childProcess.kill();
    });

    process.on("SIGTERM", () => {
        console.log("\n🛑 Stopping markdown viewer...");
        childProcess.kill();
    });

} catch (error) {
    console.error("❌ Error starting markdown viewer:", error);
    process.exit(1);
}
