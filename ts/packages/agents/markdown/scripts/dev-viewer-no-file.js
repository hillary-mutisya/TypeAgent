#!/usr/bin/env node
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// Development viewer script that can work without a file (memory-only mode)

import { fork } from "child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "fs";

// Parse command line arguments
const args = process.argv.slice(2);
let filePath = null; // Allow null for memory-only mode
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
Markdown Viewer Dev Server (Enhanced for Collaboration)

Usage: npm run dev:backend-no-file [--file <path>] [--port <port>]

Options:
  --file, -f <path>    Path to the markdown file to view (optional for memory-only mode)
  --port, -p <port>    Port to run the server on (default: 3000)
  --help, -h          Show this help message

Examples:
  npm run dev:backend-no-file                           # Memory-only mode
  npm run dev:backend-no-file --file ./README.md        # With file
  npm run dev:backend-no-file --port 3001               # Custom port
  npm run dev:backend-no-file -f ./example.md -p 8080   # File + custom port
        `);
        process.exit(0);
    } else if (!filePath && !arg.startsWith("-")) {
        // If no --file specified, treat first non-flag argument as file path
        filePath = arg;
    }
}

// Validate file path if provided
if (filePath) {
    // Convert to absolute path
    filePath = path.resolve(filePath);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
        console.error(`Error: File does not exist: ${filePath}`);
        process.exit(1);
    }

    // Check if it's a markdown file
    if (!filePath.match(/\.(md|markdown)$/i)) {
        console.warn(
            `Warning: File does not have a markdown extension: ${filePath}`,
        );
    }

    console.log(`Starting markdown viewer with file...`);
    console.log(`File: ${filePath}`);
} else {
    console.log(`Starting markdown viewer in memory-only mode...`);
    console.log(`📝 No file specified - using default content`);
    console.log(`💡 Perfect for collaboration testing and new documents`);
}

console.log(`Port: ${port}`);
console.log(`URL: http://localhost:${port}`);

// Start the service
try {
    const serviceScript = fileURLToPath(
        new URL("../dist/view/route/service.js", import.meta.url),
    );

    // Check if the built service exists
    if (!fs.existsSync(serviceScript)) {
        console.error(
            "Error: Service script not found. Please run 'npm run build' first.",
        );
        process.exit(1);
    }

    const childProcess = fork(serviceScript, [port.toString()]);

    // Send file path only if provided
    if (filePath) {
        childProcess.send({
            type: "setFile",
            filePath: filePath,
        });
    } else {
        // Send empty message to indicate no file mode
        childProcess.send({
            type: "setFile",
            filePath: null,
        });
    }

    childProcess.on("message", function (message) {
        if (message === "Success") {
            console.log(`✅ Markdown viewer started successfully!`);
            console.log(`📝 Open http://localhost:${port} in your browser`);
            
            if (filePath) {
                console.log(`📄 Viewing: ${path.basename(filePath)}`);
                console.log(`🔄 File changes will be reflected automatically`);
            } else {
                console.log(`📄 Mode: Memory-only with default content`);
                console.log(`🔄 Perfect for collaboration and testing`);
                console.log(`💾 Changes won't persist to disk (use File > Save to save)`);
            }
            
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
