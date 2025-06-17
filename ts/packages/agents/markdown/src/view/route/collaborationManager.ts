// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as Y from "yjs";
import { WebSocket } from "ws";

/**
 * Server-side collaboration manager for handling Yjs synchronization
 * This works alongside the y-websocket-server for custom TypeAgent features
 */
export class CollaborationManager {
    private documents: Map<string, Y.Doc> = new Map();
    private clients: Map<string, WebSocket[]> = new Map();
    private documentPaths: Map<string, string> = new Map();

    /**
     * Initialize collaboration for a document
     */
    initializeDocument(documentId: string, filePath: string): void {
        if (!this.documents.has(documentId)) {
            const ydoc = new Y.Doc();
            this.documents.set(documentId, ydoc);
            this.documentPaths.set(documentId, filePath);
            this.clients.set(documentId, []);

            console.log(`📄 Initialized collaboration document: ${documentId}`);
        }
    }

    /**
     * Get collaboration statistics
     */
    getStats(): any {
        return {
            documents: this.documents.size,
            totalClients: Array.from(this.clients.values()).reduce(
                (sum, clients) => sum + clients.length,
                0,
            ),
            documentsWithClients: Array.from(this.clients.entries()).filter(
                ([_, clients]) => clients.length > 0,
            ).length,
        };
    }

    /**
     * Apply operation to Yjs document (NEW for Flow 1 simplification)
     */
    applyOperation(operation: any): void {
        // For now, we'll implement this as a basic operation applier
        // This will be enhanced based on the DocumentOperation type
        console.log("📝 [COLLAB] Applying operation:", operation.type);
        
        // TODO: Implement actual operation application to Yjs
        // This is a placeholder for the enhanced implementation
    }

    /**
     * Get document content as string (SINGLE SOURCE OF TRUTH)
     */
    getDocumentContent(documentId: string): string {
        const ydoc = this.documents.get(documentId);
        if (!ydoc) {
            console.warn(`No document found for ID: ${documentId}, returning empty content`);
            return "";
        }
        
        const ytext = ydoc.getText("content");
        return ytext.toString(); // Yjs is the authoritative source
    }

    /**
     * Get document content as string
     */
    getDocumentContent(documentId: string): string {
        const ydoc = this.documents.get(documentId);
        if (ydoc) {
            const ytext = ydoc.getText("content");
            return ytext.toString();
        }
        return "";
    }

    /**
     * Set document content from string
     */
    setDocumentContent(documentId: string, content: string): void {
        let ydoc = this.documents.get(documentId);
        if (!ydoc) {
            this.initializeDocument(documentId, documentId + ".md");
            ydoc = this.documents.get(documentId)!;
        }

        const ytext = ydoc.getText("content");
        ytext.delete(0, ytext.length);
        ytext.insert(0, content);
    }
}
