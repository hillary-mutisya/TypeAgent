import type { Editor } from "@milkdown/core";
import { editorViewCtx } from "@milkdown/core";
import type { SaveStatus } from "../types";
import { AI_CONFIG } from "../config";

export class DocumentManager {
    private notificationManager: any = null;

    public setNotificationManager(notificationManager: any): void {
        this.notificationManager = notificationManager;
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
            // First try to get content from server (most accurate)
            const response = await fetch(AI_CONFIG.ENDPOINTS.DOCUMENT);
            if (response.ok) {
                return await response.text();
            }
        } catch (error) {
            console.warn("Failed to fetch document from server:", error);
        }

        // Fallback to editor content
        return new Promise((resolve) => {
            editor.action((ctx) => {
                const view = ctx.get(editorViewCtx);
                resolve(view.state.doc.textContent || "");
            });
        });
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
        // Import from config
        const { DEFAULT_MARKDOWN_CONTENT } = require("../config");
        return DEFAULT_MARKDOWN_CONTENT;
    }

    private showSaveStatus(status: SaveStatus): void {
        if (this.notificationManager) {
            this.notificationManager.showSaveStatus(status);
        }
    }
}
