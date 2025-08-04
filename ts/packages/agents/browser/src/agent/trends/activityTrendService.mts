// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { Website } from "website-memory";
import { SessionContext } from "@typeagent/agent-sdk";
import { BrowserActionContext } from "../actionHandler.mjs";
import { AnalyticsManager } from "../storage/analyticsManager.mjs";
import { TopicVectorGenerator } from "./topicVectorGenerator.mjs";
import { ActivityClusterDetector } from "./activityClusterDetector.mjs";
import { TrendClassifier } from "./trendClassifier.mjs";
import { IntentDetector } from "./intentDetector.mjs";
import {
    UserTrend,
    TrendType,
    UserIntent,
    TrendVisualizationData,
    VisualizationType,
    TrendAnalyticsData,
    TimeRange
} from "./types.mjs";
import registerDebug from "debug";

const debug = registerDebug("typeagent:browser:trends:service");

export interface TrendOptions {
    minConfidence?: number;
    types?: TrendType[];
    limit?: number;
    includeHabits?: boolean;
    timeRange?: TimeRange;
}

export interface TrendDetails {
    trend: UserTrend;
    intent?: UserIntent | undefined;
    relatedWebsites: Website[];
    analytics: {
        totalVisits: number;
        uniqueDomains: number;
        averageSessionTime?: number;
        peakActivityDay: string;
    };
}

export class ActivityTrendService {
    private topicGenerator: TopicVectorGenerator;
    private clusterDetector: ActivityClusterDetector;
    private trendClassifier: TrendClassifier;
    private intentDetector: IntentDetector;
    private cache: Map<string, UserTrend[]> = new Map();
    private lastAnalysisTime: number = 0;
    private readonly cacheTimeout = 5 * 60 * 1000; // 5 minutes

    constructor(
        private context: SessionContext<BrowserActionContext>,
        private analyticsManager: AnalyticsManager
    ) {
        this.topicGenerator = new TopicVectorGenerator();
        this.clusterDetector = new ActivityClusterDetector();
        this.trendClassifier = new TrendClassifier();
        this.intentDetector = new IntentDetector();
    }

    /**
     * Get all detected trends
     */
    async getTrends(options?: TrendOptions): Promise<UserTrend[]> {
        debug("Getting trends with options:", options);
        
        try {
            // Check cache first
            const cacheKey = JSON.stringify(options || {});
            if (this.isCacheValid() && this.cache.has(cacheKey)) {
                debug("Returning cached trends");
                return this.cache.get(cacheKey)!;
            }

            // Get website collection
            const websiteCollection = this.context.agentContext.websiteCollection;
            if (!websiteCollection || websiteCollection.messages.length === 0) {
                debug("No website collection available");
                return [];
            }

            // Apply time range filter
            const websites = this.filterWebsitesByTimeRange(
                this.convertDocPartsToWebsites(Array.from(websiteCollection.messages)),
                options?.timeRange
            );

            if (websites.length === 0) {
                debug("No websites in specified time range");
                return [];
            }

            // Generate topic vectors
            const vectors = await this.topicGenerator.generateVectors(websites);
            debug(`Generated ${vectors.length} topic vectors`);

            // Detect clusters
            const clusters = await this.clusterDetector.detectClusters(vectors);
            debug(`Detected ${clusters.length} clusters`);

            // Classify trends
            const trends = await this.trendClassifier.classifyTrends(clusters, websites);
            debug(`Classified ${trends.length} trends`);

            // Apply filters
            const filteredTrends = this.applyTrendFilters(trends, options);

            // Enhance with intents
            await this.enhanceWithIntents(filteredTrends);

            // Update analytics
            await this.updateTrendAnalytics(filteredTrends);

            // Cache results
            this.cache.set(cacheKey, filteredTrends);
            this.lastAnalysisTime = Date.now();

            debug(`Returning ${filteredTrends.length} filtered trends`);
            return filteredTrends;

        } catch (error) {
            debug("Error getting trends:", error);
            throw new Error(`Failed to get trends: ${error}`);
        }
    }

