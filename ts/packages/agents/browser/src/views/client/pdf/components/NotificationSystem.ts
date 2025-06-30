// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Toast notification system for user feedback
 */
export class NotificationSystem {
    private container: HTMLElement;

    constructor() {
        this.container = this.createContainer();
        document.body.appendChild(this.container);
    }

    /**
     * Create notification container
     */
    private createContainer(): HTMLElement {
        const container = document.createElement("div");
        container.className = "notification-container";
        return container;
    }

    /**
     * Show success notification
     */
    showSuccess(message: string, duration: number = 4000): void {
        this.showNotification(message, "success", duration);
    }

    /**
     * Show error notification
     */
    showError(message: string, duration: number = 6000): void {
        this.showNotification(message, "error", duration);
    }

    /**
     * Show info notification
     */
    showInfo(message: string, duration: number = 4000): void {
        this.showNotification(message, "info", duration);
    }

    /**
     * Show warning notification
     */
    showWarning(message: string, duration: number = 5000): void {
        this.showNotification(message, "warning", duration);
    }

    /**
     * Show notification with specified type
     */
    private showNotification(
        message: string,
        type: "success" | "error" | "info" | "warning",
        duration: number,
    ): void {
        const notification = this.createNotificationElement(message, type);
        this.container.appendChild(notification);

        // Trigger animation
        requestAnimationFrame(() => {
            notification.classList.add("visible");
        });

        // Auto-remove after duration
        setTimeout(() => {
            this.removeNotification(notification);
        }, duration);

        // Allow manual dismissal
        const closeBtn = notification.querySelector(".notification-close");
        if (closeBtn) {
            closeBtn.addEventListener("click", () => {
                this.removeNotification(notification);
            });
        }
    }

    /**
     * Create notification element
     */
    private createNotificationElement(
        message: string,
        type: string,
    ): HTMLElement {
        const notification = document.createElement("div");
        notification.className = `notification notification-${type}`;

        const icon = this.getIconForType(type);

        notification.innerHTML = `
            <div class="notification-content">
                <div class="notification-icon">
                    <i class="${icon}"></i>
                </div>
                <div class="notification-message">${this.escapeHtml(message)}</div>
                <button class="notification-close" type="button">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;

        return notification;
    }

    /**
     * Get icon class for notification type
     */
    private getIconForType(type: string): string {
        switch (type) {
            case "success":
                return "fas fa-check-circle";
            case "error":
                return "fas fa-exclamation-circle";
            case "warning":
                return "fas fa-exclamation-triangle";
            case "info":
            default:
                return "fas fa-info-circle";
        }
    }

    /**
     * Remove notification with animation
     */
    private removeNotification(notification: HTMLElement): void {
        notification.classList.add("removing");
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }

    /**
     * Escape HTML for safe display
     */
    private escapeHtml(text: string): string {
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Clear all notifications
     */
    clearAll(): void {
        const notifications = this.container.querySelectorAll(".notification");
        notifications.forEach((notification) => {
            this.removeNotification(notification as HTMLElement);
        });
    }

    /**
     * Destroy the notification system
     */
    destroy(): void {
        this.clearAll();
        if (this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
    }
}

// Global notification instance
let globalNotificationSystem: NotificationSystem | null = null;

/**
 * Get or create global notification system
 */
export function getNotificationSystem(): NotificationSystem {
    if (!globalNotificationSystem) {
        globalNotificationSystem = new NotificationSystem();
    }
    return globalNotificationSystem;
}

/**
 * Convenience functions for global notifications
 */
export const notify = {
    success: (message: string, duration?: number) =>
        getNotificationSystem().showSuccess(message, duration),
    error: (message: string, duration?: number) =>
        getNotificationSystem().showError(message, duration),
    info: (message: string, duration?: number) =>
        getNotificationSystem().showInfo(message, duration),
    warning: (message: string, duration?: number) =>
        getNotificationSystem().showWarning(message, duration),
};
