// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

interface M365ChatConfig {
    useDevEnvironment?: boolean;
    currentPageUrl?: string;
    currentPageTitle?: string;
    prefilledMessage?: string;
}

class M365ChatPanel {
    private iframe: HTMLIFrameElement;
    private loadingIndicator: HTMLElement;
    private errorDisplay: HTMLElement;
    private errorMessage: HTMLElement;
    private refreshButton: HTMLButtonElement;
    private retryButton: HTMLButtonElement;

    private static readonly PROD_BASE_URL =
        "https://m365.cloud.microsoft/chat/";
    private static readonly DEV_BASE_URL =
        "https://scuprodprv.m365.cloud.microsoft/chat/";
    private static readonly TYPEAGENT_TITLE_ID =
        "U_86e17a7a-0be2-9b6a-f914-a70f04c8a26a";

    private static readonly USE_DEV_ENVIRONMENT = true;

    constructor() {
        this.iframe = document.getElementById(
            "m365ChatFrame",
        ) as HTMLIFrameElement;
        this.loadingIndicator =
            document.getElementById("loadingIndicator")!;
        this.errorDisplay = document.getElementById("errorDisplay")!;
        this.errorMessage = document.getElementById("errorMessage")!;
        this.refreshButton = document.getElementById(
            "refreshButton",
        ) as HTMLButtonElement;
        this.retryButton = document.getElementById(
            "retryButton",
        ) as HTMLButtonElement;

        this.initialize();
    }

    private async initialize(): Promise<void> {
        console.log("[M365ChatPanel] Initializing...");

        const currentTab = await this.getCurrentTab();

        const chatUrl = this.buildM365ChatUrl({
            useDevEnvironment: M365ChatPanel.USE_DEV_ENVIRONMENT,
            currentPageUrl: currentTab?.url,
            currentPageTitle: currentTab?.title,
        });

        console.log("[M365ChatPanel] Loading M365 Chat:", chatUrl);

        this.setupEventListeners();
        this.loadChat(chatUrl);
    }

    private setupEventListeners(): void {
        this.refreshButton.addEventListener("click", () => {
            console.log("[M365ChatPanel] Refreshing chat...");
            this.iframe.src = this.iframe.src;
        });

        this.retryButton.addEventListener("click", () => {
            this.hideError();
            this.initialize();
        });

        this.iframe.addEventListener("load", () => {
            console.log("[M365ChatPanel] IFrame loaded successfully");
            this.hideLoading();
        });

        this.iframe.addEventListener("error", (error) => {
            console.error("[M365ChatPanel] IFrame load error:", error);
            this.showError(
                "Failed to load M365 Chat. Please check your connection.",
            );
        });
    }

    private async getCurrentTab(): Promise<chrome.tabs.Tab | null> {
        try {
            const [tab] = await chrome.tabs.query({
                active: true,
                currentWindow: true,
            });
            return tab || null;
        } catch (error) {
            console.error(
                "[M365ChatPanel] Failed to get current tab:",
                error,
            );
            return null;
        }
    }

    private buildM365ChatUrl(config: M365ChatConfig): string {
        const baseUrl =
            (config.useDevEnvironment ?? M365ChatPanel.USE_DEV_ENVIRONMENT)
                ? M365ChatPanel.DEV_BASE_URL
                : M365ChatPanel.PROD_BASE_URL;

        const url = new URL(baseUrl);

        url.searchParams.set("titleId", M365ChatPanel.TYPEAGENT_TITLE_ID);
        url.searchParams.set("auth", "2");

        if (config.useDevEnvironment ?? M365ChatPanel.USE_DEV_ENVIRONMENT) {
            url.searchParams.set("M365ChatLocal", "8887");
            url.searchParams.set("M365ChatMode", "prod");
            url.searchParams.set("cspoff", "true");
            url.searchParams.set("flight", "!cspheaders.enabled");
            url.searchParams.set("M365ChatAppLocal", "9090");
        }

        if (config.prefilledMessage) {
            url.searchParams.set("message", config.prefilledMessage);
        }

        if (config.currentPageUrl) {
            url.searchParams.set("context_url", config.currentPageUrl);
        }

        if (config.currentPageTitle) {
            url.searchParams.set("context_title", config.currentPageTitle);
        }

        return url.toString();
    }

    private loadChat(url: string): void {
        this.showLoading();
        this.iframe.src = url;
    }

    private showLoading(): void {
        this.loadingIndicator.style.display = "flex";
        this.errorDisplay.style.display = "none";
    }

    private hideLoading(): void {
        this.loadingIndicator.style.display = "none";
    }

    private showError(message: string): void {
        this.hideLoading();
        this.errorMessage.textContent = message;
        this.errorDisplay.style.display = "flex";
    }

    private hideError(): void {
        this.errorDisplay.style.display = "none";
    }
}

document.addEventListener("DOMContentLoaded", () => {
    new M365ChatPanel();
});
