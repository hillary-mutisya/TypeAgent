import { Doc } from "yjs";
import { WebsocketProvider } from "y-websocket";
import type { CollaborationInfo, CollaborationConfig } from "../types";
import { COLLABORATION_CONFIG } from "../config";
import { createCollaborationStatusElement } from "../utils";

export class CollaborationManager {
    private yjsDoc: Doc | null = null;
    private websocketProvider: WebsocketProvider | null = null;
    private config: CollaborationConfig | null = null;

    public async reconnectToDocument(newDocumentId: string): Promise<void> {
        console.log(`🔄 [COLLAB] Reconnecting to document: "${newDocumentId}"`);
        
        // Destroy existing connection
        if (this.websocketProvider) {
            console.log(`🔌 [COLLAB] Disconnecting from previous room`);
            this.websocketProvider.destroy();
            this.websocketProvider = null;
        }
        
        if (this.yjsDoc) {
            this.yjsDoc.destroy();
            this.yjsDoc = null;
        }
        
        // Create new Y.js document for the new room
        this.yjsDoc = new Doc();
        
        // Get the WebSocket server URL (should be same as before)
        const config = await this.getCollaborationConfig();
        
        // Create new WebSocket provider for the new document
        console.log(`🔄 [COLLAB] Connecting to WebSocket: ${config.websocketServerUrl} with documentId: "${newDocumentId}"`);
        
        this.websocketProvider = new WebsocketProvider(
            config.websocketServerUrl,
            newDocumentId,
            this.yjsDoc,
        );
        
        // Setup connection status monitoring for new connection
        this.setupCollaborationStatus(this.websocketProvider);
        
        console.log(`✅ [COLLAB] Reconnected to document: "${newDocumentId}"`);
        console.log(JSON.stringify(this.yjsDoc))
    }

    public async initialize(): Promise<void> {
        console.log("🔄 Initializing Collaboration Manager...");

        try {
            // Get collaboration configuration
            this.config = await this.getCollaborationConfig();

            // Create Yjs document
            this.yjsDoc = new Doc();

            // Create WebSocket provider
            console.log(`🔄 [FRONTEND] Connecting to WebSocket: ${this.config.websocketServerUrl} with documentId: "${this.config.documentId}"`);
            
            this.websocketProvider = new WebsocketProvider(
                this.config.websocketServerUrl,
                this.config.documentId,
                this.yjsDoc,
            );

            // Setup connection status monitoring
            this.setupCollaborationStatus(this.websocketProvider);

            console.log(
                "✅ Collaboration initialized for document:",
                this.config.documentId,
            );

            console.log(JSON.stringify(this.yjsDoc))
        } catch (error) {
            console.error("❌ Failed to initialize collaboration:", error);
            console.log("⚠️ Continuing without collaboration features");

            if (this.config?.fallbackToLocal) {
                // Create a local-only Yjs document as fallback
                this.yjsDoc = new Doc();
            }
        }
    }

    private async getCollaborationConfig(): Promise<CollaborationConfig> {
        try {
            const response = await fetch("/collaboration/info");
            if (response.ok) {
                const collabInfo: CollaborationInfo = await response.json();
                console.log("🔄 Initializing collaboration:", collabInfo);

                return {
                    websocketServerUrl:
                        collabInfo.websocketServerUrl ||
                        COLLABORATION_CONFIG.DEFAULT_WEBSOCKET_URL,
                    documentId: collabInfo.currentDocument
                        ? collabInfo.currentDocument.replace(".md", "")
                        : COLLABORATION_CONFIG.DEFAULT_DOCUMENT_ID,
                    fallbackToLocal: true,
                };
            } else {
                throw new Error(`Server returned ${response.status}`);
            }
        } catch (fetchError) {
            console.warn(
                "⚠️ Could not get collaboration info from server, using defaults:",
                fetchError,
            );

            // Use default configuration if server endpoint is not available
            return {
                websocketServerUrl: COLLABORATION_CONFIG.DEFAULT_WEBSOCKET_URL,
                documentId: COLLABORATION_CONFIG.DEFAULT_DOCUMENT_ID,
                fallbackToLocal: true,
            };
        }
    }

    private setupCollaborationStatus(provider: WebsocketProvider): void {
        const statusElement =
            document.getElementById("collaboration-status") ||
            createCollaborationStatusElement();

        provider.on("status", ({ status }: { status: string }) => {
            console.log("Collaboration status:", status);

            statusElement.className = `collaboration-status ${status}`;

            this.updateStatusDisplay(statusElement, status);
        });

        provider.on("sync", (isSynced: boolean) => {
            if (isSynced) {
                console.log("📄 Document synchronized");
                console.log(JSON.stringify(this.yjsDoc))


                statusElement.textContent = "📄 Document synchronized";
                statusElement.className = "collaboration-status connected";
                statusElement.style.display = "block";
                setTimeout(() => {
                    statusElement.style.display = "none";
                }, 3000);
            }
        });
    }

    private updateStatusDisplay(
        statusElement: HTMLElement,
        status: string,
    ): void {
        const hideDelay = 3000; // From constants

        switch (status) {
            case "connected":
                statusElement.textContent =
                    "🔄 Connected to collaboration server";
                statusElement.style.display = "block";
                setTimeout(() => {
                    statusElement.style.display = "none";
                }, hideDelay);
                break;
            case "disconnected":
                statusElement.textContent =
                    "❌ Disconnected from collaboration server";
                statusElement.style.display = "block";
                break;
            case "connecting":
                statusElement.textContent =
                    "🔄 Connecting to collaboration server...";
                statusElement.style.display = "block";
                break;
        }
    }

    public getYjsDoc(): Doc | null {
        return this.yjsDoc;
    }

    public getWebsocketProvider(): WebsocketProvider | null {
        return this.websocketProvider;
    }

    public isConnected(): boolean {
        return this.websocketProvider?.wsconnected || false;
    }

    public destroy(): void {
        if (this.websocketProvider) {
            this.websocketProvider.destroy();
            this.websocketProvider = null;
        }

        if (this.yjsDoc) {
            this.yjsDoc.destroy();
            this.yjsDoc = null;
        }
    }
}
