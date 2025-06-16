import type { Editor } from "@milkdown/core";
import { EDITOR_CONFIG } from "../config";
import { getElementById, addClass, removeClass, hasClass } from "../utils";

export class PanelManager {
    private editor: Editor | null = null;

    public async initialize(): Promise<void> {
        console.log("📋 Initializing Panel Manager...");

        this.setupRawMarkdownPanel();
        this.restoreRawMarkdownPanelState();
    }

    public setEditor(editor: Editor): void {
        this.editor = editor;
    }

    private setupRawMarkdownPanel(): void {
        const closeButton = getElementById("close-raw-panel");
        if (closeButton) {
            closeButton.addEventListener("click", () => {
                this.hideRawMarkdownPanel();
            });
        }
    }

    public toggleRawMarkdownPanel(): void {
        const panel = getElementById("raw-markdown-panel");

        if (panel) {
            const isVisible = hasClass(panel, "visible");

            if (isVisible) {
                this.hideRawMarkdownPanel();
            } else {
                this.showRawMarkdownPanel();
            }
        }
    }

    public showRawMarkdownPanel(): void {
        const panel = getElementById("raw-markdown-panel");
        const button = getElementById("raw-markdown-toggle");
        const container = getElementById("editor-container");

        if (panel && button && container) {
            addClass(panel, "visible");
            addClass(button, "active");
            addClass(container, "panel-visible");

            // Update content when showing
            this.updateRawMarkdownContent();

            // Store state
            localStorage.setItem(
                EDITOR_CONFIG.STORAGE_KEYS.RAW_MARKDOWN_PANEL_VISIBLE,
                "true",
            );
        }
    }

    public hideRawMarkdownPanel(): void {
        const panel = getElementById("raw-markdown-panel");
        const button = getElementById("raw-markdown-toggle");
        const container = getElementById("editor-container");

        if (panel && button && container) {
            removeClass(panel, "visible");
            removeClass(button, "active");
            removeClass(container, "panel-visible");

            // Store state
            localStorage.setItem(
                EDITOR_CONFIG.STORAGE_KEYS.RAW_MARKDOWN_PANEL_VISIBLE,
                "false",
            );
        }
    }

    public async updateRawMarkdownContent(): Promise<void> {
        const textElement = getElementById("raw-markdown-text");
        if (textElement && this.editor) {
            try {
                const { DocumentManager } = await import(
                    "../core/document-manager"
                );
                const documentManager = new DocumentManager();
                const content = await documentManager.getMarkdownContent(
                    this.editor,
                );
                textElement.textContent =
                    content ||
                    "# Empty Document\n\nStart typing to see content here...";
            } catch (error) {
                console.error("Failed to get markdown content:", error);
                textElement.textContent =
                    "// Error loading content\n// Please try refreshing the page";
            }
        }
    }

    public isRawMarkdownPanelVisible(): boolean {
        const panel = getElementById("raw-markdown-panel");
        return panel ? hasClass(panel, "visible") : false;
    }

    private restoreRawMarkdownPanelState(): void {
        const savedState = localStorage.getItem(
            EDITOR_CONFIG.STORAGE_KEYS.RAW_MARKDOWN_PANEL_VISIBLE,
        );

        if (savedState === "true") {
            setTimeout(() => {
                this.showRawMarkdownPanel();
            }, EDITOR_CONFIG.TIMING.PANEL_RESTORE_DELAY);
        }
    }
}
