// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { WebsiteImportManager } from "../websiteImportManager";
import { WebsiteImportUI } from "../websiteImportUI";
import {
    ImportOptions,
    FolderImportOptions,
    ImportProgress,
    ImportResult,
} from "../../interfaces/websiteImport.types";
import {
    notificationManager,
    chromeExtensionService,
    KnowledgeTemplateHelpers as TemplateHelpers,
    KnowledgeFormatUtils as FormatUtils,
    ChromeEventManager as EventManager,
    KnowledgeConnectionManager as ConnectionManager,
    Website,
    SearchResult,
    SearchFilters,
    KnowledgeStatus,
    LibraryStats,
} from "../knowledgeUtilities";

export interface FullPageNavigation {
    currentPage: "search" | "discover" | "analytics";
    previousPage: string | null;
}

export interface DiscoverInsights {
    trendingTopics: Array<{
        topic: string;
        count: number;
        trend: "up" | "down" | "stable";
        percentage: number;
    }>;
    readingPatterns: Array<{
        timeframe: string;
        activity: number;
        peak: boolean;
    }>;
    popularPages: Array<{
        url: string;
        title: string;
        visitCount: number;
        isBookmarked: boolean;
        domain: string;
        lastVisited: string;
    }>;
    topDomains: Array<{
        domain: string;
        count: number;
        favicon?: string;
    }>;
}

export interface AnalyticsData {
    overview: {
        totalSites: number;
        totalBookmarks: number;
        totalHistory: number;
        knowledgeExtracted: number;
    };
    trends: Array<{
        date: string;
        visits: number;
        bookmarks: number;
    }>;
    insights: Array<{
        category: string;
        value: number;
        change: number;
    }>;
    domains?: {
        topDomains: Array<{
            domain: string;
            count: number;
            percentage: number;
        }>;
        totalSites: number;
    };
    knowledge?: {
        extractionProgress?: {
            entityProgress: number;
            topicProgress: number;
            actionProgress: number;
        };
        qualityDistribution?: {
            highQuality: number;
            mediumQuality: number;
            lowQuality: number;
        };
        totalEntities?: number;
        totalTopics?: number;
        totalActions?: number;
        totalRelationships?: number;
        recentItems?: any[];
    };
    activity?: {
        trends: Array<{
            date: string;
            visits: number;
            bookmarks: number;
        }>;
        summary: {
            totalActivity: number;
            peakDay: string | null;
            averagePerDay: number;
            timeRange: string;
        };
    };
}

export interface LocalImportOptions {
    source: "chrome" | "edge";
    type: "bookmarks" | "history";
    limit?: number;
    days?: number;
    folder?: string;
    extractContent?: boolean;
    enableIntelligentAnalysis?: boolean;
    extractionMode?: "basic" | "content" | "actions" | "full";
    maxConcurrent?: number;
    contentTimeout?: number;
}

export interface SearchSuggestion {
    text: string;
    type: "recent" | "entity" | "topic" | "domain" | "auto";
    metadata?: {
        count?: number;
        lastUsed?: string;
        source?: string;
    };
}

export interface UserPreferences {
    viewMode: string;
    autoExtractKnowledge: boolean;
    showConfidenceScores: boolean;
    enableNotifications: boolean;
    theme: "light" | "dark" | "auto";
}

export class LibraryBaseController {
    protected isConnected: boolean = false;
    protected isInitialized: boolean = false;
    protected navigation: FullPageNavigation = {
        currentPage: "search",
        previousPage: null,
    };

    protected libraryStats: LibraryStats = {
        totalWebsites: 0,
        totalBookmarks: 0,
        totalHistory: 0,
        topDomains: 0,
    };
    protected discoverData: DiscoverInsights | null = null;
    protected analyticsData: AnalyticsData | null = null;

    protected userPreferences: UserPreferences;
    protected knowledgeCache: Map<string, KnowledgeStatus> = new Map();

    protected importManager: WebsiteImportManager;
    protected importUI: WebsiteImportUI;

    constructor() {
        this.userPreferences = this.loadUserPreferences();
        this.importManager = new WebsiteImportManager();
        this.importUI = new WebsiteImportUI();
    }

    async initialize(): Promise<void> {
        if (this.isInitialized) {
            console.log("Library already initialized, skipping");
            return;
        }

        console.log("Initializing Website Library...");

        try {
            this.setupNavigation();
            this.setupEventListeners();
            this.setupImportFunctionality();

            await this.checkConnectionStatus();
            await this.loadLibraryStats();
            this.showPage("search");
        } catch (error) {
            console.error("Failed to initialize Website Library:", error);
            this.isInitialized = false;
            notificationManager.showError(
                "Failed to load Website Library. Please refresh the page.",
                () => window.location.reload(),
            );
        }
    }

