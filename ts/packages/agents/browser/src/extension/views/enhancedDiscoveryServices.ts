// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { DefaultDiscoveryServices } from "./knowledgeUtilities";
import { ExtensionServiceBase } from "./extensionServiceBase";

export interface TrendingSectionData {
    cards: TrendingContentCard[];
    summary: {
        totalActive: number;
        totalFound: number;
        lastUpdated: string;
    };
}

export interface TrendingContentCard {
    id: string;
    trendName: string;
    trendType: 'ephemeral' | 'persistent' | 'recurring' | 'seasonal';
    confidence: number;
    websiteCount: number;
    domainCount: number;
    topTopics: string[];
    duration: string;
    isActive: boolean;
    insights: string[];
    startDate: string;
    endDate?: string;
}

export interface ReadingPatternData {
    patterns: ReadingPatternCard[];
    insights: string[];
}

export interface ReadingPatternCard {
    id: string;
    patternName: string;
    frequency: 'daily' | 'weekly' | 'monthly';
    domains: string[];
    timeOfDay?: string;
    dayOfWeek?: string;
    consistency: number;
    lastActivity: string;
    confidence: number;
    insights: string[];
}

export interface PopularContentData {
    popularPages: PopularContentItem[];
    analytics: {
        totalTrends: number;
        totalWebsites: number;
    };
}

export interface PopularContentItem {
    title: string;
    url: string;
    description: string;
    visits: number;
    trendScore: number;
    category: string;
}

/**
 * Enhanced Discovery Services with trend integration
 * Extends the default discovery services to include trend-based insights
 */
export class EnhancedDiscoveryServices extends DefaultDiscoveryServices {
    private trendCache: Map<string, { data: any; expiry: number }> = new Map();
    private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
    private readonly MAX_RETRIES = 2;
    private readonly RETRY_DELAY = 1000; // 1 second

    constructor(extensionService: ExtensionServiceBase) {
        super(extensionService);
    }

    /**
     * Get trending content for the Discover page
     */
    async getTrendingContent(): Promise<TrendingSectionData> {
        const cacheKey = 'trending-content';
        const cached = this.getCachedData(cacheKey);
        if (cached) {
            return cached;
        }

        return this.executeWithRetry(
            async () => {
                // Use a generic message sending approach since we're extending DefaultDiscoveryServices
                const response = await this.sendTrendMessage('getTrendingContent') as any;

                if (response && response.success) {
                    const data: TrendingSectionData = {
                        cards: (response.trends || []).map((trend: any) => this.formatTrendCard(trend)),
                        summary: response.summary || { totalActive: 0, totalFound: 0, lastUpdated: new Date().toISOString() },
                    };

                    this.setCachedData(cacheKey, data);
                    return data;
                } else {
                    throw new Error((response && response.error) || 'Failed to get trending content');
                }
            },
            this.getEmptyTrendingData(),
            'getTrendingContent'
        );
    }

    /**
     * Get reading patterns for the Discover page
     */
    async getReadingPatterns(): Promise<ReadingPatternData> {
        const cacheKey = 'reading-patterns';
        const cached = this.getCachedData(cacheKey);
        if (cached) {
            return cached;
        }

        const fallbackData: ReadingPatternData = {
            patterns: [],
            insights: ["Start browsing regularly to discover your reading patterns"],
        };

        return this.executeWithRetry(
            async () => {
                const response = await this.sendTrendMessage('getReadingPatterns') as any;

                if (response && response.success) {
                    const data: ReadingPatternData = {
                        patterns: (response.patterns || []).map((pattern: any) => this.formatPatternCard(pattern)),
                        insights: response.insights || [],
                    };

                    this.setCachedData(cacheKey, data);
                    return data;
                } else {
                    throw new Error((response && response.error) || 'Failed to get reading patterns');
                }
            },
            fallbackData,
            'getReadingPatterns'
        );
    }

