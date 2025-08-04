// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { DiscoveryServices } from "./knowledgeUtilities";
import { 
    EnhancedDiscoveryServices, 
    TrendingSectionData, 
    ReadingPatternData, 
    PopularContentData 
} from "./enhancedDiscoveryServices";

export class KnowledgeDiscoveryPanel {
    private container: HTMLElement;
    private services: DiscoveryServices;
    private enhancedServices: EnhancedDiscoveryServices | null = null;
    private discoverData: any = null;
    private trendData: {
        trending?: TrendingSectionData;
        patterns?: ReadingPatternData;
        popular?: PopularContentData;
    } = {};
    private isConnected: boolean = true;

    constructor(container: HTMLElement, services: DiscoveryServices) {
        this.container = container;
        this.services = services;
        
        // Initialize enhanced services if available
        if (services && 'chromeService' in services) {
            this.enhancedServices = new EnhancedDiscoveryServices((services as any).chromeService);
        }
    }

    async initialize(): Promise<void> {
        // Initially hide the empty state while loading
        const emptyState = document.getElementById("discoverEmptyState");
        if (emptyState) {
            emptyState.style.display = "none";
        }

        // Load both legacy and trend data
        await Promise.all([
            this.loadDiscoverData(),
            this.loadTrendData()
        ]);
        
        this.renderContent();
    }

    async loadDiscoverData(): Promise<void> {
        if (!this.isConnected) {
            this.showConnectionError();
            return;
        }

        try {
            const response = await this.services.loadDiscoverData();

            // Handle service response structure
            if (response && response.success) {
                this.discoverData = {
                    trendingTopics: response.trendingTopics || [],
                    readingPatterns: response.readingPatterns || [],
                    popularPages: response.popularPages || [],
                    topDomains: response.topDomains || [],
                };
            } else {
                this.handleDiscoverDataError(
                    response?.error || "Failed to load discover data",
                );
            }
        } catch (error) {
            console.error("Failed to load discovery data:", error);
            this.handleDiscoverDataError(error);
        }
    }

    async loadTrendData(): Promise<void> {
        if (!this.enhancedServices || !this.isConnected) {
            return;
        }

        try {
            // Load trend data in parallel
            const [trending, patterns, popular] = await Promise.all([
                this.enhancedServices.getTrendingContent(),
                this.enhancedServices.getReadingPatterns(),
                this.enhancedServices.getPopularContent()
            ]);

            this.trendData = {
                trending,
                patterns,
                popular
            };
        } catch (error) {
            console.error('Error loading trend data:', error);
            // Don't fail completely, just proceed without trend data
        }
    }

    renderContent(): void {
        if (!this.discoverData) return;

        // Check both legacy and trend data for content
        const hasLegacyData =
            this.discoverData.trendingTopics?.length > 0 ||
            this.discoverData.readingPatterns?.some(
                (p: any) => p.activity > 0,
            ) ||
            this.discoverData.popularPages?.length > 0;

        const hasTrendData = 
            (this.trendData.trending?.cards?.length ?? 0) > 0 ||
            (this.trendData.patterns?.patterns?.length ?? 0) > 0 ||
            (this.trendData.popular?.popularPages?.length ?? 0) > 0;

        const hasData = hasLegacyData || hasTrendData;

        const emptyState = document.getElementById("discoverEmptyState");
        if (emptyState) {
            emptyState.style.display = hasData ? "none" : "block";
        }

        if (hasData) {
            this.renderTrendingContent();
            this.renderReadingPatterns();
            this.renderPopularPages();
        }
    }

    async refreshData(): Promise<void> {
        // Clear trend cache before refreshing
        if (this.enhancedServices) {
            await this.enhancedServices.clearTrendCache();
        }
        
        await Promise.all([
            this.loadDiscoverData(),
            this.loadTrendData()
        ]);
        
        this.renderContent();
    }

    destroy(): void {
        // Cleanup any event listeners or timers if needed
    }

    private showConnectionError(): void {
        const emptyState = document.getElementById("discoverEmptyState");
        if (emptyState) {
            emptyState.style.display = "block";
        }

        const container = document.getElementById("discoverContent");
        if (container) {
            container.innerHTML = `
                <div class="connection-required">
                    <i class="bi bi-wifi-off"></i>
                    <h3>Connection Required</h3>
                    <p>The Discover page requires an active connection to the TypeAgent service.</p>
                    <button class="btn btn-primary" data-action="reconnect">
                        <i class="bi bi-arrow-repeat"></i> Reconnect
                    </button>
                </div>
            `;
        }
    }

