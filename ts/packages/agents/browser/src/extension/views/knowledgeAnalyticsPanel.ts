// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { AnalyticsServices } from "./knowledgeUtilities";
import { EnhancedEntityGraphView } from "./enhancedEntityGraphView";

export class KnowledgeAnalyticsPanel {
    private container: HTMLElement;
    private services: AnalyticsServices;
    private analyticsData: any = null;
    private isConnected: boolean = true;

    constructor(container: HTMLElement, services: AnalyticsServices) {
        this.container = container;
        this.services = services;
    }

    async initialize(): Promise<void> {
        // Initially hide the empty state while loading
        const emptyState = document.getElementById("analyticsEmptyState");
        if (emptyState) {
            emptyState.style.display = "none";
        }

        await this.loadAnalyticsData();
        await this.renderContent();
    }

    async loadAnalyticsData(): Promise<void> {
        if (!this.isConnected) {
            this.showAnalyticsConnectionError();
            return;
        }

        try {
            const response = await this.services.loadAnalyticsData();

            // Handle service response structure similar to original
            if (response && response.success) {
                this.analyticsData = {
                    overview: response.analytics?.overview || {},
                    trends: response.analytics?.activity?.trends || [],
                    insights: this.transformKnowledgeInsights(
                        response.analytics?.knowledge || {},
                    ),
                    domains: response.analytics?.domains || {},
                    knowledge: response.analytics?.knowledge || {},
                    activity: response.analytics?.activity || {},
                };
            } else {
                throw new Error(
                    response?.error || "Failed to get analytics data",
                );
            }
        } catch (error) {
            console.error("Failed to load analytics data:", error);
            this.handleAnalyticsDataError(error);
        }
    }

    async renderContent(): Promise<void> {
        if (!this.analyticsData) return;

        const hasData =
            this.analyticsData.overview.totalSites > 0 ||
            this.analyticsData.overview.knowledgeExtracted > 0 ||
            this.analyticsData.insights.some(
                (insight: any) => insight.value > 0,
            );

        const emptyState = document.getElementById("analyticsEmptyState");
        if (emptyState) {
            emptyState.style.display = hasData ? "none" : "block";
        }

        if (hasData) {
            this.renderActivityCharts();
            await this.renderKnowledgeInsights();
            this.renderTopDomains();
            this.updateKnowledgeVisualizationData(this.analyticsData.knowledge);
        }
    }

    async refreshData(): Promise<void> {
        await this.loadAnalyticsData();
        await this.renderContent();
    }

    destroy(): void {
        // Cleanup any event listeners or timers if needed
    }

    private showAnalyticsConnectionError(): void {
        const emptyState = document.getElementById("analyticsEmptyState");
        if (emptyState) {
            emptyState.style.display = "block";
        }

        const container = document.getElementById("analyticsContent");
        if (container) {
            container.innerHTML = `
                <div class="connection-required">
                    <i class="bi bi-wifi-off"></i>
                    <h3>Connection Required</h3>
                    <p>The Analytics page requires an active connection to the TypeAgent service.</p>
                    <button class="btn btn-primary" data-action="reconnect">
                        <i class="bi bi-arrow-repeat"></i> Reconnect
                    </button>
                </div>
            `;
        }
    }

    private handleAnalyticsDataError(error: any): void {
        this.analyticsData = {
            overview: {
                totalSites: 0,
                totalBookmarks: 0,
                totalHistory: 0,
                knowledgeExtracted: 0,
            },
            trends: [],
            insights: [],
            domains: { topDomains: [] },
            knowledge: {},
            activity: { trends: [], summary: {} },
        };

        const emptyState = document.getElementById("analyticsEmptyState");
        if (emptyState) {
            emptyState.style.display = "block";
        }

        // Update metric displays with zeros
        this.updateMetricDisplaysWithZeros();
    }

    private transformKnowledgeInsights(knowledge: any): any[] {
        return [
            {
                category: "Entities",
                value: knowledge.totalEntities || 0,
                change: 0,
            },
            {
                category: "Relationships",
                value: knowledge.totalRelationships || 0,
                change: 0,
            },
            {
                category: "Knowledge Quality",
                value: this.calculateKnowledgeQualityFromData(knowledge),
                change: 0,
            },
        ];
    }

