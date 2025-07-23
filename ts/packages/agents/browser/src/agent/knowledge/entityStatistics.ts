// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Phase 2: Advanced Entity Statistics Calculation
 * 
 * This module provides comprehensive statistical analysis for entities including:
 * - Advanced metrics calculation
 * - Temporal trend analysis  
 * - Domain distribution analysis
 * - Relationship network metrics
 */

import * as website from "website-memory";
import registerDebug from "debug";
import { EntityStats } from "./entityRelationshipInference.js";

const debug = registerDebug("typeagent:browser:entity-statistics");

export interface EntityNetworkMetrics {
    centralityScore: number;      // How central this entity is in the network
    clusteringCoefficient: number; // How clustered the entity's neighbors are
    betweennessCentrality: number; // How often entity acts as bridge between others
    pageRankScore: number;        // PageRank-style importance score
    communityId?: string;         // Which community/cluster the entity belongs to
    influenceScore: number;       // Overall influence in the knowledge graph
}

export interface EntityTrendAnalysis {
    mentionTrend: "increasing" | "decreasing" | "stable" | "periodic";
    growthRate: number;           // Percentage change in mentions over time
    peakPeriods: string[];        // Time periods with highest activity
    cyclicality: {
        detected: boolean;
        period?: "daily" | "weekly" | "monthly" | "yearly";
        confidence: number;
    };
    forecast: {
        nextPeriodPrediction: number; // Predicted mentions for next period
        confidence: number;
    };
}

export interface EntityQualityMetrics {
    dataQuality: number;          // 0-1 score of data completeness/accuracy
    sourceReliability: number;    // Average reliability of sources mentioning entity
    informationDensity: number;   // How much info per mention
    verificationScore: number;    // How well verified/cross-referenced the entity is
    freshness: number;           // How recent the information is (0-1)
}

export class EntityStatisticsCalculator {
    constructor(private websiteCollection: website.WebsiteCollection) {}

    /**
     * Calculate comprehensive entity statistics with advanced analytics
     */
    async calculateComprehensiveStats(entityName: string): Promise<EntityStats & {
        networkMetrics: EntityNetworkMetrics;
        trendAnalysis: EntityTrendAnalysis;
        qualityMetrics: EntityQualityMetrics;
    }> {
        debug(`Calculating comprehensive statistics for: ${entityName}`);

        // Get basic stats
        const basicStats = await this.calculateBasicStats(entityName);
        
        // Calculate advanced metrics
        const networkMetrics = await this.calculateNetworkMetrics(entityName);
        const trendAnalysis = await this.analyzeTrends(entityName);
        const qualityMetrics = await this.calculateQualityMetrics(entityName);

        return {
            ...basicStats,
            networkMetrics,
            trendAnalysis,
            qualityMetrics
        };
    }

