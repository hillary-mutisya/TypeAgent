import type { Editor } from "@milkdown/core";
import { editorViewCtx, parserCtx } from "@milkdown/core";
import type { SaveStatus } from "../types";
import { AI_CONFIG, DEFAULT_MARKDOWN_CONTENT } from "../config";

export class DocumentManager {
    private notificationManager: any = null;
    private editorManager: any = null;
    private eventSource: EventSource | null = null;

    public setNotificationManager(notificationManager: any): void {
        this.notificationManager = notificationManager;
    }

    public setEditorManager(editorManager: any): void {
        this.editorManager = editorManager;
    }

    public getEditorManager(): any {
        return this.editorManager;
    }

    public getCollaborationManager(): any {
        return this.editorManager?.getCollaborationManager();
    }

    public async initialize(): Promise<void> {
        // Set up SSE connection for document change notifications
        this.setupSSEConnection();
    }

    private setupSSEConnection(): void {
        try {
            this.eventSource = new EventSource('/events');
            
            this.eventSource.onopen = () => {
                console.log('📡 [SSE] Connected to server events');
            };
            
            this.eventSource.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleSSEEvent(data);
                } catch (error) {
                    console.error('❌ [SSE] Failed to parse event data:', error);
                    console.error('❌ [SSE] Raw event data:', event.data?.substring(0, 100) + '...');
                    // Don't crash on parse errors - just log and continue
                }
            };
            