    /**
     * Get trends for specific time range
     */
    async getTrendsInRange(start: Date, end: Date): Promise<UserTrend[]> {
        return this.getTrends({ timeRange: { start, end } });
    }

    /**
     * Get specific trend details
     */
    async getTrendDetails(trendId: string): Promise<TrendDetails | null> {
        debug(`Getting details for trend: ${trendId}`);
        
        try {
            const allTrends = await this.getTrends();
            const trend = allTrends.find(t => t.id === trendId);
            
            if (!trend) {
                debug(`Trend not found: ${trendId}`);
                return null;
            }

            // Get related websites
            const websiteCollection = this.context.agentContext.websiteCollection;
            const allWebsites = websiteCollection ? this.convertDocPartsToWebsites(Array.from(websiteCollection.messages)) : [];
            const relatedWebsites = allWebsites.filter(w => 
                trend.cluster.websites.includes(w.metadata.url)
            );

            // Detect intent if not already done
            let intent: UserIntent | undefined;
            if (!trend.cluster.websites.some(url => url.includes('intent'))) {
                intent = await this.intentDetector.detectIntent(trend.cluster) || undefined;
            }

            // Calculate analytics
            const analytics = this.calculateTrendAnalytics(trend, relatedWebsites);

            return {
                trend,
                intent,
                relatedWebsites,
                analytics
            };

        } catch (error) {
            debug("Error getting trend details:", error);
            return null;
        }
    }

    /**
     * Get visualization data
     */
    async getVisualizationData(type: VisualizationType, options?: TrendOptions): Promise<TrendVisualizationData> {
        debug(`Getting visualization data for type: ${type}`);
        
        const trends = await this.getTrends(options);
        const timeRange = options?.timeRange || this.getDefaultTimeRange();
        
        let data: any;
        
        switch (type) {
            case VisualizationType.TIMELINE:
                data = this.generateTimelineData(trends);
                break;
            case VisualizationType.HEATMAP:
                data = this.generateHeatmapData(trends, timeRange);
                break;
            case VisualizationType.TOPIC_CLOUD:
                data = this.generateTopicCloudData(trends);
                break;
            case VisualizationType.TREND_DASHBOARD:
                data = this.generateDashboardData(trends);
                break;
            case VisualizationType.INTENT_JOURNEY:
                data = await this.generateIntentJourneyData(trends);
                break;
            default:
                throw new Error(`Unsupported visualization type: ${type}`);
        }

        return {
            type,
            data,
            metadata: {
                timeRange,
                trendCount: trends.length,
                lastUpdated: new Date()
            }
        };
    }

    /**
     * Export trends report
     */
    async exportTrendsReport(format: 'json' | 'html' = 'json'): Promise<string> {
        debug(`Exporting trends report in ${format} format`);
        
        const trends = await this.getTrends();
        const analytics = await this.getTrendAnalytics();
        
        const reportData = {
            generatedAt: new Date().toISOString(),
            summary: {
                totalTrends: trends.length,
                activeTrends: trends.filter(t => t.isActive).length,
                trendTypes: this.groupBy(trends, t => t.type)
            },
            trends: trends.map(trend => ({
                id: trend.id,
                name: trend.cluster.name,
                type: trend.type,
                confidence: trend.confidence,
                duration: this.calculateDuration(trend),
                isActive: trend.isActive,
                insights: trend.insights,
                websites: trend.cluster.websites.length,
                domains: trend.cluster.domains
            })),
            analytics
        };

        if (format === 'json') {
            return JSON.stringify(reportData, null, 2);
        } else {
            return this.generateHtmlReport(reportData);
        }
    }

