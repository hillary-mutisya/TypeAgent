// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { Website } from "website-memory";
import { ActivityCluster, UserTrend, TrendType } from "./types.mjs";
import registerDebug from "debug";

const debug = registerDebug("typeagent:browser:trends:classifier");

export class TrendClassifier {
    /**
     * Classify activity clusters into trends
     */
    async classifyTrends(
        clusters: ActivityCluster[], 
        allWebsites: Website[]
    ): Promise<UserTrend[]> {
        debug(`Classifying ${clusters.length} clusters into trends`);
        
        const trends: UserTrend[] = [];
        
        for (const cluster of clusters) {
            const trend = await this.classifyCluster(cluster, allWebsites);
            if (trend) {
                trends.push(trend);
            }
        }
        
        // Find related trends
        this.findRelatedTrends(trends);
        
        debug(`Classified ${trends.length} trends`);
        return trends;
    }

    /**
     * Classify a single cluster into a trend
     */
    private async classifyCluster(
        cluster: ActivityCluster, 
        allWebsites: Website[]
    ): Promise<UserTrend | null> {
        // Calculate trend metrics
        const durationDays = this.calculateDurationDays(cluster.timeRange);
        const visitsPerDay = cluster.visitCount / Math.max(1, durationDays);
        // const domainDiversity = cluster.uniqueDomains / cluster.websites.length;
        
        // Determine trend type
        const type = this.determineTrendType(cluster, durationDays, visitsPerDay);
        
        // Calculate confidence
        const confidence = this.calculateConfidence(cluster, type);
        
        // Generate insights
        const insights = this.generateInsights(cluster, type, durationDays, visitsPerDay);
        
        // Check if trend is still active
        const isActive = this.isTrendActive(cluster);
        
        return {
            id: this.generateTrendId(),
            cluster,
            type,
            confidence,
            insights,
            relatedTrends: [], // Will be filled later
            startDate: cluster.timeRange.start,
            endDate: isActive ? cluster.timeRange.end : cluster.timeRange.end,
            isActive
        };
    }

    /**
     * Determine the type of trend
     */
    private determineTrendType(
        cluster: ActivityCluster, 
        durationDays: number,
        visitsPerDay: number
    ): TrendType {
        // Check for recurring patterns
        if (this.hasRecurringPattern(cluster)) {
            return TrendType.RECURRING;
        }
        
        // Check duration
        if (durationDays < 7) {
            return TrendType.EPHEMERAL;
        } else if (durationDays > 30) {
            return TrendType.PERSISTENT;
        }
        
        // Check for seasonal patterns (simplified for now)
        if (this.hasSeasonalPattern(cluster)) {
            return TrendType.SEASONAL;
        }
        
        // Default based on intensity and duration
        if (cluster.intensity > 0.7 && durationDays < 14) {
            return TrendType.EPHEMERAL;
        }
        
        return TrendType.PERSISTENT;
    }

    /**
     * Check if cluster has recurring pattern
     */
    private hasRecurringPattern(cluster: ActivityCluster): boolean {
        // Simplified check - in a real implementation, would analyze
        // visit timestamps for daily/weekly patterns
        
        // Check for news/social media domains (often daily habits)
        const habitDomains = [
            "news", "reddit", "twitter", "facebook", "linkedin",
            "youtube", "gmail", "outlook"
        ];
        
        const isHabitDomain = cluster.domains.some(domain => 
            habitDomains.some(hd => domain.includes(hd))
        );
        
        // Check if visits span multiple weeks with consistent activity
        const durationDays = this.calculateDurationDays(cluster.timeRange);
        const weeksSpanned = durationDays / 7;
        const visitsPerWeek = cluster.visitCount / Math.max(1, weeksSpanned);
        
        return isHabitDomain && weeksSpanned > 2 && visitsPerWeek > 3;
    }

    /**
     * Check for seasonal patterns
     */
    private hasSeasonalPattern(cluster: ActivityCluster): boolean {
        // Check for seasonal keywords
        const seasonalKeywords = [
            "holiday", "christmas", "thanksgiving", "black friday",
            "summer", "winter", "spring", "fall", "vacation",
            "tax", "graduation", "back to school"
        ];
        
        const hasSeasonalTopic = cluster.topics.some(topic => 
            seasonalKeywords.some(keyword => 
                topic.toLowerCase().includes(keyword)
            )
        );
        
        // Check for seasonal domains
        const seasonalDomains = ["booking", "expedia", "airbnb", "kayak"];
        const hasSeasonalDomain = cluster.domains.some(domain => 
            seasonalDomains.some(sd => domain.includes(sd))
        );
        
        return hasSeasonalTopic || hasSeasonalDomain;
    }

    /**
     * Calculate confidence score for trend classification
     */
    private calculateConfidence(cluster: ActivityCluster, type: TrendType): number {
        let confidence = 0.5; // Base confidence
        
        // Increase confidence based on cluster size
        if (cluster.websites.length > 10) {
            confidence += 0.2;
        } else if (cluster.websites.length > 5) {
            confidence += 0.1;
        }
        
        // Increase confidence based on topic/entity coherence
        const topicCoherence = Math.min(1, cluster.topics.length / 5);
        const entityCoherence = Math.min(1, cluster.entities.length / 3);
        confidence += (topicCoherence + entityCoherence) * 0.15;
        
        // Adjust based on trend type certainty
        switch (type) {
            case TrendType.RECURRING:
                // Recurring patterns are easier to identify with confidence
                confidence += 0.1;
                break;
            case TrendType.EPHEMERAL:
                // Short bursts might be random
                confidence -= 0.05;
                break;
            case TrendType.SEASONAL:
                // Seasonal patterns need more data
                confidence -= 0.1;
                break;
        }
        
        // Cap confidence at 0.95
        return Math.min(0.95, Math.max(0.1, confidence));
    }