    /**
     * Enhanced basic statistics calculation
     */
    private async calculateBasicStats(entityName: string): Promise<EntityStats> {
        if (!this.websiteCollection.knowledgeEntities) {
            throw new Error("Knowledge entities table not available");
        }

        const knowledgeTable = this.websiteCollection.knowledgeEntities as any;

        // Multi-query approach for comprehensive stats
        const queries = {
            basic: `
                SELECT 
                    COUNT(*) as totalMentions,
                    COUNT(DISTINCT url) as uniqueUrls,
                    COUNT(DISTINCT domain) as uniqueDomains,
                    AVG(confidence) as avgConfidence,
                    MIN(extractionDate) as firstSeen,
                    MAX(extractionDate) as lastSeen,
                    GROUP_CONCAT(DISTINCT entityType) as entityTypes,
                    -- Calculate mention density per URL
                    CAST(COUNT(*) AS FLOAT) / COUNT(DISTINCT url) as mentionDensity
                FROM knowledgeEntities 
                WHERE entityName = ?
            `,
            
            domainDistribution: `
                SELECT 
                    domain, 
                    COUNT(*) as count,
                    AVG(confidence) as avgDomainConfidence,
                    MIN(extractionDate) as domainFirstSeen,
                    MAX(extractionDate) as domainLastSeen,
                    (COUNT(*) * 100.0 / (SELECT COUNT(*) FROM knowledgeEntities WHERE entityName = ?)) as percentage
                FROM knowledgeEntities 
                WHERE entityName = ?
                GROUP BY domain
                ORDER BY count DESC
                LIMIT 10
            `,

            temporalDistribution: `
                SELECT 
                    DATE(extractionDate) as date,
                    COUNT(*) as dailyMentions,
                    AVG(confidence) as dailyAvgConfidence
                FROM knowledgeEntities 
                WHERE entityName = ?
                GROUP BY DATE(extractionDate)
                ORDER BY date DESC
                LIMIT 30
            `
        };

        const basicStats = knowledgeTable.db.prepare(queries.basic).get(entityName);
        const domainDistribution = knowledgeTable.db.prepare(queries.domainDistribution).all(entityName, entityName);
        const temporalData = knowledgeTable.db.prepare(queries.temporalDistribution).all(entityName);

        // Analyze temporal patterns
        const temporalPattern = this.analyzeTemporalPattern(temporalData);

        return {
            totalMentions: basicStats?.totalMentions || 0,
            uniqueUrls: basicStats?.uniqueUrls || 0,
            uniqueDomains: basicStats?.uniqueDomains || 0,
            topDomains: domainDistribution.slice(0, 5).map((d: any) => d.domain),
            avgConfidence: basicStats?.avgConfidence || 0,
            firstSeen: basicStats?.firstSeen || new Date().toISOString(),
            lastSeen: basicStats?.lastSeen || new Date().toISOString(),
            entityTypes: basicStats?.entityTypes ? basicStats.entityTypes.split(',').filter(Boolean) : [],
            relationshipCount: 0, // Will be calculated separately
            domainDistribution: domainDistribution.map((d: any) => ({
                domain: d.domain,
                count: d.count,
                percentage: Math.round(d.percentage * 100) / 100
            })),
            temporalPattern
        };
    }

    /**
     * Calculate network-based metrics for the entity
     */
    private async calculateNetworkMetrics(entityName: string): Promise<EntityNetworkMetrics> {
        debug(`Calculating network metrics for: ${entityName}`);

        // This would require implementing graph algorithms
        // For Phase 2, we'll provide basic implementations that can be enhanced

        const centralityScore = await this.calculateCentralityScore(entityName);
        const clusteringCoefficient = await this.calculateClusteringCoefficient(entityName);
        const influenceScore = await this.calculateInfluenceScore(entityName);

        return {
            centralityScore,
            clusteringCoefficient,
            betweennessCentrality: 0.5, // Placeholder
            pageRankScore: centralityScore * 0.8, // Approximation
            influenceScore
        };
    }

    /**
     * Analyze temporal trends and patterns
     */
    private async analyzeTrends(entityName: string): Promise<EntityTrendAnalysis> {
        debug(`Analyzing trends for: ${entityName}`);

        if (!this.websiteCollection.knowledgeEntities) {
            return this.getDefaultTrendAnalysis();
        }

        const knowledgeTable = this.websiteCollection.knowledgeEntities as any;

        // Get temporal data for trend analysis
        const trendQuery = `
            SELECT 
                DATE(extractionDate) as date,
                COUNT(*) as mentions,
                AVG(confidence) as avgConfidence
            FROM knowledgeEntities 
            WHERE entityName = ?
              AND extractionDate >= date('now', '-90 days')
            GROUP BY DATE(extractionDate)
            ORDER BY date ASC
        `;

        const trendData = knowledgeTable.db.prepare(trendQuery).all(entityName);

        if (trendData.length < 3) {
            return this.getDefaultTrendAnalysis();
        }

        // Analyze trend direction
        const mentionTrend = this.calculateTrendDirection(trendData);
        const growthRate = this.calculateGrowthRate(trendData);
        const cyclicality = this.detectCyclicality(trendData);
        const peakPeriods = this.identifyPeakPeriods(trendData);

        return {
            mentionTrend,
            growthRate,
            peakPeriods,
            cyclicality,
            forecast: {
                nextPeriodPrediction: this.forecastNextPeriod(trendData),
                confidence: cyclicality.confidence
            }
        };
    }