            this.eventSource.onerror = (error) => {
                console.error('❌ [SSE] Connection error:', error);
                // Reconnect after a delay
                setTimeout(() => {
                    if (this.eventSource?.readyState === EventSource.CLOSED) {
                        console.log('🔄 [SSE] Reconnecting...');
                        this.setupSSEConnection();
                    }
                }, 5000);
            };
            
        } catch (error) {
            console.error('❌ [SSE] Failed to setup connection:', error);
        }
    }

    private async handleSSEEvent(data: any): Promise<void> {
        console.log('📡 [SSE] Received event:', data.type, data);
        
        switch (data.type) {
            case 'documentChanged':
                console.log(`🔄 [SSE] Document changed to: ${data.newDocumentId}`);
                await this.handleDocumentChangeFromBackend(data.newDocumentId, data.newDocumentName);
                break;
                
            case 'documentUpdated':
                console.log(`📄 [SSE] Document updated: ${data.documentName}`);
                console.log(`📄 [SSE] Document updated timestamp: ${data.timestamp}`);
                
                // Document content was updated - WebSocket should handle the sync
                // But let's add a fallback check in case WebSocket fails
                if (this.editorManager) {
                    console.log(`🔍 [SSE-FALLBACK] Checking WebSocket connection status...`);
                    const collaborationManager = this.getCollaborationManager();
                    
                    if (collaborationManager && !collaborationManager.isConnected()) {
                        console.log(`⚠️ [SSE-FALLBACK] WebSocket disconnected, triggering content refresh from SSE event`);
                        
                        // Fallback: manually refresh content from server
                        try {
                            const currentContent = await this.getDocumentContent();
                            // Note: We don't set content directly to avoid conflicts, just log for debugging
                            console.log(`📡 [SSE-FALLBACK] Server has ${currentContent.length} chars available for sync`);
                            
                            if (this.notificationManager) {
                                this.notificationManager.showNotification(
                                    "📡 Document updated (WebSocket reconnecting...)",
                                    "info"
                                );
                            }
                        } catch (error) {
                            console.error(`❌ [SSE-FALLBACK] Failed to refresh content:`, error);
                        }
                    } else {
                        console.log(`✅ [SSE] WebSocket connected - no fallback needed`);
                    }
                } else {
                    console.log(`⚠️ [SSE] No editor manager available for WebSocket status check`);
                }
                break;
                
            case 'autoSave':
                console.log(`💾 [SSE] Auto-save completed for: ${data.filePath}`);
                // Show brief save notification
                if (this.notificationManager) {
                    this.notificationManager.showNotification(
                        `💾 Auto-saved: ${data.filePath}`,
                        "info"
                    );
                }
                break;
                
            case 'autoSaveError':
                console.error(`❌ [SSE] Auto-save error: ${data.error}`);
                if (this.notificationManager) {
                    this.notificationManager.showNotification(
                        `❌ Auto-save failed: ${data.error}`,
                        "error"
                    );
                }
                break;

            case 'llmOperations':
                // PRODUCTION: Handle LLM operations sent to PRIMARY client only via SSE
                console.log(`🎯 [SSE] Received ${data.operations?.length || 0} LLM operations from ${data.source} (role: ${data.clientRole || 'unknown'})`);
                
                // LOG DETAILED OPERATION OBJECTS
                if (data.operations && Array.isArray(data.operations)) {
                    console.log(`📋 [SSE-DEBUG] Detailed operation objects:`);
                    data.operations.forEach((operation: any, index: number) => {
                        console.log(`📋 [SSE-DEBUG] Operation ${index + 1}:`, {
                            type: operation.type,
                            position: operation.position,
                            from: operation.from,
                            to: operation.to,
                            content: operation.content,
                            description: operation.description,
                            fullOperation: operation
                        });
                        
                        // Log content structure in detail
                        if (operation.content) {
                            console.log(`📋 [SSE-DEBUG] Operation ${index + 1} content structure:`, JSON.stringify(operation.content, null, 2));
                        }
                    });
                }
                
                if (data.clientRole === 'primary' && data.operations && Array.isArray(data.operations) && this.editorManager) {
                    try {
                        // Apply operations through editor API for proper markdown parsing
                        const editor = this.editorManager.getEditor();
                        if (editor) {
                            console.log(`📝 [SSE-DEBUG] About to apply ${data.operations.length} operations through editor API`);
                            await this.applyOperationsThroughEditor(editor, data.operations);
                            console.log(`✅ [SSE] PRIMARY CLIENT applied ${data.operations.length} operations via editor API`);
                            
                            if (this.notificationManager) {
                                this.notificationManager.showNotification(
                                    `✨ AI updated document with ${data.operations.length} changes`,
                                    "success"
                                );
                            }
                        } else {
                            console.warn(`⚠️ [SSE] No editor available to apply operations`);
                        }
                    } catch (error) {
                        console.error(`❌ [SSE] Failed to apply LLM operations:`, error);
                        if (this.notificationManager) {
                            this.notificationManager.showNotification(
                                `❌ Failed to apply AI changes`,
                                "error"
                            );
                        }
                    }
                } else if (data.clientRole !== 'primary') {
                    console.log(`ℹ️ [SSE] Ignoring operations - not the primary client (role: ${data.clientRole || 'unknown'})`);
                } else {
                    console.warn(`⚠️ [SSE] Invalid LLM operations received:`, data);
                }
                break;

            case 'operationsBeingApplied':
                // Handle notification that operations are being applied by primary client
                console.log(`📢 [SSE] Operations being applied by primary client - ${data.operationCount} changes incoming`);
                
                if (this.notificationManager) {
                    this.notificationManager.showNotification(
                        `🔄 AI is updating document (${data.operationCount} changes)...`,
                        "info"
                    );
                }
                break;
                
            default:
                // Log unknown event types for debugging
                console.log(`📡 [SSE] Unknown event type: ${data.type}`, data);
                break;
        }
    }

    private async handleDocumentChangeFromBackend(documentId: string, documentName: string): Promise<void> {
        try {
            console.log(`🔄 [DOCUMENT] Backend switched to: ${documentName}, reconnecting frontend...`);
            
            // Get content from server with URL logging
            const documentUrl = AI_CONFIG.ENDPOINTS.DOCUMENT;
            console.log(`📡 [HTTP-REQUEST] GET ${documentUrl} - Fetching document content for: ${documentName}`);
            
            const response = await fetch(documentUrl);
            console.log(`📡 [HTTP-RESPONSE] GET ${documentUrl} - Status: ${response.status} ${response.statusText}`);
            
            const content = response.ok ? await response.text() : "";
            console.log(`📡 [HTTP-CONTENT] GET ${documentUrl} - Content length: ${content.length} chars`);
            
            // Switch editor collaboration to new document room
            if (this.editorManager) {
                await this.editorManager.switchToDocument(documentId, content);
                console.log(`✅ [DOCUMENT] Frontend switched to document: "${documentId}"`);
            }
            
            // Update page title and URL  
            document.title = `${documentName} - AI-Enhanced Markdown Editor`;
            const newUrl = `/document/${encodeURIComponent(documentName)}`;
            window.history.pushState({ documentName }, document.title, newUrl);
            
            if (this.notificationManager) {
                this.notificationManager.showNotification(
                    `📄 Switched to: ${documentName}`,
                    "success"
                );
            }
            
        } catch (error) {
            console.error("❌ [DOCUMENT] Failed to handle backend document change:", error);
        }
    }

    public destroy(): void {
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }
    }

    public async saveDocument(editor?: Editor): Promise<void> {
        try {
            this.showSaveStatus("saving");

            // Get markdown content from editor or server
            const content = editor
                ? await this.getMarkdownContent(editor)
                : await this.loadContentFromServer();

            const saveUrl = AI_CONFIG.ENDPOINTS.DOCUMENT;
            console.log(`📡 [HTTP-REQUEST] POST ${saveUrl} - Saving document content (${content.length} chars)`);

            const response = await fetch(saveUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content }),
            });

            console.log(`📡 [HTTP-RESPONSE] POST ${saveUrl} - Status: ${response.status} ${response.statusText}`);

            if (!response.ok) {
                throw new Error(`Save failed: ${response.status}`);
            }

            console.log(`✅ [DOCUMENT] Document saved successfully via POST ${saveUrl}`);
            this.showSaveStatus("saved");
        } catch (error) {
            console.error("❌ [DOCUMENT] Failed to save document:", error);
            this.showSaveStatus("error");
            throw error;
        }
    }

    public async getMarkdownContent(editor: Editor): Promise<string> {
        if (!editor) return "";

        try {
            // Get content directly from editor first (most current state)
            const editorContent = await new Promise<string>((resolve) => {
                editor.action((ctx) => {
                    const view = ctx.get(editorViewCtx);
                    resolve(view.state.doc.textContent || "");
                });
            });
            
            if (editorContent) {
                console.log("📄 [DOCUMENT] Got content from live editor:", editorContent.length, "chars");
                
                return editorContent;
            }
        } catch (error) {
            console.warn("Failed to get content from editor:", error);
        }

        try {
            // Fallback to server content if editor content is empty
            const response = await fetch(AI_CONFIG.ENDPOINTS.DOCUMENT);
            if (response.ok) {
                const serverContent = await response.text();
                console.log("📄 [DOCUMENT] Fallback to server content:", serverContent.length, "chars");
                return serverContent;
            }
        } catch (error) {
            console.warn("Failed to fetch document from server:", error);
        }

        return "";
    }

    public async loadInitialContent(): Promise<string> {
        try {
            const documentUrl = AI_CONFIG.ENDPOINTS.DOCUMENT;
            console.log(`📡 [HTTP-REQUEST] GET ${documentUrl} - Loading initial document content`);
            
            const response = await fetch(documentUrl);
            console.log(`📡 [HTTP-RESPONSE] GET ${documentUrl} - Status: ${response.status} ${response.statusText}`);
            
            if (response.ok) {
                const content = await response.text();
                console.log(`📡 [HTTP-CONTENT] GET ${documentUrl} - Initial content loaded: ${content.length} chars`);
                return content;
            } else {
                console.log(`⚠️ [DOCUMENT] GET ${documentUrl} failed, using default content`);
                return this.getDefaultContent();
            }
        } catch (error) {
            console.error("❌ [DOCUMENT] Failed to load initial content:", error);
            return this.getDefaultContent();
        }
    }

    private async loadContentFromServer(): Promise<string> {
        const documentUrl = AI_CONFIG.ENDPOINTS.DOCUMENT;
        console.log(`📡 [HTTP-REQUEST] GET ${documentUrl} - Loading content from server`);
        
        const response = await fetch(documentUrl);
        console.log(`📡 [HTTP-RESPONSE] GET ${documentUrl} - Status: ${response.status} ${response.statusText}`);
        
        if (response.ok) {
            const content = await response.text();
            console.log(`📡 [HTTP-CONTENT] GET ${documentUrl} - Server content loaded: ${content.length} chars`);
            return content;
        }
        throw new Error(`Failed to load content from server: ${response.status} ${response.statusText}`);
    }

    private getDefaultContent(): string {
        // Import from config - use the exported constant
        return DEFAULT_MARKDOWN_CONTENT;
    }

    private showSaveStatus(status: SaveStatus): void {
        if (this.notificationManager) {
            this.notificationManager.showSaveStatus(status);
        }
    }

    public async getDocumentContent(): Promise<string> {
        try {
            const documentUrl = AI_CONFIG.ENDPOINTS.DOCUMENT;
            console.log(`📡 [HTTP-REQUEST] GET ${documentUrl} - Getting current document content`);
            
            const response = await fetch(documentUrl);
            console.log(`📡 [HTTP-RESPONSE] GET ${documentUrl} - Status: ${response.status} ${response.statusText}`);
            
            if (response.ok) {
                const content = await response.text();
                console.log(`📡 [HTTP-CONTENT] GET ${documentUrl} - Current content: ${content.length} chars`);
                return content;
            }
            throw new Error(`Failed to fetch document content: ${response.status} ${response.statusText}`);
        } catch (error) {
            console.error("❌ [DOCUMENT] Failed to get document content:", error);
            throw error;
        }
    }

    public async setDocumentContent(content: string): Promise<void> {
        try {
            const saveUrl = AI_CONFIG.ENDPOINTS.DOCUMENT;
            console.log(`📡 [HTTP-REQUEST] POST ${saveUrl} - Setting document content (${content.length} chars)`);
            
            const response = await fetch(saveUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content }),
            });

            console.log(`📡 [HTTP-RESPONSE] POST ${saveUrl} - Status: ${response.status} ${response.statusText}`);

            if (!response.ok) {
                throw new Error(`Failed to set document content: ${response.status} ${response.statusText}`);
            }
            
            console.log(`✅ [DOCUMENT] Document content updated successfully via POST ${saveUrl}`);
            // Don't reload the whole page, just notify the editor will update via collaboration
            console.log("📄 [DOCUMENT] Content set - WebSocket collaboration will sync changes");
        } catch (error) {
            console.error("❌ [DOCUMENT] Failed to set document content:", error);
            throw error;
        }
    }

    public async loadFileFromDisk(file: File): Promise<void> {
        try {
            // Check if there's unsaved content
            const hasUnsavedChanges = await this.hasUnsavedChanges();
            
            if (hasUnsavedChanges) {
                const shouldSave = confirm(
                    "You have unsaved changes. Do you want to save the current document before opening a new file?"
                );
                
                if (shouldSave) {
                    // Save current document first
                    await this.saveDocument(this.editorManager?.getEditor());
                }
            }
            
            // Read the file content
            const content = await file.text();
            
            // Extract document name from filename (without extension)
            const documentName = file.name.replace(/\.(md|markdown)$/i, "");
            
            // Switch to the new document (this handles collaboration reconnection)
            await this.switchToDocument(documentName);
            
            // Set the file content (after switching rooms)
            if (this.editorManager) {
                await this.editorManager.setContent(content);
            }
            
            // Also update the server-side content
            await this.setDocumentContent(content);
            
            if (this.notificationManager) {
                this.notificationManager.showNotification(
                    `📁 Loaded: ${file.name}`,
                    "success"
                );
            }
        } catch (error) {
            console.error("Failed to load file:", error);
            if (this.notificationManager) {
                this.notificationManager.showNotification(
                    "❌ Failed to load file",
                    "error"
                );
            }
            throw error;
        }
    }

    public async switchToDocument(documentName: string): Promise<void> {
        try {
            const switchUrl = "/api/switch-document";
            console.log(`📡 [HTTP-REQUEST] POST ${switchUrl} - Switching to document: ${documentName}`);
            
            // Call server to switch document
            const response = await fetch(switchUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ documentName }),
            });

            console.log(`📡 [HTTP-RESPONSE] POST ${switchUrl} - Status: ${response.status} ${response.statusText}`);

            if (!response.ok) {
                throw new Error(`Failed to switch document: ${response.status} ${response.statusText}`);
            }

            const result = await response.json();
            console.log(`📡 [HTTP-CONTENT] POST ${switchUrl} - Response:`, result);
            console.log(`📄 [DOCUMENT] Server switched to: ${documentName}`, result);
            
            // Switch editor collaboration to new document room
            if (this.editorManager) {
                const documentId = documentName; // Document ID is same as document name (without .md)
                await this.editorManager.switchToDocument(documentId, result.content);
                console.log(`✅ [DOCUMENT] Editor switched to document: "${documentId}"`);
            }
            
            // Update page title and URL
            document.title = `${documentName} - AI-Enhanced Markdown Editor`;
            const newUrl = `/document/${encodeURIComponent(documentName)}`;
            window.history.pushState({ documentName }, document.title, newUrl);
            
        } catch (error) {
            console.error("❌ [DOCUMENT] Failed to switch document:", error);
            throw error;
        }
    }

    private async hasUnsavedChanges(): Promise<boolean> {
        try {
            if (!this.editorManager) return false;
            
            // Get current editor content
            const currentContent = await this.getMarkdownContent(this.editorManager.getEditor());
            
            // Get server content
            const serverContent = await this.getDocumentContent();
            
            // Compare content (normalize line endings)
            const normalizeContent = (str: string) => str.replace(/\r\n/g, '\n').trim();
            
            return normalizeContent(currentContent) !== normalizeContent(serverContent);
        } catch (error) {
            console.warn("Could not check for unsaved changes:", error);
            return false; // Assume no changes if we can't check
        }
    }

    /**
     * Apply operations through the editor API for proper markdown parsing and DOM updates
     */
    private async applyOperationsThroughEditor(editor: any, operations: any[]): Promise<void> {
        console.log(`📝 [EDITOR-API] Applying ${operations.length} operations through editor`);
        
        // LOG EACH OPERATION BEFORE PROCESSING
        operations.forEach((operation: any, index: number) => {
            console.log(`📝 [EDITOR-API-DEBUG] Processing operation ${index + 1}/${operations.length}:`, {
                type: operation.type,
                position: operation.position,
                from: operation.from,
                to: operation.to,
                content: operation.content,
                description: operation.description
            });
        });
        
        await editor.action((ctx: any) => {
            const view = ctx.get(editorViewCtx);
            const parser = ctx.get(parserCtx);
            let tr = view.state.tr;

            console.log(`📝 [EDITOR-API-DEBUG] Current document size: ${view.state.doc.content.size} chars`);

            for (const operation of operations) {
                console.log(`📝 [EDITOR-API] Applying operation: ${operation.type} at position ${operation.position || 0}`);
                
                try {
                    switch (operation.type) {
                        case "insert": {
                            // Convert operation content to markdown text
                            const markdownText = this.operationContentToMarkdown(operation.content);
                            console.log(`📝 [EDITOR-API-DEBUG] Converted content to markdown: "${markdownText}"`);
                            
                            const position = Math.min(operation.position || 0, view.state.doc.content.size);
                            console.log(`📝 [EDITOR-API-DEBUG] Calculated position: ${position} (requested: ${operation.position || 0}, max: ${view.state.doc.content.size})`);
                            
                            // Parse markdown to ProseMirror nodes
                            const doc = parser(markdownText);
                            if (doc && doc.content) {
                                console.log(`📝 [EDITOR-API-DEBUG] Parsed markdown to ProseMirror nodes:`, doc.content.toString());
                                tr = tr.insert(position, doc.content);
                                console.log(`✅ [EDITOR-API] Inserted "${markdownText}" at position ${position}`);
                            } else {
                                console.warn(`⚠️ [EDITOR-API] Failed to parse markdown: "${markdownText}"`);
                            }
                            break;
                        }
                        case "replace": {
                            const markdownText = this.operationContentToMarkdown(operation.content);
                            console.log(`📝 [EDITOR-API-DEBUG] Replace operation - markdown: "${markdownText}"`);
                            
                            const fromPos = Math.min(operation.from || 0, view.state.doc.content.size);
                            const toPos = Math.min(operation.to || fromPos + 1, view.state.doc.content.size);
                            console.log(`📝 [EDITOR-API-DEBUG] Replace positions: from ${fromPos} to ${toPos}`);
                            
                            // Parse markdown to ProseMirror nodes
                            const doc = parser(markdownText);
                            if (doc && doc.content) {
                                tr = tr.replaceWith(fromPos, toPos, doc.content);
                                console.log(`✅ [EDITOR-API] Replaced content from ${fromPos} to ${toPos} with "${markdownText}"`);
                            }
                            break;
                        }
                        case "delete": {
                            const fromPos = Math.min(operation.from || 0, view.state.doc.content.size);
                            const toPos = Math.min(operation.to || fromPos + 1, view.state.doc.content.size);
                            console.log(`📝 [EDITOR-API-DEBUG] Delete operation: from ${fromPos} to ${toPos}`);
                            
                            tr = tr.delete(fromPos, toPos);
                            console.log(`✅ [EDITOR-API] Deleted content from ${fromPos} to ${toPos}`);
                            break;
                        }
                        default:
                            console.warn(`❌ [EDITOR-API] Unknown operation type: ${operation.type}`);
                            break;
                    }
                } catch (operationError) {
                    console.error(`❌ [EDITOR-API] Failed to apply operation ${operation.type}:`, operationError);
                }
            }

            // Dispatch all changes in a single transaction
            if (tr.docChanged) {
                console.log(`📝 [EDITOR-API-DEBUG] Dispatching transaction with ${operations.length} operations`);
                view.dispatch(tr);
                console.log(`✅ [EDITOR-API] Applied ${operations.length} operations successfully`);
                console.log(`📝 [EDITOR-API-DEBUG] New document size: ${view.state.doc.content.size} chars`);
            } else {
                console.log(`ℹ️ [EDITOR-API] No document changes to apply`);
            }
        });
    }

    /**
     * Convert operation content array to markdown text
     */
    private operationContentToMarkdown(content: any[]): string {
        console.log(`🔄 [CONTENT-CONVERT] Converting content to markdown:`, content);
        
        if (!Array.isArray(content)) {
            const result = String(content || "");
            console.log(`🔄 [CONTENT-CONVERT] Non-array content converted to: "${result}"`);
            return result;
        }

        const result = content.map((item: any, index: number) => {
            console.log(`🔄 [CONTENT-CONVERT] Processing item ${index + 1}:`, item);
            
            if (typeof item === "string") {
                console.log(`🔄 [CONTENT-CONVERT] Item ${index + 1} is string: "${item}"`);
                return item;
            }
            
            if (item && typeof item === "object") {
                // Handle different content types
                switch (item.type) {
                    case "heading":
                        const level = item.level || 1;
                        const headingText = this.extractTextFromContent(item.content);
                        const result = "#".repeat(level) + " " + headingText;
                        console.log(`🔄 [CONTENT-CONVERT] Heading (level ${level}): "${result}"`);
                        return result;
                        
                    case "paragraph":
                        const paragraphText = this.extractTextFromContent(item.content || item.text);
                        
                        console.log(`🔄 [CONTENT-CONVERT] Paragraph: "${paragraphText}"`);
                        return paragraphText;
                        
                    case "text":
                        const textResult = item.text || "";
                        console.log(`🔄 [CONTENT-CONVERT] Text: "${textResult}"`);
                        return textResult;
                        
                    default:
                        // Fallback: extract any text content
                        const fallbackResult = this.extractTextFromContent(item.content) || item.text || "";
                        console.log(`🔄 [CONTENT-CONVERT] Fallback for type "${item.type}": "${fallbackResult}"`);
                        return fallbackResult;
                }
            }
            
            const stringResult = String(item || "");
            console.log(`🔄 [CONTENT-CONVERT] Item ${index + 1} stringified: "${stringResult}"`);
            return stringResult;
        }).join("\n");

        console.log(`🔄 [CONTENT-CONVERT] Final markdown result: "${result}"`);
        return result;
    }

    /**
     * Extract plain text from nested content structures
     */
    private extractTextFromContent(content: any): string {
        if (!content) return "";
        
        if (typeof content === "string") {
            return content;
        }
        
        if (Array.isArray(content)) {
            return content.map(item => this.extractTextFromContent(item)).join("");
        }
        
        if (content.text) {
            return content.text;
        }
        
        if (content.content) {
            return this.extractTextFromContent(content.content);
        }
        
        return "";
    }
}
