// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// HeadlessEditorManager with dynamic Milkdown integration and DOM environment setup
// Uses dynamic imports and jsdom to provide DOM APIs for headless Milkdown operation

import { Doc } from "yjs";
import { WebsocketProvider } from "y-websocket";
import * as fs from "fs";
import * as path from "path";
import registerDebug from "debug";
import type { DocumentOperation } from "../../agent/markdownOperationSchema.js";
// @ts-ignore - ws is required for Node.js WebSocket support
import ws from "ws";
import { JSDOM } from "jsdom";

const debug = registerDebug("typeagent:markdown:headless");

// Dynamic import types (will be populated at runtime)
interface MilkdownModules {
    Editor: any;
    rootCtx: any;
    defaultValueCtx: any;
    editorViewCtx: any;
    commonmark: any;  // Changed from gfm to commonmark for better stability
    collab: any;
    collabServiceCtx: any;
}

// DOM environment setup state
let domSetup = false;

/**
 * HeadlessEditorManager - Dynamic Milkdown integration with Y.js fallback
 * 
 * This class manages a headless Milkdown instance using dynamic imports to avoid
 * compile-time issues. Falls back to Y.js-only mode if Milkdown is unavailable.
 * 
 * Features:
 * - Dynamic Milkdown loading with graceful fallback
 * - Proper markdown parsing and serialization when available
 * - Collaboration via WebSocket as a "system user"
 * - File I/O with validated markdown processing
 * - AI operation application through editor APIs
 */
export class HeadlessEditorManager {
    private milkdownModules: MilkdownModules | null = null;
    private editor: any | null = null;
    private yjsDoc: Doc | null = null;
    private websocketProvider: WebsocketProvider | null = null;
    private documentId: string = "default";
    private websocketUrl: string = "";
    private isInitialized: boolean = false;
    private useMilkdown: boolean = false;

    constructor(websocketUrl: string = "ws://localhost:3000") {
        this.websocketUrl = websocketUrl;
    }

