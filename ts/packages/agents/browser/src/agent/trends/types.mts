// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

export interface TimeRange {
    start: Date;
    end: Date;
}

export interface TopicVector {
    topics: string[];           // Extracted topics from knowledge
    entities: string[];         // Key entities mentioned
    domains: string[];          // Domains visited
    urls: string[];            // Website URLs
    weight: number;            // Importance score (based on visit count, recency)
    timestamp: Date;           // Visit time
    pageTypes: string[];       // Page type classifications
}

export interface ActivityCluster {
    id: string;
    name: string;              // e.g., "Car Purchase Research"
    topics: string[];          // Common topics across cluster
    entities: string[];        // Common entities
    domains: string[];         // Frequently visited domains
    timeRange: TimeRange;      // Active period
    intensity: number;         // Activity intensity score (0-1)
    websites: string[];        // Website URLs in cluster
    visitCount: number;        // Total visits in cluster
    uniqueDomains: number;     // Number of unique domains
}

export enum TrendType {
    EPHEMERAL = "ephemeral",        // Short burst of activity (< 7 days)
    RECURRING = "recurring",        // Regular pattern (daily/weekly)
    PERSISTENT = "persistent",      // Long-term interest (> 30 days)
    SEASONAL = "seasonal"           // Time-based pattern
}

export interface UserTrend {
    id: string;
    cluster: ActivityCluster;
    type: TrendType;
    confidence: number;        // 0-1 confidence score
    insights: string[];        // Human-readable insights
    relatedTrends: string[];   // IDs of related trends
    startDate: Date;
    endDate?: Date;           // undefined if still active
    isActive: boolean;
}

export interface UserIntent {
    intent: string;                 // e.g., "Researching car purchase"
    confidence: number;             // 0-1 confidence score
    supportingEvidence: {
        topics: string[];
        entities: string[];
        domains: string[];
        timespan: number;          // Days active
        visitCount: number;
    };
    stage?: IntentStage;           // Current stage in multi-step process
    suggestedActions?: string[];   // Suggested next steps
}

export enum IntentStage {
    DISCOVERY = "discovery",        // Initial exploration
    RESEARCH = "research",          // Deep research phase
    COMPARISON = "comparison",      // Comparing options
    DECISION = "decision",          // Making final decision
    POST_DECISION = "post_decision" // After decision (support, learning)
}

export interface TrendInsight {
    trendId: string;
    type: "pattern" | "anomaly" | "suggestion" | "milestone";
    message: string;
    confidence: number;
    timestamp: Date;
}

export interface TrendVisualizationData {
    type: VisualizationType;
    data: any;                     // Type-specific data
    metadata: {
        timeRange: TimeRange;
        trendCount: number;
        lastUpdated: Date;
    };
}

export enum VisualizationType {
    TIMELINE = "timeline",
    HEATMAP = "heatmap",
    TOPIC_CLOUD = "topic_cloud",
    TREND_DASHBOARD = "trend_dashboard",
    INTENT_JOURNEY = "intent_journey"
}

export interface TrendAnalyticsData {
    totalTrends: number;
    activeTrends: number;
    trendsByType: Record<TrendType, number>;
    averageTrendDuration: number;
    topIntents: UserIntent[];
    trendHistory: {
        date: string;
        trendCount: number;
        newTrends: number;
    }[];
}

// Integration with existing types
export interface TrendAwareWebsite {
    url: string;
    trendIds: string[];           // Associated trend IDs
    clusterIds: string[];         // Associated cluster IDs
    intentScores: Record<string, number>; // Intent -> confidence mapping
}

export interface ClusteringOptions {
    minClusterSize: number;       // Minimum websites in a cluster
    maxClusterAge: number;        // Maximum days to look back
    similarityThreshold: number;  // 0-1 threshold for grouping
    timeWindowHours: number;      // Time window for temporal grouping
}

export interface TrendDetectionOptions {
    enableIntentDetection: boolean;
    enableHabitDetection: boolean;
    minConfidence: number;
    maxTrendsToTrack: number;
    excludeDomains?: string[];    // Domains to exclude from analysis
}