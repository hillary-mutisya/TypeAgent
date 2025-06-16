// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import {
    CollaborationConfig,
    CollaborationContext,
    UserPresence,
} from "./collaborationTypes.js";

export class TypeAgentYjsProvider {
    private ydoc: Y.Doc;
    private provider: WebsocketProvider;
    private ytext: Y.Text;
    private config: CollaborationConfig;
    private context: CollaborationContext;
    private connected: boolean = false;
    private userPresence: Map<string, UserPresence> = new Map();

    constructor(config: CollaborationConfig) {
        this.config = config;

        // Create Yjs document
        this.ydoc = new Y.Doc();
        this.ytext = this.ydoc.getText("content");

        // Create websocket provider using the proven y-websocket pattern
        this.provider = new WebsocketProvider(
            config.websocketUrl,
            config.documentId,
            this.ydoc,
        );

        // Initialize collaboration context
        this.context = {
            ydoc: this.ydoc,
            provider: this.provider,
            ytext: this.ytext,
            config: this.config,
            connected: this.connected,
            userPresence: this.userPresence,
        };

        this.setupEventHandlers();
        this.setupUserPresence();
    }

    /**
     * Get the collaboration context for use by other components
     */
    getContext(): CollaborationContext {
        return this.context;
    }

    /**
     * Get the Yjs document
     */
    getDocument(): Y.Doc {
        return this.ydoc;
    }

    /**
     * Get the main text object
     */
    getText(): Y.Text {
        return this.ytext;
    }

    /**
     * Get the websocket provider
     */
    getProvider(): WebsocketProvider {
        return this.provider;
    }

    /**
     * Check if connected to collaboration server
     */
    isConnected(): boolean {
        return this.connected;
    }

    /**
     * Connect to the collaboration server
     */
    async connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error("Connection timeout"));
            }, 10000);

            const onConnect = () => {
                clearTimeout(timeout);
                this.provider.off("status", onStatusChange);
                resolve();
            };

            const onStatusChange = ({ status }: { status: string }) => {
                if (status === "connected") {
                    onConnect();
                }
            };

            this.provider.on("status", onStatusChange);

            // If already connected, resolve immediately
            if (this.connected) {
                clearTimeout(timeout);
                resolve();
            }
        });
    }

    /**
     * Disconnect from the collaboration server
     */
    disconnect(): void {
        this.provider.disconnect();
        this.connected = false;
        this.context.connected = false;
    }

    /**
     * Setup event handlers for connection and awareness
     */
    private setupEventHandlers(): void {
        // Connection status
        this.provider.on("status", ({ status }: { status: string }) => {
            console.log("Collaboration status:", status);

            this.connected = status === "connected";
            this.context.connected = this.connected;

            if (this.context.onStatusChange) {
                this.context.onStatusChange(status as any);
            }
        });

        // Document synchronization
        this.provider.on("sync", (isSynced: boolean) => {
            if (isSynced) {
                console.log("Document synchronized");
            }
        });

        // Handle connection errors
        this.provider.on("connection-error", (error: Error) => {
            console.error("Collaboration connection error:", error);
        });
    }

    /**
     * Setup user presence and awareness
     */
    private setupUserPresence(): void {
        const awareness = this.provider.awareness;

        // Set local user info
        awareness.setLocalStateField("user", {
            id: this.config.userInfo.id,
            name: this.config.userInfo.name,
            avatar: this.config.userInfo.avatar,
            color: this.config.userInfo.color,
            lastSeen: Date.now(),
            isAI: false,
        });

        // Listen for awareness changes
        awareness.on("change", ({ added, updated, removed }: any) => {
            // Handle users joining
            added.forEach((clientId: number) => {
                const user = awareness.getStates().get(clientId)
                    ?.user as UserPresence;
                if (user) {
                    this.userPresence.set(user.id, user);
                    if (this.context.onUserJoin) {
                        this.context.onUserJoin(user);
                    }
                }
            });

            // Handle users leaving
            removed.forEach((clientId: number) => {
                // Find user that was removed (simplified for now)
                // In a real implementation, we'd need better client-to-user mapping
                if (this.userPresence.size > 0) {
                    const firstUserId = this.userPresence.keys().next().value;
                    if (firstUserId && this.context.onUserLeave) {
                        this.context.onUserLeave(firstUserId);
                    }
                    this.userPresence.delete(firstUserId);
                }
            });

            // Handle user updates
            updated.forEach((clientId: number) => {
                const user = awareness.getStates().get(clientId)
                    ?.user as UserPresence;
                if (user) {
                    this.userPresence.set(user.id, user);
                }
            });
        });
    }

    /**
     * Update user cursor position
     */
    updateCursor(position: number): void {
        const awareness = this.provider.awareness;
        const currentUser = awareness.getLocalState()?.user;

        if (currentUser) {
            awareness.setLocalStateField("user", {
                ...currentUser,
                cursor: position,
                lastSeen: Date.now(),
            });
        }
    }

    /**
     * Update user selection
     */
    updateSelection(from: number, to: number): void {
        const awareness = this.provider.awareness;
        const currentUser = awareness.getLocalState()?.user;

        if (currentUser) {
            awareness.setLocalStateField("user", {
                ...currentUser,
                selection: { from, to },
                lastSeen: Date.now(),
            });
        }
    }

    /**
     * Send AI request (for future AI integration)
     */
    sendAIRequest(
        requestId: string,
        command: string,
        parameters: any,
        context: any,
    ): void {
        // For now, this is a placeholder for future AI integration
        console.log("AI request queued:", { requestId, command, parameters });

        // In future phases, this will integrate with TypeAgent's AI system
        if (this.context.onAIStatus) {
            this.context.onAIStatus({
                requestId,
                status: "started",
                description: `Processing ${command} request`,
            });
        }
    }

    /**
     * Get current document content as markdown
     */
    getMarkdownContent(): string {
        return this.ytext.toString();
    }

    /**
     * Set document content (useful for initial loading)
     */
    setMarkdownContent(content: string): void {
        // Clear existing content and set new content
        this.ytext.delete(0, this.ytext.length);
        this.ytext.insert(0, content);
    }

    /**
     * Apply text operations to the document
     */
    applyTextOperation(
        position: number,
        text: string,
        deleteLength: number = 0,
    ): void {
        if (deleteLength > 0) {
            this.ytext.delete(position, deleteLength);
        }
        if (text.length > 0) {
            this.ytext.insert(position, text);
        }
    }
}
