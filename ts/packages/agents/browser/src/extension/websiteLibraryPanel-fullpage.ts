// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// Full-page Website Library implementation
// Extends the existing interfaces and functionality for full-page layout

interface FullPageNavigation {
    currentPage: "search" | "discover" | "analytics";
    previousPage: string | null;
}

interface DiscoverInsights {
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
    popularPages: Website[];
    topDomains: Array<{
        domain: string;
        count: number;
        favicon?: string;
    }>;
}

interface AnalyticsData {
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
}

// Import existing interfaces
interface ImportOptions {
    source: "chrome" | "edge";
    type: "bookmarks" | "history";
    limit?: number;
    days?: number;
    folder?: string;
    extractContent?: boolean;
    enableIntelligentAnalysis?: boolean;
    enableActionDetection?: boolean;
    extractionMode?: "basic" | "content" | "actions" | "full";
    maxConcurrent?: number;
    contentTimeout?: number;
}

interface LibraryStats {
    totalWebsites: number;
    totalBookmarks: number;
    totalHistory: number;
    topDomains: number;
    lastImport?: number;
}

interface SearchFilters {
    dateFrom?: string;
    dateTo?: string;
    sourceType?: "bookmarks" | "history";
    domain?: string;
    minRelevance?: number;
}

interface KnowledgeStatus {
    hasKnowledge: boolean;
    extractionDate?: string;
    entityCount?: number;
    topicCount?: number;
    suggestionCount?: number;
    status: "extracted" | "pending" | "error" | "none";
    confidence?: number;
}

interface Website {
    url: string;
    title: string;
    domain: string;
    visitCount?: number;
    lastVisited?: string;
    source: "bookmarks" | "history";
    score?: number;
    snippet?: string;
    knowledge?: KnowledgeStatus;
}

interface SearchResult {
    websites: Website[];
    summary: {
        text: string;
        totalFound: number;
        searchTime: number;
        sources: SourceReference[];
        entities: EntityMatch[];
    };
    query: string;
    filters: SearchFilters;
}

interface SourceReference {
    url: string;
    title: string;
    relevance: number;
}

interface EntityMatch {
    entity: string;
    type: string;
    count: number;
}

class WebsiteLibraryPanelFullPage {
    private isConnected: boolean = false;
    private navigation: FullPageNavigation = {
        currentPage: "search",
        previousPage: null
    };
    
    // Search functionality
    private currentResults: Website[] = [];
    private currentViewMode: "list" | "grid" | "timeline" | "domain" = "list";
    private searchDebounceTimer: number | null = null;
    private recentSearches: string[] = [];
    private currentQuery: string = "";
    private currentSearchMode: string = "auto";
    
    // Data storage
    private libraryStats: LibraryStats = {
        totalWebsites: 0,
        totalBookmarks: 0,
        totalHistory: 0,
        topDomains: 0
    };
    private discoverData: DiscoverInsights | null = null;
    private analyticsData: AnalyticsData | null = null;

    async initialize() {
        console.log("Initializing Full-Page Website Library Panel");
        
        this.setupNavigation();
        this.setupSearchInterface();
        this.setupEventListeners();
        await this.checkConnectionStatus();
        await this.loadLibraryStats();
        await this.loadRecentSearches();
        this.showPage("search");
    }

