// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { LibraryBaseController, AnalyticsData } from "./LibraryBaseController";
import {
    notificationManager,
    chromeExtensionService,
    KnowledgeFormatUtils as FormatUtils,
} from "../knowledgeUtilities";

export class AnalyticsViewController extends LibraryBaseController {
    
    public async initializeAnalyticsPage(): Promise<void> {
        const emptyState = document.getElementById("analyticsEmptyState");
        if (emptyState) {
            emptyState.style.display = "none";
        }

        this.clearPlaceholderContent();

        if (!this.analyticsData) {
            await this.loadAnalyticsData();
        }
        await this.renderAnalyticsContent();
    }

    private async loadAnalyticsData(): Promise<void> {
        if (!this.isConnected) {
            this.showAnalyticsConnectionError();
            return;
        }

        try {
            const analyticsResponse = await chromeExtensionService.getAnalyticsData({
                timeRange: "30d",
                includeQuality: true,
                includeProgress: true,
                topDomainsLimit: 10,
                activityGranularity: "day",
            });

            if (analyticsResponse.success) {
                this.analyticsData = {
                    overview: analyticsResponse.analytics.overview,
                    trends: analyticsResponse.analytics.activity.trends,
                    insights: this.transformKnowledgeInsights(analyticsResponse.analytics.knowledge),
                    domains: analyticsResponse.analytics.domains,
                    knowledge: analyticsResponse.analytics.knowledge,
                    activity: analyticsResponse.analytics.activity,
                };

                this.updateKnowledgeVisualizationData(analyticsResponse.analytics.knowledge);
            } else {
                throw new Error(analyticsResponse.error || "Failed to get analytics data");
            }
        } catch (error) {
            console.error("Failed to load analytics data:", error);
            this.handleAnalyticsDataError(error);
        }
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

    private handleAnalyticsDataError(error: any): void {
        this.analyticsData = {
            overview: {
                totalSites: this.libraryStats.totalWebsites,
                totalBookmarks: this.libraryStats.totalBookmarks,
                totalHistory: this.libraryStats.totalHistory,
                knowledgeExtracted: 0,
            },
            trends: [],
            insights: [],
        };

        const emptyState = document.getElementById("analyticsEmptyState");
        if (emptyState) {
            emptyState.style.display = "block";
        }

        this.updateMetricDisplaysWithZeros();
        this.clearPlaceholderContent();
        this.updateRecentEntitiesDisplay([]);
        this.updateRecentTopicsDisplay([]);
        this.updateRecentActionsDisplay([]);
    }

    private calculateKnowledgeQualityFromData(knowledge: any): number {
        if (!knowledge || !knowledge.qualityDistribution) return 0;

        const { highQuality, mediumQuality, lowQuality } = knowledge.qualityDistribution;
        const total = highQuality + mediumQuality + lowQuality;

        if (total === 0) return 0;

        return Math.round((highQuality * 100 + mediumQuality * 60 + lowQuality * 20) / total);
    }

    private updateKnowledgeVisualizationData(knowledge: any): void {
        const knowledgeExtractedElement = document.getElementById("knowledgeExtracted");
        const totalEntitiesElement = document.getElementById("totalEntities");
        const totalTopicsElement = document.getElementById("totalTopics");
        const totalActionsElement = document.getElementById("totalActions");

        if (knowledgeExtractedElement) {
            knowledgeExtractedElement.textContent = (knowledge.totalEntities || 0).toString();
        }
        if (totalEntitiesElement) {
            totalEntitiesElement.textContent = (knowledge.totalEntities || 0).toString();
        }
        if (totalTopicsElement) {
            totalTopicsElement.textContent = (knowledge.totalTopics || 0).toString();
        }
        if (totalActionsElement) {
            totalActionsElement.textContent = (knowledge.totalActions || 0).toString();
        }

        this.updateKnowledgeVisualizationCards(knowledge);
        this.clearPlaceholderContent();
        this.loadRecentKnowledgeItems(knowledge);
    }

    private updateKnowledgeVisualizationCards(knowledge: any): void {
        const totalEntitiesMetric = document.getElementById("totalEntitiesMetric");
        if (totalEntitiesMetric) {
            totalEntitiesMetric.textContent = (knowledge.totalEntities || 0).toString();
        }

        const totalTopicsMetric = document.getElementById("totalTopicsMetric");
        if (totalTopicsMetric) {
            totalTopicsMetric.textContent = (knowledge.totalTopics || 0).toString();
        }

        const totalActionsMetric = document.getElementById("totalActionsMetric");
        if (totalActionsMetric) {
            totalActionsMetric.textContent = (knowledge.totalActions || 0).toString();
        }

        // Note: totalRelationshipsMetric element doesn't exist in HTML, so we skip it
        // If needed, this element should be added to the HTML file
    }

    private async loadRecentKnowledgeItems(knowledge: any): Promise<void> {
        try {
            const response = await chromeExtensionService.getRecentKnowledgeItems(10);

            if (response && response.success) {
                this.updateRecentEntitiesDisplay(response.entities || []);
                this.updateRecentTopicsDisplay(response.topics || []);
                this.updateRecentActionsDisplay(response.actions || []);
            } else {
                console.warn("No recent knowledge items found or API returned failure");
                this.updateRecentEntitiesDisplay([]);
                this.updateRecentTopicsDisplay([]);
                this.updateRecentActionsDisplay([]);
            }
        } catch (error) {
            console.error("Failed to load recent knowledge items:", error);
            this.updateRecentEntitiesDisplay([]);
            this.updateRecentTopicsDisplay([]);
            this.updateRecentActionsDisplay([]);
        }
    }

    private updateRecentEntitiesDisplay(entities: any[]): void {
        const entitiesBreakdown = document.getElementById("entitiesBreakdown");
        if (!entitiesBreakdown) return;

        if (entities.length === 0) {
            entitiesBreakdown.innerHTML = `
                <div class="text-center py-3 text-muted">
                    <i class="bi bi-diagram-2 me-2"></i>
                    No entities extracted yet. Visit websites to start building your knowledge base.
                </div>
            `;
            return;
        }

        const recentEntitiesList = entities.map(entity => `
            <div class="breakdown-item">
                <span class="breakdown-type" title="${entity.entityType || 'Entity'}">${FormatUtils.escapeHtml(entity.name)}</span>
                <span class="breakdown-count small text-muted" title="From: ${entity.fromPage || 'Unknown'}">${FormatUtils.formatDate(entity.created || entity.extractedAt)}</span>
            </div>
        `).join('');

        entitiesBreakdown.innerHTML = `
            <div class="mb-2">
                <small class="text-muted d-flex align-items-center">
                    <i class="bi bi-clock-history me-2"></i>
                    10 Most Recent Entities
                </small>
            </div>
            ${recentEntitiesList}
        `;
    }

    private updateRecentTopicsDisplay(topics: any[]): void {
        const topicsBreakdown = document.getElementById("topicsBreakdown");
        if (!topicsBreakdown) return;

        if (topics.length === 0) {
            topicsBreakdown.innerHTML = `
                <div class="text-center py-3 text-muted">
                    <i class="bi bi-tags me-2"></i>
                    No topics identified yet. Visit websites to start building your knowledge base.
                </div>
            `;
            return;
        }

        const recentTopics = topics.slice(0, 10);
        const topicTags = recentTopics.map((topic, index) => {
            const sizeClass = index < 3 ? "size-large" : index < 6 ? "size-medium" : "size-small";
            const shortPageTitle = topic.fromPage && topic.fromPage.length > 30 
                ? topic.fromPage.substring(0, 30) + "..." 
                : topic.fromPage || "Unknown";

            return `<span class="topic-tag ${sizeClass}" title="From: ${topic.fromPage || 'Unknown'} (${FormatUtils.formatDate(topic.extractedAt || topic.created)})">${FormatUtils.escapeHtml(topic.name)}</span>`;
        }).join("");

        topicsBreakdown.innerHTML = `
            <div class="mb-2">
                <small class="text-muted d-flex align-items-center">
                    <i class="bi bi-clock-history me-2"></i>
                    10 Most Recent Topics
                </small>
            </div>
            <div class="topic-tags-container">
                ${topicTags}
            </div>
        `;
    }

    private updateRecentActionsDisplay(actions: any[]): void {
        const actionsBreakdown = document.getElementById("actionsBreakdown");
        if (!actionsBreakdown) return;

        if (actions.length === 0) {
            actionsBreakdown.innerHTML = `
                <div class="text-center py-3 text-muted">
                    <i class="bi bi-lightning me-2"></i>
                    No actions detected yet. Visit interactive websites to start detecting actions.
                </div>
            `;
            return;
        }

        const recentActionsList = actions.slice(0, 10).map(action => {
            const shortPageTitle = action.fromPage && action.fromPage.length > 30
                ? action.fromPage.substring(0, 30) + "..."
                : action.fromPage || "Unknown";
            const confidencePercentage = Math.round((action.confidence || 0) * 100);

            return `
                <div class="breakdown-item">
                    <div class="d-flex align-items-center justify-content-between">
                        <span class="breakdown-type" title="${action.text || `${action.type || action.actionType} on ${action.element || 'element'}`}">
                            ${action.actionType || action.type || 'Action'}
                            ${action.element ? `<span class="badge bg-secondary ms-1">${action.element}</span>` : ''}
                        </span>
                        <span class="confidence-badge" title="Confidence: ${confidencePercentage}%">
                            ${confidencePercentage}%
                        </span>
                    </div>
                    <span class="breakdown-count small text-muted" title="From: ${action.fromPage || 'Unknown'}">
                        ${shortPageTitle}
                    </span>
                </div>
            `;
        }).join("");

        actionsBreakdown.innerHTML = `
            <div class="mb-2">
                <small class="text-muted d-flex align-items-center">
                    <i class="bi bi-clock-history me-2"></i>
                    10 Most Recent Actions
                </small>
            </div>
            ${recentActionsList}
        `;
    }

    private async renderAnalyticsContent(): Promise<void> {
        if (!this.analyticsData) return;

        const hasData =
            this.analyticsData.overview.totalSites > 0 ||
            this.analyticsData.overview.knowledgeExtracted > 0 ||
            this.analyticsData.insights.some((insight) => insight.value > 0);

        const emptyState = document.getElementById("analyticsEmptyState");
        if (emptyState) {
            emptyState.style.display = hasData ? "none" : "block";
        }

        if (hasData) {
            this.renderActivityCharts();
            await this.renderKnowledgeInsights();
            this.renderTopDomains();
        }
    }

    private renderActivityCharts(): void {
        const container = document.getElementById("activityCharts");
        if (!container || !this.analyticsData?.activity) return;

        const trends = this.analyticsData.activity.trends || [];
        if (trends.length === 0) {
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

        const maxActivity = Math.max(...trends.map((t: any) => t.visits + t.bookmarks));
        const recentTrends = trends.slice(-14);

        const chartBars = recentTrends.map((trend: any) => {
            const totalActivity = trend.visits + trend.bookmarks;
            const date = new Date(trend.date).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
            });

            const visitsHeight = maxActivity > 0 ? (trend.visits / maxActivity) * 100 : 0;
            const bookmarksHeight = maxActivity > 0 ? (trend.bookmarks / maxActivity) * 100 : 0;

            return `
                <div class="chart-bar" title="${date}: ${totalActivity} activities">
                    <div class="bar-segment visits" style="height: ${visitsHeight}%" title="Visits: ${trend.visits}"></div>
                    <div class="bar-segment bookmarks" style="height: ${bookmarksHeight}%" title="Bookmarks: ${trend.bookmarks}"></div>
                    <div class="bar-label">${date}</div>
                </div>
            `;
        }).join("");

        const summary = this.analyticsData.activity.summary || {};

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
                            <span class="stat-value">${summary.peakDay ? new Date(summary.peakDay).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "N/A"}</span>
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
                                    <div class="progress-fill" style="width: ${knowledgeStats.extractionProgress?.entityProgress || 0}%; background: linear-gradient(90deg, #17a2b8, #20c997);"></div>
                                </div>
                                <span class="progress-percentage">${knowledgeStats.extractionProgress?.entityProgress || 0}%</span>
                            </div>
                        </div>
                        
                        <div class="progress-item">
                            <div class="progress-label">
                                <i class="bi bi-tags text-purple"></i>
                                <span>Topic Analysis</span>
                            </div>
                            <div class="progress-bar-container">
                                <div class="progress-bar">
                                    <div class="progress-fill" style="width: ${knowledgeStats.extractionProgress?.topicProgress || 0}%; background: linear-gradient(90deg, #6f42c1, #e83e8c);"></div>
                                </div>
                                <span class="progress-percentage">${knowledgeStats.extractionProgress?.topicProgress || 0}%</span>
                            </div>
                        </div>
                        
                        <div class="progress-item">
                            <div class="progress-label">
                                <i class="bi bi-lightning text-warning"></i>
                                <span>Action Detection</span>
                            </div>
                            <div class="progress-bar-container">
                                <div class="progress-bar">
                                    <div class="progress-fill" style="width: ${knowledgeStats.extractionProgress?.actionProgress || 0}%; background: linear-gradient(90deg, #fd7e14, #ffc107);"></div>
                                </div>
                                <span class="progress-percentage">${knowledgeStats.extractionProgress?.actionProgress || 0}%</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="card">
                <div class="card-body">
                    <h6 class="card-title">Knowledge Quality Distribution</h6>
                    <div class="quality-distribution">
                        <div class="quality-segment high" style="width: ${knowledgeStats.qualityDistribution?.highQuality || 0}%;" title="High Quality: ${knowledgeStats.qualityDistribution?.highQuality || 0}%">
                            <span class="quality-label">High</span>
                        </div>
                        <div class="quality-segment medium" style="width: ${knowledgeStats.qualityDistribution?.mediumQuality || 0}%;" title="Medium Quality: ${knowledgeStats.qualityDistribution?.mediumQuality || 0}%">
                            <span class="quality-label">Medium</span>
                        </div>
                        <div class="quality-segment low" style="width: ${knowledgeStats.qualityDistribution?.lowQuality || 0}%;" title="Low Quality: ${knowledgeStats.qualityDistribution?.lowQuality || 0}%">
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
            .map((domain: any) => `
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
            `)
            .join("");

        container.innerHTML = domainsHtml;
    }

    private updateMetricDisplaysWithZeros(): void {
        const metrics = [
            "totalEntitiesMetric",
            "totalTopicsMetric",
            "totalActionsMetric",
            "knowledgeExtracted",
            "totalEntities",
            "totalTopics",
            "totalActions"
        ];

        metrics.forEach(metricId => {
            const element = document.getElementById(metricId);
            if (element) {
                element.textContent = "0";
            }
        });
    }

    private clearPlaceholderContent(): void {
        const placeholders = document.querySelectorAll('.placeholder-glow, .placeholder');
        placeholders.forEach(placeholder => {
            placeholder.classList.remove('placeholder-glow', 'placeholder');
        });
    }

    protected async initializeDiscoverPage(): Promise<void> {
        // Implementation handled by DiscoverViewController
    }
}