    /**
     * Get trend analytics summary
     */
    async getTrendAnalytics(): Promise<TrendAnalyticsData> {
        const trends = await this.getTrends();
        
        return {
            totalTrends: trends.length,
            activeTrends: trends.filter(t => t.isActive).length,
            trendsByType: {
                [TrendType.EPHEMERAL]: trends.filter(t => t.type === TrendType.EPHEMERAL).length,
                [TrendType.RECURRING]: trends.filter(t => t.type === TrendType.RECURRING).length,
                [TrendType.PERSISTENT]: trends.filter(t => t.type === TrendType.PERSISTENT).length,
                [TrendType.SEASONAL]: trends.filter(t => t.type === TrendType.SEASONAL).length
            },
            averageTrendDuration: this.calculateAverageDuration(trends),
            topIntents: await this.getTopIntents(trends),
            trendHistory: await this.getTrendHistory()
        };
    }

    /**
     * Clear trend cache
     */
    clearCache(): void {
        this.cache.clear();
        this.lastAnalysisTime = 0;
        debug("Trend cache cleared");
    }

    // Private helper methods

    private filterWebsitesByTimeRange(websites: Website[], timeRange?: TimeRange): Website[] {
        if (!timeRange) {
            // Default to last 90 days
            const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
            return websites.filter(w => {
                const date = w.metadata.visitDate || w.metadata.bookmarkDate;
                return date && new Date(date) >= cutoff;
            });
        }

        return websites.filter(w => {
            const date = w.metadata.visitDate || w.metadata.bookmarkDate;
            if (!date) return false;
            const websiteDate = new Date(date);
            return websiteDate >= timeRange.start && websiteDate <= timeRange.end;
        });
    }

    private applyTrendFilters(trends: UserTrend[], options?: TrendOptions): UserTrend[] {
        let filtered = trends;

        if (options?.minConfidence) {
            filtered = filtered.filter(t => t.confidence >= options.minConfidence!);
        }

        if (options?.types && options.types.length > 0) {
            filtered = filtered.filter(t => options.types!.includes(t.type));
        }

        if (options?.includeHabits === false) {
            filtered = filtered.filter(t => t.type !== TrendType.RECURRING);
        }

        if (options?.limit) {
            // Sort by confidence and take top N
            filtered = filtered
                .sort((a, b) => b.confidence - a.confidence)
                .slice(0, options.limit);
        }

        return filtered;
    }

    private async enhanceWithIntents(trends: UserTrend[]): Promise<void> {
        for (const trend of trends) {
            try {
                const intent = await this.intentDetector.detectIntent(trend.cluster);
                if (intent) {
                    // Store intent reference in cluster for later retrieval
                    (trend.cluster as any)._intent = intent;
                }
            } catch (error) {
                debug(`Failed to detect intent for trend ${trend.id}:`, error);
            }
        }
    }

    private async updateTrendAnalytics(trends: UserTrend[]): Promise<void> {
        try {
            // Record trend metrics in analytics manager
            for (const trend of trends) {
                await this.analyticsManager.recordUsage(`trend_${trend.type}`, {
                    success: true,
                    domain: trend.cluster.domains[0],
                });
            }
        } catch (error) {
            debug("Failed to update trend analytics:", error);
        }
    }

    private calculateTrendAnalytics(trend: UserTrend, websites: Website[]): TrendDetails['analytics'] {
        const totalVisits = websites.reduce((sum, w) => 
            sum + (w.metadata.visitCount || 1), 0
        );
        
        const uniqueDomains = new Set(websites.map(w => w.metadata.domain)).size;
        
        // Find peak activity day
        const visitsByDay = new Map<string, number>();
        websites.forEach(w => {
            const date = w.metadata.visitDate || w.metadata.bookmarkDate;
            if (date) {
                const day = new Date(date).toISOString().split('T')[0];
                visitsByDay.set(day, (visitsByDay.get(day) || 0) + 1);
            }
        });
        
        const peakDay = Array.from(visitsByDay.entries())
            .sort((a, b) => b[1] - a[1])[0];

        return {
            totalVisits,
            uniqueDomains,
            peakActivityDay: peakDay ? peakDay[0] : 'Unknown'
        };
    }

    private generateTimelineData(trends: UserTrend[]): any {
        return trends.map(trend => ({
            id: trend.id,
            name: trend.cluster.name,
            start: trend.startDate,
            end: trend.endDate || new Date(),
            type: trend.type,
            intensity: trend.cluster.intensity,
            websites: trend.cluster.websites.length
        }));
    }