    /**
     * Get popular content for the Discover page
     */
    async getPopularContent(): Promise<PopularContentData> {
        const cacheKey = 'popular-content';
        const cached = this.getCachedData(cacheKey);
        if (cached) {
            return cached;
        }

        const fallbackData: PopularContentData = {
            popularPages: [{
                title: "Import your browsing data to see popular content",
                url: "#",
                description: "Popular pages will appear here once you have browsing data",
                visits: 0,
                trendScore: 0,
                category: "Getting Started",
            }],
            analytics: {
                totalTrends: 0,
                totalWebsites: 0,
            },
        };

        return this.executeWithRetry(
            async () => {
                const response = await this.sendTrendMessage('getPopularContent') as any;

                if (response && response.success) {
                    const data: PopularContentData = {
                        popularPages: response.popularPages || [],
                        analytics: response.analytics || { totalTrends: 0, totalWebsites: 0 },
                    };

                    this.setCachedData(cacheKey, data);
                    return data;
                } else {
                    throw new Error((response && response.error) || 'Failed to get popular content');
                }
            },
            fallbackData,
            'getPopularContent'
        );
    }

    /**
     * Get comprehensive trend insights for the Discover page
     */
    async getTrendInsights(): Promise<{
        topIntents: any[];
        crossTrendAnalysis: string[];
        sugggestedActions: string[];
    }> {
        try {
            const response = await this.sendTrendMessage('getTrendAnalytics') as any;

            if (response && response.success && response.analytics) {
                return {
                    topIntents: response.analytics.topIntents || [],
                    crossTrendAnalysis: this.generateCrossTrendAnalysis(response.analytics),
                    sugggestedActions: this.generateSuggestedActions(response.analytics),
                };
            } else {
                return {
                    topIntents: [],
                    crossTrendAnalysis: [],
                    sugggestedActions: ["Import browsing data to see trend insights"],
                };
            }
        } catch (error) {
            console.error('Error getting trend insights:', error);
            return {
                topIntents: [],
                crossTrendAnalysis: [],
                sugggestedActions: ["Error loading trend insights"],
            };
        }
    }

    /**
     * Clear trend cache (useful for refreshing data)
     */
    async clearTrendCache(): Promise<void> {
        this.trendCache.clear();
        
        try {
            await this.sendTrendMessage('clearTrendCache');
        } catch (error) {
            console.error('Error clearing trend cache:', error);
        }
    }

    // Private helper methods

    private formatTrendCard(trend: any): TrendingContentCard {
        return {
            id: trend.id,
            trendName: trend.name || trend.cluster?.name || 'Unnamed Trend',
            trendType: trend.type || 'persistent',
            confidence: trend.confidence || 0,
            websiteCount: trend.summary?.websites || trend.cluster?.websites?.length || 0,
            domainCount: trend.summary?.domains || trend.cluster?.uniqueDomains || 0,
            topTopics: trend.summary?.topTopics || trend.cluster?.topics?.slice(0, 5) || [],
            duration: this.calculateDuration(trend.startDate, trend.endDate),
            isActive: trend.isActive || false,
            insights: trend.insights || [],
            startDate: trend.startDate,
            endDate: trend.endDate,
        };
    }

    private formatPatternCard(pattern: any): ReadingPatternCard {
        return {
            id: pattern.id,
            patternName: pattern.name || pattern.cluster?.name || 'Reading Pattern',
            frequency: this.determineFrequency(pattern),
            domains: pattern.cluster?.domains || [],
            timeOfDay: this.extractTimeOfDay(pattern),
            dayOfWeek: this.extractDayOfWeek(pattern),
            consistency: pattern.confidence || 0,
            lastActivity: pattern.endDate || pattern.cluster?.timeRange?.end || new Date().toISOString(),
            confidence: pattern.confidence || 0,
            insights: pattern.insights || [],
        };
    }

    private calculateDuration(startDate: string, endDate?: string): string {
        const start = new Date(startDate);
        const end = endDate ? new Date(endDate) : new Date();
        const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        
        if (days === 1) return '1 day';
        if (days < 7) return `${days} days`;
        if (days < 30) return `${Math.ceil(days / 7)} weeks`;
        return `${Math.ceil(days / 30)} months`;
    }

    private determineFrequency(pattern: any): 'daily' | 'weekly' | 'monthly' {
        // Simple heuristic based on pattern analysis
        const duration = pattern.cluster?.timeRange ? 
            new Date(pattern.cluster.timeRange.end).getTime() - new Date(pattern.cluster.timeRange.start).getTime() :
            0;
        const durationDays = duration / (1000 * 60 * 60 * 24);
        const visits = pattern.cluster?.visitCount || 0;
        
        if (visits / durationDays > 0.8) return 'daily';
        if (visits / durationDays > 0.3) return 'weekly';
        return 'monthly';
    }

