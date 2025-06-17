// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
    logLevel: 'warn', // Suppress verbose asset listings, show only warnings and errors
    root: "src/view/site",
    build: {
        outDir: "../../../dist/view/site",
        emptyOutDir: true,
        reportCompressedSize: false, // Skip gzip calculation for faster, quieter builds
        rollupOptions: {
            input: {
                main: path.resolve(__dirname, "src/view/site/index.html"),
            },
            output: {
                manualChunks: {
                    // Core editor libraries
                    'milkdown-core': ['@milkdown/core', '@milkdown/crepe'],
                    'milkdown-presets': ['@milkdown/preset-commonmark', '@milkdown/preset-gfm'],
                    'milkdown-plugins': [
                        '@milkdown/plugin-history',
                        '@milkdown/plugin-math',
                        '@milkdown/theme-nord',
                        '@milkdown/utils'
                    ],
                    // Mermaid is already being split well automatically
                    'prosemirror': [
                        'prosemirror-inputrules',
                        'prosemirror-model',
                        'prosemirror-state',
                        'prosemirror-view'
                    ],
                    // Math rendering
                    'katex': ['katex'],
                    // Markdown processing
                    'markdown': ['markdown-it', 'markdown-it-texmath', 'unist-util-visit']
                }
            }
        },
        chunkSizeWarningLimit: 1500, // Accommodate large diagram libraries (ELK ~1449kB)
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