    private handleDiscoverDataError(error: any): void {
        this.discoverData = {
            trendingTopics: [],
            readingPatterns: [],
            popularPages: [],
            topDomains: [],
        };

        const emptyState = document.getElementById("discoverEmptyState");
        if (emptyState) {
            emptyState.style.display = "block";
        }

        const container = document.getElementById("discoverContent");
        if (container) {
            container.innerHTML = `
                <div class="error-state">
                    <i class="bi bi-exclamation-triangle"></i>
                    <h3>Unable to Load Discover Data</h3>
                    <p>There was an error loading your discover insights. Please try again.</p>
                    <button class="btn btn-primary" onclick="window.location.reload()">
                        <i class="bi bi-arrow-repeat"></i> Retry
                    </button>
                </div>
            `;
        }
    }

    private renderTrendingContent(): void {
        const container = document.getElementById("trendingContent");
        if (!container) return;

        // Use trend data if available, otherwise fall back to legacy data
        const trendCards = this.trendData.trending?.cards || [];
        const legacyTopics = this.discoverData?.trendingTopics || [];

        if (trendCards.length === 0 && legacyTopics.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="bi bi-graph-up-arrow"></i>
                    <h6>No Trending Topics</h6>
                    <p>Import more content to see trending topics.</p>
                </div>
            `;
            return;
        }

        // Render trend cards if available
        if (trendCards.length > 0) {
            container.innerHTML = trendCards
                .map(card => this.renderTrendCard(card))
                .join("");
            return;
        }

        // Fall back to legacy rendering
        container.innerHTML = legacyTopics
            .map(
                (topic: any) => `
                <div class="card trending-topic-card trend-${topic.trend} discover-card mb-2">
                    <div class="card-body">
                        <h6 class="card-title text-capitalize">${this.escapeHtml(topic.topic)}</h6>
                        <div class="d-flex align-items-center justify-content-between">
                            <span class="text-muted">${topic.count} page${topic.count !== 1 ? "s" : ""}</span>
                            <div class="trend-indicator">
                                <i class="bi bi-arrow-${topic.trend === "up" ? "up" : topic.trend === "down" ? "down" : "right"} 
                                   text-${topic.trend === "up" ? "success" : topic.trend === "down" ? "danger" : "secondary"}"></i>
                                <span class="text-${topic.trend === "up" ? "success" : topic.trend === "down" ? "danger" : "secondary"} small">
                                    ${topic.percentage}%
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            `,
            )
            .join("");
    }

    private renderTrendCard(card: any): string {
        const typeIcon = this.getTrendTypeIcon(card.trendType);
        const confidencePercent = Math.round(card.confidence * 100);
        
        return `
            <div class="card trend-card ${card.trendType} ${card.isActive ? 'active' : 'inactive'} discover-card mb-2" 
                 data-trend-id="${card.id}">
                <div class="card-body">
                    <div class="d-flex align-items-start justify-content-between mb-2">
                        <h6 class="card-title">
                            <span class="trend-icon">${typeIcon}</span>
                            ${this.escapeHtml(card.trendName)}
                            ${card.isActive ? '<span class="badge bg-success ms-2">Active</span>' : ''}
                        </h6>
                        <span class="confidence-badge">${confidencePercent}%</span>
                    </div>
                    
                    <div class="trend-stats mb-2">
                        <span class="stat me-3">
                            <i class="bi bi-globe"></i> ${card.websiteCount} sites
                        </span>
                        <span class="stat me-3">
                            <i class="bi bi-collection"></i> ${card.domainCount} domains
                        </span>
                        <span class="stat">
                            <i class="bi bi-clock"></i> ${card.duration}
                        </span>
                    </div>

                    ${card.topTopics.length > 0 ? `
                        <div class="trend-topics mb-2">
                            ${card.topTopics.slice(0, 3).map((topic: string) => 
                                `<span class="badge bg-light text-dark me-1">${this.escapeHtml(topic)}</span>`
                            ).join('')}
                        </div>
                    ` : ''}

                    ${card.insights.length > 0 ? `
                        <div class="trend-insights">
                            <small class="text-muted">
                                <i class="bi bi-lightbulb"></i> ${this.escapeHtml(card.insights[0])}
                            </small>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    private getTrendTypeIcon(type: string): string {
        switch (type) {
            case 'ephemeral': return '⚡';
            case 'persistent': return '🎯';
            case 'recurring': return '🔄';
            case 'seasonal': return '📅';
            default: return '📊';
        }
    }

    private renderReadingPatterns(): void {
        const container = document.getElementById("readingPatterns");
        if (!container) return;

        // Use trend-based patterns if available
        const trendPatterns = this.trendData.patterns?.patterns || [];
        const legacyPatterns = this.discoverData?.readingPatterns || [];

        if (trendPatterns.length === 0 && (legacyPatterns.length === 0 || 
            legacyPatterns.every((p: any) => p.activity === 0))) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="bi bi-clock-history"></i>
                    <h6>No Activity Patterns</h6>
                    <p>Visit more pages to see your reading patterns.</p>
                </div>
            `;
            return;
        }

        // Render trend-based patterns if available
        if (trendPatterns.length > 0) {
            container.innerHTML = `
                <div class="patterns-grid">
                    ${trendPatterns.map(pattern => this.renderPatternCard(pattern)).join('')}
                </div>
                ${this.trendData.patterns?.insights ? `
                    <div class="pattern-insights mt-3">
                        <h6><i class="bi bi-lightbulb"></i> Insights</h6>
                        ${this.trendData.patterns.insights.map(insight => 
                            `<div class="insight-item"><small class="text-muted">${this.escapeHtml(insight)}</small></div>`
                        ).join('')}
                    </div>
                ` : ''}
            `;
            return;
        }

        // Fall back to legacy rendering
        const maxActivity = Math.max(...legacyPatterns.map((p: any) => p.activity));

        container.innerHTML = `
            <div class="card discover-card">
                <div class="card-body">
                    <h6 class="card-title">Weekly Activity Pattern</h6>
                    <div class="reading-pattern-chart">
                        ${legacyPatterns
                            .map(
                                (pattern: any) => `
                                <div class="pattern-item ${pattern.peak ? "peak" : ""}">
                                    <div class="pattern-bar" style="height: ${maxActivity > 0 ? (pattern.activity / maxActivity) * 80 + 10 : 2}px" title="${pattern.timeframe}: ${pattern.activity} visits"></div>
                                    <div class="pattern-time">${pattern.timeframe.substring(0, 3)}</div>
                                </div>
                            `,
                            )
                            .join("")}
                    </div>
                    <div class="text-center mt-2">
                        <small class="text-muted">Most active day: ${legacyPatterns.find((p: any) => p.peak)?.timeframe || "None"}</small>
                    </div>
                </div>
            </div>
        `;
    }

    private renderPatternCard(pattern: any): string {
        const confidencePercent = Math.round(pattern.confidence * 100);
        const frequencyIcon = this.getFrequencyIcon(pattern.frequency);
        
        return `
            <div class="card pattern-card discover-card mb-2">
                <div class="card-body">
                    <div class="d-flex align-items-start justify-content-between mb-2">
                        <h6 class="card-title">
                            ${frequencyIcon} ${this.escapeHtml(pattern.patternName)}
                        </h6>
                        <span class="consistency-badge">${confidencePercent}%</span>
                    </div>
                    
                    <div class="pattern-details mb-2">
                        <span class="frequency-tag badge bg-primary">${pattern.frequency}</span>
                        ${pattern.timeOfDay ? `<span class="time-tag badge bg-light text-dark ms-1">${pattern.timeOfDay}</span>` : ''}
                        ${pattern.dayOfWeek ? `<span class="day-tag badge bg-light text-dark ms-1">${pattern.dayOfWeek}</span>` : ''}
                    </div>

                    ${pattern.domains.length > 0 ? `
                        <div class="pattern-domains mb-2">
                            <small class="text-muted">
                                <i class="bi bi-globe"></i> 
                                ${pattern.domains.slice(0, 2).map((domain: string) => this.escapeHtml(domain)).join(', ')}
                                ${pattern.domains.length > 2 ? ` +${pattern.domains.length - 2} more` : ''}
                            </small>
                        </div>
                    ` : ''}

                    ${pattern.insights.length > 0 ? `
                        <div class="pattern-insight">
                            <small class="text-muted">
                                <i class="bi bi-info-circle"></i> ${this.escapeHtml(pattern.insights[0])}
                            </small>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    private getFrequencyIcon(frequency: string): string {
        switch (frequency) {
            case 'daily': return '📅';
            case 'weekly': return '📆';
            case 'monthly': return '🗓️';
            default: return '🔄';
        }
    }

    private renderPopularPages(): void {
        const container = document.getElementById("popularPages");
        if (!container) return;

        // Use trend-based popular content if available
        const trendPopular = this.trendData.popular?.popularPages || [];
        const legacyPopular = this.discoverData?.popularPages || [];

        if (trendPopular.length === 0 && legacyPopular.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="bi bi-fire"></i>
                    <h6>No Popular Pages</h6>
                    <p>Visit more pages to see trending content.</p>
                </div>
            `;
            return;
        }

        // Use trend-based popular content if available
        if (trendPopular.length > 0) {
            const pagesHtml = trendPopular
                .map(page => this.renderPopularPageCard(page))
                .join("");

            container.innerHTML = `
                <div class="popular-pages-grid">
                    ${pagesHtml}
                </div>
                ${this.trendData.popular?.analytics ? `
                    <div class="popular-analytics mt-3">
                        <small class="text-muted">
                            <i class="bi bi-bar-chart"></i> 
                            ${this.trendData.popular.analytics.totalTrends} active trends • 
                            ${this.trendData.popular.analytics.totalWebsites} total pages
                        </small>
                    </div>
                ` : ''}
            `;
            return;
        }

        // Fall back to legacy rendering
        const popularPagesAsWebsites = legacyPopular.map(
            (page: any) => ({
                url: page.url,
                title: page.title,
                domain: page.domain,
                visitCount: page.visitCount,
                lastVisited: page.lastVisited,
                source: page.isBookmarked ? "bookmarks" : "history",
                score: page.visitCount,
                knowledge: {
                    hasKnowledge: false,
                    status: "none",
                },
            }),
        );

        const pagesHtml = popularPagesAsWebsites
            .map(
                (website: any) => `
                <div class="search-result-item">
                    <div class="d-flex align-items-start">
                        <img src="https://www.google.com/s2/favicons?domain=${website.domain}" 
                             class="result-favicon me-2" alt="Favicon"
                             onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 fill=%22%23999%22><rect width=%2216%22 height=%2216%22 rx=%222%22/></svg>'">
                        <div class="flex-grow-1">
                            <h6 class="mb-1">
                                <a href="${website.url}" target="_blank" class="text-decoration-none">
                                    ${this.escapeHtml(website.title)}
                                </a>
                            </h6>
                            <div class="result-domain text-muted mb-1">${this.escapeHtml(website.domain)}</div>
                            
                            <div class="d-flex align-items-center justify-content-between">
                                <div class="page-stats">
                                    <span class="visit-count">${website.visitCount} visits</span>
                                    <span class="last-visited ms-2">${this.formatDate(website.lastVisited)}</span>
                                </div>
                                ${website.score ? `<span class="result-score">${Math.round(website.score)}%</span>` : ""}
                            </div>
                        </div>
                    </div>
                </div>
            `,
            )
            .join("");

        container.innerHTML = pagesHtml;
    }

    private renderPopularPageCard(page: any): string {
        const trendScore = Math.round(page.trendScore * 100);
        const categoryIcon = this.getCategoryIcon(page.category);

        return `
            <div class="card popular-page-card discover-card mb-2">
                <div class="card-body">
                    <div class="d-flex align-items-start justify-content-between mb-2">
                        <h6 class="card-title">
                            <a href="${page.url}" target="_blank" class="text-decoration-none">
                                ${this.escapeHtml(page.title)}
                            </a>
                        </h6>
                        <span class="trend-score-badge">${trendScore}%</span>
                    </div>
                    
                    <p class="card-text small text-muted mb-2">
                        ${this.escapeHtml(page.description)}
                    </p>

                    <div class="d-flex align-items-center justify-content-between">
                        <div class="page-meta">
                            <span class="category-badge badge bg-light text-dark">
                                ${categoryIcon} ${page.category}
                            </span>
                            <span class="visits-info ms-2 small text-muted">
                                <i class="bi bi-eye"></i> ${page.visits} visits
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    private getCategoryIcon(category: string): string {
        switch (category.toLowerCase()) {
            case 'research topic': return '🔬';
            case 'frequent domain': return '🌐';
            case 'getting started': return '🚀';
            default: return '📄';
        }
    }

    private escapeHtml(text: string): string {
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
    }

    private formatDate(dateString: string): string {
        try {
            return new Date(dateString).toLocaleDateString();
        } catch {
            return "";
        }
    }

    setConnectionStatus(isConnected: boolean): void {
        this.isConnected = isConnected;
        if (!isConnected) {
            this.showConnectionError();
        }
    }
}
