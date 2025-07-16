// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import {
    notificationManager,
    chromeExtensionService,
    TemplateHelpers,
    FormatUtils,
    EventManager,
} from "../knowledgeUtilities";
import { conversation as kpLib } from "knowledge-processor";
import { ExtractionController } from "./ExtractionController";
import { ContentRenderingController } from "./ContentRenderingController";
import { QueryController } from "./QueryController";

export interface KnowledgeData {
    entities: Entity[];
    relationships: Relationship[];
    keyTopics: string[];
    suggestedQuestions: string[];
    summary: string;
    contentActions?: kpLib.Action[];
    detectedActions?: DetectedAction[];
    actionSummary?: ActionSummary;
    contentMetrics?: {
        readingTime: number;
        wordCount: number;
    };
}

export interface DetectedAction {
    type: string;
    element: string;
    text?: string;
    confidence: number;
}
export interface ActionSummary {
    totalActions: number;
    actionTypes: string[];
    highConfidenceActions: number;
    actionDistribution: { [key: string]: number };
}

export interface Entity {
    name: string;
    type: string;
    description?: string;
    confidence: number;
}

export interface Relationship {
    from: string;
    relationship: string;
    to: string;
    confidence: number;
}

export interface ExtractionSettings {
    mode: "basic" | "content" | "actions" | "full";
    suggestQuestions: boolean;
}

export interface ExtractionModeInfo {
    description: string;
    requiresAI: boolean;
    features: string[];
    performance: string;
}

export interface QuestionCategory {
    name: string;
    icon: string;
    color: string;
    questions: CategorizedQuestion[];
    priority: number;
    count: number;
}
export interface CategorizedQuestion {
    text: string;
    category: string;
    priority: "high" | "medium" | "low";
    source: "content" | "temporal" | "technical" | "discovery" | "learning";
    confidence: number;
    recommended: boolean;
}

export interface PageSourceInfo {
    isBookmarked: boolean;
    isInHistory: boolean;
    visitCount?: number;
    lastVisited?: string;
    bookmarkFolder?: string;
}

export interface RelatedContentItem {
    url: string;
    title: string;
    similarity: number;
    relationshipType: "same-domain" | "topic-match" | "code-related";
    excerpt: string;
}

export class PageKnowledgeBaseController {
    protected currentUrl: string = "";
    protected isConnected: boolean = false;
    protected knowledgeData: KnowledgeData | null = null;
    protected pageSourceInfo: PageSourceInfo | null = null;
    protected extractionSettings: ExtractionSettings;
    protected aiModelAvailable: boolean = false;

    public extractionController: ExtractionController;
    public contentRenderingController: ContentRenderingController;
    public queryController: QueryController;

    constructor() {
        this.extractionSettings = {
            mode: "content",
            suggestQuestions: true,
        };
        
        this.extractionController = new ExtractionController(this);
        this.contentRenderingController = new ContentRenderingController(this);
        this.queryController = new QueryController(this);
    }

    async initialize() {
        console.log("Initializing Enhanced Knowledge Panel");

        await this.extractionController.checkAIModelAvailability();
        this.setupEventListeners();
        await this.loadCurrentPageInfo();
        await this.loadPageSourceInfo();
        await this.loadAutoIndexSetting();
        await this.loadIndexStats();
        await this.checkConnectionStatus();
        await this.loadFreshKnowledge();
        await this.extractionController.loadExtractionSettings();
        this.queryController.setupAdvancedQueryControls();
    }

    private setupEventListeners() {
        document.getElementById("extractKnowledge")!.addEventListener("click", () => {
            this.extractionController.extractKnowledge();
        });

        document.getElementById("indexPage")!.addEventListener("click", () => {
            this.extractionController.indexCurrentPage();
        });

        document.getElementById("autoIndexToggle")!.addEventListener("change", (e) => {
            const checkbox = e.target as HTMLInputElement;
            this.toggleAutoIndex(checkbox.checked);
        });

        document.getElementById("submitQuery")!.addEventListener("click", () => {
            this.queryController.submitQuery();
        });

        document.getElementById("enhancedQueryToggle")?.addEventListener("change", (e) => {
            const checkbox = e.target as HTMLInputElement;
            this.queryController.toggleEnhancedQuery(checkbox.checked);
        });

        document.getElementById("clearFilters")?.addEventListener("click", () => {
            this.queryController.clearAllFilters();
        });

        document.addEventListener("visibilitychange", () => {
            if (!document.hidden) {
                this.loadCurrentPageInfo();
                this.loadFreshKnowledge();
            }
        });
    }

    async loadCurrentPageInfo() {
        try {
            const tab = await chromeExtensionService.getCurrentTab();
            if (tab) {
                this.currentUrl = tab.url || "";

                const pageInfo = document.getElementById("currentPageInfo")!;
                const domain = new URL(this.currentUrl).hostname;
                const status = await this.getPageIndexStatus();

                pageInfo.innerHTML = this.createPageInfo(
                    tab.title || "Untitled",
                    domain,
                    status,
                );
            }
        } catch (error) {
            console.error("Error loading page info:", error);
        }
    }

