import { DocumentManager } from "../core/document-manager";
import { PanelManager } from "./panel-manager";
import { getElementById } from "../utils";

export class ToolbarManager {
    private documentManager: DocumentManager;
    private panelManager: PanelManager | null = null;

    constructor() {
        this.documentManager = new DocumentManager();
    }

    public async initialize(): Promise<void> {
        console.log("🔧 Initializing Toolbar Manager...");

        this.setupSaveButton();
        this.setupRawMarkdownToggle();
    }

    public setPanelManager(panelManager: PanelManager): void {
        this.panelManager = panelManager;
    }

    private setupSaveButton(): void {
        const saveBtn = getElementById("save-btn");
        if (saveBtn) {
            saveBtn.addEventListener("click", () => {
                this.triggerSave();
            });
        }
    }

    private setupRawMarkdownToggle(): void {
        const rawMarkdownToggle = getElementById("raw-markdown-toggle");
        if (rawMarkdownToggle) {
            rawMarkdownToggle.addEventListener("click", () => {
                if (this.panelManager) {
                    this.panelManager.toggleRawMarkdownPanel();
                }
            });
        }
    }

    public async triggerSave(): Promise<void> {
        try {
            await this.documentManager.saveDocument();
        } catch (error) {
            console.error("Save failed:", error);
        }
    }
}
