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
        console.log("Initializing Full-Page Website Library Panel with Enhanced Features");
        
        this.setupNavigation();
        this.setupSearchInterface();
        this.setupEventListeners();
        this.setupKnowledgeInteractions();
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
        if (this.currentViewMode === view) return;
        
        this.currentViewMode = view;
        
        // Update UI with smooth transition
        this.updateViewModeButtons();
        
        // Animate the transition if results are visible
        if (this.currentResults.length > 0) {
            this.animateViewModeTransition(view);
        }
    }

    private updateViewModeButtons() {
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        const activeBtn = document.querySelector(`[data-view="${this.currentViewMode}"]`);
        if (activeBtn) {
            activeBtn.classList.add('active');
        }
    }

    private async animateViewModeTransition(newView: "list" | "grid" | "timeline" | "domain") {
        const container = document.getElementById('resultsContainer');
        if (!container) return;
        
        // Add transitioning class to prevent interactions
        container.classList.add('transitioning');
        
        // Get current content
        const currentContent = container.querySelector('.results-content');
        if (currentContent) {
            // Fade out current content
            currentContent.classList.add('fade-out');
            
            // Wait for fade out animation
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        // Update view class on container
        container.className = 'results-container';
        container.classList.add(`${newView}-view`, 'transitioning');
        
        // Render new content
        this.renderSearchResults(this.currentResults);
        
        // Get new content and animate in
        const newContent = container.querySelector('.results-content');
        if (newContent) {
            newContent.classList.add('fade-out'); // Start hidden
            
            // Force layout
            (newContent as HTMLElement).offsetHeight;
            
            // Fade in new content
            newContent.classList.remove('fade-out');
            newContent.classList.add('fade-in');
            
            // Wait for fade in animation
            await new Promise(resolve => setTimeout(resolve, 200));
            
            // Clean up classes
            newContent.classList.remove('fade-in');
        }
        
        // Remove transitioning class
        container.classList.remove('transitioning');
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
        // Mock search implementation with enhanced knowledge data
        const mockResults: Website[] = [
            {
                url: "https://docs.microsoft.com/typescript",
                title: "TypeScript Documentation - Microsoft Docs",
                domain: "docs.microsoft.com",
                source: "bookmarks",
                score: 0.95,
                snippet: "TypeScript is a strongly typed programming language that builds on JavaScript...",
                lastVisited: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), // 2 hours ago
                knowledge: {
                    hasKnowledge: true,
                    status: "extracted",
                    entityCount: 12,
                    topicCount: 8,
                    suggestionCount: 5,
                    confidence: 0.92
                }
            },
            {
                url: "https://github.com/microsoft/TypeScript",
                title: "Microsoft TypeScript GitHub Repository",
                domain: "github.com",
                source: "history",
                score: 0.88,
                snippet: "TypeScript is a superset of JavaScript that compiles to clean JavaScript output...",
                lastVisited: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), // 1 day ago
                knowledge: {
                    hasKnowledge: true,
                    status: "extracted",
                    entityCount: 25,
                    topicCount: 15,
                    suggestionCount: 12,
                    confidence: 0.87
                }
            },
            {
                url: "https://stackoverflow.com/questions/typescript",
                title: "TypeScript Questions - Stack Overflow",
                domain: "stackoverflow.com",
                source: "history",
                score: 0.76,
                snippet: "Get answers to your TypeScript questions on Stack Overflow...",
                lastVisited: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(), // 6 hours ago
                knowledge: {
                    hasKnowledge: true,
                    status: "extracted",
                    entityCount: 8,
                    topicCount: 12,
                    suggestionCount: 18,
                    confidence: 0.73
                }
            },
            {
                url: "https://blog.logrocket.com/typescript-tutorial",
                title: "Complete TypeScript Tutorial for Beginners",
                domain: "blog.logrocket.com",
                source: "bookmarks",
                score: 0.82,
                snippet: "Learn TypeScript from scratch with this comprehensive tutorial...",
                lastVisited: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(), // 2 days ago
                knowledge: {
                    hasKnowledge: true,
                    status: "extracted",
                    entityCount: 6,
                    topicCount: 10,
                    suggestionCount: 8,
                    confidence: 0.68
                }
            },
            {
                url: "https://www.typescriptlang.org/docs/",
                title: "TypeScript: Documentation",
                domain: "typescriptlang.org",
                source: "bookmarks",
                score: 0.93,
                snippet: "TypeScript extends JavaScript by adding type definitions...",
                lastVisited: new Date(Date.now() - 1000 * 60 * 30).toISOString(), // 30 minutes ago
                knowledge: {
                    hasKnowledge: true,
                    status: "extracted",
                    entityCount: 15,
                    topicCount: 6,
                    suggestionCount: 3,
                    confidence: 0.95
                }
            }
        ];
        
        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 300));
        
        return {
            websites: mockResults,
            summary: {
                text: `Found ${mockResults.length} results for "${query}" with comprehensive knowledge extraction`,
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
        
        // Add view-specific class to container
        container.className = 'results-container';
        container.classList.add(`${this.currentViewMode}-view`);
        
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
        
        container.innerHTML = `<div class="results-content">${html}</div>`;
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
                        
                        <div class="d-flex align-items-center justify-content-between">
                            <div class="knowledge-badges">
                                ${this.renderKnowledgeBadges(website.knowledge)}
                            </div>
                            <div class="d-flex align-items-center gap-2">
                                ${website.knowledge?.confidence ? this.renderConfidenceIndicator(website.knowledge.confidence) : ''}
                                ${website.score ? `<span class="result-score">${Math.round(website.score * 100)}%</span>` : ''}
                            </div>
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
                        <h6 class="card-title mb-0 flex-grow-1">${website.title}</h6>
                        ${website.score ? `<span class="result-score">${Math.round(website.score * 100)}%</span>` : ''}
                    </div>
                    
                    <div class="result-domain text-muted mb-2">${website.domain}</div>
                    ${website.snippet ? `<p class="card-text small mb-3">${website.snippet}</p>` : ''}
                    
                    ${website.knowledge?.confidence ? `
                        <div class="mb-2">
                            ${this.renderConfidenceIndicator(website.knowledge.confidence)}
                        </div>
                    ` : ''}
                    
                    <div class="knowledge-badges">
                        ${this.renderKnowledgeBadges(website.knowledge)}
                    </div>
                    
                    <a href="${website.url}" target="_blank" class="stretched-link"></a>
                </div>
            </div>
        `).join('');
        
        return gridHtml;
    }

    private renderTimelineView(websites: Website[]): string {
        // Group by date for timeline view
        const grouped = websites.reduce((acc, website) => {
            const date = website.lastVisited ? new Date(website.lastVisited).toDateString() : 'Unknown Date';
            if (!acc[date]) acc[date] = [];
            acc[date].push(website);
            return acc;
        }, {} as Record<string, Website[]>);

        return Object.entries(grouped).map(([date, sites]) => `
            <div class="timeline-item">
                <div class="timeline-date">${date === 'Unknown Date' ? 'Recently Added' : date}</div>
                
                ${sites.map(website => `
                    <div class="search-result-item mb-3 border-0 p-0">
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
                                
                                <div class="d-flex align-items-center justify-content-between">
                                    <div class="knowledge-badges">
                                        ${this.renderKnowledgeBadges(website.knowledge)}
                                    </div>
                                    <div class="d-flex align-items-center gap-2">
                                        ${website.knowledge?.confidence ? this.renderConfidenceIndicator(website.knowledge.confidence) : ''}
                                        ${website.score ? `<span class="result-score">${Math.round(website.score * 100)}%</span>` : ''}
                                    </div>
                                </div>
                                
                                ${website.lastVisited ? `
                                    <div class="mt-1">
                                        <small class="text-muted">
                                            <i class="bi bi-clock me-1"></i>
                                            ${new Date(website.lastVisited).toLocaleTimeString()}
                                        </small>
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `).join('');
    }

    private renderDomainView(websites: Website[]): string {
        // Group by domain and calculate knowledge stats
        const grouped = websites.reduce((acc, website) => {
            if (!acc[website.domain]) {
                acc[website.domain] = {
                    sites: [],
                    totalEntities: 0,
                    totalTopics: 0,
                    totalActions: 0,
                    extractedCount: 0
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
            if (website.knowledge?.status === 'extracted') {
                acc[website.domain].extractedCount++;
            }
            
            return acc;
        }, {} as Record<string, {sites: Website[], totalEntities: number, totalTopics: number, totalActions: number, extractedCount: number}>);

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
                            ${data.extractedCount > 0 ? `<span class="knowledge-badge extracted small">${data.extractedCount} extracted</span>` : ''}
                        </div>
                    </div>
                    
                    ${(data.totalEntities > 0 || data.totalTopics > 0 || data.totalActions > 0) ? `
                        <div class="domain-knowledge-summary mt-2">
                            <div class="knowledge-badges">
                                ${data.totalEntities > 0 ? `<span class="knowledge-badge entity small">${data.totalEntities} Entities</span>` : ''}
                                ${data.totalTopics > 0 ? `<span class="knowledge-badge topic small">${data.totalTopics} Topics</span>` : ''}
                                ${data.totalActions > 0 ? `<span class="knowledge-badge action small">${data.totalActions} Actions</span>` : ''}
                            </div>
                        </div>
                    ` : ''}
                </div>
                
                <div class="domain-content">
                    ${data.sites.map(website => `
                        <div class="search-result-item">
                            <h6 class="mb-1">
                                <a href="${website.url}" target="_blank" class="text-decoration-none">
                                    ${website.title}
                                </a>
                            </h6>
                            ${website.snippet ? `<p class="mb-2 text-muted small">${website.snippet}</p>` : ''}
                            
                            <div class="d-flex align-items-center justify-content-between">
                                <div class="knowledge-badges">
                                    ${this.renderKnowledgeBadges(website.knowledge)}
                                </div>
                                <div class="d-flex align-items-center gap-2">
                                    ${website.knowledge?.confidence ? this.renderConfidenceIndicator(website.knowledge.confidence) : ''}
                                    ${website.score ? `<span class="result-score">${Math.round(website.score * 100)}%</span>` : ''}
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
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

    private renderKnowledgeInsights() {
        const container = document.getElementById('knowledgeInsights');
        if (!container || !this.analyticsData) return;
        
        // Enhanced knowledge insights with visualizations
        const knowledgeStats = this.calculateKnowledgeStats();
        
        container.innerHTML = `
            <div class="card">
                <div class="card-body">
                    <h6 class="card-title">Knowledge Extraction Overview</h6>
                    <div class="knowledge-progress-grid">
                        <div class="progress-item">
                            <div class="progress-label">
                                <i class="bi bi-diagram-2 text-info"></i>
                                <span>Entity Extraction</span>
                            </div>
                            <div class="progress-bar-container">
                                <div class="progress-bar">
                                    <div class="progress-fill" style="width: ${knowledgeStats.entityProgress}%; background: linear-gradient(90deg, #17a2b8, #20c997);"></div>
                                </div>
                                <span class="progress-percentage">${knowledgeStats.entityProgress}%</span>
                            </div>
                        </div>
                        
                        <div class="progress-item">
                            <div class="progress-label">
                                <i class="bi bi-tags text-purple"></i>
                                <span>Topic Analysis</span>
                            </div>
                            <div class="progress-bar-container">
                                <div class="progress-bar">
                                    <div class="progress-fill" style="width: ${knowledgeStats.topicProgress}%; background: linear-gradient(90deg, #6f42c1, #e83e8c);"></div>
                                </div>
                                <span class="progress-percentage">${knowledgeStats.topicProgress}%</span>
                            </div>
                        </div>
                        
                        <div class="progress-item">
                            <div class="progress-label">
                                <i class="bi bi-lightning text-warning"></i>
                                <span>Action Detection</span>
                            </div>
                            <div class="progress-bar-container">
                                <div class="progress-bar">
                                    <div class="progress-fill" style="width: ${knowledgeStats.actionProgress}%; background: linear-gradient(90deg, #fd7e14, #ffc107);"></div>
                                </div>
                                <span class="progress-percentage">${knowledgeStats.actionProgress}%</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="card">
                <div class="card-body">
                    <h6 class="card-title">Knowledge Quality Distribution</h6>
                    <div class="quality-distribution">
                        <div class="quality-segment high" style="width: ${knowledgeStats.highQuality}%;" title="High Quality: ${knowledgeStats.highQuality}%">
                            <span class="quality-label">High</span>
                        </div>
                        <div class="quality-segment medium" style="width: ${knowledgeStats.mediumQuality}%;" title="Medium Quality: ${knowledgeStats.mediumQuality}%">
                            <span class="quality-label">Medium</span>
                        </div>
                        <div class="quality-segment low" style="width: ${knowledgeStats.lowQuality}%;" title="Low Quality: ${knowledgeStats.lowQuality}%">
                            <span class="quality-label">Low</span>
                        </div>
                    </div>
                    <div class="quality-legend">
                        <div class="legend-item">
                            <div class="legend-color high"></div>
                            <span>High Confidence (≥80%)</span>
                        </div>
                        <div class="legend-item">
                            <div class="legend-color medium"></div>
                            <span>Medium Confidence (50-79%)</span>
                        </div>
                        <div class="legend-item">
                            <div class="legend-color low"></div>
                            <span>Low Confidence (<50%)</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    private calculateKnowledgeStats() {
        // Mock calculation - replace with actual data processing
        return {
            entityProgress: 78,
            topicProgress: 65,
            actionProgress: 82,
            highQuality: 45,
            mediumQuality: 35,
            lowQuality: 20
        };
    }

    private setupKnowledgeInteractions() {
        // Add click handlers for knowledge badges
        document.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            
            if (target.classList.contains('knowledge-badge')) {
                this.handleKnowledgeBadgeClick(target);
            }
            
            if (target.classList.contains('topic-tag')) {
                this.handleTopicTagClick(target);
            }
        });
    }

    private handleKnowledgeBadgeClick(badge: HTMLElement) {
        // Add visual feedback
        badge.style.transform = 'scale(0.95)';
        setTimeout(() => {
            badge.style.transform = '';
        }, 150);
        
        // Get badge type and show details
        const badgeType = Array.from(badge.classList).find(cls => 
            ['entity', 'topic', 'action', 'extracted'].includes(cls)
        );
        
        if (badgeType) {
            this.showKnowledgeDetails(badgeType, badge);
        }
    }

    private handleTopicTagClick(tag: HTMLElement) {
        const topic = tag.textContent?.trim();
        if (topic) {
            // Simulate search for this topic
            const searchInput = document.getElementById('searchInput') as HTMLInputElement;
            if (searchInput) {
                searchInput.value = topic;
                this.currentQuery = topic;
                this.performSearch();
                this.navigateToPage('search');
            }
        }
    }

    private showKnowledgeDetails(type: string, element: HTMLElement) {
        // Create a temporary tooltip showing knowledge details
        const tooltip = document.createElement('div');
        tooltip.className = 'knowledge-tooltip';
        tooltip.innerHTML = this.getKnowledgeTooltipContent(type);
        
        document.body.appendChild(tooltip);
        
        // Position tooltip
        const rect = element.getBoundingClientRect();
        tooltip.style.position = 'fixed';
        tooltip.style.top = `${rect.bottom + 8}px`;
        tooltip.style.left = `${rect.left}px`;
        tooltip.style.zIndex = '9999';
        
        // Remove tooltip after delay
        setTimeout(() => {
            tooltip.remove();
        }, 3000);
        
        // Remove on click outside
        const removeTooltip = (e: Event) => {
            if (!tooltip.contains(e.target as Node)) {
                tooltip.remove();
                document.removeEventListener('click', removeTooltip);
            }
        };
        
        setTimeout(() => {
            document.addEventListener('click', removeTooltip);
        }, 100);
    }

    private getKnowledgeTooltipContent(type: string): string {
        const tooltips = {
            entity: `
                <div class="tooltip-header">
                    <i class="bi bi-diagram-2"></i>
                    <strong>Entities Extracted</strong>
                </div>
                <div class="tooltip-content">
                    <p>Companies, technologies, people, and organizations identified in this content.</p>
                    <div class="tooltip-examples">
                        <span class="example-tag">Microsoft</span>
                        <span class="example-tag">TypeScript</span>
                        <span class="example-tag">React</span>
                    </div>
                </div>
            `,
            topic: `
                <div class="tooltip-header">
                    <i class="bi bi-tags"></i>
                    <strong>Topics Identified</strong>
                </div>
                <div class="tooltip-content">
                    <p>Main themes and subjects covered in this content.</p>
                    <div class="tooltip-examples">
                        <span class="example-tag">Web Development</span>
                        <span class="example-tag">Programming</span>
                        <span class="example-tag">Documentation</span>
                    </div>
                </div>
            `,
            action: `
                <div class="tooltip-header">
                    <i class="bi bi-lightning"></i>
                    <strong>Actions Detected</strong>
                </div>
                <div class="tooltip-content">
                    <p>Actionable items and next steps found in this content.</p>
                    <div class="tooltip-examples">
                        <span class="example-tag">Download</span>
                        <span class="example-tag">Install</span>
                        <span class="example-tag">Configure</span>
                    </div>
                </div>
            `,
            extracted: `
                <div class="tooltip-header">
                    <i class="bi bi-check-circle"></i>
                    <strong>Knowledge Extracted</strong>
                </div>
                <div class="tooltip-content">
                    <p>This content has been successfully processed and knowledge has been extracted.</p>
                    <div class="status-indicator success">
                        <i class="bi bi-check"></i>
                        Processing Complete
                    </div>
                </div>
            `
        };
        
        return tooltips[type as keyof typeof tooltips] || '';
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

    private renderKnowledgeBadges(knowledge?: KnowledgeStatus): string {
        if (!knowledge?.hasKnowledge) return '';
        
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
        
        if (knowledge.status === 'extracted') {
            badges.push(`
                <span class="knowledge-badge extracted" title="Knowledge successfully extracted">
                    <i class="bi bi-check-circle"></i>
                    Extracted
                </span>
            `);
        }
        
        return badges.join('');
    }

    private renderConfidenceIndicator(confidence: number): string {
        const percentage = Math.round(confidence * 100);
        let color = '#dc3545'; // Red for low confidence
        
        if (confidence >= 0.7) {
            color = '#28a745'; // Green for high confidence
        } else if (confidence >= 0.4) {
            color = '#ffc107'; // Yellow for medium confidence
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
