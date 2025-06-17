import type { NotificationType, SaveStatus } from "../types";
import { EDITOR_CONFIG } from "../config";
import {
    createNotificationElement,
    createErrorNotificationElement,
    addToBody,
    removeElement,
    getElementById,
} from "../utils";

export class NotificationManager {
    public async initialize(): Promise<void> {
        // No specific initialization needed
    }

    public showNotification(
        message: string,
        type: NotificationType = "info",
    ): void {

        const notification = createNotificationElement(message, type);
        addToBody(notification);

        // Remove after delay
        setTimeout(() => {
            removeElement(notification);
        }, EDITOR_CONFIG.TIMING.ERROR_HIDE_DELAY);
    }

    public showError(message: string): void {
        console.error(message);

        const errorElement = createErrorNotificationElement(message);
        addToBody(errorElement);

        // Remove after 5 seconds
        setTimeout(() => {
            removeElement(errorElement);
        }, 5000);
    }

    public showSaveStatus(status: SaveStatus): void {
        const statusElement = getElementById("save-status");
        if (!statusElement) return;

        switch (status) {
            case "saving":
                statusElement.textContent = "💾 Saving...";
                statusElement.className = "save-status saving";
                break;
            case "saved":
                statusElement.textContent = "✅ Saved";
                statusElement.className = "save-status saved";
                setTimeout(() => {
                    statusElement.textContent = "";
                    statusElement.className = "save-status";
                }, EDITOR_CONFIG.TIMING.STATUS_HIDE_DELAY);
                break;
            case "error":
                statusElement.textContent = "❌ Save failed";
                statusElement.className = "save-status error";
                setTimeout(() => {
                    statusElement.textContent = "";
                    statusElement.className = "save-status";
                }, EDITOR_CONFIG.TIMING.ERROR_HIDE_DELAY);
                break;
        }
    }
}
