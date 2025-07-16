// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

export interface StateDisplayOptions {
    icon?: string;
    title: string;
    message: string;
    actionButton?: {
        text: string;
        action: () => void;
        style?: "primary" | "secondary";
    };
}

export class UIStateManager {
    static showLoadingState(containerId: string, message: string = "Loading..."): void {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = `
            <div class="loading-state">
                <div class="d-flex justify-content-center">
                    <div class="spinner-border" role="status">
                        <span class="visually-hidden">${message}</span>
                    </div>
                </div>
                <p class="text-center mt-3 text-muted">${message}</p>
            </div>
        `;
    }

    static showEmptyState(containerId: string, options: StateDisplayOptions): void {
        const container = document.getElementById(containerId);
        if (!container) return;

        const actionButtonHtml = options.actionButton ? `
            <button class="btn btn-${options.actionButton.style || 'primary'} mt-3" 
                    data-action="${options.actionButton.text}">
                ${options.actionButton.text}
            </button>
        ` : '';

        container.innerHTML = `
            <div class="empty-state">
                ${options.icon ? `<i class="${options.icon}"></i>` : ''}
                <h5>${options.title}</h5>
                <p>${options.message}</p>
                ${actionButtonHtml}
            </div>
        `;

        if (options.actionButton) {
            const button = container.querySelector('[data-action]');
            button?.addEventListener('click', options.actionButton.action);
        }
    }

    static showErrorState(containerId: string, options: StateDisplayOptions): void {
        const container = document.getElementById(containerId);
        if (!container) return;

        const actionButtonHtml = options.actionButton ? `
            <button class="btn btn-${options.actionButton.style || 'primary'} mt-3" 
                    data-action="${options.actionButton.text}">
                ${options.actionButton.text}
            </button>
        ` : '';

        container.innerHTML = `
            <div class="error-state">
                <i class="${options.icon || 'bi bi-exclamation-triangle'}"></i>
                <h5>${options.title}</h5>
                <p>${options.message}</p>
                ${actionButtonHtml}
            </div>
        `;

        if (options.actionButton) {
            const button = container.querySelector('[data-action]');
            button?.addEventListener('click', options.actionButton.action);
        }
    }

    static showConnectionRequired(containerId: string, onReconnect?: () => void): void {
        this.showErrorState(containerId, {
            icon: "bi bi-wifi-off",
            title: "Connection Required",
            message: "Please connect to the TypeAgent service to continue.",
            actionButton: onReconnect ? {
                text: "Reconnect",
                action: onReconnect,
                style: "primary"
            } : undefined
        });
    }

    static hideState(containerId: string): void {
        const container = document.getElementById(containerId);
        if (container) {
            container.style.display = "none";
        }
    }

    static showState(containerId: string): void {
        const container = document.getElementById(containerId);
        if (container) {
            container.style.display = "block";
        }
    }
}