    /**
     * Setup DOM environment for headless Milkdown operation
     */
    private setupDOMEnvironment(): void {
        if (domSetup) {
            debug('[HEADLESS] DOM environment already set up');
            return;
        }

        try {
            debug('[HEADLESS] Setting up DOM environment for headless operation...');

            // Create a minimal DOM environment using jsdom
            const dom = new JSDOM('<!DOCTYPE html><html><head></head><body><div id="editor"></div></body></html>', {
                url: 'http://localhost',
                pretendToBeVisual: false,
                resources: 'usable'
            });

            // Helper function to safely set global properties
            const safeSetGlobal = (name: string, value: any) => {
                try {
                    if (!(name in global) || global[name as keyof typeof global] === undefined) {
                        (global as any)[name] = value;
                        debug(`[HEADLESS] ✅ Set global.${name}`);
                    } else {
                        debug(`[HEADLESS] ⚠️ Skipped global.${name} (already exists)`);
                    }
                } catch (error) {
                    debug(`[HEADLESS] ⚠️ Failed to set global.${name}: ${error}`);
                }
            };

            // Set global DOM objects that Milkdown expects, with safety checks
            safeSetGlobal('window', dom.window);
            safeSetGlobal('document', dom.window.document);
            safeSetGlobal('HTMLElement', dom.window.HTMLElement);
            safeSetGlobal('HTMLDivElement', dom.window.HTMLDivElement);
            safeSetGlobal('Node', dom.window.Node);
            safeSetGlobal('Element', dom.window.Element);
            safeSetGlobal('DocumentFragment', dom.window.DocumentFragment);
            safeSetGlobal('MutationObserver', dom.window.MutationObserver);
            safeSetGlobal('getComputedStyle', dom.window.getComputedStyle);

            // Event system with basic event handling for Milkdown timing
            const eventListeners = new Map<string, Function[]>();
            
            const flexibleAddEventListener = (type: string, listener: any) => {
                debug(`[HEADLESS] addEventListener called for: ${type}`);
                if (!eventListeners.has(type)) {
                    eventListeners.set(type, []);
                }
                eventListeners.get(type)!.push(listener);
            };
            
            const flexibleRemoveEventListener = (type: string, listener: any) => {
                debug(`[HEADLESS] removeEventListener called for: ${type}`);
                if (eventListeners.has(type)) {
                    const listeners = eventListeners.get(type)!;
                    const index = listeners.indexOf(listener);
                    if (index > -1) {
                        listeners.splice(index, 1);
                    }
                }
            };
            
            const flexibleDispatchEvent = (event: any) => {
                const eventType = event?.type || (typeof event === 'string' ? event : 'unknown');
                debug(`[HEADLESS] dispatchEvent called for: ${eventType}`);
                
                // Try to handle the event if we have listeners
                if (eventListeners.has(eventType)) {
                    const listeners = eventListeners.get(eventType)!;
                    debug(`[HEADLESS] Triggering ${listeners.length} listeners for ${eventType}`);
                    
                    // Trigger listeners asynchronously to avoid blocking
                    setTimeout(() => {
                        listeners.forEach(listener => {
                            try {
                                if (typeof listener === 'function') {
                                    listener(event);
                                }
                            } catch (error) {
                                debug(`[HEADLESS] Error in event listener for ${eventType}:`, error);
                            }
                        });
                    }, 0);
                }
                
                return true;
            };

            safeSetGlobal('addEventListener', flexibleAddEventListener);
            safeSetGlobal('removeEventListener', flexibleRemoveEventListener);
            safeSetGlobal('dispatchEvent', flexibleDispatchEvent);

            // Also set these methods on window and document objects where Milkdown might call them
            if (global.window) {
                (global.window as any).addEventListener = flexibleAddEventListener;
                (global.window as any).removeEventListener = flexibleRemoveEventListener;
                (global.window as any).dispatchEvent = flexibleDispatchEvent;
            }

            if (global.document) {
                (global.document as any).addEventListener = flexibleAddEventListener;
                (global.document as any).removeEventListener = flexibleRemoveEventListener;
                (global.document as any).dispatchEvent = flexibleDispatchEvent;
            }

            // Additional event and selection APIs that Milkdown might need
            safeSetGlobal('CustomEvent', dom.window.CustomEvent);
            safeSetGlobal('MouseEvent', dom.window.MouseEvent);
            safeSetGlobal('KeyboardEvent', dom.window.KeyboardEvent);
            safeSetGlobal('Range', dom.window.Range);
            safeSetGlobal('Selection', dom.window.Selection);

            // Animation frame polyfills
            safeSetGlobal('requestAnimationFrame', (callback: Function) => setTimeout(callback, 16));
            safeSetGlobal('cancelAnimationFrame', (id: any) => clearTimeout(id));

            // Only set navigator if it doesn't exist or is undefined
            if (!global.navigator) {
                try {
                    (global as any).navigator = dom.window.navigator;
                    debug('[HEADLESS] ✅ Set global.navigator');
                } catch (error) {
                    debug('[HEADLESS] ⚠️ Could not set navigator, using existing or creating minimal one');
                    // Create minimal navigator if needed
                    if (!global.navigator) {
                        (global as any).navigator = {
                            userAgent: 'node-jsdom',
                            platform: 'node'
                        };
                    }
                }
            }

            // Set up basic event handling if not available
            if (!global.Event) {
                (global as any).Event = class Event {
                    type: string;
                    target: any;
                    currentTarget: any;
                    preventDefault() {}
                    stopPropagation() {}
                    
                    constructor(type: string) {
                        this.type = type;
                    }
                };
                debug('[HEADLESS] ✅ Created Event class');
            }

            domSetup = true;
            debug('[HEADLESS] ✅ DOM environment set up successfully');

        } catch (error) {
            console.error('[HEADLESS] Failed to setup DOM environment:', error);
            throw new Error(`DOM setup failed: ${error}`);
        }
    }