    /**
     * Generate human-readable insights
     */
    private generateInsights(
        cluster: ActivityCluster,
        type: TrendType,
        durationDays: number,
        visitsPerDay: number
    ): string[] {
        const insights: string[] = [];
        
        // Duration insight
        if (durationDays < 3) {
            insights.push(`Intense ${Math.round(durationDays * 24)}-hour research burst`);
        } else {
            insights.push(`Active for ${Math.round(durationDays)} days`);
        }
        
        // Intensity insight
        if (visitsPerDay > 10) {
            insights.push("Very high activity level - strong interest");
        } else if (visitsPerDay > 5) {
            insights.push("High engagement with topic");
        } else if (visitsPerDay < 1) {
            insights.push("Casual browsing pattern");
        }
        
        // Domain diversity insight
        if (cluster.uniqueDomains > 10) {
            insights.push(`Researched across ${cluster.uniqueDomains} different websites`);
        } else if (cluster.uniqueDomains === 1) {
            insights.push(`Focused on ${cluster.domains[0]}`);
        }
        
        // Type-specific insights
        switch (type) {
            case TrendType.EPHEMERAL:
                insights.push("Short-term interest, possibly triggered by an event");
                break;
            case TrendType.RECURRING:
                insights.push("Part of regular browsing habits");
                break;
            case TrendType.PERSISTENT:
                insights.push("Long-term project or ongoing interest");
                break;
            case TrendType.SEASONAL:
                insights.push("Seasonal or time-sensitive activity");
                break;
        }
        
        // Topic-based insights
        if (cluster.topics.length > 0) {
            const topTopics = cluster.topics.slice(0, 3).join(", ");
            insights.push(`Main topics: ${topTopics}`);
        }
        
        return insights;
    }

    /**
     * Check if trend is still active
     */
    private isTrendActive(cluster: ActivityCluster): boolean {
        const daysSinceLastActivity = 
            (Date.now() - cluster.timeRange.end.getTime()) / (1000 * 60 * 60 * 24);
        
        // Different thresholds for different intensities
        if (cluster.intensity > 0.7) {
            return daysSinceLastActivity < 3; // High intensity: 3 days
        } else if (cluster.intensity > 0.3) {
            return daysSinceLastActivity < 7; // Medium intensity: 1 week
        } else {
            return daysSinceLastActivity < 14; // Low intensity: 2 weeks
        }
    }

    /**
     * Find related trends based on overlapping topics/entities
     */
    private findRelatedTrends(trends: UserTrend[]): void {
        for (let i = 0; i < trends.length; i++) {
            for (let j = i + 1; j < trends.length; j++) {
                const similarity = this.calculateTrendSimilarity(
                    trends[i].cluster, 
                    trends[j].cluster
                );
                
                if (similarity > 0.3) {
                    trends[i].relatedTrends.push(trends[j].id);
                    trends[j].relatedTrends.push(trends[i].id);
                }
            }
        }
    }

    /**
     * Calculate similarity between two clusters
     */
    private calculateTrendSimilarity(c1: ActivityCluster, c2: ActivityCluster): number {
        // Topic overlap
        const topicOverlap = this.calculateOverlap(c1.topics, c2.topics);
        
        // Entity overlap
        const entityOverlap = this.calculateOverlap(c1.entities, c2.entities);
        
        // Domain overlap
        const domainOverlap = this.calculateOverlap(c1.domains, c2.domains);
        
        // Time overlap
        const timeOverlap = this.calculateTimeOverlap(c1.timeRange, c2.timeRange);
        
        return (
            topicOverlap * 0.4 +
            entityOverlap * 0.3 +
            domainOverlap * 0.2 +
            timeOverlap * 0.1
        );
    }

    /**
     * Calculate overlap between two arrays
     */
    private calculateOverlap(arr1: string[], arr2: string[]): number {
        if (arr1.length === 0 || arr2.length === 0) return 0;
        
        const set1 = new Set(arr1.map(s => s.toLowerCase()));
        const set2 = new Set(arr2.map(s => s.toLowerCase()));
        
        const intersection = new Set([...set1].filter(x => set2.has(x)));
        
        return intersection.size / Math.min(set1.size, set2.size);
    }

    /**
     * Calculate time overlap between two time ranges
     */
    private calculateTimeOverlap(range1: any, range2: any): number {
        const start1 = range1.start.getTime();
        const end1 = range1.end.getTime();
        const start2 = range2.start.getTime();
        const end2 = range2.end.getTime();
        
        const overlapStart = Math.max(start1, start2);
        const overlapEnd = Math.min(end1, end2);
        
        if (overlapStart >= overlapEnd) return 0;
        
        const overlap = overlapEnd - overlapStart;
        const minDuration = Math.min(end1 - start1, end2 - start2);
        
        return overlap / minDuration;
    }

    /**
     * Helper to calculate duration in days
     */
    private calculateDurationDays(timeRange: any): number {
        return (timeRange.end.getTime() - timeRange.start.getTime()) / (1000 * 60 * 60 * 24);
    }

    /**
     * Generate unique trend ID
     */
    private generateTrendId(): string {
        return `trend_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}