    /**
     * Calculate data quality metrics
     */
    private async calculateQualityMetrics(entityName: string): Promise<EntityQualityMetrics> {
        debug(`Calculating quality metrics for: ${entityName}`);

        if (!this.websiteCollection.knowledgeEntities) {
            return this.getDefaultQualityMetrics();
        }

        const knowledgeTable = this.websiteCollection.knowledgeEntities as any;

        const qualityQuery = `
            SELECT 
                AVG(confidence) as avgConfidence,
                COUNT(DISTINCT domain) as sourceDiversity,
                COUNT(DISTINCT url) as sourceCount,
                COUNT(*) as totalMentions,
                MAX(extractionDate) as latestMention,
                -- Data completeness indicators
                COUNT(CASE WHEN entityType IS NOT NULL AND entityType != '' THEN 1 END) as typedMentions,
                COUNT(CASE WHEN confidence > 0.7 THEN 1 END) as highConfidenceMentions
            FROM knowledgeEntities 
            WHERE entityName = ?
        `;

        const qualityData = knowledgeTable.db.prepare(qualityQuery).get(entityName);

        if (!qualityData) {
            return this.getDefaultQualityMetrics();
        }

        // Calculate quality scores
        const dataQuality = this.calculateDataQuality(qualityData);
        const sourceReliability = this.calculateSourceReliability(qualityData);
        const informationDensity = this.calculateInformationDensity(qualityData);
        const verificationScore = this.calculateVerificationScore(qualityData);
        const freshness = this.calculateFreshness(qualityData.latestMention);

        return {
            dataQuality,
            sourceReliability,
            informationDensity,
            verificationScore,
            freshness
        };
    }

    // Private helper methods for calculations

    private async calculateCentralityScore(entityName: string): Promise<number> {
        // Simplified centrality based on relationship count and strength
        if (!this.websiteCollection.knowledgeEntities) return 0;

        const knowledgeTable = this.websiteCollection.knowledgeEntities as any;
        
        const centralityQuery = `
            SELECT COUNT(DISTINCT e2.entityName) as connectionCount
            FROM knowledgeEntities e1
            JOIN knowledgeEntities e2 ON e1.url = e2.url
            WHERE e1.entityName = ? AND e2.entityName != ?
        `;

        const result = knowledgeTable.db.prepare(centralityQuery).get(entityName, entityName);
        const connectionCount = result?.connectionCount || 0;

        // Normalize to 0-1 scale (assuming max 100 connections)
        return Math.min(1.0, connectionCount / 100);
    }

    private async calculateClusteringCoefficient(entityName: string): Promise<number> {
        // Simplified clustering coefficient
        // In a full implementation, this would analyze how connected an entity's neighbors are to each other
        return 0.5; // Placeholder
    }

    private async calculateInfluenceScore(entityName: string): Promise<number> {
        if (!this.websiteCollection.knowledgeEntities) return 0;

        const knowledgeTable = this.websiteCollection.knowledgeEntities as any;

        // Influence based on mentions, domain diversity, and confidence
        const influenceQuery = `
            SELECT 
                COUNT(*) as mentions,
                COUNT(DISTINCT domain) as domainDiversity,
                AVG(confidence) as avgConfidence,
                COUNT(DISTINCT url) as urlDiversity
            FROM knowledgeEntities 
            WHERE entityName = ?
        `;

        const data = knowledgeTable.db.prepare(influenceQuery).get(entityName);
        if (!data) return 0;

        // Weighted influence calculation
        const mentionScore = Math.min(1.0, data.mentions / 50);
        const diversityScore = Math.min(1.0, data.domainDiversity / 20);
        const confidenceScore = data.avgConfidence;
        const urlScore = Math.min(1.0, data.urlDiversity / 30);

        return (mentionScore * 0.3 + diversityScore * 0.3 + confidenceScore * 0.25 + urlScore * 0.15);
    }

