// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { LibraryBaseController, SearchSuggestion } from "./LibraryBaseController";
import {
    notificationManager,
    chromeExtensionService,
    KnowledgeTemplateHelpers as TemplateHelpers,
    KnowledgeFormatUtils as FormatUtils,
    Website,
    SearchResult,
    SearchFilters,
    KnowledgeStatus,
} from "../knowledgeUtilities";

interface EntityMatch {
    entity: string;
    type: string;
    count: number;
}

export class SearchViewController extends LibraryBaseController {
    private currentResults: Website[] = [];
    private currentViewMode: "list" | "grid" | "timeline" | "domain" = "list";
    private searchDebounceTimer: number | null = null;
    private recentSearches: string[] = [];
    private currentQuery: string = "";
    private searchSuggestions: SearchSuggestion[] = [];
    private suggestionDropdown: HTMLElement | null = null;
    private searchCache: Map<string, SearchResult> = new Map();

    async initialize(): Promise<void> {
        await super.initialize();
        this.setupSearchInterface();
        await this.loadRecentSearches();
        this.updateRecentSearchesUI();
        this.isInitialized = true;
    }

    private setupSearchInterface(): void {
        const searchInput = document.getElementById("searchInput") as HTMLInputElement;
        const searchButton = document.getElementById("searchButton");

        if (searchInput) {
            searchInput.addEventListener("input", (e) => {
                const target = e.target as HTMLInputElement;
                this.handleSearchInput(target.value);
            });

            searchInput.addEventListener("keypress", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    this.performSearch();
                }
            });

            searchInput.addEventListener("focus", () => {
                if (searchInput.value.length > 0) {
                    this.showSearchSuggestions(searchInput.value);
                }
            });

