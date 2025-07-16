// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { LibraryBaseController, DiscoverInsights } from "./LibraryBaseController";
import {
    notificationManager,
    chromeExtensionService,
    KnowledgeFormatUtils as FormatUtils,
    Website,
} from "../knowledgeUtilities";

export class DiscoverViewController extends LibraryBaseController {
    
    public async initializeDiscoverPage(): Promise<void> {
        const emptyState = document.getElementById("discoverEmptyState");
        if (emptyState) {
            emptyState.style.display = "none";
        }

        if (!this.discoverData) {
            await this.loadDiscoverData();
        }
        this.renderDiscoverContent();
    }

    private async loadDiscoverData(): Promise<void> {
        if (!this.isConnected) {
            const emptyState = document.getElementById("discoverEmptyState");
            if (emptyState) {
                emptyState.style.display = "block";
            }
            return;
        }

        try {
            const response = await chromeExtensionService.getDiscoverInsights(10, "30d");
            if (response.success) {
                this.discoverData = {
                    trendingTopics: response.trendingTopics || [],
                    readingPatterns: response.readingPatterns || [],
                    popularPages: response.popularPages || [],
                    topDomains: response.topDomains || [],
                };
            }
        } catch (error) {
            console.error("Error loading discover data:", error);
        }
    }

    private renderDiscoverContent(): void {
        if (!this.discoverData) return;

        const hasData = this.discoverData.trendingTopics.length > 0 ||
                       this.discoverData.readingPatterns.some((p) => p.activity > 0) ||
                       this.discoverData.popularPages.length > 0;

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

    private renderTrendingContent(): void {
        const container = document.getElementById("trendingContent");
        if (!container || !this.discoverData) return;

        if (this.discoverData.trendingTopics.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="bi bi-graph-up-arrow"></i>
                    <h6>No Trending Topics</h6>
                    <p>Import more content to see trending topics.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.discoverData.trendingTopics.map(topic => `
            <div class="card trending-topic-card trend-${topic.trend} discover-card mb-2">
                <div class="card-body">
                    <h6 class="card-title text-capitalize">${FormatUtils.escapeHtml(topic.topic)}</h6>
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
        `).join("");
    }

    private renderReadingPatterns(): void {
        const container = document.getElementById("readingPatterns");
        if (!container || !this.discoverData) return;

        if (this.discoverData.readingPatterns.length === 0 ||
            this.discoverData.readingPatterns.every((p) => p.activity === 0)) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="bi bi-clock-history"></i>
                    <h6>No Activity Patterns</h6>
                    <p>Visit more pages to see your reading patterns.</p>
                </div>
            `;
            return;
        }

        const maxActivity = Math.max(...this.discoverData.readingPatterns.map((p) => p.activity));

        container.innerHTML = `
            <div class="card discover-card">
                <div class="card-body">
                    <h6 class="card-title">Weekly Activity Pattern</h6>
                    <div class="reading-pattern-chart">
                        ${this.discoverData.readingPatterns.map(pattern => `
                            <div class="pattern-item ${pattern.peak ? "peak" : ""}">
                                <div class="pattern-bar" style="height: ${maxActivity > 0 ? (pattern.activity / maxActivity) * 80 + 10 : 2}px" 
                                     title="${pattern.timeframe}: ${pattern.activity} visits"></div>
                                <div class="pattern-time">${pattern.timeframe.substring(0, 3)}</div>
                            </div>
                        `).join("")}
                    </div>
                    <div class="text-center mt-2">
                        <small class="text-muted">Most active day: ${this.discoverData.readingPatterns.find((p) => p.peak)?.timeframe || "None"}</small>
                    </div>
                </div>
            </div>
        `;
    }

    private renderPopularPages(): void {
        const container = document.getElementById("popularPages");
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

        const popularPagesAsWebsites: Website[] = this.discoverData.popularPages.map((page) => ({
            url: page.url,
            title: page.title,
            domain: page.domain,
            visitCount: page.visitCount,
            lastVisited: page.lastVisited,
            source: page.isBookmarked ? "bookmarks" : "history",
            score: page.visitCount,
            knowledge: {
                hasKnowledge: false,
                status: "none" as const,
            },
        }));

        container.innerHTML = popularPagesAsWebsites.map(website => `
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
                        <div class="d-flex align-items-center justify-content-between">
                            <span class="text-muted small">
                                ${website.visitCount} visits • ${FormatUtils.formatDate(website.lastVisited || '')}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        `).join("");
    }

    protected async initializeAnalyticsPage(): Promise<void> {
        // Implementation handled by AnalyticsViewController
    }
}