    private async getPageIndexStatus(retryCount: number = 0): Promise<string> {
        try {
            const response = await chromeExtensionService.getPageIndexStatus(this.currentUrl);

            if (response.isIndexed) {
                const lastIndexedDate = response.lastIndexed
                    ? new Date(response.lastIndexed).toLocaleDateString()
                    : "Unknown";
                const entityCount = response.entityCount || 0;

                return `
                    <span class="badge bg-success position-relative">
                        <i class="bi bi-check-circle me-1"></i>Indexed
                        <span class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-info">
                            ${entityCount}
                            <span class="visually-hidden">entities</span>
                        </span>
                    </span>
                    <div class="small text-muted mt-1">
                        Last: ${lastIndexedDate}
                    </div>
                `;
            } else {
                if (retryCount < 2) {
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                    return this.getPageIndexStatus(retryCount + 1);
                }

                return `
                    <span class="badge bg-secondary">
                        <i class="bi bi-circle me-1"></i>Not indexed
                    </span>
                    <div class="small text-muted mt-1">
                        Ready to index
                    </div>
                `;
            }
        } catch (error) {
            return `
                <span class="badge bg-warning">
                    <i class="bi bi-question-circle me-1"></i>Unknown
                </span>
                <div class="small text-muted mt-1">
                    Check connection
                </div>
            `;
        }
    }

    private async loadPageSourceInfo() {
        try {
            const response = await chromeExtensionService.getPageSourceInfo(this.currentUrl);
            this.pageSourceInfo = response.sourceInfo;
            this.updatePageSourceDisplay();
        } catch (error) {
            console.error("Error loading page source info:", error);
        }
    }

    private updatePageSourceDisplay() {
        const pageInfo = document.getElementById("currentPageInfo")!;
        const existingContent = pageInfo.innerHTML;

        if (this.pageSourceInfo) {
            const sourceIndicators = [];

            if (this.pageSourceInfo.isBookmarked) {
                sourceIndicators.push(
                    `<span class="badge bg-primary me-1" title="This page is bookmarked">
                        <i class="bi bi-bookmark-star"></i> Bookmarked
                    </span>`
                );
            }

            if (this.pageSourceInfo.isInHistory) {
                const visitText = this.pageSourceInfo.visitCount
                    ? this.pageSourceInfo.visitCount + " visits"
                    : "In History";
                sourceIndicators.push(
                    `<span class="badge bg-info me-1" title="This page is in your browser history">
                        <i class="bi bi-clock-history"></i> ${visitText}
                    </span>`
                );
            }

            if (sourceIndicators.length > 0) {
                const sourceDiv = `<div class="mt-2">${sourceIndicators.join("")}</div>`;
                pageInfo.innerHTML = existingContent + sourceDiv;
            }
        }
    }

    private async loadAutoIndexSetting() {
        try {
            const enabled = await chromeExtensionService.getAutoIndexSetting();
            const toggle = document.getElementById("autoIndexToggle") as HTMLInputElement;
            toggle.checked = enabled;
        } catch (error) {
            console.error("Error loading auto-index setting:", error);
        }
    }

    private async toggleAutoIndex(enabled: boolean) {
        try {
            await chromeExtensionService.setAutoIndexSetting(enabled);

            const statusText = enabled ? "Auto-indexing enabled" : "Auto-indexing disabled";
            notificationManager.showTemporaryStatus(statusText, enabled ? "success" : "info");

            await chromeExtensionService.notifyAutoIndexSettingChanged(enabled);
        } catch (error) {
            console.error("Error toggling auto-index:", error);
        }
    }

    private async loadIndexStats() {
        try {
            const stats = await chromeExtensionService.getIndexStats();
            const statsElement = document.getElementById("indexStats");
            if (statsElement && stats) {
                statsElement.innerHTML = `
                    <div class="d-flex justify-content-between">
                        <span>Total Pages: ${stats.totalPages || 0}</span>
                        <span>Total Entities: ${stats.totalEntities || 0}</span>
                    </div>
                `;
            }
        } catch (error) {
            console.warn("Could not load index stats:", error);
        }
    }

    private async checkConnectionStatus() {
        try {
            const response = await chromeExtensionService.checkConnection();
            this.isConnected = response.connected;
            this.updateConnectionStatus();
        } catch (error) {
            this.isConnected = false;
            this.updateConnectionStatus();
        }
    }

    private updateConnectionStatus() {
        const statusElement = document.getElementById("connectionStatus");
        if (statusElement) {
            if (this.isConnected) {
                statusElement.innerHTML = `
                    <span class="badge bg-success">
                        <i class="bi bi-check-circle"></i> Connected
                    </span>
                `;
            } else {
                statusElement.innerHTML = `
                    <span class="badge bg-danger">
                        <i class="bi bi-x-circle"></i> Disconnected
                    </span>
                `;
            }
        }
    }