    private calculateKnowledgeQualityFromData(knowledge: any): number {
        if (!knowledge || !knowledge.qualityDistribution) return 0;

        const { highQuality, mediumQuality, lowQuality } =
            knowledge.qualityDistribution;
        const total = highQuality + mediumQuality + lowQuality;

        if (total === 0) return 0;

        // Weighted score: high=100%, medium=60%, low=20%
        return Math.round(
            (highQuality * 100 + mediumQuality * 60 + lowQuality * 20) / total,
        );
    }

    private updateKnowledgeVisualizationData(knowledge: any): void {
        // Update AI Insights section with real data
        const knowledgeExtractedElement =
            document.getElementById("knowledgeExtracted");
        const totalEntitiesElement = document.getElementById("totalEntities");
        const totalTopicsElement = document.getElementById("totalTopics");
        const totalActionsElement = document.getElementById("totalActions");

        if (knowledgeExtractedElement) {
            knowledgeExtractedElement.textContent = (
                knowledge.totalEntities || 0
            ).toString();
        }
        if (totalEntitiesElement) {
            totalEntitiesElement.textContent = (
                knowledge.totalEntities || 0
            ).toString();
        }
        if (totalTopicsElement) {
            totalTopicsElement.textContent = (
                knowledge.totalTopics || 0
            ).toString();
        }
        if (totalActionsElement) {
            totalActionsElement.textContent = (
                knowledge.totalActions || 0
            ).toString();
        }

        // Update knowledge visualization cards with real data
        this.updateKnowledgeVisualizationCards(knowledge);

        // Update recent items displays with real data
        this.updateRecentEntitiesDisplay(
            knowledge.recentEntities || knowledge.recentItems?.entities || [],
        );
        this.updateRecentTopicsDisplay(
            knowledge.recentTopics || knowledge.recentItems?.topics || [],
        );
        // Use recentRelationships instead of transforming recentActions
        this.updateRecentActionsDisplay(knowledge.recentRelationships || []);
    }

    private updateKnowledgeVisualizationCards(knowledge: any): void {
        const totalEntitiesMetric = document.getElementById(
            "totalEntitiesMetric",
        );
        if (totalEntitiesMetric) {
            totalEntitiesMetric.textContent = (
                knowledge.totalEntities || 0
            ).toString();
        }

        const totalTopicsMetric = document.getElementById("totalTopicsMetric");
        if (totalTopicsMetric) {
            totalTopicsMetric.textContent = (
                knowledge.totalTopics || 0
            ).toString();
        }

        const totalActionsMetric =
            document.getElementById("totalActionsMetric");
        if (totalActionsMetric) {
            totalActionsMetric.textContent = (
                knowledge.totalActions || 0
            ).toString();
        }
    }

    private updateMetricDisplaysWithZeros(): void {
        const elements = [
            "knowledgeExtracted",
            "totalEntities",
            "totalTopics",
            "totalActions",
            "totalEntitiesMetric",
            "totalTopicsMetric",
            "totalActionsMetric",
        ];

        elements.forEach((elementId) => {
            const element = document.getElementById(elementId);
            if (element) {
                element.textContent = "0";
            }
        });
    }

