// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

export class M365ChatManager {
    private static readonly PROD_BASE_URL =
        "https://m365.cloud.microsoft/chat/";
    private static readonly DEV_BASE_URL =
        "https://scuprodprv.m365.cloud.microsoft/chat/";
    private static readonly TYPEAGENT_TITLE_ID =
        "U_86e17a7a-0be2-9b6a-f914-a70f04c8a26a";
    private static readonly USE_DEV_ENVIRONMENT = true;

    static buildChatUrl(options: {
        useDevEnvironment?: boolean;
        currentPageUrl?: string;
        currentPageTitle?: string;
        prefilledMessage?: string;
    }): string {
        const baseUrl =
            (options.useDevEnvironment ?? M365ChatManager.USE_DEV_ENVIRONMENT)
                ? M365ChatManager.DEV_BASE_URL
                : M365ChatManager.PROD_BASE_URL;

        const url = new URL(baseUrl);

        url.searchParams.set("titleId", M365ChatManager.TYPEAGENT_TITLE_ID);
        url.searchParams.set("auth", "2");

        if (options.useDevEnvironment ?? M365ChatManager.USE_DEV_ENVIRONMENT) {
            url.searchParams.set("M365ChatLocal", "8887");
            url.searchParams.set("M365ChatMode", "prod");
            url.searchParams.set("cspoff", "true");
            url.searchParams.set("flight", "!cspheaders.enabled");
            url.searchParams.set("M365ChatAppLocal", "9090");
        }

        if (options.prefilledMessage) {
            url.searchParams.set(
                "message",
                encodeURIComponent(options.prefilledMessage),
            );
        }

        if (options.currentPageUrl) {
            url.searchParams.set("context_url", options.currentPageUrl);
        }

        if (options.currentPageTitle) {
            url.searchParams.set(
                "context_title",
                encodeURIComponent(options.currentPageTitle),
            );
        }

        return url.toString();
    }

    static async openChatPanel(
        tabId: number,
        options?: {
            prefilledMessage?: string;
        },
    ): Promise<void> {
        try {
            await chrome.sidePanel.open({ tabId });

            await chrome.sidePanel.setOptions({
                tabId,
                path: "views/m365Chat.html",
                enabled: true,
            });

            if (options) {
                await chrome.storage.session.set({
                    [`m365Chat_${tabId}`]: options,
                });
            }

            console.log(
                `[M365ChatManager] Opened chat panel for tab ${tabId}`,
            );
        } catch (error) {
            console.error("[M365ChatManager] Failed to open chat panel:", error);
            throw error;
        }
    }

    static async isChatPanelOpen(tabId: number): Promise<boolean> {
        try {
            const panel = await chrome.sidePanel.getOptions({ tabId });
            return (
                panel.path === "views/m365Chat.html" && panel.enabled === true
            );
        } catch (error) {
            console.error(
                "[M365ChatManager] Failed to check panel status:",
                error,
            );
            return false;
        }
    }

    static async closeChatPanel(tabId: number): Promise<void> {
        try {
            await chrome.sidePanel.setOptions({
                tabId,
                enabled: false,
            });

            await chrome.storage.session.remove(`m365Chat_${tabId}`);

            console.log(
                `[M365ChatManager] Closed chat panel for tab ${tabId}`,
            );
        } catch (error) {
            console.error("[M365ChatManager] Failed to close panel:", error);
        }
    }
}
