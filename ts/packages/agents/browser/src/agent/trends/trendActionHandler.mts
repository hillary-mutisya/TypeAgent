// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { SessionContext } from "@typeagent/agent-sdk";
import { BrowserActionContext } from "../actionHandler.mjs";
import { ActivityTrendService } from "./activityTrendService.mjs";
import { AnalyticsManager } from "../storage/analyticsManager.mjs";
import { 
    TrendType, 
    VisualizationType
} from "./types.mjs";
import { TrendOptions } from "./activityTrendService.mjs";
import registerDebug from "debug";

const debug = registerDebug("typeagent:browser:trends:handler");

export interface GetTrendsParams {
    minConfidence?: number;
    types?: TrendType[];
    limit?: number;
    includeHabits?: boolean;
    startDate?: string;
    endDate?: string;
}

export interface GetTrendDetailsParams {
    trendId: string;
}

export interface GetVisualizationParams {
    type: VisualizationType;
    minConfidence?: number;
    limit?: number;
    startDate?: string;
    endDate?: string;
}

export interface ExportTrendsParams {
    format?: 'json' | 'html';
    minConfidence?: number;
    types?: TrendType[];
}

export class TrendActionHandler {
    private trendService: ActivityTrendService;

    constructor(
        private readonly _context: SessionContext<BrowserActionContext>,
        private analyticsManager: AnalyticsManager
    ) {
        this.trendService = new ActivityTrendService(this._context, analyticsManager);
    }

    /**
     * Get user activity trends
     */
    async getTrends(params?: GetTrendsParams) {
        debug("Handling getTrends request:", params);
        
        try {
            const options: TrendOptions = {};
            
            if (params?.minConfidence) {
                options.minConfidence = params.minConfidence;
            }
            
            if (params?.types) {
                options.types = params.types;
            }
            
            if (params?.limit) {
                options.limit = params.limit;
            }
            
            if (params?.includeHabits !== undefined) {
                options.includeHabits = params.includeHabits;
            }
            
            if (params?.startDate && params?.endDate) {
                options.timeRange = {
                    start: new Date(params.startDate),
                    end: new Date(params.endDate)
                };
            }
            
            const trends = await this.trendService.getTrends(options);
            
            // Record usage analytics
            await this.analyticsManager.recordUsage("get_trends", {
                success: true
            });
            
            return {
                success: true,
                trends: trends.map(trend => ({
                    id: trend.id,
                    name: trend.cluster.name,
                    type: trend.type,
                    confidence: trend.confidence,
                    isActive: trend.isActive,
                    startDate: trend.startDate.toISOString(),
                    endDate: trend.endDate?.toISOString(),
                    insights: trend.insights,
                    summary: {
                        websites: trend.cluster.websites.length,
                        domains: trend.cluster.uniqueDomains,
                        intensity: trend.cluster.intensity,
                        topTopics: trend.cluster.topics.slice(0, 5),
                        topEntities: trend.cluster.entities.slice(0, 5)
                    }
                })),
                totalCount: trends.length,
                filters: options
            };
            
        } catch (error) {
            debug("Error getting trends:", error);
            
            await this.analyticsManager.recordUsage("get_trends", {
                success: false
            });
            
            return {
                success: false,
                error: `Failed to get trends: ${(error as Error).message}`,
                trends: [],
                totalCount: 0
            };
        }
    }

    /**
     * Get detailed information about a specific trend
     */
    async getTrendDetails(params: GetTrendDetailsParams) {
        debug("Handling getTrendDetails request:", params);
        
        try {
            const details = await this.trendService.getTrendDetails(params.trendId);
            
            if (!details) {
                return {
                    success: false,
                    error: `Trend not found: ${params.trendId}`,
                    details: null
                };
            }
            
            await this.analyticsManager.recordUsage("get_trend_details", {
                success: true
            });
            
            return {
                success: true,
                details: {
                    trend: {
                        id: details.trend.id,
                        name: details.trend.cluster.name,
                        type: details.trend.type,
                        confidence: details.trend.confidence,
                        isActive: details.trend.isActive,
                        startDate: details.trend.startDate.toISOString(),
                        endDate: details.trend.endDate?.toISOString(),
                        insights: details.trend.insights,
                        relatedTrends: details.trend.relatedTrends
                    },
                    intent: details.intent ? {
                        intent: details.intent.intent,
                        confidence: details.intent.confidence,
                        stage: details.intent.stage,
                        suggestedActions: details.intent.suggestedActions,
                        evidence: details.intent.supportingEvidence
                    } : null,
                    cluster: {
                        topics: details.trend.cluster.topics,
                        entities: details.trend.cluster.entities,
                        domains: details.trend.cluster.domains,
                        websites: details.trend.cluster.websites,
                        timeRange: {
                            start: details.trend.cluster.timeRange.start.toISOString(),
                            end: details.trend.cluster.timeRange.end.toISOString()
                        },
                        intensity: details.trend.cluster.intensity
                    },
                    analytics: details.analytics,
                    websites: details.relatedWebsites.map(w => ({
                        url: w.metadata.url,
                        title: w.metadata.title,
                        domain: w.metadata.domain,
                        visitDate: w.metadata.visitDate,
                        visitCount: w.metadata.visitCount
                    }))
                }
            };
            
        } catch (error) {
            debug("Error getting trend details:", error);
            
            await this.analyticsManager.recordUsage("get_trend_details", {
                success: false
            });
            
            return {
                success: false,
                error: `Failed to get trend details: ${(error as Error).message}`,
                details: null
            };
        }
    }