    private renderActivityCharts(): void {
        const container = document.getElementById("activityCharts");
        if (!container || !this.analyticsData?.activity) return;

        const activityData = this.analyticsData.activity;

        if (!activityData.trends || activityData.trends.length === 0) {
            container.innerHTML = `
                <div class="card">
                    <div class="card-body">
                        <h6 class="card-title">Activity Trends</h6>
                        <div class="empty-message">
                            <i class="bi bi-bar-chart"></i>
                            <span>No activity data available</span>
                            <small>Import bookmarks or browse websites to see trends</small>
                        </div>
                    </div>
                </div>
            `;
            return;
        }

        const trends = activityData.trends;
        const maxActivity = Math.max(
            ...trends.map((t: any) => t.visits + t.bookmarks),
        );
        const recentTrends = trends.slice(-14);

        const chartBars = recentTrends
            .map((trend: any) => {
                const totalActivity = trend.visits + trend.bookmarks;
                const date = new Date(trend.date).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                });

                const visitsHeight =
                    maxActivity > 0 ? (trend.visits / maxActivity) * 100 : 0;
                const bookmarksHeight =
                    maxActivity > 0 ? (trend.bookmarks / maxActivity) * 100 : 0;

                return `
                    <div class="chart-bar" title="${date}: ${totalActivity} activities">
                        <div class="bar-segment visits" style="height: ${visitsHeight}%" title="Visits: ${trend.visits}"></div>
                        <div class="bar-segment bookmarks" style="height: ${bookmarksHeight}%" title="Bookmarks: ${trend.bookmarks}"></div>
                        <div class="bar-label">${date}</div>
                    </div>
                `;
            })
            .join("");

        const summary = activityData.summary || {};

        container.innerHTML = `
            <div class="card">
                <div class="card-body">
                    <h6 class="card-title">Activity Trends</h6>
                    
                    <div class="activity-summary mb-3">
                        <div class="summary-stat">
                            <span class="stat-label">Total Activity</span>
                            <span class="stat-value">${summary.totalActivity || 0}</span>
                        </div>
                        <div class="summary-stat">
                            <span class="stat-label">Daily Average</span>
                            <span class="stat-value">${Math.round(summary.averagePerDay || 0)}</span>
                        </div>
                        <div class="summary-stat">
                            <span class="stat-label">Peak Day</span>
                            <span class="stat-value">${
                                summary.peakDay
                                    ? new Date(
                                          summary.peakDay,
                                      ).toLocaleDateString("en-US", {
                                          month: "short",
                                          day: "numeric",
                                      })
                                    : "N/A"
                            }</span>
                        </div>
                    </div>
                    
                    <div class="activity-chart">
                        <div class="chart-container">
                            ${chartBars}
                        </div>
                        <div class="chart-legend">
                            <div class="legend-item">
                                <div class="legend-color visits"></div>
                                <span>Visits</span>
                            </div>
                            <div class="legend-item">
                                <div class="legend-color bookmarks"></div>
                                <span>Bookmarks</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    private async renderKnowledgeInsights(): Promise<void> {
        const container = document.getElementById("knowledgeInsights");
        if (!container || !this.analyticsData?.knowledge) return;

        const knowledgeStats = this.analyticsData.knowledge;

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
                                    <div class="progress-fill" style="width: ${
                                        knowledgeStats.extractionProgress
                                            ?.entityProgress || 0
                                    }%; background: linear-gradient(90deg, #17a2b8, #20c997);"></div>
                                </div>
                                <span class="progress-percentage">${
                                    knowledgeStats.extractionProgress
                                        ?.entityProgress || 0
                                }%</span>
                            </div>
                        </div>
                        
                        <div class="progress-item">
                            <div class="progress-label">
                                <i class="bi bi-tags text-purple"></i>
                                <span>Topic Analysis</span>
                            </div>
                            <div class="progress-bar-container">
                                <div class="progress-bar">
                                    <div class="progress-fill" style="width: ${
                                        knowledgeStats.extractionProgress
                                            ?.topicProgress || 0
                                    }%; background: linear-gradient(90deg, #6f42c1, #e83e8c);"></div>
                                </div>
                                <span class="progress-percentage">${
                                    knowledgeStats.extractionProgress
                                        ?.topicProgress || 0
                                }%</span>
                            </div>
                        </div>
                        
                        <div class="progress-item">
                            <div class="progress-label">
                                <i class="bi bi-lightning text-warning"></i>
                                <span>Action Detection</span>
                            </div>
                            <div class="progress-bar-container">
                                <div class="progress-bar">
                                    <div class="progress-fill" style="width: ${
                                        knowledgeStats.extractionProgress
                                            ?.actionProgress || 0
                                    }%; background: linear-gradient(90deg, #fd7e14, #ffc107);"></div>
                                </div>
                                <span class="progress-percentage">${
                                    knowledgeStats.extractionProgress
                                        ?.actionProgress || 0
                                }%</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="card">
                <div class="card-body">
                    <h6 class="card-title">Knowledge Quality Distribution</h6>
                    <div class="quality-distribution">
                        <div class="quality-segment high" style="width: ${
                            knowledgeStats.qualityDistribution?.highQuality || 0
                        }%;" title="High Quality: ${knowledgeStats.qualityDistribution?.highQuality || 0}%">
                            <span class="quality-label">High</span>
                        </div>
                        <div class="quality-segment medium" style="width: ${
                            knowledgeStats.qualityDistribution?.mediumQuality ||
                            0
                        }%;" title="Medium Quality: ${knowledgeStats.qualityDistribution?.mediumQuality || 0}%">
                            <span class="quality-label">Medium</span>
                        </div>
                        <div class="quality-segment low" style="width: ${
                            knowledgeStats.qualityDistribution?.lowQuality || 0
                        }%;" title="Low Quality: ${knowledgeStats.qualityDistribution?.lowQuality || 0}%">
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

    private renderTopDomains(): void {
        const container = document.getElementById("topDomainsList");
        if (!container || !this.analyticsData?.domains) return;

        const domainsData = this.analyticsData.domains;

        if (!domainsData.topDomains || domainsData.topDomains.length === 0) {
            container.innerHTML = `
                <div class="empty-message">
                    <i class="bi bi-globe"></i>
                    <span>No domain data available</span>
                </div>
            `;
            return;
        }

        const domainsHtml = domainsData.topDomains
            .map(
                (domain: any) => `
                    <div class="domain-item">
                        <div class="domain-info">
                            <img src="https://www.google.com/s2/favicons?domain=${domain.domain}" 
                                 class="domain-favicon" alt="Favicon" loading="lazy"
                                 onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 fill=%22%23999%22><rect width=%2216%22 height=%2216%22 rx=%222%22/></svg>'">
                            <div class="domain-details">
                                <div class="domain-name">${domain.domain}</div>
                                <div class="domain-stats">
                                    <span class="site-count">${domain.count} sites</span>
                                    <span class="percentage">${domain.percentage}%</span>
                                </div>
                            </div>
                        </div>
                        <div class="domain-bar">
                            <div class="bar-fill" style="width: ${Math.min(domain.percentage, 100)}%"></div>
                        </div>
                    </div>
                `,
            )
            .join("");

        container.innerHTML = domainsHtml;
    }

    setConnectionStatus(isConnected: boolean): void {
        this.isConnected = isConnected;
        if (!isConnected) {
            this.showAnalyticsConnectionError();
        }
    }

    private updateRecentEntitiesDisplay(recentEntities: any[]): void {
        const container = document.getElementById("recentEntitiesList");
        if (!container) return;

        if (!recentEntities || recentEntities.length === 0) {
            container.innerHTML = `
                <div class="empty-message">
                    <i class="bi bi-diagram-2"></i>
                    <span>No recent entities extracted</span>
                </div>
            `;
            return;
        }

        const entitiesHtml = recentEntities
            .slice(0, 10)
            .map(
                (entity) => `
            <div class="entity-pill clickable" data-entity-name="${this.escapeHtml(entity.name || "Unknown Entity")}" title="🚀 Click to explore '${this.escapeHtml(entity.name || "Unknown Entity")}' in Enhanced Graph View">
                <div class="pill-icon">
                    <i class="bi bi-diagram-3"></i>
                </div>
                <div class="pill-content">
                    <div class="pill-name">${this.escapeHtml(entity.name || "Unknown Entity")}</div>
                    <div class="pill-type">
                        <i class="bi bi-tag"></i> ${this.escapeHtml(entity.type || "Unknown")}
                        <span class="pill-action-hint">
                            <i class="bi bi-cursor-fill"></i> Click to explore
                        </span>
                    </div>
                </div>
            </div>
        `,
            )
            .join("");

        container.innerHTML = entitiesHtml;

        // Add click handlers for entity navigation to enhanced graph view
        container.querySelectorAll(".entity-pill.clickable").forEach((pill) => {
            pill.addEventListener("click", (e) => {
                const entityName = (
                    e.currentTarget as HTMLElement
                ).getAttribute("data-entity-name");
                if (entityName) {
                    // Show enhanced graph view for the selected entity
                    this.showEnhancedGraphView(entityName);
                }
            });
        });
    }

    private updateRecentTopicsDisplay(recentTopics: any[]): void {
        const container = document.getElementById("recentTopicsList");
        if (!container) return;

        if (!recentTopics || recentTopics.length === 0) {
            container.innerHTML = `
                <div class="empty-message">
                    <i class="bi bi-tags"></i>
                    <span>No recent topics identified</span>
                </div>
            `;
            return;
        }

        const topicsHtml = recentTopics
            .slice(0, 10)
            .map(
                (topic) => `
            <div class="topic-pill">
                <div class="pill-icon">
                    <i class="bi bi-tags"></i>
                </div>
                <div class="pill-content">
                    <div class="pill-name">${this.escapeHtml(topic.name || topic.topic || "Unknown Topic")}</div>
                    ${topic.category ? `<div class="pill-type">${this.escapeHtml(topic.category)}</div>` : ""}
                </div>
            </div>
        `,
            )
            .join("");

        container.innerHTML = topicsHtml;
    }

    private updateRecentActionsDisplay(recentRelationships: any[]): void {
        const container = document.getElementById("recentActionsList");
        if (!container) return;

        if (!recentRelationships || recentRelationships.length === 0) {
            container.innerHTML = `
                <div class="empty-message">
                    <i class="bi bi-diagram-3"></i>
                    <span>No recent entity actions identified</span>
                </div>
            `;
            return;
        }

        // Use the relationship data directly (no transformation needed)
        const relationshipsHtml = recentRelationships
            .slice(0, 10)
            .map(
                (rel) => `
                <div class="relationship-item rounded">
                    <span class="fw-semibold">${this.escapeHtml(rel.from)}</span>
                    <i class="bi bi-arrow-right mx-2 text-muted"></i>
                    <span class="text-muted">${this.escapeHtml(rel.relationship)}</span>
                    <i class="bi bi-arrow-right mx-2 text-muted"></i>
                    <span class="fw-semibold">${this.escapeHtml(rel.to)}</span>
                </div>
            `,
            )
            .join("");

        container.innerHTML = relationshipsHtml;
    }

    private formatRelativeDate(dateString?: string): string {
        if (!dateString) return "Unknown";

        try {
            const date = new Date(dateString);
            const now = new Date();
            const diffTime = Math.abs(now.getTime() - date.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays === 0) {
                return "Today";
            } else if (diffDays === 1) {
                return "Yesterday";
            } else if (diffDays <= 7) {
                return `${diffDays} days ago`;
            } else {
                return date.toLocaleDateString();
            }
        } catch (error) {
            return "Unknown";
        }
    }

    /**
     * Show the enhanced graph view for a selected entity
     */
    private showEnhancedGraphView(entityName: string): void {
        console.log(`🚀 Opening enhanced graph view for entity: ${entityName}`);
        
        // Show loading notification
        this.showLoadingNotification(`Loading enhanced graph view for "${entityName}"...`);
        
        try {
            // Create or get enhanced graph view container
            let graphContainer = document.getElementById('enhanced-graph-view-container');
            if (!graphContainer) {
                graphContainer = this.createEnhancedGraphViewContainer();
            }
            
            // Show the graph container
            graphContainer.style.display = 'block';
            
            // Hide the main analytics page
            const analyticsPage = document.getElementById('analytics-page');
            if (analyticsPage) {
                analyticsPage.style.display = 'none';
            }
            
            // Initialize enhanced graph view with the entity
            let enhancedGraphView: EnhancedEntityGraphView;
            try {
                enhancedGraphView = new EnhancedEntityGraphView({
                    enableRealtimeExpansion: true,
                    autoLayoutUpdate: true,
                    performanceMode: "balanced",
                    defaultExpansionDepth: 2,
                    enableNetworkAnalysis: true,
                    cacheSize: 100
                });
            } catch (initError) {
                console.error('Failed to initialize enhanced graph view:', initError);
                this.hideLoadingNotification();
                this.showErrorNotification('Enhanced graph view unavailable, redirecting to standard view...');
                setTimeout(() => {
                    window.location.href = `entityGraphView.html?entity=${encodeURIComponent(entityName)}`;
                }, 1500);
                return;
            }
            
            // Set a timeout for the loading process
            const loadingTimeout = setTimeout(() => {
                this.hideLoadingNotification();
                this.showErrorNotification('Loading timed out. Redirecting to standard entity view...');
                this.hideEnhancedGraphView();
                window.location.href = `entityGraphView.html?entity=${encodeURIComponent(entityName)}`;
            }, 15000); // 15 second timeout

            // Search and visualize the entity with error handling
            enhancedGraphView.searchAndVisualizeEntity(entityName, {
                expansionDepth: 2,
                enableNetworkAnalysis: true
            }).then(() => {
                // Success - clear the timeout
                clearTimeout(loadingTimeout);
            }).catch((error) => {
                console.error('Failed to load entity in enhanced graph view:', error);
                clearTimeout(loadingTimeout);
                this.hideLoadingNotification();
                this.showErrorNotification(`Failed to load enhanced graph view: ${error instanceof Error ? error.message : String(error)}`);
                
                // Hide the graph view and return to analytics
                this.hideEnhancedGraphView();
                
                // Fallback to traditional entity graph view
                setTimeout(() => {
                    window.location.href = `entityGraphView.html?entity=${encodeURIComponent(entityName)}`;
                }, 2000);
            });
            
            // Make it globally accessible for debugging
            (window as any).currentEnhancedGraphView = enhancedGraphView;
            
            // Hide loading notification
            this.hideLoadingNotification();
            
            // Show success notification
            this.showSuccessNotification(`Enhanced graph view loaded for "${entityName}"`);
            
        } catch (error) {
            console.error('❌ Failed to show enhanced graph view:', error);
            
            // Hide loading notification
            this.hideLoadingNotification();
            
            // Show error notification
            this.showErrorNotification(`Failed to load enhanced graph view: ${error instanceof Error ? error.message : String(error)}`);
            
            // Fallback to traditional navigation
            window.location.href = `entityGraphView.html?entity=${encodeURIComponent(entityName)}`;
        }
    }
    
    /**
     * Create the enhanced graph view container
     */
    private createEnhancedGraphViewContainer(): HTMLElement {
        const container = document.createElement('div');
        container.id = 'enhanced-graph-view-container';
        container.className = 'enhanced-graph-view-overlay';
        container.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: white;
            z-index: 9999;
            display: none;
            overflow: auto;
        `;
        
        // Add header with back button
        const header = document.createElement('div');
        header.className = 'enhanced-graph-header';
        header.style.cssText = `
            position: sticky;
            top: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 1rem;
            display: flex;
            align-items: center;
            gap: 1rem;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            z-index: 10000;
        `;
        
        const backButton = document.createElement('button');
        backButton.innerHTML = '<i class="bi bi-arrow-left"></i> Back to Analytics';
        backButton.className = 'btn btn-outline-light btn-sm';
        backButton.addEventListener('click', () => {
            this.hideEnhancedGraphView();
        });
        
        const title = document.createElement('h5');
        title.innerHTML = '<i class="bi bi-diagram-3"></i> Enhanced Entity Graph View';
        title.style.margin = '0';
        
        header.appendChild(backButton);
        header.appendChild(title);
        
        // Add main content area
        const content = document.createElement('div');
        content.id = 'enhanced-graph-content';
        content.style.cssText = `
            padding: 2rem;
            height: calc(100vh - 80px);
            display: flex;
            flex-direction: column;
        `;
        
        container.appendChild(header);
        container.appendChild(content);
        
        // Add to body
        document.body.appendChild(container);
        
        return container;
    }
    
    /**
     * Hide the enhanced graph view and return to analytics
     */
    private hideEnhancedGraphView(): void {
        const graphContainer = document.getElementById('enhanced-graph-view-container');
        if (graphContainer) {
            graphContainer.style.display = 'none';
        }
        
        const analyticsPage = document.getElementById('analytics-page');
        if (analyticsPage) {
            analyticsPage.style.display = 'block';
        }
        
        // Clean up the enhanced graph view instance
        if ((window as any).currentEnhancedGraphView) {
            delete (window as any).currentEnhancedGraphView;
        }
    }

    /**
     * Show loading notification
     */
    private showLoadingNotification(message: string): void {
        this.createNotification(message, 'loading');
    }
    
    /**
     * Show success notification
     */
    private showSuccessNotification(message: string): void {
        this.createNotification(message, 'success');
    }
    
    /**
     * Show error notification
     */
    private showErrorNotification(message: string): void {
        this.createNotification(message, 'error');
    }
    
    /**
     * Hide loading notification
     */
    private hideLoadingNotification(): void {
        const notification = document.querySelector('.graph-view-notification.loading');
        if (notification) {
            notification.remove();
        }
    }
    
    /**
     * Create a notification element
     */
    private createNotification(message: string, type: 'loading' | 'success' | 'error'): void {
        // Remove existing notifications of the same type
        document.querySelectorAll(`.graph-view-notification.${type}`).forEach(n => n.remove());
        
        const notification = document.createElement('div');
        notification.className = `graph-view-notification ${type}`;
        
        const icon = type === 'loading' ? 'bi-hourglass-split' : 
                    type === 'success' ? 'bi-check-circle-fill' : 'bi-exclamation-triangle-fill';
        
        const bgColor = type === 'loading' ? '#667eea' :
                       type === 'success' ? '#28a745' : '#dc3545';
        
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${bgColor};
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 0.5rem;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 10001;
            display: flex;
            align-items: center;
            gap: 0.75rem;
            font-size: 0.875rem;
            max-width: 350px;
            animation: slideInRight 0.3s ease;
        `;
        
        notification.innerHTML = `
            <i class="bi ${icon}"></i>
            <span>${this.escapeHtml(message)}</span>
        `;
        
        // Add slide in animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideInRight {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
        `;
        document.head.appendChild(style);
        
        document.body.appendChild(notification);
        
        // Auto-remove success and error notifications
        if (type !== 'loading') {
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.style.animation = 'slideInRight 0.3s ease reverse';
                    setTimeout(() => notification.remove(), 300);
                }
            }, 3000);
        }
    }

    private escapeHtml(text: string): string {
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
    }
}