    protected setupNavigation(): void {
        const navItems = document.querySelectorAll(".nav-item");
        navItems.forEach((item) => {
            item.addEventListener("click", (e) => {
                const target = e.currentTarget as HTMLElement;
                const page = target.getAttribute("data-page") as
                    | "search"
                    | "discover"
                    | "analytics";
                if (page) {
                    this.navigateToPage(page).catch(console.error);
                }
            });
        });
    }

    protected async navigateToPage(
        page: "search" | "discover" | "analytics"
    ): Promise<void> {
        if (page === this.navigation.currentPage) return;

        this.navigation.previousPage = this.navigation.currentPage;
        this.navigation.currentPage = page;

        this.updateNavigation();
        this.showPage(page);

        switch (page) {
            case "search":
                break;
            case "discover":
                await this.initializeDiscoverPage();
                break;
            case "analytics":
                await this.initializeAnalyticsPage();
                break;
        }
    }

    protected updateNavigation(): void {
        document.querySelectorAll(".nav-item").forEach((item) => {
            item.classList.remove("active");
        });

        const activeItem = document.querySelector(
            `[data-page="${this.navigation.currentPage}"]`,
        );
        if (activeItem) {
            activeItem.classList.add("active");
        }
    }

    protected showPage(page: string): void {
        document.querySelectorAll(".page-content").forEach((pageEl) => {
            pageEl.classList.remove("active");
        });

        const targetPage = document.getElementById(`${page}-page`);
        if (targetPage) {
            targetPage.classList.add("active");
        }
    }

    protected async initializeDiscoverPage(): Promise<void> {
        throw new Error("Must be implemented by derived class");
    }

    protected async initializeAnalyticsPage(): Promise<void> {
        throw new Error("Must be implemented by derived class");
    }

    protected setupEventListeners(): void {
        // Settings button
        const settingsButton = document.getElementById("settingsButton");
        if (settingsButton) {
            settingsButton.addEventListener("click", () => {
                this.showSettings();
            });
        }

        // Event delegation for data-action buttons
        document.addEventListener("click", (e) => {
            const target = e.target as HTMLElement;
            const actionButton = target.closest("[data-action]") as HTMLElement;

            if (actionButton) {
                e.preventDefault();
                const action = actionButton.getAttribute("data-action");
                this.handleAction(action, actionButton);
            }
        });

        window.addEventListener("beforeunload", () => {
            this.saveUserPreferences();
        });
    }

    protected setupImportFunctionality(): void {
        const importWebActivityBtn = document.getElementById("importWebActivityBtn");
        const importFromFileBtn = document.getElementById("importFromFileBtn");

        if (importWebActivityBtn) {
            importWebActivityBtn.addEventListener("click", (e) => {
                e.preventDefault();
                this.showWebActivityImportModal();
            });
        }

        if (importFromFileBtn) {
            importFromFileBtn.addEventListener("click", (e) => {
                e.preventDefault();
                this.showFolderImportModal();
            });
        }

        this.setupImportEventListeners();
    }

    protected setupImportEventListeners(): void {
        window.addEventListener("startWebActivityImport", async (event: any) => {
            const options = event.detail as ImportOptions;
            await this.handleWebActivityImport(options);
        });

        window.addEventListener("startFolderImport", async (event: any) => {
            const options = event.detail as FolderImportOptions;
            await this.handleFolderImport(options);
        });

        window.addEventListener("cancelImport", () => {
            this.handleCancelImport();
        });

        EventManager.setupMessageListener((message, sender, sendResponse) => {
            if (message.type === "importProgress") {
                this.handleImportProgressMessage(message);
            }
        });
    }

    protected async checkConnectionStatus(): Promise<void> {
        try {
            // Simplified connection check
            this.isConnected = true; // Assume connected for now
        } catch (error) {
            console.error("Connection check failed:", error);
            this.isConnected = false;
        }
        this.updateConnectionStatus();
    }

    protected updateConnectionStatus(): void {
        const statusElement = document.getElementById("connectionStatus");
        if (statusElement) {
            const indicator = statusElement.querySelector(".status-indicator");
            const text = statusElement.querySelector("span:last-child");

            if (indicator && text) {
                if (this.isConnected) {
                    indicator.className = "status-indicator status-connected";
                    text.textContent = "Connected";
                } else {
                    indicator.className = "status-indicator status-disconnected";
                    text.textContent = "Disconnected";
                }
            }
        }
    }

