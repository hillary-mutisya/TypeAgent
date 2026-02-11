// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { CommandServer } from "./commandServer.js";
import dotenv from "dotenv";

const envPath = new URL("../../../.env", import.meta.url);
dotenv.config({ path: envPath });

console.log("Starting Command Executor Server");

// Parse command-line arguments
const args = process.argv.slice(2);
const schemaDiscoveryFlag = args.includes("--schemaDiscovery") ||
                            args.includes("--schema-discovery") ||
                            process.env.SCHEMA_DISCOVERY === "true";

const debugMode = args.includes("--debug") ||
                 process.env.DEBUG_MODE !== "false"; // default true for backward compatibility

console.log(`Debug mode: ${debugMode}`);
console.log(`Schema discovery: ${schemaDiscoveryFlag}`);

const commandServer = new CommandServer(debugMode, undefined, schemaDiscoveryFlag);
await commandServer.start();

console.log("Exit Command Executor Server");