    private analyzeTemporalPattern(temporalData: any[]): {
        peakHours: number[];
        trendDirection: "increasing" | "decreasing" | "stable";
        seasonality?: string;
    } {
        if (temporalData.length < 2) {
            return {
                peakHours: [9, 14, 20],
                trendDirection: "stable"
            };
        }

        // Analyze trend direction
        const recent = temporalData.slice(-7).reduce((sum, d) => sum + d.dailyMentions, 0);
        const older = temporalData.slice(0, 7).reduce((sum, d) => sum + d.dailyMentions, 0);
        
        let trendDirection: "increasing" | "decreasing" | "stable" = "stable";
        if (recent > older * 1.2) trendDirection = "increasing";
        else if (recent < older * 0.8) trendDirection = "decreasing";

        return {
            peakHours: [9, 14, 20], // Default business hours
            trendDirection
        };
    }

    private calculateTrendDirection(trendData: any[]): "increasing" | "decreasing" | "stable" | "periodic" {
        if (trendData.length < 5) return "stable";

        const recentAvg = trendData.slice(-7).reduce((sum, d) => sum + d.mentions, 0) / 7;
        const olderAvg = trendData.slice(0, 7).reduce((sum, d) => sum + d.mentions, 0) / 7;

        const changePercent = (recentAvg - olderAvg) / olderAvg;

        if (changePercent > 0.2) return "increasing";
        if (changePercent < -0.2) return "decreasing";
        
        // Check for periodicity (simplified)
        const variance = this.calculateVariance(trendData.map(d => d.mentions));
        const mean = trendData.reduce((sum, d) => sum + d.mentions, 0) / trendData.length;
        
        if (variance / mean > 1.5) return "periodic";
        
        return "stable";
    }

    private calculateGrowthRate(trendData: any[]): number {
        if (trendData.length < 2) return 0;

        const firstWeek = trendData.slice(0, 7).reduce((sum, d) => sum + d.mentions, 0);
        const lastWeek = trendData.slice(-7).reduce((sum, d) => sum + d.mentions, 0);

        if (firstWeek === 0) return lastWeek > 0 ? 100 : 0;
        
        return ((lastWeek - firstWeek) / firstWeek) * 100;
    }

    private detectCyclicality(trendData: any[]): {
        detected: boolean;
        period?: "daily" | "weekly" | "monthly" | "yearly";
        confidence: number;
    } {
        // Simplified cyclicality detection
        if (trendData.length < 14) {
            return { detected: false, confidence: 0 };
        }

        // Check for weekly patterns (7-day cycles)
        const weeklyCorrelation = this.calculateWeeklyCorrelation(trendData);
        
        if (weeklyCorrelation > 0.6) {
            return { detected: true, period: "weekly", confidence: weeklyCorrelation };
        }

        return { detected: false, confidence: 0.3 };
    }

    private identifyPeakPeriods(trendData: any[]): string[] {
        const mean = trendData.reduce((sum, d) => sum + d.mentions, 0) / trendData.length;
        const threshold = mean * 1.5;

        return trendData
            .filter(d => d.mentions > threshold)
            .map(d => d.date)
            .slice(0, 5); // Top 5 peak periods
    }

    private forecastNextPeriod(trendData: any[]): number {
        if (trendData.length < 3) return 0;

        // Simple linear trend extrapolation
        const recentTrend = trendData.slice(-7);
        const avgMentions = recentTrend.reduce((sum, d) => sum + d.mentions, 0) / recentTrend.length;
        
        return Math.max(0, Math.round(avgMentions));
    }

