// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
    root: "src/view/site",
    build: {
        outDir: "../../../dist/view/site",
        emptyOutDir: true,
        rollupOptions: {
            input: {
                main: path.resolve(__dirname, "src/view/site/index.html"),
            },
        },
        // Ensure large dependencies are handled properly
        chunkSizeWarningLimit: 1000,
    },
    server: {
        port: 3001, // Different from backend
        open: false, // Don't auto-open browser
        proxy: {
            // Proxy API calls to the backend server
            "/document": "http://localhost:3000",
            "/preview": "http://localhost:3000",
            "/events": "http://localhost:3000",
            "/operations": "http://localhost:3000",
            "/agent": "http://localhost:3000",
        },
    },
    resolve: {
        alias: {
            // Add aliases for easier imports
            "@": path.resolve(__dirname, "src"),
            "@editor": path.resolve(__dirname, "src/view/editor"),
            "@ai-tools": path.resolve(__dirname, "src/view/editor/ai-tools"),
        },
    },
    optimizeDeps: {
        // Include Milkdown dependencies for optimization
        include: [
            "@milkdown/core",
            "@milkdown/crepe",
            "@milkdown/preset-commonmark",
            "@milkdown/preset-gfm",
            "@milkdown/plugin-history",
            "@milkdown/theme-nord",
            "mermaid",
        ],
    },
    define: {
        // Define environment variables for development
        __DEV__: JSON.stringify(process.env.NODE_ENV === "development"),
    },
});