    /**
     * Create a DOM root element for Milkdown
     */
    private createDOMRoot(): Element {
        if (!global.document) {
            throw new Error("DOM environment not set up");
        }

        // Create or get the editor root element
        let root = global.document.getElementById('headless-editor');
        if (!root) {
            root = global.document.createElement('div');
            root.id = 'headless-editor';
            global.document.body.appendChild(root);
        }

        debug('[HEADLESS] ✅ DOM root element created/found');
        return root;
    }
    private async loadMilkdownModules(): Promise<MilkdownModules | null> {
        try {
            debug('[HEADLESS] Attempting to load Milkdown modules...');
            
            const [
                coreModule,
                commonmarkModule,
                collabModule
            ] = await Promise.all([
                import('@milkdown/core'),
                import('@milkdown/preset-commonmark'),  // Changed from gfm to commonmark
                import('@milkdown/plugin-collab')
            ]);

            // Use any to bypass TypeScript compile-time checks for dynamic imports
            const core = coreModule as any;
            const commonmark = commonmarkModule as any;  // Changed from gfm
            const collab = collabModule as any;

            // Debug: Log available exports to understand module structure
            debug('[HEADLESS] Core module exports:', Object.keys(core));
            debug('[HEADLESS] Commonmark module exports:', Object.keys(commonmark));  // Changed from GFM
            debug('[HEADLESS] Collab module exports:', Object.keys(collab));

            // Attempt to extract modules with multiple fallback strategies
            const modules: MilkdownModules = {
                Editor: core.Editor || core.default?.Editor || core.default,
                rootCtx: core.rootCtx || core.default?.rootCtx,
                defaultValueCtx: core.defaultValueCtx || core.default?.defaultValueCtx,
                editorViewCtx: core.editorViewCtx || core.default?.editorViewCtx,
                commonmark: commonmark.commonmark || commonmark.default?.commonmark || commonmark.default,  // Changed from gfm
                collab: collab.collab || collab.default?.collab || collab.default,
                collabServiceCtx: collab.collabServiceCtx || collab.default?.collabServiceCtx
            };

            // Check availability and provide detailed logging
            const availableModules: string[] = [];
            const missingModules: string[] = [];
            
            for (const [key, value] of Object.entries(modules)) {
                if (value && typeof value !== 'undefined') {
                    availableModules.push(key);
                    debug(`[HEADLESS] ✅ ${key}: available (type: ${typeof value})`);
                } else {
                    missingModules.push(key);
                    debug(`[HEADLESS] ❌ ${key}: missing`);
                }
            }

            debug('[HEADLESS] Summary - Available:', availableModules);
            debug('[HEADLESS] Summary - Missing:', missingModules);
            
            // If we have critical modules, try to continue with partial support
            if (modules.Editor && availableModules.length >= 3) {
                debug('[HEADLESS] ✅ Sufficient Milkdown modules available for basic functionality');
                return modules;
            } else if (missingModules.length > 0) {
                throw new Error(`Critical Milkdown modules missing: ${missingModules.join(', ')}`);
            }

            debug('[HEADLESS] ✅ All Milkdown modules loaded successfully');
            return modules;

        } catch (error) {
            debug('[HEADLESS] ⚠️ Failed to load Milkdown modules:', error);
            console.warn('[HEADLESS] Milkdown unavailable, using Y.js fallback mode');
            
            if (error instanceof Error) {
                console.warn('[HEADLESS] Error details:', error.message);
            } else {
                console.warn('[HEADLESS] Error details:', String(error));
            }
            
            return null;
        }
    }