    /**
     * Get visualization data for trends
     */
    async getVisualization(params: GetVisualizationParams) {
        debug("Handling getVisualization request:", params);
        
        try {
            const options: TrendOptions = {};
            
            if (params.minConfidence) {
                options.minConfidence = params.minConfidence;
            }
            
            if (params.limit) {
                options.limit = params.limit;
            }
            
            if (params.startDate && params.endDate) {
                options.timeRange = {
                    start: new Date(params.startDate),
                    end: new Date(params.endDate)
                };
            }
            
            const visualizationData = await this.trendService.getVisualizationData(
                params.type, 
                options
            );
            
            await this.analyticsManager.recordUsage("get_visualization", {
                success: true
            });
            
            return {
                success: true,
                visualization: {
                    type: visualizationData.type,
                    data: visualizationData.data,
                    metadata: {
                        timeRange: {
                            start: visualizationData.metadata.timeRange.start.toISOString(),
                            end: visualizationData.metadata.timeRange.end.toISOString()
                        },
                        trendCount: visualizationData.metadata.trendCount,
                        lastUpdated: visualizationData.metadata.lastUpdated.toISOString()
                    }
                }
            };
            
        } catch (error) {
            debug("Error getting visualization:", error);
            
            await this.analyticsManager.recordUsage("get_visualization", {
                success: false
            });
            
            return {
                success: false,
                error: `Failed to get visualization: ${(error as Error).message}`,
                visualization: null
            };
        }
    }

    /**
     * Export trends report
     */
    async exportTrends(params?: ExportTrendsParams) {
        debug("Handling exportTrends request:", params);
        
        try {
            const format = params?.format || 'json';
            const report = await this.trendService.exportTrendsReport(format);
            
            await this.analyticsManager.recordUsage("export_trends", {
                success: true
            });
            
            return {
                success: true,
                report,
                format,
                exportedAt: new Date().toISOString()
            };
            
        } catch (error) {
            debug("Error exporting trends:", error);
            
            await this.analyticsManager.recordUsage("export_trends", {
                success: false
            });
            
            return {
                success: false,
                error: `Failed to export trends: ${(error as Error).message}`,
                report: null,
                format: params?.format || 'json'
            };
        }
    }

    /**
     * Get trend analytics summary
     */
    async getTrendAnalytics() {
        debug("Handling getTrendAnalytics request");
        
        try {
            const analytics = await this.trendService.getTrendAnalytics();
            
            await this.analyticsManager.recordUsage("get_trend_analytics", {
                success: true
            });
            
            return {
                success: true,
                analytics: {
                    ...analytics,
                    trendHistory: analytics.trendHistory.map(h => ({
                        date: h.date,
                        trendCount: h.trendCount,
                        newTrends: h.newTrends
                    }))
                }
            };
            
        } catch (error) {
            debug("Error getting trend analytics:", error);
            
            await this.analyticsManager.recordUsage("get_trend_analytics", {
                success: false
            });
            
            return {
                success: false,
                error: `Failed to get trend analytics: ${(error as Error).message}`,
                analytics: null
            };
        }
    }

    /**
     * Clear trend cache (for development/debugging)
     */
    async clearTrendCache() {
        debug("Handling clearTrendCache request");
        
        try {
            this.trendService.clearCache();
            
            await this.analyticsManager.recordUsage("clear_trend_cache", {
                success: true
            });
            
            return {
                success: true,
                message: "Trend cache cleared successfully"
            };
            
        } catch (error) {
            debug("Error clearing trend cache:", error);
            
            return {
                success: false,
                error: `Failed to clear trend cache: ${(error as Error).message}`
            };
        }
    }
}