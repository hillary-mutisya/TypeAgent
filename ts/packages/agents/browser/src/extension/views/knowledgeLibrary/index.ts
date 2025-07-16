// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { SearchViewController } from "./SearchViewController";
import { DiscoverViewController } from "./DiscoverViewController";
import { AnalyticsViewController } from "./AnalyticsViewController";
import { LibraryBaseController, FullPageNavigation } from "./LibraryBaseController";

export class KnowledgeLibraryPage extends LibraryBaseController {
    private searchController: SearchViewController;
    private discoverController: DiscoverViewController;
    private analyticsController: AnalyticsViewController;

    constructor() {
        super();
        this.searchController = new SearchViewController();
        this.discoverController = new DiscoverViewController();
        this.analyticsController = new AnalyticsViewController();
    }

    async initialize(): Promise<void> {
        if (this.isInitialized) {
            console.log("Library already initialized, skipping");
            return;
        }

        console.log("Initializing Website Library...");

        try {
            await super.initialize();
            await this.searchController.initialize();
            this.isInitialized = true;
        } catch (error) {
            console.error("Failed to initialize Website Library:", error);
            this.isInitialized = false;
        }
    }

    protected async initializeDiscoverPage(): Promise<void> {
        await this.discoverController.initializeDiscoverPage();
    }

    protected async initializeAnalyticsPage(): Promise<void> {
        await this.analyticsController.initializeAnalyticsPage();
    }

    public performSearchWithQuery(query: string): void {
        this.searchController.performSearchWithQuery(query);
    }

    public extractKnowledge(url: string): void {
        this.searchController.extractKnowledge(url);
    }

    public showImportModal(): void {
        this.showWebActivityImportModal();
    }

    public showWebActivityImportModal(): void {
        super.showWebActivityImportModal();
    }

    public showFolderImportModal(): void {
        super.showFolderImportModal();
    }

    public handleNotificationAction(id: string, actionLabel: string): void {
        // Simplified notification handling
        console.log("Notification action:", id, actionLabel);
    }

    public hideNotification(id: string): void {
        // Simplified notification hiding
        console.log("Hide notification:", id);
    }
}

let libraryPanelInstance: KnowledgeLibraryPage;
let isInitialized = false;

function initializeLibraryPanel() {
    if (isInitialized) {
        console.log("Website Library already initialized, skipping duplicate initialization");
        return;
    }

    isInitialized = true;
    libraryPanelInstance = new KnowledgeLibraryPage();
    libraryPanelInstance.initialize();

    (window as any).libraryPanel = libraryPanelInstance;
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeLibraryPanel);
} else {
    initializeLibraryPanel();
}
