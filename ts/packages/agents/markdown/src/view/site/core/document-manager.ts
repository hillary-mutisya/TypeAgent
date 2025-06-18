import type { Editor } from "@milkdown/core";
import { editorViewCtx } from "@milkdown/core";
import type { SaveStatus } from "../types";
import { AI_CONFIG, DEFAULT_MARKDOWN_CONTENT } from "../config";

export class DocumentManager {
    private notificationManager: any = null;
    private editorManager: any = null;

    public setNotificationManager(notificationManager: any): void {
        this.notificationManager = notificationManager;
    }

    public setEditorManager(editorManager: any): void {
        this.editorManager = editorManager;
    }

    public getEditorManager(): any {
        return this.editorManager;
    }

    public async saveDocument(editor?: Editor): Promise<void> {
        try {
            this.showSaveStatus("saving");

            // Get markdown content from editor or server
            const content = editor
                ? await this.getMarkdownContent(editor)
                : await this.loadContentFromServer();

            const response = await fetch(AI_CONFIG.ENDPOINTS.DOCUMENT, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content }),
            });

            if (!response.ok) {
                throw new Error(`Save failed: ${response.status}`);
            }

            this.showSaveStatus("saved");
        } catch (error) {
            console.error("Failed to save document:", error);
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
            const response = await fetch(AI_CONFIG.ENDPOINTS.DOCUMENT);
            if (response.ok) {
                return await response.text();
            } else {
                return this.getDefaultContent();
            }
        } catch (error) {
            console.error("Failed to load initial content:", error);
            return this.getDefaultContent();
        }
    }

    private async loadContentFromServer(): Promise<string> {
        const response = await fetch(AI_CONFIG.ENDPOINTS.DOCUMENT);
        if (response.ok) {
            return await response.text();
        }
        throw new Error("Failed to load content from server");
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
            const response = await fetch(AI_CONFIG.ENDPOINTS.DOCUMENT);
            if (response.ok) {
                return await response.text();
            }
            throw new Error("Failed to fetch document content");
        } catch (error) {
            console.error("Failed to get document content:", error);
            throw error;
        }
    }

    public async setDocumentContent(content: string): Promise<void> {
        try {
            const response = await fetch(AI_CONFIG.ENDPOINTS.DOCUMENT, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content }),
            });

            if (!response.ok) {
                throw new Error(`Failed to set document content: ${response.status}`);
            }
            
            // Don't reload the whole page, just notify the editor will update via collaboration
            console.log("Document content updated successfully");
        } catch (error) {
            console.error("Failed to set document content:", error);
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
            
            // Update the editor content directly
            if (this.editorManager) {
                await this.editorManager.setContent(content);
            }
            
            // Also update the server-side content
            await this.setDocumentContent(content);
            
            // Extract document name from filename (without extension)
            const documentName = file.name.replace(/\.(md|markdown)$/i, "");
            
            // Update browser URL to reflect the new document
            const newUrl = `/document/${encodeURIComponent(documentName)}`;
            window.history.pushState({ documentName }, `${documentName} - AI-Enhanced Markdown Editor`, newUrl);
            document.title = `${documentName} - AI-Enhanced Markdown Editor`;
            
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
}