    private extractTimeOfDay(pattern: any): string | undefined {
        // Placeholder for time analysis
        // In a real implementation, would analyze visit timestamps
        return undefined;
    }

    private extractDayOfWeek(pattern: any): string | undefined {
        // Placeholder for day analysis
        // In a real implementation, would analyze visit patterns by day
        return undefined;
    }

    private generateCrossTrendAnalysis(analytics: any): string[] {
        const analysis: string[] = [];
        
        if (analytics.activeTrends > 1) {
            analysis.push(`You're actively researching ${analytics.activeTrends} different topics`);
        }
        
        if (analytics.trendsByType) {
            const types = Object.keys(analytics.trendsByType);
            if (types.length > 2) {
                analysis.push(`Your interests span ${types.length} different activity types`);
            }
        }
        
        if (analytics.averageTrendDuration > 14) {
            analysis.push("You tend to research topics thoroughly over extended periods");
        } else if (analytics.averageTrendDuration < 3) {
            analysis.push("You explore topics in focused, intense bursts");
        }
        
        return analysis;
    }

    private generateSuggestedActions(analytics: any): string[] {
        const actions: string[] = [];
        
        if (analytics.topIntents && analytics.topIntents.length > 0) {
            const topIntent = analytics.topIntents[0];
            actions.push(`Continue researching ${topIntent.intent}`);
        }
        
        if (analytics.activeTrends > 3) {
            actions.push("Consider organizing your research into focused sessions");
        }
        
        if (analytics.trendHistory && analytics.trendHistory.length > 5) {
            actions.push("Review your past research to identify completion opportunities");
        }
        
        actions.push("Export your trends as a research report");
        
        return actions;
    }

    private getEmptyTrendingData(): TrendingSectionData {
        return {
            cards: [{
                id: 'empty',
                trendName: "Start browsing to discover trends",
                trendType: 'persistent',
                confidence: 0,
                websiteCount: 0,
                domainCount: 0,
                topTopics: [],
                duration: '0 days',
                isActive: false,
                insights: ["Your browsing trends will appear here"],
                startDate: new Date().toISOString(),
            }],
            summary: {
                totalActive: 0,
                totalFound: 0,
                lastUpdated: new Date().toISOString(),
            },
        };
    }

    private getCachedData(key: string): any {
        const cached = this.trendCache.get(key);
        if (cached && cached.expiry > Date.now()) {
            return cached.data;
        }
        return null;
    }

    private setCachedData(key: string, data: any): void {
        this.trendCache.set(key, {
            data,
            expiry: Date.now() + this.CACHE_TTL,
        });
    }

    /**
     * Execute a function with retry logic for better error handling
     */
    private async executeWithRetry<T>(
        operation: () => Promise<T>,
        fallback: T,
        context: string
    ): Promise<T> {
        let lastError: any;
        
        for (let attempt = 0; attempt <= this.MAX_RETRIES; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error;
                console.warn(`${context} - Attempt ${attempt + 1} failed:`, error);
                
                if (attempt < this.MAX_RETRIES) {
                    await this.delay(this.RETRY_DELAY * (attempt + 1)); // Exponential backoff
                }
            }
        }
        
        console.error(`${context} - All ${this.MAX_RETRIES + 1} attempts failed. Using fallback.`, lastError);
        return fallback;
    }

    /**
     * Send a trend-related message to the service worker
     * Uses the parent class's chrome service to send messages
     */
    private async sendTrendMessage(type: string, params: any = {}): Promise<any> {
        // Access the chrome service through the parent class
        const message = { type, ...params };
        
        // Call a method that exists on the chrome service to send the message
        // Since we can't access sendMessage directly, we'll use a workaround
        // by temporarily storing the message and using the discovery service's message sending
        try {
            // Use the existing discovery service method but with our trend message
            return await (this.chromeService as any).sendMessage(message);
        } catch (error) {
            console.error(`Failed to send trend message ${type}:`, error);
            // Return a minimal error response that matches expected structure
            return {
                success: false,
                error: `Failed to send ${type} message: ${error}`,
            };
        }
    }

    /**
     * Simple delay helper for retry logic
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}