    private generateHeatmapData(trends: UserTrend[], timeRange: TimeRange): any {
        const calendar: any = {};
        
        trends.forEach(trend => {
            const duration = trend.endDate 
                ? trend.endDate.getTime() - trend.startDate.getTime()
                : Date.now() - trend.startDate.getTime();
            
            const days = Math.ceil(duration / (1000 * 60 * 60 * 24));
            
            for (let i = 0; i < days; i++) {
                const date = new Date(trend.startDate.getTime() + i * 24 * 60 * 60 * 1000);
                const dateKey = date.toISOString().split('T')[0];
                
                if (!calendar[dateKey]) {
                    calendar[dateKey] = { date: dateKey, value: 0, trends: [] };
                }
                
                calendar[dateKey].value += trend.cluster.intensity;
                calendar[dateKey].trends.push(trend.id);
            }
        });
        
        return Object.values(calendar);
    }

    private generateTopicCloudData(trends: UserTrend[]): any {
        const topicCounts = new Map<string, number>();
        
        trends.forEach(trend => {
            trend.cluster.topics.forEach(topic => {
                topicCounts.set(topic, (topicCounts.get(topic) || 0) + trend.cluster.intensity);
            });
        });
        
        return Array.from(topicCounts.entries())
            .map(([topic, weight]) => ({ text: topic, weight }))
            .sort((a, b) => b.weight - a.weight)
            .slice(0, 50);
    }

    private generateDashboardData(trends: UserTrend[]): any {
        return {
            activeTrends: trends.filter(t => t.isActive),
            trendsByType: this.groupBy(trends, t => t.type),
            topDomains: this.getTopDomains(trends),
            recentActivity: trends
                .sort((a, b) => b.startDate.getTime() - a.startDate.getTime())
                .slice(0, 10)
        };
    }

    private async generateIntentJourneyData(trends: UserTrend[]): Promise<any> {
        const journeys: any[] = [];
        
        for (const trend of trends) {
            const intent = await this.intentDetector.detectIntent(trend.cluster);
            if (intent) {
                journeys.push({
                    trendId: trend.id,
                    intent: intent.intent,
                    stage: intent.stage,
                    confidence: intent.confidence,
                    timeline: this.buildIntentTimeline(trend, intent)
                });
            }
        }
        
        return journeys;
    }

    private buildIntentTimeline(trend: UserTrend, intent: UserIntent): any[] {
        // Simplified timeline based on websites and domains
        const timeline: any[] = [];
        
        // Group websites by domain and time
        const domainGroups = this.groupBy(
            trend.cluster.websites.map(url => ({ url, domain: this.extractDomain(url) })),
            item => item.domain
        );
        
        Object.entries(domainGroups).forEach(([domain, items]) => {
            timeline.push({
                stage: this.inferStageFromDomain(domain),
                domain,
                websites: items.length,
                timestamp: trend.startDate // Simplified
            });
        });
        
        return timeline.sort((a, b) => a.timestamp - b.timestamp);
    }

    private extractDomain(url: string): string {
        try {
            return new URL(url).hostname.replace(/^www\./, '');
        } catch {
            return url;
        }
    }

    private inferStageFromDomain(domain: string): string {
        if (domain.includes('review') || domain.includes('compare')) {
            return 'comparison';
        } else if (domain.includes('shop') || domain.includes('buy')) {
            return 'decision';
        } else {
            return 'research';
        }
    }

    private isCacheValid(): boolean {
        return Date.now() - this.lastAnalysisTime < this.cacheTimeout;
    }

    private getDefaultTimeRange(): TimeRange {
        const end = new Date();
        const start = new Date(end.getTime() - 90 * 24 * 60 * 60 * 1000);
        return { start, end };
    }

    private groupBy<T, K extends string | number>(items: T[], keyFn: (item: T) => K): Record<K, T[]> {
        const groups = {} as Record<K, T[]>;
        items.forEach(item => {
            const key = keyFn(item);
            if (!groups[key]) groups[key] = [];
            groups[key].push(item);
        });
        return groups;
    }