            searchInput.addEventListener("blur", () => {
                setTimeout(() => this.hideSearchSuggestions(), 150);
            });
        }

        if (searchButton) {
            searchButton.addEventListener("click", () => {
                this.performSearch();
            });
        }

        this.setupFilterControls();
        this.setupViewModeControls();
        this.setupSortControls();
    }
    private setupFilterControls(): void {
        const filterButton = document.getElementById("filterButton");
        const filterPanel = document.getElementById("filterPanel");
        const applyFiltersBtn = document.getElementById("applyFilters");
        const clearFiltersBtn = document.getElementById("clearFilters");

        if (filterButton && filterPanel) {
            filterButton.addEventListener("click", () => {
                filterPanel.classList.toggle("show");
            });
        }

        if (applyFiltersBtn) {
            applyFiltersBtn.addEventListener("click", () => {
                this.applyFilters();
            });
        }

        if (clearFiltersBtn) {
            clearFiltersBtn.addEventListener("click", () => {
                this.clearFilters();
            });
        }

        const filterInputs = document.querySelectorAll(".filter-input");
        filterInputs.forEach((input) => {
            input.addEventListener("change", () => {
                this.updateSearchFilters();
            });
        });
    }

    private setupViewModeControls(): void {
        const viewModeButtons = document.querySelectorAll(".view-btn");
        viewModeButtons.forEach((button) => {
            button.addEventListener("click", (e) => {
                const target = e.currentTarget as HTMLElement;
                const mode = target.getAttribute("data-view") as "list" | "grid" | "timeline" | "domain";
                if (mode) {
                    this.setViewMode(mode);
                }
            });
        });
    }

    private setupSortControls(): void {
        const sortSelect = document.getElementById("sortSelect") as HTMLSelectElement;
        if (sortSelect) {
            sortSelect.addEventListener("change", () => {
                this.applySorting();
            });
        }
    }

    private handleSearchInput(query: string): void {
        this.currentQuery = query;

        if (this.searchDebounceTimer) {
            clearTimeout(this.searchDebounceTimer);
        }

        this.searchDebounceTimer = window.setTimeout(async () => {
            if (query.length > 1) {
                await this.loadSearchSuggestions(query);
                await this.showSearchSuggestions(query);
            } else {
                this.hideSearchSuggestions();
            }
        }, 300);
    }

    private async performSearch(): Promise<void> {
        const query = this.currentQuery.trim();
        if (!query) return;

        this.hideSearchSuggestions();
        this.addToRecentSearches(query);
        this.showSearchLoading();

        try {
            const filters: SearchFilters = {};

            const dateFrom = (document.getElementById("dateFrom") as HTMLInputElement)?.value;
            const dateTo = (document.getElementById("dateTo") as HTMLInputElement)?.value;
            const sourceType = (document.getElementById("sourceFilter") as HTMLSelectElement)?.value;
            const domain = (document.getElementById("domainFilter") as HTMLInputElement)?.value;
            const minRelevance = parseInt((document.getElementById("relevanceFilter") as HTMLInputElement)?.value || "0");

            if (dateFrom) filters.dateFrom = dateFrom;
            if (dateTo) filters.dateTo = dateTo;
            if (sourceType) filters.sourceType = sourceType as "bookmarks" | "history";
            if (domain) filters.domain = domain;
            if (minRelevance > 0) filters.minRelevance = minRelevance;

            const cacheKey = `${query}-${JSON.stringify(filters)}`;

            if (this.searchCache.has(cacheKey)) {
                const cachedResults = this.searchCache.get(cacheKey)!;
                this.showSearchResults(cachedResults);
                return;
            }

            let results: SearchResult;

            if (this.isConnected) {
                results = await chromeExtensionService.searchWebMemories(query, filters);
                await chromeExtensionService.saveSearch(query, results);
            } else {
                results = await this.searchWebMemories(query, filters);
            }

            this.searchCache.set(cacheKey, results);
            await this.enhanceResultsWithKnowledge(results.websites);
            this.showSearchResults(results);
        } catch (error) {
            console.error("Search failed:", error);
            this.showSearchError("Search failed. Please check your connection and try again.");
            notificationManager.showError("Search failed", () => this.performSearch());
        }
    }

    private async enhanceResultsWithKnowledge(websites: Website[]): Promise<void> {
        const knowledgePromises = websites.map(async (website) => {
            try {
                if (this.knowledgeCache.has(website.url)) {
                    website.knowledge = this.knowledgeCache.get(website.url);
                    return;
                }

                if (this.isConnected) {
                    const knowledge = await chromeExtensionService.checkKnowledgeStatus(website.url);
                    website.knowledge = knowledge;
                    this.knowledgeCache.set(website.url, knowledge);
                } else {
                    website.knowledge = {
                        hasKnowledge: false,
                        status: "none" as const,
                    };
                }
            } catch (error) {
                console.error(`Failed to get knowledge status for ${website.url}:`, error);
                website.knowledge = {
                    hasKnowledge: false,
                    status: "error" as const,
                };
            }
        });

        await Promise.all(knowledgePromises);
    }

    private async searchWebMemories(query: string, filters: SearchFilters): Promise<SearchResult> {
        if (!this.isConnected) {
            this.showConnectionRequired();
            throw new Error("Connection required");
        }

        try {
            return await chromeExtensionService.searchWebMemories(query, filters);
        } catch (error) {
            console.error("Search failed:", error);
            throw error;
        }
    }

    private showSearchLoading(): void {
        const resultsContainer = document.getElementById("searchResults");
        const emptyState = document.getElementById("searchEmptyState");
        let loadingState = document.getElementById("searchLoadingState");

        if (resultsContainer) {
            resultsContainer.style.display = "block";
        }

        if (emptyState) {
            emptyState.style.display = "none";
        }

        const aiSummary = document.getElementById("aiSummary");
        const entitiesSection = document.getElementById("entitiesSection");
        if (aiSummary) {
            aiSummary.style.display = "none";
        }
        if (entitiesSection) {
            entitiesSection.style.display = "none";
        }

        // Create loading state if it doesn't exist
        if (!loadingState) {
            this.createSearchLoadingState();
            loadingState = document.getElementById("searchLoadingState");
        }

        if (loadingState) {
            loadingState.style.display = "block";
        }

        // Hide any existing results content while loading
        const resultsContent = document.getElementById("resultsContainer");
        if (resultsContent) {
            resultsContent.style.display = "none";
        }
    }

    private createSearchLoadingState(): void {
        const resultsContainer = document.getElementById("searchResults");
        if (!resultsContainer) return;

        // Create loading state container
        const loadingDiv = document.createElement("div");
        loadingDiv.id = "searchLoadingState";
        loadingDiv.style.display = "block";
        loadingDiv.innerHTML = `
            <div class="results-header">
                <h2 class="results-title">Searching...</h2>
            </div>
            <div class="text-center p-4">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Searching...</span>
                </div>
                <p class="mt-3 mb-0">Searching your library...</p>
            </div>
        `;

        // Insert the loading state into the results container
        resultsContainer.appendChild(loadingDiv);
    }

    private showSearchResults(results: SearchResult): void {
        this.currentResults = results.websites;
        
        const loadingState = document.getElementById("searchLoadingState");
        if (loadingState) {
            loadingState.style.display = "none";
        }

        this.renderSearchResults(results);
        this.updateSearchStats(results);
        this.renderSearchSuggestions(results.summary.entities || []);
    }

    protected async initializeDiscoverPage(): Promise<void> {
        // Implementation handled by DiscoverViewController
    }

    protected async initializeAnalyticsPage(): Promise<void> {
        // Implementation handled by AnalyticsViewController
    }

    public performSearchWithQuery(query: string): void {
        const searchInput = document.getElementById("searchInput") as HTMLInputElement;
        if (searchInput) {
            searchInput.value = query;
            this.currentQuery = query;
            this.performSearch();
        }
    }

    public extractKnowledge(url: string): void {
        if (this.isConnected) {
            chromeExtensionService.extractKnowledge(url).then(result => {
                if (result.success) {
                    notificationManager.showSuccess("Knowledge extraction started");
                    this.knowledgeCache.delete(url);
                } else {
                    notificationManager.showError("Failed to extract knowledge");
                }
            }).catch(error => {
                console.error("Knowledge extraction error:", error);
                notificationManager.showError("Knowledge extraction failed");
            });
        }
    }

    private renderSearchResults(results: SearchResult): void {
        const container = document.getElementById("resultsContainer");
        if (!container) return;

        if (results.websites.length === 0) {
            this.showNoResults();
            return;
        }

        container.className = "results-container";
        container.classList.add(`${this.currentViewMode}-view`);

        let html = "";
        switch (this.currentViewMode) {
            case "list":
                html = this.renderListView(results.websites);
                break;
            case "grid":
                html = this.renderGridView(results.websites);
                break;
            case "timeline":
                html = this.renderTimelineView(results.websites);
                break;
            case "domain":
                html = this.renderDomainView(results.websites);
                break;
        }

        container.innerHTML = `<div class="results-content">${html}</div>`;

        if (results.summary.text) {
            this.showAISummary(results.summary.text);
        }

        if (results.summary.entities && results.summary.entities.length > 0) {
            this.showEntities(results.summary.entities);
        }
    }

    private renderListView(websites: Website[]): string {
        return websites.map(website => `
            <div class="search-result-item">
                <div class="d-flex align-items-start">
                    <img src="https://www.google.com/s2/favicons?domain=${website.domain}" 
                         class="result-favicon me-2" alt="Favicon">
                    <div class="flex-grow-1">
                        <h6 class="mb-1">
                            <a href="${website.url}" target="_blank" class="text-decoration-none">
                                ${FormatUtils.escapeHtml(website.title)}
                            </a>
                        </h6>
                        <div class="result-domain text-muted mb-1">${website.domain}</div>
                        ${website.snippet ? `<p class="mb-2 text-muted small">${FormatUtils.escapeHtml(website.snippet)}</p>` : ""}
                        
                        <div class="d-flex align-items-center justify-content-between">
                            <div class="knowledge-badges">
                                ${this.renderKnowledgeBadges(website.knowledge)}
                            </div>
                            <div class="d-flex align-items-center gap-2">
                                ${website.knowledge?.confidence ? this.renderConfidenceIndicator(website.knowledge.confidence) : ""}
                                ${website.score ? `<span class="result-score">${Math.round(website.score * 100)}%</span>` : ""}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `).join("");
    }

    private renderGridView(websites: Website[]): string {
        return websites.map(website => `
            <div class="card result-card">
                <div class="card-body">
                    <div class="d-flex align-items-center mb-2">
                        <img src="https://www.google.com/s2/favicons?domain=${website.domain}" 
                             class="result-favicon me-2" alt="Favicon">
                        <h6 class="card-title mb-0 flex-grow-1">${FormatUtils.escapeHtml(website.title)}</h6>
                        ${website.score ? `<span class="result-score">${Math.round(website.score * 100)}%</span>` : ""}
                    </div>
                    
                    <div class="result-domain text-muted mb-2">${website.domain}</div>
                    ${website.snippet ? `<p class="card-text small mb-3">${FormatUtils.escapeHtml(website.snippet)}</p>` : ""}
                    
                    ${website.knowledge?.confidence ? `
                        <div class="mb-2">
                            ${this.renderConfidenceIndicator(website.knowledge.confidence)}
                        </div>
                    ` : ""}
                    
                    <div class="knowledge-badges">
                        ${this.renderKnowledgeBadges(website.knowledge)}
                    </div>
                    
                    <a href="${website.url}" target="_blank" class="stretched-link"></a>
                </div>
            </div>
        `).join("");
    }

    private renderTimelineView(websites: Website[]): string {
        const grouped = websites.reduce((acc, website) => {
            const date = website.lastVisited 
                ? new Date(website.lastVisited).toDateString() 
                : "Unknown Date";
            if (!acc[date]) acc[date] = [];
            acc[date].push(website);
            return acc;
        }, {} as Record<string, Website[]>);

        return Object.entries(grouped).map(([date, sites]) => `
            <div class="timeline-item">
                <div class="timeline-date">${date === "Unknown Date" ? "Recently Added" : date}</div>
                
                ${sites.map(website => `
                    <div class="search-result-item mb-3 border-0 p-0">
                        <div class="d-flex align-items-start">
                            <img src="https://www.google.com/s2/favicons?domain=${website.domain}" 
                                 class="result-favicon me-2" alt="Favicon">
                            <div class="flex-grow-1">
                                <h6 class="mb-1">
                                    <a href="${website.url}" target="_blank" class="text-decoration-none">
                                        ${FormatUtils.escapeHtml(website.title)}
                                    </a>
                                </h6>
                                <div class="result-domain text-muted mb-1">${website.domain}</div>
                                ${website.snippet ? `<p class="mb-2 text-muted small">${FormatUtils.escapeHtml(website.snippet)}</p>` : ""}
                                
                                <div class="d-flex align-items-center justify-content-between">
                                    <div class="knowledge-badges">
                                        ${this.renderKnowledgeBadges(website.knowledge)}
                                    </div>
                                    <div class="d-flex align-items-center gap-2">
                                        ${website.knowledge?.confidence ? this.renderConfidenceIndicator(website.knowledge.confidence) : ""}
                                        ${website.score ? `<span class="result-score">${Math.round(website.score * 100)}%</span>` : ""}
                                    </div>
                                </div>
                                
                                ${website.lastVisited ? `
                                    <div class="mt-1">
                                        <small class="text-muted">
                                            <i class="bi bi-clock me-1"></i>
                                            ${new Date(website.lastVisited).toLocaleTimeString()}
                                        </small>
                                    </div>
                                ` : ""}
                            </div>
                        </div>
                    </div>
                `).join("")}
            </div>
        `).join("");
    }

    private renderDomainView(websites: Website[]): string {
        const grouped = websites.reduce((acc, website) => {
            if (!acc[website.domain]) {
                acc[website.domain] = {
                    sites: [],
                    totalEntities: 0,
                    totalTopics: 0,
                    totalActions: 0,
                    extractedCount: 0,
                };
            }
            acc[website.domain].sites.push(website);

            if (website.knowledge?.entityCount) {
                acc[website.domain].totalEntities += website.knowledge.entityCount;
            }
            if (website.knowledge?.topicCount) {
                acc[website.domain].totalTopics += website.knowledge.topicCount;
            }
            if (website.knowledge?.suggestionCount) {
                acc[website.domain].totalActions += website.knowledge.suggestionCount;
            }
            if (website.knowledge?.status === "extracted") {
                acc[website.domain].extractedCount++;
            }

            return acc;
        }, {} as Record<string, {
            sites: Website[];
            totalEntities: number;
            totalTopics: number;
            totalActions: number;
            extractedCount: number;
        }>);

        return Object.entries(grouped).map(([domain, data]) => `
            <div class="domain-group">
                <div class="domain-header">
                    <div class="d-flex align-items-center justify-content-between">
                        <div class="d-flex align-items-center">
                            <img src="https://www.google.com/s2/favicons?domain=${domain}" 
                                 class="result-favicon me-2" alt="Favicon">
                            <div>
                                <strong>${domain}</strong>
                                <div class="small text-muted">${data.sites.length} pages</div>
                            </div>
                        </div>
                        <div class="d-flex gap-2">
                            <span class="badge">${data.sites.length}</span>
                            ${data.extractedCount > 0 ? `<span class="knowledge-badge extracted small">${data.extractedCount} extracted</span>` : ""}
                        </div>
                    </div>
                    
                    ${data.totalEntities > 0 || data.totalTopics > 0 || data.totalActions > 0 ? `
                        <div class="domain-knowledge-summary mt-2">
                            <div class="knowledge-badges">
                                ${data.totalEntities > 0 ? `<span class="knowledge-badge entity small">${data.totalEntities} Entities</span>` : ""}
                                ${data.totalTopics > 0 ? `<span class="knowledge-badge topic small">${data.totalTopics} Topics</span>` : ""}
                                ${data.totalActions > 0 ? `<span class="knowledge-badge action small">${data.totalActions} Actions</span>` : ""}
                            </div>
                        </div>
                    ` : ""}
                </div>
                
                <div class="domain-content">
                    ${data.sites.map(website => `
                        <div class="search-result-item">
                            <h6 class="mb-1">
                                <a href="${website.url}" target="_blank" class="text-decoration-none">
                                    ${FormatUtils.escapeHtml(website.title)}
                                </a>
                            </h6>
                            ${website.snippet ? `<p class="mb-2 text-muted small">${FormatUtils.escapeHtml(website.snippet)}</p>` : ""}
                            
                            <div class="d-flex align-items-center justify-content-between">
                                <div class="knowledge-badges">
                                    ${this.renderKnowledgeBadges(website.knowledge)}
                                </div>
                                <div class="d-flex align-items-center gap-2">
                                    ${website.knowledge?.confidence ? this.renderConfidenceIndicator(website.knowledge.confidence) : ""}
                                    ${website.score ? `<span class="result-score">${Math.round(website.score * 100)}%</span>` : ""}
                                </div>
                            </div>
                        </div>
                    `).join("")}
                </div>
            </div>
        `).join("");
    }

    private showNoResults(): void {
        const container = document.getElementById("resultsContainer");
        if (container) {
            container.innerHTML = `
                <div class="no-results">
                    <i class="bi bi-search"></i>
                    <h5>No results found</h5>
                    <p>Try adjusting your search terms or filters</p>
                </div>
            `;
        }
    }

    private showConnectionRequired(): void {
        const container = document.getElementById("resultsContainer");
        if (container) {
            container.innerHTML = `
                <div class="connection-required">
                    <i class="bi bi-wifi-off"></i>
                    <h5>Connection Required</h5>
                    <p>Please connect to the TypeAgent service to search.</p>
                </div>
            `;
        }
    }

    private showSearchError(message: string): void {
        const container = document.getElementById("resultsContainer");
        if (container) {
            container.innerHTML = `
                <div class="search-error">
                    <i class="bi bi-exclamation-triangle"></i>
                    <h5>Search Error</h5>
                    <p>${message}</p>
                </div>
            `;
        }
    }

    private updateSearchStats(results: SearchResult): void {
        // Update results header with stats if available
        const resultsHeader = document.querySelector(".results-header .results-title");
        if (resultsHeader) {
            resultsHeader.textContent = `Found ${results.summary.totalFound} results`;
        }
    }

    private updateRecentSearchesUI(): void {
        const container = document.getElementById("recentSearchesList");
        if (!container) return;

        if (this.recentSearches.length === 0) {
            container.innerHTML = '<span class="empty-message">No recent searches</span>';
            return;
        }

        container.innerHTML = "";

        this.recentSearches.forEach((query) => {
            const span = document.createElement("span");
            span.className = "recent-search-tag";
            span.setAttribute("data-query", query);
            span.textContent = query;
            container.appendChild(span);
        });

        container.querySelectorAll(".recent-search-tag").forEach((tag) => {
            tag.addEventListener("click", () => {
                const query = tag.getAttribute("data-query");
                if (query) {
                    this.performSearchWithQuery(query);
                }
            });
        });
    }

    private renderSearchSuggestions(suggestions: any[]): void {
        // Load search suggestions for the current query
        if (this.currentQuery.length > 1) {
            this.loadSearchSuggestions(this.currentQuery);
        }
    }

    private async loadSearchSuggestions(query: string): Promise<void> {
        try {
            let suggestions: SearchSuggestion[] = [];

            if (this.isConnected) {
                const suggestionTexts = await chromeExtensionService.getSearchSuggestions(query);
                suggestions = suggestionTexts.map((text) => ({
                    text,
                    type: "auto" as const,
                    metadata: {},
                }));
            }

            // Add recent searches if they match
            const recentMatches = this.recentSearches
                .filter((search) => search.toLowerCase().includes(query.toLowerCase()))
                .slice(0, 3)
                .map((text) => ({
                    text,
                    type: "recent" as const,
                    metadata: { lastUsed: "Recently" },
                }));

            this.searchSuggestions = [
                ...recentMatches,
                ...suggestions.filter(s => !recentMatches.some(r => r.text === s.text)),
            ].slice(0, 8);
        } catch (error) {
            console.error("Failed to load search suggestions:", error);
            this.searchSuggestions = [];
        }
    }

    private async showSearchSuggestions(query: string): Promise<void> {
        if (!this.suggestionDropdown) {
            this.createSuggestionDropdown();
        }

        if (!this.suggestionDropdown || this.searchSuggestions.length === 0) return;

        const suggestionsHtml = this.searchSuggestions.map(suggestion => `
            <div class="suggestion-item dropdown-item d-flex align-items-center justify-content-between" 
                 data-suggestion="${suggestion.text}">
                <div class="d-flex align-items-center">
                    <i class="bi ${this.getSuggestionIcon(suggestion.type)} me-2 text-muted"></i>
                    <span>${this.highlightMatch(suggestion.text, query)}</span>
                </div>
                <div class="suggestion-metadata">
                    ${this.renderSuggestionMetadata(suggestion)}
                </div>
            </div>
        `).join("");

        this.suggestionDropdown.innerHTML = suggestionsHtml;
        this.suggestionDropdown.style.display = "block";

        this.suggestionDropdown.querySelectorAll(".suggestion-item").forEach((item) => {
            item.addEventListener("click", () => {
                const text = item.getAttribute("data-suggestion");
                if (text) {
                    const searchInput = document.getElementById("searchInput") as HTMLInputElement;
                    if (searchInput) {
                        searchInput.value = text;
                        this.currentQuery = text;
                        this.hideSearchSuggestions();
                        this.performSearch();
                    }
                }
            });
        });
    }

    private createSuggestionDropdown(): void {
        const searchInput = document.getElementById("searchInput");
        if (!searchInput) return;

        this.suggestionDropdown = document.createElement("div");
        this.suggestionDropdown.className = "search-suggestions dropdown-menu";
        this.suggestionDropdown.style.position = "absolute";
        this.suggestionDropdown.style.top = "100%";
        this.suggestionDropdown.style.left = "0";
        this.suggestionDropdown.style.width = "100%";
        this.suggestionDropdown.style.zIndex = "1000";
        this.suggestionDropdown.style.display = "none";

        const searchContainer = searchInput.parentElement;
        if (searchContainer) {
            searchContainer.style.position = "relative";
            searchContainer.appendChild(this.suggestionDropdown);
        }
    }

    private getSuggestionIcon(type: string): string {
        switch (type) {
            case "recent":
                return "bi-clock-history";
            case "entity":
                return "bi-diagram-2";
            case "topic":
                return "bi-tags";
            case "domain":
                return "bi-globe";
            default:
                return "bi-search";
        }
    }

    private highlightMatch(text: string, query: string): string {
        if (!query) return text;
        const regex = new RegExp(`(${query})`, "gi");
        return text.replace(regex, "<strong>$1</strong>");
    }

    private renderSuggestionMetadata(suggestion: SearchSuggestion): string {
        if (!suggestion.metadata) return "";

        const { count, lastUsed, source } = suggestion.metadata;

        if (count) {
            return `<small class="text-muted">${count} results</small>`;
        }
        if (lastUsed) {
            return `<small class="text-muted">${lastUsed}</small>`;
        }
        if (source) {
            return `<small class="text-muted">from ${source}</small>`;
        }
        return "";
    }

    private hideSearchSuggestions(): void {
        if (this.suggestionDropdown) {
            this.suggestionDropdown.style.display = 'none';
        }
    }

    private addToRecentSearches(query: string): void {
        this.recentSearches = this.recentSearches.filter(s => s !== query);
        this.recentSearches.unshift(query);
        this.recentSearches = this.recentSearches.slice(0, 10);
        this.saveRecentSearches();
    }

    private async loadRecentSearches(): Promise<void> {
        try {
            const stored = localStorage.getItem('libraryRecentSearches');
            if (stored) {
                this.recentSearches = JSON.parse(stored);
            }
        } catch (error) {
            console.error("Failed to load recent searches:", error);
            this.recentSearches = [];
        }
    }

    private saveRecentSearches(): void {
        try {
            localStorage.setItem('libraryRecentSearches', JSON.stringify(this.recentSearches));
        } catch (error) {
            console.error("Failed to save recent searches:", error);
        }
    }

    private setViewMode(mode: "list" | "grid" | "timeline" | "domain"): void {
        this.currentViewMode = mode;
        this.userPreferences.viewMode = mode;
        this.saveUserPreferences();

        // Update UI buttons
        document.querySelectorAll(".view-btn").forEach((btn) => {
            btn.classList.remove("active");
        });

        const activeBtn = document.querySelector(`[data-view="${mode}"]`);
        if (activeBtn) {
            activeBtn.classList.add("active");
        }

        // Re-render results if we have any
        if (this.currentResults.length > 0) {
            const mockResult: SearchResult = {
                websites: this.currentResults,
                summary: {
                    text: "",
                    totalFound: this.currentResults.length,
                    searchTime: 0,
                    sources: [],
                    entities: [],
                },
                query: this.currentQuery,
                filters: {},
            };
            this.renderSearchResults(mockResult);
        }
    }

    private renderKnowledgeBadges(knowledge?: KnowledgeStatus): string {
        if (!knowledge?.hasKnowledge) return "";

        const badges = [];

        if (knowledge.entityCount && knowledge.entityCount > 0) {
            badges.push(`
                <span class="knowledge-badge entity" title="${knowledge.entityCount} entities extracted">
                    <i class="bi bi-diagram-2"></i>
                    ${knowledge.entityCount} Entities
                </span>
            `);
        }

        if (knowledge.topicCount && knowledge.topicCount > 0) {
            badges.push(`
                <span class="knowledge-badge topic" title="${knowledge.topicCount} topics identified">
                    <i class="bi bi-tags"></i>
                    ${knowledge.topicCount} Topics
                </span>
            `);
        }

        if (knowledge.suggestionCount && knowledge.suggestionCount > 0) {
            badges.push(`
                <span class="knowledge-badge action" title="${knowledge.suggestionCount} actions detected">
                    <i class="bi bi-lightning"></i>
                    ${knowledge.suggestionCount} Actions
                </span>
            `);
        }

        if (knowledge.status === "extracted") {
            badges.push(`
                <span class="knowledge-badge extracted" title="Knowledge successfully extracted">
                    <i class="bi bi-check-circle"></i>
                    Extracted
                </span>
            `);
        }

        return badges.join("");
    }

    private renderConfidenceIndicator(confidence: number): string {
        const percentage = Math.round(confidence * 100);
        let color = "#dc3545"; // Red for low confidence

        if (confidence >= 0.7) {
            color = "#28a745"; // Green for high confidence
        } else if (confidence >= 0.4) {
            color = "#ffc107"; // Yellow for medium confidence
        }

        return `
            <div class="confidence-indicator" title="Confidence: ${percentage}%">
                <span class="text-muted small">Confidence:</span>
                <div class="confidence-bar">
                    <div class="confidence-fill" style="width: ${percentage}%; background-color: ${color}"></div>
                </div>
                <span class="small">${percentage}%</span>
            </div>
        `;
    }

    private showAISummary(summary: string): void {
        const summarySection = document.getElementById("aiSummary");
        const summaryContent = document.getElementById("summaryContent");

        if (summarySection && summaryContent) {
            summaryContent.textContent = summary;
            summarySection.style.display = "block";
        }
    }

    private showEntities(entities: any[]): void {
        const entitiesSection = document.getElementById("entitiesSection");
        const entitiesContent = document.getElementById("entitiesContent");

        if (entitiesSection && entitiesContent && entities.length > 0) {
            const sortedEntities = entities.sort((a, b) => b.count - a.count);

            const entityTagsHtml = sortedEntities.map(entity => `
                <div class="entity-tag" title="${entity.type}: found ${entity.count} time${entity.count !== 1 ? "s" : ""}">
                    <span>${entity.entity}</span>
                    <span class="entity-count">${entity.count}</span>
                </div>
            `).join("");

            entitiesContent.innerHTML = `
                <div class="entity-tags">
                    ${entityTagsHtml}
                </div>
            `;

            entitiesSection.style.display = "block";
        } else if (entitiesSection) {
            entitiesSection.style.display = "none";
        }
    }

    private applyFilters(): void {
        if (this.currentQuery && this.currentResults.length > 0) {
            this.performSearch();
        }
    }

    private clearFilters(): void {
        const filterInputs = document.querySelectorAll('.filter-input') as NodeListOf<HTMLInputElement>;
        filterInputs.forEach(input => {
            input.value = '';
        });
        
        if (this.currentQuery && this.currentResults.length > 0) {
            this.performSearch();
        }
    }

    private updateSearchFilters(): void {
        if (this.currentQuery && this.currentResults.length > 0) {
            this.performSearch();
        }
    }

    private applySorting(): void {
        // Implementation would go here for sorting results
    }
}