    async loadFreshKnowledge() {
        try {
            const indexStatus = await chromeExtensionService.getPageIndexStatus(this.currentUrl);

            if (indexStatus.isIndexed) {
                await this.loadIndexedKnowledge();
            } else {
                this.showNotIndexedState();
            }
        } catch (error) {
            console.error("Error loading fresh knowledge:", error);
            this.showConnectionError();
        }
    }

    private showConnectionError() {
        const knowledgeSection = document.getElementById("knowledgeSection")!;
        knowledgeSection.className = "";
        knowledgeSection.innerHTML = `
            <div class="knowledge-card card">
                <div class="card-body text-center">
                    <i class="bi bi-exclamation-triangle text-warning h3"></i>
                    <p class="mb-0">Unable to connect to knowledge service.</p>
                    <small class="text-muted">Check your connection and try again.</small>
                </div>
            </div>
        `;

        const questionsSection = document.getElementById("questionsSection")!;
        questionsSection.className = "knowledge-card card d-none";
    }

    private showIndexedKnowledgeIndicator() {
        const knowledgeSection = document.getElementById("knowledgeSection")!;
        const firstCard = knowledgeSection.querySelector(".knowledge-card");

        if (firstCard) {
            const indicatorDiv = document.createElement("div");
            indicatorDiv.className = "alert alert-info mt-2";
            indicatorDiv.innerHTML = `
                <small>
                    <i class="bi bi-info-circle me-1"></i>
                    This knowledge was loaded from the index. Use "Extract" for fresh analysis.
                </small>
            `;
            firstCard.appendChild(indicatorDiv);
        }
    }

    private createPageInfo(title: string, domain: string, status: string): string {
        return `
            <div class="d-flex align-items-center">
                <img src="https://www.google.com/s2/favicons?domain=${domain}" 
                     width="16" height="16" class="me-2" alt="favicon">
                <div class="flex-grow-1">
                    <div class="fw-semibold">${title || "Untitled"}</div>
                    <small class="text-muted">${domain}</small>
                </div>
                <div id="pageStatus" class="ms-2">${status}</div>
            </div>
        `;
    }

    getCurrentUrl(): string {
        return this.currentUrl;
    }

    getKnowledgeData(): KnowledgeData | null {
        return this.knowledgeData;
    }

    setKnowledgeData(data: KnowledgeData | null): void {
        this.knowledgeData = data;
    }

    getExtractionSettings(): ExtractionSettings {
        return this.extractionSettings;
    }

    setExtractionSettings(settings: ExtractionSettings): void {
        this.extractionSettings = settings;
    }

    getAIModelAvailable(): boolean {
        return this.aiModelAvailable;
    }

    setAIModelAvailable(available: boolean): void {
        this.aiModelAvailable = available;
    }

    async refreshPageStatusAfterIndexing() {
        try {
            const tab = await chromeExtensionService.getCurrentTab();
            if (tab) {
                this.currentUrl = tab.url || "";
                const pageInfo = document.getElementById("currentPageInfo")!;
                const domain = new URL(this.currentUrl).hostname;
                const status = await this.getPageIndexStatus(0);

                pageInfo.innerHTML = this.createPageInfo(tab.title || "Untitled", domain, status);
                await this.loadPageSourceInfo();
                this.updatePageSourceDisplay();
            }
        } catch (error) {
            console.error("Error refreshing page status after indexing:", error);
        }
    }

    private async loadIndexedKnowledge() {
        try {
            const response = await chromeExtensionService.getPageIndexedKnowledge(this.currentUrl);

            if (response.isIndexed && response.knowledge) {
                this.knowledgeData = response.knowledge;
                if (this.knowledgeData) {
                    await this.contentRenderingController.renderKnowledgeResults(this.knowledgeData);
                    this.showIndexedKnowledgeIndicator();
                }
            } else {
                this.showNotIndexedState();
            }
        } catch (error) {
            console.error("Error loading indexed knowledge:", error);
            this.showConnectionError();
        }
    }

    private showNotIndexedState() {
        const knowledgeSection = document.getElementById("knowledgeSection")!;
        knowledgeSection.className = "";
        knowledgeSection.innerHTML = `
            <div class="knowledge-card card">
                <div class="card-body text-center">
                    <i class="bi bi-info-circle text-info h3"></i>
                    <p class="mb-0">This page is not indexed yet.</p>
                    <small class="text-muted">Click "Extract" or "Index" to analyze this page.</small>
                </div>
            </div>
        `;

        const questionsSection = document.getElementById("questionsSection")!;
        questionsSection.className = "knowledge-card card d-none";
    }
}

let libraryPanelInstance: PageKnowledgeBaseController;
let isInitialized = false;

function initializeLibraryPanel() {
    if (isInitialized) {
        console.log("Page Knowledge Panel already initialized, skipping duplicate initialization");
        return;
    }

    isInitialized = true;
    libraryPanelInstance = new PageKnowledgeBaseController();
    libraryPanelInstance.initialize();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeLibraryPanel);
} else {
    initializeLibraryPanel();
}
