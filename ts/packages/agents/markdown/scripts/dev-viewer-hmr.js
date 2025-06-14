#!/usr/bin/env node

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { fork, spawn } from "child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "fs";

// Parse command line arguments
const args = process.argv.slice(2);
let filePath = "";
let backendPort = 3000;
let frontendPort = 5173;
let hmr = false;

// Parse arguments
for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--file" || arg === "-f") {
        filePath = args[i + 1];
        i++; // Skip next argument since it's the value
    } else if (arg === "--port" || arg === "-p") {
        backendPort = parseInt(args[i + 1]) || 3000;
        i++; // Skip next argument since it's the value
    } else if (arg === "--frontend-port") {
        frontendPort = parseInt(args[i + 1]) || 5173;
        i++; // Skip next argument since it's the value
    } else if (arg === "--hmr") {
        hmr = true;
    } else if (arg === "--help" || arg === "-h") {
        console.log(`
AI-Enhanced Markdown Editor Dev Server

Usage: npm run dev:hmr -- --file <path> [options]

Options:
  --file, -f <path>        Path to the markdown file to view (required)
  --port, -p <port>        Backend port (default: 3000)
  --frontend-port <port>   Frontend dev server port (default: 5173)
  --hmr                    Enable Hot Module Replacement (default: false)
  --help, -h              Show this help message

Examples:
  npm run dev:hmr -- --file ./README.md --hmr
  npm run dev:hmr -- --file ./docs/guide.md --port 3001 --frontend-port 5174
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
    console.error("Use 'npm run dev:hmr -- --help' for usage information.");
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

if (hmr) {
    console.log(`🚀 Starting AI-Enhanced Markdown Editor with HMR...`);
    console.log(`📄 File: ${filePath}`);
    console.log(`🔗 Backend: http://localhost:${backendPort}`);
    console.log(`⚡ Frontend: http://localhost:${frontendPort}`);
    console.log(`🔥 HMR: Enabled`);
    startWithHMR();
} else {
    console.log(`📝 Starting markdown viewer...`);
    console.log(`File: ${filePath}`);
    console.log(`Port: ${backendPort}`);
    console.log(`URL: http://localhost:${backendPort}`);
    startWithoutHMR();
}

async function startWithHMR() {
    try {
        // Build TypeScript first
        console.log("🔨 Building TypeScript...");
        await runCommand("npm", ["run", "tsc"]);
        
        // Start backend service
        const serviceScript = fileURLToPath(
            new URL("../dist/view/route/service.js", import.meta.url)
        );

        // Check if the built service exists
        if (!fs.existsSync(serviceScript)) {
            console.error("Error: Service script not found. Please run 'npm run build' first.");
            process.exit(1);
        }

        console.log("🌐 Starting backend server...");
        const backendProcess = fork(serviceScript, [backendPort.toString()]);

        backendProcess.send({
            type: "setFile",
            filePath: filePath,
        });

        // Wait for backend to be ready
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error("Backend startup timeout"));
            }, 10000);

            backendProcess.on("message", function (message) {
                if (message === "Success") {
                    clearTimeout(timeout);
                    console.log(`✅ Backend started on port ${backendPort}`);
                    resolve();
                } else if (message === "Failure") {
                    clearTimeout(timeout);
                    reject(new Error("Backend startup failed"));
                }
            });
        });

        // Start Vite dev server
        console.log("⚡ Starting Vite dev server with HMR...");
        const viteProcess = spawn("npx", ["vite", "--port", frontendPort.toString(), "--host"], {
            stdio: "inherit",
            shell: true
        });

        console.log("\n🎉 Development servers started successfully!");
        console.log(`📝 Backend API: http://localhost:${backendPort}`);
        console.log(`⚡ Frontend (HMR): http://localhost:${frontendPort}`);
        console.log(`📄 Viewing: ${path.basename(filePath)}`);
        console.log(`🔥 Hot Module Replacement enabled - changes will update instantly!`);
        console.log(`⚡ Press Ctrl+C to stop both servers`);

        // Handle process termination
        process.on("SIGINT", () => {
            console.log("\n🛑 Stopping development servers...");
            backendProcess.kill();
            viteProcess.kill();
            process.exit(0);
        });

        process.on("SIGTERM", () => {
            console.log("\n🛑 Stopping development servers...");
            backendProcess.kill();
            viteProcess.kill();
            process.exit(0);
        });

        backendProcess.on("exit", (code) => {
            console.log(`\n🔧 Backend stopped (exit code: ${code})`);
            viteProcess.kill();
            process.exit(code || 0);
        });

        viteProcess.on("exit", (code) => {
            console.log(`\n⚡ Vite dev server stopped (exit code: ${code})`);
            backendProcess.kill();
            process.exit(code || 0);
        });

    } catch (error) {
        console.error("❌ Error starting development servers:", error);
        process.exit(1);
    }
}

function startWithoutHMR() {
    // Original functionality for production-like development
    try {
        const serviceScript = fileURLToPath(
            new URL("../dist/view/route/service.js", import.meta.url)
        );

        // Check if the built service exists
        if (!fs.existsSync(serviceScript)) {
            console.error("Error: Service script not found. Please run 'npm run build' first.");
            process.exit(1);
        }

        const childProcess = fork(serviceScript, [backendPort.toString()]);

        childProcess.send({
            type: "setFile",
            filePath: filePath,
        });

        childProcess.on("message", function (message) {
            if (message === "Success") {
                console.log(`✅ Markdown viewer started successfully!`);
                console.log(`📝 Open http://localhost:${backendPort} in your browser`);
                console.log(`📄 Viewing: ${path.basename(filePath)}`);
                console.log(`🔄 File changes will be reflected automatically`);
                console.log(`⚡ Press Ctrl+C to stop the server`);
                console.log(`💡 Use --hmr flag for Hot Module Replacement during development`);
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
}

function runCommand(command, args) {
    return new Promise((resolve, reject) => {
        const process = spawn(command, args, { stdio: "pipe", shell: true });
        
        let output = "";
        process.stdout.on("data", (data) => {
            output += data.toString();
        });
        
        process.stderr.on("data", (data) => {
            output += data.toString();
        });
        
        process.on("close", (code) => {
            if (code === 0) {
                resolve(output);
            } else {
                reject(new Error(`Command failed with exit code ${code}: ${output}`));
            }
        });
    });
}