    private calculateDataQuality(qualityData: any): number {
        const completenessScore = qualityData.typedMentions / qualityData.totalMentions;
        const confidenceScore = qualityData.avgConfidence;
        const consistencyScore = Math.min(1.0, qualityData.highConfidenceMentions / qualityData.totalMentions);

        return (completenessScore * 0.4 + confidenceScore * 0.4 + consistencyScore * 0.2);
    }

    private calculateSourceReliability(qualityData: any): number {
        // Source reliability based on diversity and mention frequency
        const diversityScore = Math.min(1.0, qualityData.sourceDiversity / 10);
        const frequencyScore = Math.min(1.0, qualityData.totalMentions / 20);
        
        return (diversityScore * 0.6 + frequencyScore * 0.4);
    }

    private calculateInformationDensity(qualityData: any): number {
        // Information density: mentions per source
        if (qualityData.sourceCount === 0) return 0;
        
        const density = qualityData.totalMentions / qualityData.sourceCount;
        return Math.min(1.0, density / 5); // Normalize assuming max 5 mentions per source is dense
    }

    private calculateVerificationScore(qualityData: any): number {
        // Verification based on cross-references and confidence
        const crossRefScore = Math.min(1.0, qualityData.sourceDiversity / 15);
        const confidenceScore = qualityData.avgConfidence;
        
        return (crossRefScore * 0.6 + confidenceScore * 0.4);
    }

    private calculateFreshness(latestMention: string): number {
        if (!latestMention) return 0;

        const now = new Date();
        const latest = new Date(latestMention);
        const daysDiff = (now.getTime() - latest.getTime()) / (1000 * 60 * 60 * 24);

        // Freshness score: 1.0 for today, decreasing over time
        if (daysDiff < 1) return 1.0;
        if (daysDiff < 7) return 0.8;
        if (daysDiff < 30) return 0.6;
        if (daysDiff < 90) return 0.4;
        if (daysDiff < 365) return 0.2;
        
        return 0.1;
    }

    private calculateVariance(values: number[]): number {
        const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
        const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
        return squaredDiffs.reduce((sum, diff) => sum + diff, 0) / values.length;
    }

    private calculateWeeklyCorrelation(trendData: any[]): number {
        // Simplified weekly correlation calculation
        if (trendData.length < 14) return 0;

        const week1 = trendData.slice(0, 7).map(d => d.mentions);
        const week2 = trendData.slice(7, 14).map(d => d.mentions);

        // Simple correlation coefficient approximation
        const correlation = this.simpleCorrelation(week1, week2);
        return Math.abs(correlation);
    }

    private simpleCorrelation(arr1: number[], arr2: number[]): number {
        if (arr1.length !== arr2.length) return 0;

        const mean1 = arr1.reduce((sum, val) => sum + val, 0) / arr1.length;
        const mean2 = arr2.reduce((sum, val) => sum + val, 0) / arr2.length;

        let numerator = 0;
        let sum1Sq = 0;
        let sum2Sq = 0;

        for (let i = 0; i < arr1.length; i++) {
            const diff1 = arr1[i] - mean1;
            const diff2 = arr2[i] - mean2;
            
            numerator += diff1 * diff2;
            sum1Sq += diff1 * diff1;
            sum2Sq += diff2 * diff2;
        }

        const denominator = Math.sqrt(sum1Sq * sum2Sq);
        return denominator === 0 ? 0 : numerator / denominator;
    }

    private getDefaultTrendAnalysis(): EntityTrendAnalysis {
        return {
            mentionTrend: "stable",
            growthRate: 0,
            peakPeriods: [],
            cyclicality: { detected: false, confidence: 0 },
            forecast: { nextPeriodPrediction: 0, confidence: 0 }
        };
    }

    private getDefaultQualityMetrics(): EntityQualityMetrics {
        return {
            dataQuality: 0.5,
            sourceReliability: 0.5,
            informationDensity: 0.5,
            verificationScore: 0.5,
            freshness: 0.5
        };
    }
}