    private setupNavigation() {
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                const target = e.currentTarget as HTMLElement;
                const page = target.getAttribute('data-page') as "search" | "discover" | "analytics";
                if (page) {
                    this.navigateToPage(page);
                }
            });
        });
    }

    private setupSearchInterface() {
        // Search input
        const searchInput = document.getElementById('searchInput') as HTMLInputElement;
        const searchButton = document.getElementById('searchButton');
        
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const target = e.target as HTMLInputElement;
                this.handleSearchInput(target.value);
            });
            
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.performSearch();
                }
            });
        }
        
        if (searchButton) {
            searchButton.addEventListener('click', () => {
                this.performSearch();
            });
        }
        
        // Search mode buttons
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.currentTarget as HTMLElement;
                const mode = target.getAttribute('data-mode');
                if (mode) {
                    this.setSearchMode(mode);
                }
            });
        });
        
        // View mode buttons
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.currentTarget as HTMLElement;
                const view = target.getAttribute('data-view') as "list" | "grid" | "timeline" | "domain";
                if (view) {
                    this.setViewMode(view);
                }
            });
        });
        
        this.setupFilterControls();
    }

    private async checkConnectionStatus() {
        // Mock implementation - replace with actual connection check
        this.isConnected = true;
        this.updateConnectionStatus();
    }

    private updateConnectionStatus() {
        const statusElement = document.getElementById('connectionStatus');
        if (statusElement) {
            const indicator = statusElement.querySelector('.status-indicator');
            const text = statusElement.querySelector('span:last-child');
            
            if (indicator && text) {
                if (this.isConnected) {
                    indicator.className = 'status-indicator status-connected';
                    text.textContent = 'Connected';
                } else {
                    indicator.className = 'status-indicator status-disconnected';
                    text.textContent = 'Disconnected';
                }
            }
        }
    }

    private async loadLibraryStats() {
        // Mock implementation - replace with actual data loading
        this.libraryStats = {
            totalWebsites: 1247,
            totalBookmarks: 324,
            totalHistory: 923,
            topDomains: 45
        };
        this.updateStatsDisplay();
    }

    private updateStatsDisplay() {
        const updates: Array<[string, number]> = [
            ['totalWebsites', this.libraryStats.totalWebsites],
            ['totalBookmarks', this.libraryStats.totalBookmarks], 
            ['totalHistory', this.libraryStats.totalHistory],
            ['topDomains', this.libraryStats.topDomains]
        ];

        updates.forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = value.toString();
            }
        });
    }

    private navigateToPage(page: "search" | "discover" | "analytics") {
        // Update navigation state
        this.navigation.previousPage = this.navigation.currentPage;
        this.navigation.currentPage = page;
        
        // Update UI
        this.updateNavigation();
        this.showPage(page);
        
        // Load page-specific data
        switch (page) {
            case "search":
                this.initializeSearchPage();
                break;
            case "discover":
                this.initializeDiscoverPage();
                break;
            case "analytics":
                this.initializeAnalyticsPage();
                break;
        }
    }

    private updateNavigation() {
        // Update active navigation item
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        
        const activeItem = document.querySelector(`[data-page="${this.navigation.currentPage}"]`);
        if (activeItem) {
            activeItem.classList.add('active');
        }
    }

    private showPage(page: string) {
        // Hide all pages
        document.querySelectorAll('.page-content').forEach(pageEl => {
            pageEl.classList.remove('active');
        });
        
        // Show current page
        const currentPageEl = document.getElementById(`${page}-page`);
        if (currentPageEl) {
            currentPageEl.classList.add('active');
        }
    }

    private setupFilterControls() {
        const relevanceFilter = document.getElementById('relevanceFilter') as HTMLInputElement;
        if (relevanceFilter) {
            relevanceFilter.addEventListener('input', (e) => {
                const value = (e.target as HTMLInputElement).value;
                const valueDisplay = document.getElementById('relevanceValue');
                if (valueDisplay) {
                    valueDisplay.textContent = `${value}%`;
                }
            });
        }

        // Setup date filters
        const dateFrom = document.getElementById('dateFrom') as HTMLInputElement;
        const dateTo = document.getElementById('dateTo') as HTMLInputElement;
        
        if (dateFrom) {
            dateFrom.addEventListener('change', () => this.updateSearchFilters());
        }
        if (dateTo) {
            dateTo.addEventListener('change', () => this.updateSearchFilters());
        }

        // Setup other filters
        const sourceFilter = document.getElementById('sourceFilter') as HTMLSelectElement;
        const domainFilter = document.getElementById('domainFilter') as HTMLInputElement;
        
        if (sourceFilter) {
            sourceFilter.addEventListener('change', () => this.updateSearchFilters());
        }
        if (domainFilter) {
            domainFilter.addEventListener('input', () => this.updateSearchFilters());
        }

        // Setup knowledge filters
        const knowledgeFilters = [
            'hasEntitiesFilter',
            'hasTopicsFilter', 
            'hasActionsFilter',
            'knowledgeExtractedFilter'
        ];
        
        knowledgeFilters.forEach(filterId => {
            const filter = document.getElementById(filterId) as HTMLInputElement;
            if (filter) {
                filter.addEventListener('change', () => this.updateSearchFilters());
            }
        });
    }

    private setupEventListeners() {
        // Settings button
        const settingsButton = document.getElementById('settingsButton');
        if (settingsButton) {
            settingsButton.addEventListener('click', () => {
                this.showSettings();
            });
        }

        // Quick action buttons
        document.querySelectorAll('.action-btn').forEach(btn => {
            const onclick = btn.getAttribute('onclick');
            if (onclick && !btn.hasAttribute('data-handler-set')) {
                btn.setAttribute('data-handler-set', 'true');
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.handleQuickAction(btn);
                });
            }
        });
    }

    private handleQuickAction(button: Element) {
        const onclick = button.getAttribute('onclick');
        if (onclick) {
            if (onclick.includes('showImportModal')) {
                this.showImportModal();
            } else if (onclick.includes('exploreRecentBookmarks')) {
                this.exploreRecentBookmarks();
            } else if (onclick.includes('exploreMostVisited')) {
                this.exploreMostVisited();
            } else if (onclick.includes('exploreByDomain')) {
                this.exploreByDomain();
            }
        }
    }

    private setSearchMode(mode: string) {
        this.currentSearchMode = mode;
        
        // Update UI
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        const activeBtn = document.querySelector(`[data-mode="${mode}"]`);
        if (activeBtn) {
            activeBtn.classList.add('active');
        }
    }

    private setViewMode(view: "list" | "grid" | "timeline" | "domain") {
        this.currentViewMode = view;
        
        // Update UI
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        const activeBtn = document.querySelector(`[data-view="${view}"]`);
        if (activeBtn) {
            activeBtn.classList.add('active');
        }
        
        // Re-render results with new view
        if (this.currentResults.length > 0) {
            this.renderSearchResults(this.currentResults);
        }
    }

    private handleSearchInput(query: string) {
        this.currentQuery = query;
        
        // Clear previous debounce timer
        if (this.searchDebounceTimer) {
            clearTimeout(this.searchDebounceTimer);
        }
        
        // Set new debounce timer
        this.searchDebounceTimer = window.setTimeout(() => {
            if (query.length >= 2) {
                this.showSearchSuggestions(query);
            } else {
                this.hideSearchSuggestions();
            }
        }, 300);
    }

    private async performSearch() {
        const query = this.currentQuery.trim();
        if (!query) return;
        
        // Add to recent searches
        this.addToRecentSearches(query);
        
        // Show loading state
        this.showSearchLoading();
        
        try {
            // Get search filters
            const filters = this.getSearchFilters();
            
            // Perform search (mock implementation)
            const results = await this.searchWebsites(query, filters);
            
            // Show results
            this.showSearchResults(results);
            
        } catch (error) {
            console.error('Search failed:', error);
            this.showSearchError('Search failed. Please try again.');
        }
    }

    private getSearchFilters(): SearchFilters {
        const filters: SearchFilters = {};
        
        const dateFrom = (document.getElementById('dateFrom') as HTMLInputElement)?.value;
        const dateTo = (document.getElementById('dateTo') as HTMLInputElement)?.value;
        const sourceType = (document.getElementById('sourceFilter') as HTMLSelectElement)?.value;
        const domain = (document.getElementById('domainFilter') as HTMLInputElement)?.value;
        const minRelevance = parseInt((document.getElementById('relevanceFilter') as HTMLInputElement)?.value || '0');
        
        if (dateFrom) filters.dateFrom = dateFrom;
        if (dateTo) filters.dateTo = dateTo;
        if (sourceType) filters.sourceType = sourceType as "bookmarks" | "history";
        if (domain) filters.domain = domain;
        if (minRelevance > 0) filters.minRelevance = minRelevance;
        
        return filters;
    }

    private updateSearchFilters() {
        // If there's an active search, re-run it with new filters
        if (this.currentQuery && this.currentResults.length > 0) {
            this.performSearch();
        }
    }

    private async searchWebsites(query: string, filters: SearchFilters): Promise<SearchResult> {
        // Mock search implementation - replace with actual API call
        const mockResults: Website[] = [
            {
                url: "https://example.com",
                title: "Example Website",
                domain: "example.com",
                source: "bookmarks",
                score: 0.95,
                snippet: "This is a sample search result...",
                knowledge: {
                    hasKnowledge: true,
                    status: "extracted",
                    entityCount: 5,
                    topicCount: 3,
                    confidence: 0.8
                }
            }
        ];
        
        return {
            websites: mockResults,
            summary: {
                text: `Found ${mockResults.length} results for "${query}"`,
                totalFound: mockResults.length,
                searchTime: 0.15,
                sources: [],
                entities: []
            },
            query,
            filters
        };
    }

    private showSearchLoading() {
        const resultsContainer = document.getElementById('searchResults');
        const emptyState = document.getElementById('searchEmptyState');
        
        if (resultsContainer) {
            resultsContainer.style.display = 'block';
            resultsContainer.innerHTML = `
                <div class="results-header">
                    <h2 class="results-title">Searching...</h2>
                </div>
                <div class="results-container">
                    <div class="text-center">
                        <div class="spinner-border text-primary" role="status">
                            <span class="visually-hidden">Searching...</span>
                        </div>
                        <p class="mt-3">Searching your library...</p>
                    </div>
                </div>
            `;
        }
        
        if (emptyState) {
            emptyState.style.display = 'none';
        }
    }

    private showSearchResults(results: SearchResult) {
        this.currentResults = results.websites;
        
        const resultsContainer = document.getElementById('searchResults');
        const emptyState = document.getElementById('searchEmptyState');
        
        if (emptyState) {
            emptyState.style.display = 'none';
        }
        
        if (resultsContainer) {
            resultsContainer.style.display = 'block';
            this.renderSearchResults(results.websites);
            
            // Show AI summary if available
            if (results.summary.text) {
                this.showAISummary(results.summary.text);
            }
        }
    }

    private renderSearchResults(websites: Website[]) {
        const container = document.getElementById('resultsContainer');
        if (!container) return;
        
        let html = '';
        
        switch (this.currentViewMode) {
            case 'list':
                html = this.renderListView(websites);
                break;
            case 'grid':
                html = this.renderGridView(websites);
                break;
            case 'timeline':
                html = this.renderTimelineView(websites);
                break;
            case 'domain':
                html = this.renderDomainView(websites);
                break;
        }
        
        container.innerHTML = html;
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
                                ${website.title}
                            </a>
                        </h6>
                        <div class="result-domain text-muted mb-1">${website.domain}</div>
                        ${website.snippet ? `<p class="mb-2 text-muted small">${website.snippet}</p>` : ''}
                        <div class="d-flex align-items-center gap-2">
                            ${website.knowledge?.hasKnowledge ? `
                                <span class="entity-badge">
                                    <i class="bi bi-lightbulb me-1"></i>Knowledge
                                </span>
                            ` : ''}
                            ${website.score ? `
                                <span class="result-score">${Math.round(website.score * 100)}%</span>
                            ` : ''}
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
    }

    private renderGridView(websites: Website[]): string {
        const gridHtml = websites.map(website => `
            <div class="card result-card">
                <div class="card-body">
                    <div class="d-flex align-items-center mb-2">
                        <img src="https://www.google.com/s2/favicons?domain=${website.domain}" 
                             class="result-favicon me-2" alt="Favicon">
                        <h6 class="card-title mb-0">${website.title}</h6>
                    </div>
                    <div class="result-domain text-muted mb-2">${website.domain}</div>
                    ${website.snippet ? `<p class="card-text small">${website.snippet}</p>` : ''}
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            ${website.knowledge?.hasKnowledge ? `
                                <span class="entity-badge small">
                                    <i class="bi bi-lightbulb"></i>
                                </span>
                            ` : ''}
                        </div>
                        ${website.score ? `
                            <span class="result-score">${Math.round(website.score * 100)}%</span>
                        ` : ''}
                    </div>
                    <a href="${website.url}" target="_blank" class="stretched-link"></a>
                </div>
            </div>
        `).join('');
        
        return `<div class="row row-cols-1 row-cols-md-2 row-cols-lg-3 g-3">${gridHtml}</div>`;
    }

    private renderTimelineView(websites: Website[]): string {
        // Group by date for timeline view
        const grouped = websites.reduce((acc, website) => {
            const date = website.lastVisited ? new Date(website.lastVisited).toDateString() : 'Unknown';
            if (!acc[date]) acc[date] = [];
            acc[date].push(website);
            return acc;
        }, {} as Record<string, Website[]>);

        return Object.entries(grouped).map(([date, sites]) => `
            <div class="timeline-item">
                <div class="timeline-date fw-semibold text-primary mb-2">${date}</div>
                ${sites.map(website => `
                    <div class="search-result-item mb-2">
                        <div class="d-flex align-items-center">
                            <img src="https://www.google.com/s2/favicons?domain=${website.domain}" 
                                 class="result-favicon me-2" alt="Favicon">
                            <div>
                                <a href="${website.url}" target="_blank" class="text-decoration-none">
                                    ${website.title}
                                </a>
                                <div class="result-domain text-muted small">${website.domain}</div>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `).join('');
    }

    private renderDomainView(websites: Website[]): string {
        // Group by domain
        const grouped = websites.reduce((acc, website) => {
            if (!acc[website.domain]) acc[website.domain] = [];
            acc[website.domain].push(website);
            return acc;
        }, {} as Record<string, Website[]>);

        return Object.entries(grouped).map(([domain, sites]) => `
            <div class="domain-group">
                <div class="domain-header">
                    <div class="d-flex align-items-center">
                        <img src="https://www.google.com/s2/favicons?domain=${domain}" 
                             class="result-favicon me-2" alt="Favicon">
                        <strong>${domain}</strong>
                        <span class="badge bg-secondary ms-2">${sites.length}</span>
                    </div>
                </div>
                ${sites.map(website => `
                    <div class="search-result-item">
                        <h6 class="mb-1">
                            <a href="${website.url}" target="_blank" class="text-decoration-none">
                                ${website.title}
                            </a>
                        </h6>
                        ${website.snippet ? `<p class="mb-0 text-muted small">${website.snippet}</p>` : ''}
                    </div>
                `).join('')}
            </div>
        `).join('');
    }

    private showAISummary(summary: string) {
        const summarySection = document.getElementById('aiSummary');
        const summaryContent = document.getElementById('summaryContent');
        
        if (summarySection && summaryContent) {
            summaryContent.textContent = summary;
            summarySection.style.display = 'block';
        }
    }

    private showSearchError(message: string) {
        const resultsContainer = document.getElementById('searchResults');
        if (resultsContainer) {
            resultsContainer.innerHTML = `
                <div class="alert alert-danger" role="alert">
                    <i class="bi bi-exclamation-triangle me-2"></i>
                    ${message}
                </div>
            `;
        }
    }

    private showSearchSuggestions(query: string) {
        // Mock suggestions - replace with actual implementation
        const suggestions = [
            `${query} bookmarks`,
            `${query} recently visited`,
            `${query} this week`
        ];
        
        // Implementation would show suggestions dropdown
        console.log('Showing suggestions for:', query, suggestions);
    }

    private hideSearchSuggestions() {
        // Hide suggestions dropdown
    }

    private addToRecentSearches(query: string) {
        // Remove if already exists
        const index = this.recentSearches.indexOf(query);
        if (index > -1) {
            this.recentSearches.splice(index, 1);
        }
        
        // Add to beginning
        this.recentSearches.unshift(query);
        
        // Keep only last 10
        this.recentSearches = this.recentSearches.slice(0, 10);
        
        // Update UI
        this.updateRecentSearchesUI();
        
        // Save to storage
        this.saveRecentSearches();
    }

    private updateRecentSearchesUI() {
        const container = document.getElementById('recentSearchesList');
        if (!container) return;
        
        if (this.recentSearches.length === 0) {
            container.innerHTML = '<span class="empty-message">No recent searches</span>';
            return;
        }
        
        container.innerHTML = this.recentSearches.map(query => `
            <span class="recent-search-tag" onclick="libraryPanel.performSearchWithQuery('${query}')">
                ${query}
            </span>
        `).join('');
    }

    public performSearchWithQuery(query: string) {
        const searchInput = document.getElementById('searchInput') as HTMLInputElement;
        if (searchInput) {
            searchInput.value = query;
            this.currentQuery = query;
            this.performSearch();
        }
    }

    // Page initialization methods
    private async initializeSearchPage() {
        // Already initialized in setupSearchInterface
    }

    private async initializeDiscoverPage() {
        if (!this.discoverData) {
            await this.loadDiscoverData();
        }
        this.renderDiscoverContent();
    }

    private async initializeAnalyticsPage() {
        if (!this.analyticsData) {
            await this.loadAnalyticsData();
        }
        this.renderAnalyticsContent();
    }

    private async loadDiscoverData() {
        // Mock data - replace with actual API call
        this.discoverData = {
            trendingTopics: [
                { topic: "JavaScript", count: 45, trend: "up", percentage: 15 },
                { topic: "React", count: 32, trend: "up", percentage: 8 },
                { topic: "TypeScript", count: 28, trend: "stable", percentage: 0 }
            ],
            readingPatterns: [
                { timeframe: "9 AM", activity: 25, peak: false },
                { timeframe: "2 PM", activity: 45, peak: true },
                { timeframe: "7 PM", activity: 30, peak: false }
            ],
            popularPages: [],
            topDomains: [
                { domain: "github.com", count: 156 },
                { domain: "stackoverflow.com", count: 89 },
                { domain: "medium.com", count: 67 }
            ]
        };
    }

    private renderDiscoverContent() {
        if (!this.discoverData) return;
        
        this.renderTrendingContent();
        this.renderReadingPatterns();
        this.renderPopularPages();
    }

    private renderTrendingContent() {
        const container = document.getElementById('trendingContent');
        if (!container || !this.discoverData) return;
        
        container.innerHTML = this.discoverData.trendingTopics.map(topic => `
            <div class="card">
                <div class="card-body">
                    <h6 class="card-title">${topic.topic}</h6>
                    <div class="d-flex align-items-center justify-content-between">
                        <span class="text-muted">${topic.count} pages</span>
                        <div class="d-flex align-items-center">
                            <i class="bi bi-arrow-${topic.trend === 'up' ? 'up' : topic.trend === 'down' ? 'down' : 'right'} 
                               text-${topic.trend === 'up' ? 'success' : topic.trend === 'down' ? 'danger' : 'secondary'}"></i>
                            ${topic.percentage > 0 ? `<span class="text-${topic.trend === 'up' ? 'success' : 'danger'} small ms-1">
                                ${topic.percentage}%</span>` : ''}
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
    }

    private renderReadingPatterns() {
        const container = document.getElementById('readingPatterns');
        if (!container || !this.discoverData) return;
        
        container.innerHTML = `
            <div class="card">
                <div class="card-body">
                    <h6 class="card-title">Daily Activity Pattern</h6>
                    <div class="reading-pattern-chart">
                        ${this.discoverData.readingPatterns.map(pattern => `
                            <div class="pattern-item ${pattern.peak ? 'peak' : ''}">
                                <div class="pattern-bar" style="height: ${pattern.activity}%"></div>
                                <div class="pattern-time">${pattern.timeframe}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    }

    private renderPopularPages() {
        const container = document.getElementById('popularPages');
        if (!container) return;
        
        if (!this.discoverData?.popularPages || this.discoverData.popularPages.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="bi bi-fire"></i>
                    <h6>No Popular Pages</h6>
                    <p>Visit more pages to see trending content.</p>
                </div>
            `;
            return;
        }
        
        // Render popular pages similar to search results
        container.innerHTML = this.renderListView(this.discoverData.popularPages);
    }

    private async loadAnalyticsData() {
        // Mock data - replace with actual API call
        this.analyticsData = {
            overview: {
                totalSites: this.libraryStats.totalWebsites,
                totalBookmarks: this.libraryStats.totalBookmarks,
                totalHistory: this.libraryStats.totalHistory,
                knowledgeExtracted: 0
            },
            trends: [
                { date: "2024-01-01", visits: 45, bookmarks: 5 },
                { date: "2024-01-02", visits: 52, bookmarks: 8 },
                { date: "2024-01-03", visits: 38, bookmarks: 3 }
            ],
            insights: [
                { category: "Most Active Day", value: 52, change: 15 },
                { category: "Avg. Session Time", value: 25, change: -5 },
                { category: "Knowledge Coverage", value: 78, change: 12 }
            ]
        };
    }

    private renderAnalyticsContent() {
        if (!this.analyticsData) return;
        
        this.renderAnalyticsOverview();
        this.renderActivityCharts();
        this.renderKnowledgeInsights();
    }

    private renderAnalyticsOverview() {
        const container = document.getElementById('analyticsOverview');
        if (!container || !this.analyticsData) return;
        
        const { overview } = this.analyticsData;
        container.innerHTML = `
            <div class="stat-item">
                <div class="stat-number">${overview.totalSites}</div>
                <div class="stat-label">Total Sites</div>
            </div>
            <div class="stat-item">
                <div class="stat-number">${overview.totalBookmarks}</div>
                <div class="stat-label">Bookmarks</div>
            </div>
            <div class="stat-item">
                <div class="stat-number">${overview.totalHistory}</div>
                <div class="stat-label">History Items</div>
            </div>
            <div class="stat-item">
                <div class="stat-number">${overview.knowledgeExtracted}</div>
                <div class="stat-label">Knowledge Extracted</div>
            </div>
        `;
    }

    private renderActivityCharts() {
        const container = document.getElementById('activityCharts');
        if (!container || !this.analyticsData) return;
        
        container.innerHTML = `
            <div class="card">
                <div class="card-body">
                    <h6 class="card-title">Activity Trends</h6>
                    <div class="analytics-chart">
                        <p class="text-muted">Activity trends chart would be displayed here</p>
                        <div class="chart-placeholder" style="height: 200px; background: #f8f9fa; border-radius: 0.375rem; display: flex; align-items: center; justify-content: center;">
                            <span class="text-muted">Chart visualization would appear here</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    private renderKnowledgeInsights() {
        const container = document.getElementById('knowledgeInsights');
        if (!container || !this.analyticsData) return;
        
        container.innerHTML = this.analyticsData.insights.map(insight => `
            <div class="card">
                <div class="card-body">
                    <h6 class="card-title">${insight.category}</h6>
                    <div class="d-flex align-items-center justify-content-between">
                        <span class="h4 mb-0">${insight.value}${insight.category.includes('Time') ? 'min' : insight.category.includes('Coverage') ? '%' : ''}</span>
                        <div class="d-flex align-items-center">
                            <i class="bi bi-arrow-${insight.change > 0 ? 'up' : 'down'} 
                               text-${insight.change > 0 ? 'success' : 'danger'}"></i>
                            <span class="text-${insight.change > 0 ? 'success' : 'danger'} small ms-1">
                                ${Math.abs(insight.change)}%
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
    }

    // Storage methods
    private async loadRecentSearches() {
        try {
            const stored = localStorage.getItem('websiteLibrary_recentSearches');
            if (stored) {
                this.recentSearches = JSON.parse(stored);
                this.updateRecentSearchesUI();
            }
        } catch (error) {
            console.error('Failed to load recent searches:', error);
        }
    }

    private saveRecentSearches() {
        try {
            localStorage.setItem('websiteLibrary_recentSearches', JSON.stringify(this.recentSearches));
        } catch (error) {
            console.error('Failed to save recent searches:', error);
        }
    }

    // Quick action methods
    public showImportModal() {
        console.log('Show import modal');
        // Implementation would show the existing import modal
    }

    public exploreRecentBookmarks() {
        console.log('Explore recent bookmarks');
        this.navigateToPage('search');
        // Set search to show recent bookmarks
    }

    public exploreMostVisited() {
        console.log('Explore most visited');
        this.navigateToPage('search');
        // Set search to show most visited sites
    }

    public exploreByDomain() {
        console.log('Explore by domain');
        this.navigateToPage('search');
        // Set view mode to domain view
        this.setViewMode('domain');
    }

    public showSettings() {
        console.log('Show settings');
        // Implementation would show settings modal
    }
}

// Initialize the panel when DOM is loaded
let libraryPanelFullPage: WebsiteLibraryPanelFullPage;

document.addEventListener('DOMContentLoaded', () => {
    libraryPanelFullPage = new WebsiteLibraryPanelFullPage();
    libraryPanelFullPage.initialize();
});

// Make it globally available for onclick handlers
(window as any).libraryPanel = () => libraryPanelFullPage;
