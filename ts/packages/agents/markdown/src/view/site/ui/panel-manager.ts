import type { Editor } from "@milkdown/core";

export class PanelManager {
    public async initialize(): Promise<void> {
        console.log("📋 Initializing Panel Manager...");
        // Panel manager no longer manages raw markdown panel
        // All functionality moved to toolbar and document managers
    }

    public setEditor(_editor: Editor): void {
        // Editor reference no longer needed since raw markdown panel was removed
        // Method kept for compatibility with existing code
    }

    // Collaboration status methods can be added here if needed
    public showCollaborationStatus(status: string): void {
        const statusElement = document.getElementById("collaboration-status");
        if (statusElement) {
            statusElement.textContent = status;
            statusElement.style.display = "block";
            
            // Auto-hide after 3 seconds for success messages
            if (status.includes("Connected") || status.includes("synchronized")) {
                setTimeout(() => {
                    statusElement.style.display = "none";
                }, 3000);
            }
        }
    }

    public hideCollaborationStatus(): void {
        const statusElement = document.getElementById("collaboration-status");
        if (statusElement) {
            statusElement.style.display = "none";
        }
    }
}
