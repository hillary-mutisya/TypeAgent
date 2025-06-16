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
    },
    server: {
        port: 5173,
        host: true,
        proxy: {
            // Proxy API requests to the backend during development
            "/document": {
                target: "http://localhost:3010",
                changeOrigin: true,
            },
            "/preview": {
                target: "http://localhost:3010",
                changeOrigin: true,
            },
            "/events": {
                target: "http://localhost:3010",
                changeOrigin: true,
            },
            "/agent": {
                target: "http://localhost:3010",
                changeOrigin: true,
            },
        },
    },
    css: {
        modules: false,
    },
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "src/view/site"),
        },
    },
    optimizeDeps: {
        include: [
            "@milkdown/core",
            "@milkdown/crepe",
            "@milkdown/preset-commonmark",
            "@milkdown/preset-gfm",
            "@milkdown/plugin-history",
            "@milkdown/plugin-math",
            "@milkdown/theme-nord",
            "@milkdown/utils",
        ],
    },
});