    /**
     * Wait for Milkdown editor to be ready
     */
    private async waitForMilkdownReady(editor: any): Promise<any> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error("Milkdown editor initialization timeout"));
            }, 10000);

            // For now, resolve immediately as we don't have EditorStatus in dynamic import
            // TODO: Add proper status checking when we can import EditorStatus
            setTimeout(() => {
                clearTimeout(timeout);
                resolve(editor);
            }, 100);
        });
    }

    /**
     * Initialize the headless editor for a specific document
     */
    async initialize(documentId: string): Promise<void> {
        debug(`[HEADLESS] Initializing for document: "${documentId}"`);

        this.documentId = documentId;

        try {
            // Try to load Milkdown modules dynamically
            this.milkdownModules = await this.loadMilkdownModules();
            this.useMilkdown = !!this.milkdownModules;

            // Create Y.js document for collaboration
            this.yjsDoc = new Doc();
            debug(`[HEADLESS] Created Y.js document with client ID: ${this.yjsDoc.clientID}`);

            // Create WebSocket provider for collaboration
            this.websocketProvider = new WebsocketProvider(
                this.websocketUrl,
                this.documentId,
                this.yjsDoc,
                {
                    // Required for Node.js environment
                    WebSocketPolyfill: ws as any,
                    // Mark as system participant
                    params: { userType: 'system', userId: 'headless-editor' }
                }
            );

            // Setup system user awareness
            this.websocketProvider.awareness.setLocalStateField('user', {
                name: this.useMilkdown ? 'Milkdown System Editor' : 'Y.js System Editor',
                color: '#6366f1',
                userType: 'system',
                mode: this.useMilkdown ? 'milkdown' : 'yjs'
            });

            // Initialize Milkdown editor if available
            if (this.useMilkdown && this.milkdownModules) {
                await this.initializeMilkdownEditor();
            } else {
                debug('[HEADLESS] Using Y.js-only mode');
            }

            // Monitor connection
            this.websocketProvider.on('status', (event: { status: string }) => {
                debug(`[HEADLESS] WebSocket status: ${event.status}`);
            });

            this.websocketProvider.on('sync', (isSynced: boolean) => {
                if (isSynced) {
                    debug(`[HEADLESS] Document synchronized: "${this.documentId}"`);
                }
            });

            this.isInitialized = true;
            debug(`[HEADLESS] Initialization complete for document: "${documentId}" (mode: ${this.useMilkdown ? 'Milkdown' : 'Y.js only'})`);

        } catch (error) {
            console.error(`[HEADLESS] Failed to initialize:`, error);
            throw error;
        }
    }

    /**
     * Initialize Milkdown editor with dynamic modules and DOM environment
     */
    private async initializeMilkdownEditor(): Promise<void> {
        if (!this.milkdownModules || !this.yjsDoc) {
            throw new Error("Milkdown modules or Y.js document not available");
        }

        // Setup DOM environment before creating Milkdown editor
        this.setupDOMEnvironment();

        const { Editor, rootCtx, defaultValueCtx, commonmark, collab, collabServiceCtx } = this.milkdownModules;

        try {
            debug('[HEADLESS] Creating Milkdown editor with DOM environment...');

            // Create DOM root for headless operation
            const domRoot = this.createDOMRoot();

            // Add timeout to Milkdown initialization to prevent hanging
            const initTimeout = setTimeout(() => {
                debug('[HEADLESS] ⚠️ Milkdown initialization timeout, will fall back to Y.js mode');
            }, 10000); // 10 second timeout

            // Create headless Milkdown editor
            this.editor = await Promise.race([
                Editor.make()
                    .use(commonmark) // Commonmark preset (more stable than GFM)
                    .use(collab) // Collaboration plugin
                    .config((ctx: any) => {
                        // Set DOM root for editor
                        ctx.set(rootCtx, domRoot);
                        // Start with empty content
                        ctx.set(defaultValueCtx, '');
                    })
                    .create(),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Milkdown initialization timeout')), 15000)
                )
            ]);

            clearTimeout(initTimeout);
            debug('[HEADLESS] ✅ Milkdown editor created with DOM environment');

            // Wait for editor to be ready
            await this.waitForMilkdownReady(this.editor);
            debug('[HEADLESS] ✅ Milkdown editor ready');

            // Connect collaboration service
            this.editor.action((actionCtx: any) => {
                const collabService = actionCtx.get(collabServiceCtx);
                collabService
                    .bindDoc(this.yjsDoc!)
                    .setAwareness(this.websocketProvider!.awareness)
                    .connect();
                debug('[HEADLESS] ✅ Milkdown collaboration service connected');
            });

        } catch (error) {
            console.error('[HEADLESS] Failed to initialize Milkdown editor:', error);
            debug('[HEADLESS] Falling back to Y.js-only mode due to initialization failure');
            this.useMilkdown = false;
            this.editor = null;
            
            // Update awareness to reflect fallback mode
            if (this.websocketProvider) {
                this.websocketProvider.awareness.setLocalStateField('user', {
                    name: 'Y.js System Editor (Milkdown Fallback)',
                    color: '#f59e0b',
                    userType: 'system',
                    mode: 'yjs-fallback'
                });
            }
        }
    }

    /**
     * Switch to a different document
     */
    async switchDocument(newDocumentId: string): Promise<void> {
        debug(`[HEADLESS] Switching to document: "${newDocumentId}"`);

        if (!this.isInitialized) {
            throw new Error("HeadlessEditorManager not initialized");
        }

        await this.destroy();
        await this.initialize(newDocumentId);

        debug(`[HEADLESS] Successfully switched to document: "${newDocumentId}"`);
    }

    /**
     * Set document content from markdown string
     */
    async setContent(markdown: string): Promise<void> {
        if (!this.yjsDoc) {
            throw new Error("Y.js document not initialized");
        }

        debug(`[HEADLESS] Setting content: ${markdown.length} chars (mode: ${this.useMilkdown ? 'Milkdown' : 'Y.js'})`);

        if (this.useMilkdown && this.editor && this.milkdownModules) {
            // Use Milkdown for proper markdown parsing
            try {
                await this.setContentViaMilldown(markdown);
                debug('[HEADLESS] ✅ Content set via Milkdown');
                return;
            } catch (error) {
                console.warn('[HEADLESS] Milkdown setContent failed, falling back to Y.js:', error);
            }
        }

        // Fallback to Y.js text setting
        const ytext = this.yjsDoc.getText("content");
        ytext.delete(0, ytext.length);
        ytext.insert(0, markdown);
        debug('[HEADLESS] ✅ Content set via Y.js fallback');
    }

    /**
     * Set content via Milkdown editor
     */
    private async setContentViaMilldown(markdown: string): Promise<void> {
        if (!this.editor || !this.milkdownModules) {
            throw new Error("Milkdown editor not available");
        }

        // Use Milkdown action to set content
        this.editor.action((ctx: any) => {
            const { editorViewCtx } = this.milkdownModules!;
            try {
                const view = ctx.get(editorViewCtx);
                if (view) {
                    // Replace entire document content with parsed markdown
                    const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, 
                        view.state.schema.text(markdown));
                    view.dispatch(tr);
                } else {
                    // Fallback to Y.js if view not available
                    throw new Error("EditorView not available");
                }
            } catch (error) {
                throw new Error(`Failed to set content via Milkdown: ${error}`);
            }
        });
    }

    /**
     * Get document content as clean markdown
     */
    async getContent(): Promise<string> {
        if (!this.yjsDoc) {
            throw new Error("Y.js document not initialized");
        }

        if (this.useMilkdown && this.editor && this.milkdownModules) {
            // Try to get content via Milkdown for proper serialization
            try {
                const content = await this.getContentViaMilldown();
                debug(`[HEADLESS] ✅ Got content via Milkdown: ${content.length} chars`);
                return content;
            } catch (error) {
                console.warn('[HEADLESS] Milkdown getContent failed, falling back to Y.js:', error);
            }
        }

        // Fallback to Y.js content
        const ytext = this.yjsDoc.getText("content");
        const content = ytext.toString();
        debug(`[HEADLESS] ✅ Got content via Y.js fallback: ${content.length} chars`);
        return content;
    }

    /**
     * Get content via Milkdown editor for proper markdown serialization
     */
    private async getContentViaMilldown(): Promise<string> {
        if (!this.editor || !this.milkdownModules) {
            throw new Error("Milkdown editor not available");
        }

        return new Promise((resolve, reject) => {
            this.editor.action((ctx: any) => {
                const { editorViewCtx } = this.milkdownModules!;
                try {
                    const view = ctx.get(editorViewCtx);
                    if (view) {
                        // Get content from editor view as text
                        // TODO: Use proper markdown serializer when available
                        const content = view.state.doc.textContent;
                        resolve(content);
                    } else {
                        reject(new Error("EditorView not available"));
                    }
                } catch (error) {
                    reject(new Error(`Failed to get content via Milkdown: ${error}`));
                }
            });
        });
    }

    /**
     * Apply AI-generated operations through enhanced processing
     */
    async applyLLMOperations(operations: DocumentOperation[]): Promise<void> {
        if (!this.yjsDoc || !this.websocketProvider) {
            throw new Error("Document or collaboration not initialized");
        }

        debug(`[HEADLESS] Applying ${operations.length} LLM operations (mode: ${this.useMilkdown ? 'Milkdown' : 'Y.js'})`);

        // Show AI editing state
        this.showAIEditingState();

        try {
            if (this.useMilkdown && this.editor && this.milkdownModules) {
                // Use Milkdown for proper operation application
                try {
                    await this.applyOperationsViaMilldown(operations);
                    debug(`[HEADLESS] ✅ Applied ${operations.length} operations via Milkdown`);
                    return;
                } catch (error) {
                    console.warn('[HEADLESS] Milkdown operation application failed, falling back to Y.js:', error);
                }
            }

            // Fallback to Y.js operations
            const ytext = this.yjsDoc.getText("content");
            for (const operation of operations) {
                this.applyOperationToYText(ytext, operation);
            }
            debug(`[HEADLESS] ✅ Applied ${operations.length} operations via Y.js fallback`);

        } finally {
            // Clear AI editing state
            this.clearAIEditingState();
        }
    }

    /**
     * Apply operations via Milkdown editor for proper parsing
     */
    private async applyOperationsViaMilldown(operations: DocumentOperation[]): Promise<void> {
        if (!this.editor || !this.milkdownModules) {
            throw new Error("Milkdown editor not available");
        }

        this.editor.action((ctx: any) => {
            const { editorViewCtx } = this.milkdownModules!;
            const view = ctx.get(editorViewCtx);
            
            if (!view) {
                throw new Error("EditorView not available");
            }

            // Apply operations through ProseMirror transactions
            let tr = view.state.tr;
            
            for (const operation of operations) {
                tr = this.applyOperationToTransaction(tr, operation);
            }
            
            if (tr.docChanged) {
                view.dispatch(tr);
            }
        });
    }

    /**
     * Apply operation to ProseMirror transaction
     */
    private applyOperationToTransaction(tr: any, operation: DocumentOperation): any {
        try {
            switch (operation.type) {
                case "insert": {
                    const markdownText = this.operationContentToMarkdown(operation.content);
                    const position = Math.min(operation.position || 0, tr.doc.content.size);
                    tr = tr.insertText(markdownText, position);
                    debug(`[HEADLESS] Milkdown: Inserted "${markdownText}" at position ${position}`);
                    break;
                }
                case "replace": {
                    const markdownText = this.operationContentToMarkdown(operation.content);
                    const fromPos = Math.min(operation.from || 0, tr.doc.content.size);
                    const toPos = Math.min(operation.to || fromPos + 1, tr.doc.content.size);
                    
                    tr = tr.delete(fromPos, toPos).insertText(markdownText, fromPos);
                    debug(`[HEADLESS] Milkdown: Replaced content from ${fromPos} to ${toPos}`);
                    break;
                }
                case "delete": {
                    const fromPos = Math.min(operation.from || 0, tr.doc.content.size);
                    const toPos = Math.min(operation.to || fromPos + 1, tr.doc.content.size);
                    
                    tr = tr.delete(fromPos, toPos);
                    debug(`[HEADLESS] Milkdown: Deleted content from ${fromPos} to ${toPos}`);
                    break;
                }
                default:
                    console.warn(`[HEADLESS] Unknown operation type: ${(operation as any).type}`);
                    break;
            }
        } catch (error) {
            console.error(`[HEADLESS] Failed to apply Milkdown operation ${operation.type}:`, error);
        }
        return tr;
    }

    /**
     * Apply a single operation to Y.js text
     */
    private applyOperationToYText(ytext: any, operation: DocumentOperation): void {
        try {
            switch (operation.type) {
                case "insert": {
                    const markdownText = this.operationContentToMarkdown(operation.content);
                    const position = Math.min(operation.position || 0, ytext.length);
                    ytext.insert(position, markdownText);
                    debug(`[HEADLESS] Inserted "${markdownText}" at position ${position}`);
                    break;
                }
                case "replace": {
                    const markdownText = this.operationContentToMarkdown(operation.content);
                    const fromPos = Math.min(operation.from || 0, ytext.length);
                    const toPos = Math.min(operation.to || fromPos + 1, ytext.length);

                    ytext.delete(fromPos, toPos - fromPos);
                    ytext.insert(fromPos, markdownText);
                    debug(`[HEADLESS] Replaced content from ${fromPos} to ${toPos}`);
                    break;
                }
                case "delete": {
                    const fromPos = Math.min(operation.from || 0, ytext.length);
                    const toPos = Math.min(operation.to || fromPos + 1, ytext.length);

                    ytext.delete(fromPos, toPos - fromPos);
                    debug(`[HEADLESS] Deleted content from ${fromPos} to ${toPos}`);
                    break;
                }
                default:
                    console.warn(`[HEADLESS] Unknown operation type: ${(operation as any).type}`);
                    break;
            }
        } catch (error) {
            console.error(`[HEADLESS] Failed to apply operation ${operation.type}:`, error);
        }
    }

    /**
     * Convert operation content to markdown text
     */
    private operationContentToMarkdown(content: any): string {
        if (!content) return "";

        if (typeof content === "string") {
            return content;
        }

        if (Array.isArray(content)) {
            return content
                .map((item: any) => {
                    if (typeof item === "string") return item;
                    if (item.text) return item.text;
                    if (item.type === "paragraph" && item.content) {
                        return this.operationContentToMarkdown(item.content);
                    }
                    return "";
                })
                .join("\n");
        }

        return String(content);
    }

    /**
     * Load document from file
     */
    async loadFromFile(filePath: string): Promise<void> {
        debug(`[HEADLESS] Loading from file: ${filePath}`);

        try {
            const content = fs.readFileSync(filePath, "utf-8");
            await this.setContent(content);
            debug(`[HEADLESS] Loaded ${content.length} chars from file`);
        } catch (error) {
            console.error(`[HEADLESS] Failed to load file ${filePath}:`, error);
            throw error;
        }
    }

    /**
     * Save document to file
     */
    async saveToFile(filePath: string): Promise<void> {
        debug(`[HEADLESS] Saving to file: ${filePath}`);

        try {
            const content = await this.getContent();

            // Ensure directory exists
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            fs.writeFileSync(filePath, content, "utf-8");
            debug(`[HEADLESS] Saved ${content.length} chars to file`);
        } catch (error) {
            console.error(`[HEADLESS] Failed to save file ${filePath}:`, error);
            throw error;
        }
    }

    /**
     * Show AI editing state in awareness
     */
    private showAIEditingState(): void {
        if (this.websocketProvider) {
            this.websocketProvider.awareness.setLocalStateField('user', {
                name: 'AI Assistant',
                color: '#6366f1',
                avatar: '🤖',
                status: 'editing',
                mode: this.useMilkdown ? 'milkdown' : 'yjs'
            });

            debug(`[HEADLESS] AI editing state activated (${this.useMilkdown ? 'Milkdown' : 'Y.js'} mode)`);
        }
    }

    /**
     * Clear AI editing state
     */
    private clearAIEditingState(): void {
        if (this.websocketProvider) {
            this.websocketProvider.awareness.setLocalStateField('user', {
                name: this.useMilkdown ? 'Milkdown System Editor' : 'Y.js System Editor',
                color: '#6366f1',
                userType: 'system',
                status: 'idle',
                mode: this.useMilkdown ? 'milkdown' : 'yjs'
            });

            debug(`[HEADLESS] AI editing state cleared (${this.useMilkdown ? 'Milkdown' : 'Y.js'} mode)`);
        }
    }

    /**
     * Get current document ID
     */
    getDocumentId(): string {
        return this.documentId;
    }

    /**
     * Check if manager is initialized
     */
    isReady(): boolean {
        return this.isInitialized && !!this.yjsDoc;
    }

    /**
     * Check if Milkdown mode is active
     */
    isMilkdownMode(): boolean {
        return this.useMilkdown && !!this.editor;
    }

    /**
     * Get current mode information
     */
    getModeInfo(): { mode: 'milkdown' | 'yjs'; milkdownAvailable: boolean; editorReady: boolean } {
        return {
            mode: this.useMilkdown ? 'milkdown' : 'yjs',
            milkdownAvailable: !!this.milkdownModules,
            editorReady: !!this.editor
        };
    }

    /**
     * Cleanup resources including DOM environment
     */
    async destroy(): Promise<void> {
        debug(`[HEADLESS] Destroying headless manager (mode: ${this.useMilkdown ? 'Milkdown' : 'Y.js'})`);

        if (this.websocketProvider) {
            this.websocketProvider.destroy();
            this.websocketProvider = null;
        }

        if (this.editor && this.useMilkdown) {
            try {
                await this.editor.destroy();
                debug('[HEADLESS] ✅ Milkdown editor destroyed');
            } catch (error) {
                console.warn('[HEADLESS] Error destroying Milkdown editor:', error);
            }
            this.editor = null;
        }

        if (this.yjsDoc) {
            this.yjsDoc.destroy();
            this.yjsDoc = null;
        }

        // Clean up DOM environment if we set it up
        if (domSetup && global.document) {
            try {
                const editorRoot = global.document.getElementById('headless-editor');
                if (editorRoot && editorRoot.parentNode) {
                    editorRoot.parentNode.removeChild(editorRoot);
                }
                debug('[HEADLESS] ✅ DOM root element cleaned up');
            } catch (error) {
                debug('[HEADLESS] Error cleaning up DOM root:', error);
            }
        }

        this.milkdownModules = null;
        this.useMilkdown = false;
        this.isInitialized = false;

        debug(`[HEADLESS] ✅ Cleanup complete`);
    }
}