    protected async loadLibraryStats(): Promise<void> {
        if (!this.isConnected) return;

        try {
            const stats = await chromeExtensionService.getLibraryStats();
            this.libraryStats = stats;
            this.updateStatsDisplay();
        } catch (error) {
            console.error("Failed to load library stats:", error);
        }
    }

    protected updateStatsDisplay(): void {
        const updates: Array<[string, number]> = [
            ["totalWebsites", this.libraryStats.totalWebsites],
            ["totalBookmarks", this.libraryStats.totalBookmarks],
            ["totalHistory", this.libraryStats.totalHistory],
            ["topDomains", this.libraryStats.topDomains],
        ];

        updates.forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = value.toString();
            }
        });
    }

    protected showImportProgress(): void {
        const progressModal = document.getElementById("importProgress");
        if (progressModal) {
            progressModal.style.display = "block";
        }
    }

    protected updateImportProgress(progress: ImportProgress): void {
        const progressBar = document.querySelector(".import-progress-bar") as HTMLElement;
        const progressText = document.querySelector(".import-progress-text") as HTMLElement;
        
        if (progressBar) {
            const percentage = Math.round((progress.processedItems / progress.totalItems) * 100);
            progressBar.style.width = `${percentage}%`;
        }
        
        if (progressText) {
            progressText.textContent = `${progress.processedItems}/${progress.totalItems} - ${progress.phase}`;
        }
    }

    protected handleImportCompleted(result: ImportResult): void {
        const progressModal = document.getElementById("importProgress");
        if (progressModal) {
            progressModal.style.display = "none";
        }

        if (result.success) {
            notificationManager.showSuccess(
                `Import completed: ${result.itemCount} items imported`
            );
            this.loadLibraryStats();
        } else {
            notificationManager.showError(
                `Import failed: ${result.errors.length} errors`
            );
        }
    }

    protected handleImportError(error: Error): void {
        const progressModal = document.getElementById("importProgress");
        if (progressModal) {
            progressModal.style.display = "none";
        }
        
        notificationManager.showError(
            `Import error: ${error.message}`
        );
    }

    protected loadUserPreferences(): UserPreferences {
        const defaults: UserPreferences = {
            viewMode: "list",
            autoExtractKnowledge: true,
            showConfidenceScores: false,
            enableNotifications: true,
            theme: "auto",
        };

        try {
            const stored = localStorage.getItem("libraryUserPreferences");
            if (stored) {
                return { ...defaults, ...JSON.parse(stored) };
            }
        } catch (error) {
            console.error("Failed to load user preferences:", error);
        }

        return defaults;
    }

    protected saveUserPreferences(): void {
        try {
            localStorage.setItem(
                "libraryUserPreferences",
                JSON.stringify(this.userPreferences)
            );
        } catch (error) {
            console.error("Failed to save user preferences:", error);
        }
    }

    public showWebActivityImportModal(): void {
        this.importUI.showWebActivityImportModal();
    }

    public showFolderImportModal(): void {
        this.importUI.showFolderImportModal();
    }

    public showSettings(): void {
        this.createEnhancedSettingsModal();
    }

    protected async handleWebActivityImport(options: ImportOptions): Promise<void> {
        try {
            let isFirstProgress = true;

            this.importManager.onProgressUpdate((progress: ImportProgress) => {
                if (isFirstProgress) {
                    this.importUI.showImportProgress(progress);
                    isFirstProgress = false;
                } else {
                    this.importUI.updateImportProgress(progress);
                }
            });

            const result = await this.importManager.startWebActivityImport(options);
            this.importUI.showImportComplete(result);
            this.handleImportCompleted(result);
        } catch (error) {
            this.handleImportError(error as Error);
        }
    }

    protected async handleFolderImport(options: FolderImportOptions): Promise<void> {
        try {
            let isFirstProgress = true;

            this.importManager.onProgressUpdate((progress: ImportProgress) => {
                if (isFirstProgress) {
                    this.importUI.showImportProgress(progress);
                    isFirstProgress = false;
                } else {
                    this.importUI.updateImportProgress(progress);
                }
            });

            const result = await this.importManager.startFolderImport(options);
            this.importUI.showImportComplete(result);
            this.handleImportCompleted(result);
        } catch (error) {
            this.handleImportError(error as Error);
        }
    }

    protected handleCancelImport(): void {
        this.importManager.cancelImport("web-activity-import");
        this.importManager.cancelImport("file-import");
    }

    protected handleImportProgressMessage(message: any): void {
        if (message.importId && message.progress) {
            this.importUI.updateImportProgress(message.progress);
        }
    }

    protected handleAction(action: string | null, button: HTMLElement): void {
        if (!action) return;

        switch (action) {
            case "showImportModal":
                this.showWebActivityImportModal();
                break;
            case "reconnect":
                this.checkConnectionStatus();
                break;
            default:
                console.warn("Unknown action:", action);
        }
    }

    private createEnhancedSettingsModal(): void {
        const existingModal = document.getElementById("enhancedSettingsModal");
        if (existingModal) {
            existingModal.remove();
        }

        const modalHtml = `
            <div class="modal fade" id="enhancedSettingsModal" tabindex="-1" aria-hidden="true">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Enhanced Settings</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="row">
                                <div class="col-md-6">
                                    <h6>Search Preferences</h6>
                                    <div class="mb-3">
                                        <label class="form-label">Default View Mode</label>
                                        <select class="form-select" id="defaultViewMode">
                                            <option value="list">List</option>
                                            <option value="grid">Grid</option>
                                            <option value="timeline">Timeline</option>
                                            <option value="domain">Domain</option>
                                        </select>
                                    </div>
                                </div>
                                <div class="col-md-6">
                                    <h6>Knowledge & Notifications</h6>
                                    <div class="mb-3">
                                        <div class="form-check">
                                            <input class="form-check-input" type="checkbox" id="autoExtractKnowledge">
                                            <label class="form-check-label">Auto-extract knowledge</label>
                                        </div>
                                    </div>
                                    <div class="mb-3">
                                        <div class="form-check">
                                            <input class="form-check-input" type="checkbox" id="showConfidenceScores">
                                            <label class="form-check-label">Show confidence scores</label>
                                        </div>
                                    </div>
                                    <div class="mb-3">
                                        <div class="form-check">
                                            <input class="form-check-input" type="checkbox" id="enableNotifications">
                                            <label class="form-check-label">Enable notifications</label>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-primary" id="saveSettingsBtn">Save Changes</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML("beforeend", modalHtml);

        this.populateSettingsModal();

        const saveBtn = document.getElementById("saveSettingsBtn");
        if (saveBtn) {
            saveBtn.addEventListener("click", () => this.saveUserSettingsFromModal());
        }

        const modal = document.getElementById("enhancedSettingsModal");
        if (modal && (window as any).bootstrap) {
            const bsModal = new (window as any).bootstrap.Modal(modal);
            bsModal.show();
        }
    }

    private populateSettingsModal(): void {
        const prefs = this.userPreferences;

        const defaultViewMode = document.getElementById("defaultViewMode") as HTMLSelectElement;
        const autoExtractKnowledge = document.getElementById("autoExtractKnowledge") as HTMLInputElement;
        const showConfidenceScores = document.getElementById("showConfidenceScores") as HTMLInputElement;
        const enableNotifications = document.getElementById("enableNotifications") as HTMLInputElement;

        if (defaultViewMode) defaultViewMode.value = prefs.viewMode;
        if (autoExtractKnowledge) autoExtractKnowledge.checked = prefs.autoExtractKnowledge;
        if (showConfidenceScores) showConfidenceScores.checked = prefs.showConfidenceScores;
        if (enableNotifications) enableNotifications.checked = prefs.enableNotifications;
    }

    private saveUserSettingsFromModal(): void {
        const defaultViewMode = document.getElementById("defaultViewMode") as HTMLSelectElement;
        const autoExtractKnowledge = document.getElementById("autoExtractKnowledge") as HTMLInputElement;
        const showConfidenceScores = document.getElementById("showConfidenceScores") as HTMLInputElement;
        const enableNotifications = document.getElementById("enableNotifications") as HTMLInputElement;

        this.userPreferences = {
            viewMode: defaultViewMode?.value || "list",
            autoExtractKnowledge: autoExtractKnowledge?.checked || false,
            showConfidenceScores: showConfidenceScores?.checked || true,
            enableNotifications: enableNotifications?.checked || true,
            theme: this.userPreferences.theme,
        };

        this.saveUserPreferences();
        notificationManager.showSuccess("Settings saved successfully");

        const modal = document.getElementById("enhancedSettingsModal");
        if (modal && (window as any).bootstrap) {
            const bsModal = (window as any).bootstrap.Modal.getInstance(modal);
            if (bsModal) bsModal.hide();
        }
    }
}