    private calculateDuration(trend: UserTrend): number {
        const end = trend.endDate || new Date();
        return Math.ceil((end.getTime() - trend.startDate.getTime()) / (1000 * 60 * 60 * 24));
    }

    private calculateAverageDuration(trends: UserTrend[]): number {
        if (trends.length === 0) return 0;
        const totalDuration = trends.reduce((sum, trend) => sum + this.calculateDuration(trend), 0);
        return totalDuration / trends.length;
    }

    private async getTopIntents(trends: UserTrend[]): Promise<UserIntent[]> {
        const intents: UserIntent[] = [];
        
        for (const trend of trends) {
            const intent = await this.intentDetector.detectIntent(trend.cluster);
            if (intent) {
                intents.push(intent);
            }
        }
        
        return intents
            .sort((a, b) => b.confidence - a.confidence)
            .slice(0, 5);
    }

    private async getTrendHistory(): Promise<TrendAnalyticsData['trendHistory']> {
        // Simplified implementation - would be enhanced with persistent storage
        const today = new Date().toISOString().split('T')[0];
        const trends = await this.getTrends();
        
        return [{
            date: today,
            trendCount: trends.length,
            newTrends: trends.filter(t => {
                const startDate = t.startDate.toISOString().split('T')[0];
                return startDate === today;
            }).length
        }];
    }

    private getTopDomains(trends: UserTrend[]): Array<{domain: string, count: number}> {
        const domainCounts = new Map<string, number>();
        
        trends.forEach(trend => {
            trend.cluster.domains.forEach(domain => {
                domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1);
            });
        });
        
        return Array.from(domainCounts.entries())
            .map(([domain, count]) => ({ domain, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);
    }

    /**
     * Convert WebsiteDocPart objects to Website objects for trend analysis
     */
    private convertDocPartsToWebsites(docParts: any[]): Website[] {
        return docParts.map(docPart => {
            // Extract metadata from the WebsiteDocPart
            const metadata = docPart.metadata;
            
            // Create a Website object compatible with trend analysis
            const website = new Website(
                metadata.websiteMeta || metadata, // Use websiteMeta if available, otherwise use metadata directly
                docPart.textChunks || docPart.message || '',
                docPart.tags || [],
                docPart.knowledge,
                docPart.deletionInfo,
                false // Not a new website
            );
            
            return website;
        });
    }

    private generateHtmlReport(data: any): string {
        // Simple HTML report template
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Activity Trends Report</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                .summary { background: #f5f5f5; padding: 15px; border-radius: 5px; }
                .trend { border: 1px solid #ddd; margin: 10px 0; padding: 10px; }
                .active { border-left: 4px solid #4CAF50; }
                .ephemeral { border-left: 4px solid #FF9800; }
                .persistent { border-left: 4px solid #2196F3; }
                .recurring { border-left: 4px solid #9C27B0; }
            </style>
        </head>
        <body>
            <h1>Activity Trends Report</h1>
            <p>Generated: ${data.generatedAt}</p>
            
            <div class="summary">
                <h2>Summary</h2>
                <p>Total Trends: ${data.summary.totalTrends}</p>
                <p>Active Trends: ${data.summary.activeTrends}</p>
            </div>
            
            <h2>Trends</h2>
            ${data.trends.map((trend: any) => `
                <div class="trend ${trend.type} ${trend.isActive ? 'active' : ''}">
                    <h3>${trend.name}</h3>
                    <p>Type: ${trend.type} | Confidence: ${(trend.confidence * 100).toFixed(1)}%</p>
                    <p>Duration: ${trend.duration} days | Websites: ${trend.websites}</p>
                    <p>Domains: ${trend.domains.join(', ')}</p>
                    <ul>
                        ${trend.insights.map((insight: string) => `<li>${insight}</li>`).join('')}
                    </ul>
                </div>
            `).join('')}
        </body>
        </html>
        `;
    }
}