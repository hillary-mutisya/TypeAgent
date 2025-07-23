// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Phase 3: Expansion Control System
 * 
 * Advanced controls for multi-hop exploration with:
 * - Depth controls and intelligent filtering
 * - Dynamic expansion strategies
 * - Real-time parameter adjustment
 * - Smart expansion recommendations
 */

import { ExpansionStrategy, EnhancedEntityExpansionData } from "./enhancedMultiHopExplorer.js";

export interface ExpansionControlConfig {
    maxDepth: number;
    expansionFactor: number;
    qualityThreshold: number;
    performanceMode: "fast" | "balanced" | "comprehensive";
    autoExpansion: boolean;
    smartFiltering: boolean;
}

export interface FilterCriteria {
    entityTypes: {
        include: string[];
        exclude: string[];
        priority: Record<string, number>;
    };
    relationships: {
        minStrength: number;
        minConfidence: number;
        preferredTypes: string[];
        maxAge: number; // in days
    };
    network: {
        maxNodes: number;
        maxEdgesPerNode: number;
        clusteringThreshold: number;
        centralityWeight: number;
    };
    temporal: {
        timeRange?: {
            start: string;
            end: string;
        };
        trendDirection?: "increasing" | "decreasing" | "stable";
        activityLevel?: "high" | "medium" | "low";
    };
}

export interface ExpansionRecommendation {
    entityName: string;
    reason: string;
    confidence: number;
    expectedBenefit: {
        newNodesEstimate: number;
        qualityScore: number;
        diversityBoost: number;
    };
    riskFactors: string[];
}

export interface ExpansionMetrics {
    efficiency: {
        nodesPerSecond: number;
        cacheHitRate: number;
        qualityPerNode: number;
    };
    coverage: {
        entityTypesDiversity: number;
        domainSpread: number;
        temporalSpread: number;
    };
    quality: {
        averageConfidence: number;
        relationshipStrength: number;
        dataFreshness: number;
    };
}

/**
 * Intelligent Expansion Control System
 */
export class ExpansionControlSystem {
    private config: ExpansionControlConfig;
    private activeFilters: FilterCriteria;
    private expansionMetrics: ExpansionMetrics;
    private availableStrategies: Map<string, ExpansionStrategy>;
    private recommendationEngine: ExpansionRecommendationEngine;
    private performanceMonitor: ExpansionPerformanceMonitor;

    constructor(initialConfig?: Partial<ExpansionControlConfig>) {
        this.config = {
            maxDepth: 3,
            expansionFactor: 8,
            qualityThreshold: 0.6,
            performanceMode: "balanced",
            autoExpansion: false,
            smartFiltering: true,
            ...initialConfig
        };

        this.activeFilters = this.getDefaultFilters();
        this.availableStrategies = this.initializeStrategies();
        this.recommendationEngine = new ExpansionRecommendationEngine();
        this.performanceMonitor = new ExpansionPerformanceMonitor();
        
        this.expansionMetrics = {
            efficiency: { nodesPerSecond: 0, cacheHitRate: 0, qualityPerNode: 0 },
            coverage: { entityTypesDiversity: 0, domainSpread: 0, temporalSpread: 0 },
            quality: { averageConfidence: 0, relationshipStrength: 0, dataFreshness: 0 }
        };
    }

    /**
     * Get optimized expansion strategy based on current context
     */
    getOptimalStrategy(
        currentGraph: EnhancedEntityExpansionData,
        targetEntityType?: string,
        userPreferences?: Partial<ExpansionControlConfig>
    ): ExpansionStrategy {
        const contextualConfig = { ...this.config, ...userPreferences };
        
        // Analyze current graph state
        const graphAnalysis = this.analyzeCurrentGraph(currentGraph);
        
        // Select base strategy
        let strategy: ExpansionStrategy;
        
        if (graphAnalysis.density > 0.7) {
            // High density - use focused exploration
            strategy = this.availableStrategies.get("focused")!;
        } else if (graphAnalysis.coverage < 0.3) {
            // Low coverage - use broad exploration
            strategy = this.availableStrategies.get("broad")!;
        } else if (contextualConfig.performanceMode === "fast") {
            // Performance priority - use efficient strategy
            strategy = this.availableStrategies.get("efficient")!;
        } else {
            // Default balanced strategy
            strategy = this.availableStrategies.get("balanced")!;
        }

        // Customize strategy based on context
        return this.customizeStrategy(strategy, graphAnalysis, contextualConfig, targetEntityType);
    }

    /**
     * Apply intelligent filtering to relationships
     */
    applyIntelligentFiltering(
        relationships: any[],
        sourceEntity: string,
        currentGraph: EnhancedEntityExpansionData
    ): any[] {
        if (!this.config.smartFiltering) {
            return this.applyBasicFiltering(relationships);
        }

        const filtered = relationships.filter(rel => {
            // Quality filters
            if (rel.strength < this.activeFilters.relationships.minStrength) return false;
            if (rel.confidence < this.activeFilters.relationships.minConfidence) return false;

            // Entity type filters
            if (this.activeFilters.entityTypes.exclude.includes(rel.entityType)) return false;
            if (this.activeFilters.entityTypes.include.length > 0 && 
                !this.activeFilters.entityTypes.include.includes(rel.entityType)) return false;

            // Age filter
            if (this.activeFilters.relationships.maxAge > 0) {
                const age = this.calculateRelationshipAge(rel);
                if (age > this.activeFilters.relationships.maxAge) return false;
            }

            // Network-based filters
            if (currentGraph.entities.length >= this.activeFilters.network.maxNodes) return false;

            // Temporal filters
            if (this.activeFilters.temporal.timeRange) {
                if (!this.isInTimeRange(rel, this.activeFilters.temporal.timeRange)) return false;
            }

            // Diversity filter - prefer entities that add diversity
            const diversityScore = this.calculateDiversityScore(rel, currentGraph);
            if (diversityScore < 0.3) return false;

            return true;
        });

        // Apply smart prioritization
        return this.prioritizeRelationships(filtered, sourceEntity, currentGraph);
    }

    /**
     * Generate expansion recommendations
     */
    async generateExpansionRecommendations(
        currentGraph: EnhancedEntityExpansionData,
        limit: number = 5
    ): Promise<ExpansionRecommendation[]> {
        const recommendations: ExpansionRecommendation[] = [];
        
        // Analyze current graph for expansion opportunities
        const analysis = this.analyzeCurrentGraph(currentGraph);
        
        // Get peripheral entities (good expansion candidates)
        const peripheralEntities = currentGraph.entities
            .filter(e => e.centrality.degree <= 2)
            .sort((a, b) => b.metadata.influenceScore - a.metadata.influenceScore);

        // Get bridge entities (important for network connectivity)
        const bridgeEntities = currentGraph.entities
            .filter(e => e.centrality.betweenness > 0.5)
            .sort((a, b) => b.centrality.betweenness - a.centrality.betweenness);
        
        // Generate recommendations based on different criteria
        
        // 1. Diversity recommendations
        if (analysis.entityTypesDiversity < 0.5) {
            const diversityRec = await this.recommendationEngine.generateDiversityRecommendations(
                currentGraph, 
                peripheralEntities
            );
            recommendations.push(...diversityRec);
        }

        // 2. Quality improvement recommendations
        if (analysis.averageQuality < this.config.qualityThreshold) {
            const qualityRec = await this.recommendationEngine.generateQualityRecommendations(
                currentGraph,
                bridgeEntities
            );
            recommendations.push(...qualityRec);
        }

        // 3. Coverage expansion recommendations
        if (analysis.coverage < 0.7) {
            const coverageRec = await this.recommendationEngine.generateCoverageRecommendations(
                currentGraph,
                peripheralEntities
            );
            recommendations.push(...coverageRec);
        }

        // 4. Trending entities recommendations
        const trendingRec = await this.recommendationEngine.generateTrendingRecommendations(
            currentGraph
        );
        recommendations.push(...trendingRec);

        // Sort by confidence and expected benefit
        return recommendations
            .sort((a, b) => {
                const scoreA = a.confidence * a.expectedBenefit.qualityScore;
                const scoreB = b.confidence * b.expectedBenefit.qualityScore;
                return scoreB - scoreA;
            })
            .slice(0, limit);
    }

    /**
     * Update expansion metrics based on recent expansion
     */
    updateMetrics(
        expansionResults: EnhancedEntityExpansionData,
        expansionTime: number,
        cacheHitRate: number
    ): void {
        const totalNodes = expansionResults.entities.length;
        const totalEdges = expansionResults.relationships.length;

        // Update efficiency metrics
        this.expansionMetrics.efficiency = {
            nodesPerSecond: totalNodes / (expansionTime / 1000),
            cacheHitRate,
            qualityPerNode: expansionResults.metadata.qualityScore / Math.max(totalNodes, 1)
        };

        // Update coverage metrics
        const entityTypes = new Set(expansionResults.entities.map(e => e.type));
        const domains = new Set(
            expansionResults.relationships.flatMap(r => r.evidence.domains)
        );
        
        this.expansionMetrics.coverage = {
            entityTypesDiversity: entityTypes.size / Math.max(totalNodes, 1),
            domainSpread: domains.size,
            temporalSpread: this.calculateTemporalSpread(expansionResults)
        };

        // Update quality metrics
        const avgConfidence = expansionResults.entities
            .reduce((sum, e) => sum + e.confidence, 0) / Math.max(totalNodes, 1);
        const avgStrength = expansionResults.relationships
            .reduce((sum, r) => sum + r.strength, 0) / Math.max(totalEdges, 1);
        
        this.expansionMetrics.quality = {
            averageConfidence: avgConfidence,
            relationshipStrength: avgStrength,
            dataFreshness: this.calculateDataFreshness(expansionResults)
        };

        // Update performance monitor
        this.performanceMonitor.recordExpansion(expansionResults, expansionTime);
    }

    /**
     * Get current expansion metrics
     */
    getMetrics(): ExpansionMetrics {
        return { ...this.expansionMetrics };
    }

    /**
     * Update filter criteria
     */
    updateFilters(newFilters: Partial<FilterCriteria>): void {
        this.activeFilters = { ...this.activeFilters, ...newFilters };
    }

    /**
     * Get performance recommendations
     */
    getPerformanceRecommendations(): string[] {
        return this.performanceMonitor.getRecommendations(this.expansionMetrics);
    }

    // Private helper methods

    private initializeStrategies(): Map<string, ExpansionStrategy> {
        const strategies = new Map<string, ExpansionStrategy>();

        strategies.set("focused", {
            name: "focused",
            description: "Focused exploration with high-quality filters",
            maxDepth: 2,
            expansionFactor: 5,
            filterCriteria: {
                minStrength: 0.7,
                minConfidence: 0.8,
                includeTypes: [],
                excludeTypes: []
            },
            prioritization: "confidence"
        });

        strategies.set("broad", {
            name: "broad",
            description: "Broad exploration for maximum coverage",
            maxDepth: 4,
            expansionFactor: 12,
            filterCriteria: {
                minStrength: 0.3,
                minConfidence: 0.4,
                includeTypes: [],
                excludeTypes: []
            },
            prioritization: "novelty"
        });

        strategies.set("efficient", {
            name: "efficient",
            description: "Fast exploration with performance optimization",
            maxDepth: 2,
            expansionFactor: 6,
            filterCriteria: {
                minStrength: 0.5,
                minConfidence: 0.6,
                includeTypes: [],
                excludeTypes: []
            },
            prioritization: "strength"
        });

        strategies.set("balanced", {
            name: "balanced",
            description: "Balanced exploration with good quality and coverage",
            maxDepth: 3,
            expansionFactor: 8,
            filterCriteria: {
                minStrength: 0.4,
                minConfidence: 0.5,
                includeTypes: [],
                excludeTypes: []
            },
            prioritization: "strength"
        });

        return strategies;
    }

    private getDefaultFilters(): FilterCriteria {
        return {
            entityTypes: {
                include: [],
                exclude: ["noise", "irrelevant"],
                priority: {
                    "person": 1.2,
                    "organization": 1.1,
                    "technology": 1.3,
                    "concept": 1.0
                }
            },
            relationships: {
                minStrength: 0.3,
                minConfidence: 0.5,
                preferredTypes: ["co_occurs_with", "same_domain"],
                maxAge: 365 // 1 year
            },
            network: {
                maxNodes: 100,
                maxEdgesPerNode: 10,
                clusteringThreshold: 0.3,
                centralityWeight: 0.7
            },
            temporal: {}
        };
    }

    private analyzeCurrentGraph(graph: EnhancedEntityExpansionData): {
        density: number;
        coverage: number;
        entityTypesDiversity: number;
        averageQuality: number;
        clusteringCoefficient: number;
    } {
        const totalNodes = graph.entities.length;
        const totalEdges = graph.relationships.length;
        const maxPossibleEdges = totalNodes * (totalNodes - 1) / 2;
        
        const density = maxPossibleEdges > 0 ? totalEdges / maxPossibleEdges : 0;
        const entityTypes = new Set(graph.entities.map(e => e.type));
        const entityTypesDiversity = entityTypes.size / Math.max(totalNodes, 1);
        
        const averageQuality = graph.entities
            .reduce((sum, e) => sum + e.confidence, 0) / Math.max(totalNodes, 1);
        
        const coverage = this.calculateGraphCoverage(graph);
        const clusteringCoefficient = this.calculateClusteringCoefficient(graph);

        return {
            density,
            coverage,
            entityTypesDiversity,
            averageQuality,
            clusteringCoefficient
        };
    }

    private customizeStrategy(
        baseStrategy: ExpansionStrategy,
        analysis: any,
        config: ExpansionControlConfig,
        targetEntityType?: string
    ): ExpansionStrategy {
        const customStrategy = { ...baseStrategy };

        // Adjust expansion factor based on performance mode
        switch (config.performanceMode) {
            case "fast":
                customStrategy.expansionFactor = Math.min(customStrategy.expansionFactor, 5);
                break;
            case "comprehensive":
                customStrategy.expansionFactor = Math.max(customStrategy.expansionFactor, 10);
                break;
        }

        // Adjust depth based on current graph density
        if (analysis.density > 0.8) {
            customStrategy.maxDepth = Math.min(customStrategy.maxDepth, 2);
        } else if (analysis.density < 0.2) {
            customStrategy.maxDepth = Math.max(customStrategy.maxDepth, 3);
        }

        // Focus on specific entity type if specified
        if (targetEntityType) {
            customStrategy.filterCriteria.includeTypes = [targetEntityType];
        }

        return customStrategy;
    }

    private applyBasicFiltering(relationships: any[]): any[] {
        return relationships.filter(rel => 
            rel.strength >= this.activeFilters.relationships.minStrength &&
            rel.confidence >= this.activeFilters.relationships.minConfidence
        );
    }

    private prioritizeRelationships(
        relationships: any[],
        sourceEntity: string,
        currentGraph: EnhancedEntityExpansionData
    ): any[] {
        return relationships
            .map(rel => ({
                ...rel,
                priorityScore: this.calculatePriorityScore(rel, sourceEntity, currentGraph)
            }))
            .sort((a, b) => b.priorityScore - a.priorityScore);
    }

    private calculatePriorityScore(
        relationship: any,
        sourceEntity: string,
        currentGraph: EnhancedEntityExpansionData
    ): number {
        let score = relationship.strength * 0.4 + relationship.confidence * 0.3;
        
        // Entity type priority
        const typePriority = this.activeFilters.entityTypes.priority[relationship.entityType] || 1.0;
        score *= typePriority;
        
        // Diversity bonus
        const diversityScore = this.calculateDiversityScore(relationship, currentGraph);
        score += diversityScore * 0.2;
        
        // Recency bonus
        const recencyScore = this.calculateRecencyScore(relationship);
        score += recencyScore * 0.1;
        
        return score;
    }

    private calculateDiversityScore(
        relationship: any,
        currentGraph: EnhancedEntityExpansionData
    ): number {
        // Calculate how much this relationship adds to graph diversity
        const existingTypes = new Set(currentGraph.entities.map(e => e.type));
        const existingDomains = new Set(
            currentGraph.relationships.flatMap(r => r.evidence.domains)
        );
        
        let diversityScore = 0;
        
        // Type diversity
        if (!existingTypes.has(relationship.entityType)) {
            diversityScore += 0.5;
        }
        
        // Domain diversity
        const newDomains = relationship.metadata?.domains || [];
        const uniqueNewDomains = newDomains.filter((d: any) => !existingDomains.has(d));
        diversityScore += Math.min(0.5, uniqueNewDomains.length * 0.1);
        
        return Math.min(1.0, diversityScore);
    }

    private calculateRelationshipAge(relationship: any): number {
        const lastSeen = relationship.metadata?.lastSeen;
        if (!lastSeen) return 0;
        
        const now = new Date();
        const lastSeenDate = new Date(lastSeen);
        return (now.getTime() - lastSeenDate.getTime()) / (1000 * 60 * 60 * 24); // days
    }

    private calculateRecencyScore(relationship: any): number {
        const age = this.calculateRelationshipAge(relationship);
        if (age === 0) return 0.5; // Unknown age gets neutral score
        
        // Exponential decay: newer is better
        return Math.exp(-age / 30); // 30-day half-life
    }

    private isInTimeRange(relationship: any, timeRange: { start: string; end: string }): boolean {
        const lastSeen = relationship.metadata?.lastSeen;
        if (!lastSeen) return true; // Include if no timestamp
        
        const date = new Date(lastSeen);
        const start = new Date(timeRange.start);
        const end = new Date(timeRange.end);
        
        return date >= start && date <= end;
    }

    private calculateTemporalSpread(expansionData: EnhancedEntityExpansionData): number {
        const dates = expansionData.entities
            .map(e => new Date(e.metadata.lastSeen))
            .filter(d => !isNaN(d.getTime()));
        
        if (dates.length < 2) return 0;
        
        const minDate = Math.min(...dates.map(d => d.getTime()));
        const maxDate = Math.max(...dates.map(d => d.getTime()));
        
        const spreadDays = (maxDate - minDate) / (1000 * 60 * 60 * 24);
        return Math.min(1.0, spreadDays / 365); // Normalize to 1 year
    }

    private calculateDataFreshness(expansionData: EnhancedEntityExpansionData): number {
        const now = Date.now();
        const freshnessScores = expansionData.entities.map(e => {
            const lastSeen = new Date(e.metadata.lastSeen).getTime();
            const ageDays = (now - lastSeen) / (1000 * 60 * 60 * 24);
            return Math.exp(-ageDays / 30); // 30-day half-life
        });
        
        return freshnessScores.reduce((sum, score) => sum + score, 0) / Math.max(freshnessScores.length, 1);
    }

    private calculateGraphCoverage(graph: EnhancedEntityExpansionData): number {
        // Simplified coverage metric based on entity distribution
        const entityTypes = new Set(graph.entities.map(e => e.type));
        const domains = new Set(graph.relationships.flatMap(r => r.evidence.domains));
        
        // Normalize based on expected diversity
        const typeCoverage = Math.min(1.0, entityTypes.size / 8); // Expect up to 8 different types
        const domainCoverage = Math.min(1.0, domains.size / 20); // Expect up to 20 different domains
        
        return (typeCoverage + domainCoverage) / 2;
    }

    private calculateClusteringCoefficient(graph: EnhancedEntityExpansionData): number {
        // Simplified clustering coefficient calculation
        const adjacencyMap = new Map<string, Set<string>>();
        
        // Build adjacency map
        for (const edge of graph.relationships) {
            if (!adjacencyMap.has(edge.from)) {
                adjacencyMap.set(edge.from, new Set());
            }
            if (!adjacencyMap.has(edge.to)) {
                adjacencyMap.set(edge.to, new Set());
            }
            adjacencyMap.get(edge.from)!.add(edge.to);
            adjacencyMap.get(edge.to)!.add(edge.from);
        }
        
        let totalClustering = 0;
        let nodeCount = 0;
        
        for (const [node, neighbors] of adjacencyMap) {
            if (neighbors.size < 2) continue; // Need at least 2 neighbors
            
            let triangles = 0;
            const neighborArray = Array.from(neighbors);
            
            for (let i = 0; i < neighborArray.length; i++) {
                for (let j = i + 1; j < neighborArray.length; j++) {
                    const neighbor1 = neighborArray[i];
                    const neighbor2 = neighborArray[j];
                    
                    if (adjacencyMap.get(neighbor1)?.has(neighbor2)) {
                        triangles++;
                    }
                }
            }
            
            const maxPossibleTriangles = neighbors.size * (neighbors.size - 1) / 2;
            const clusteringCoeff = maxPossibleTriangles > 0 ? triangles / maxPossibleTriangles : 0;
            
            totalClustering += clusteringCoeff;
            nodeCount++;
        }
        
        return nodeCount > 0 ? totalClustering / nodeCount : 0;
    }
}

/**
 * Expansion Recommendation Engine
 */
export class ExpansionRecommendationEngine {
    async generateDiversityRecommendations(
        currentGraph: EnhancedEntityExpansionData,
        candidates: any[]
    ): Promise<ExpansionRecommendation[]> {
        const existingTypes = new Set(currentGraph.entities.map(e => e.type));
        const recommendations: ExpansionRecommendation[] = [];
        
        for (const entity of candidates.slice(0, 3)) {
            if (!existingTypes.has(entity.type)) {
                recommendations.push({
                    entityName: entity.name,
                    reason: `Adds new entity type: ${entity.type}`,
                    confidence: 0.8,
                    expectedBenefit: {
                        newNodesEstimate: 5,
                        qualityScore: 0.7,
                        diversityBoost: 0.9
                    },
                    riskFactors: ["May introduce noise", "Unknown quality"]
                });
            }
        }
        
        return recommendations;
    }

    async generateQualityRecommendations(
        currentGraph: EnhancedEntityExpansionData,
        candidates: any[]
    ): Promise<ExpansionRecommendation[]> {
        return candidates.slice(0, 2).map(entity => ({
            entityName: entity.name,
            reason: `High influence score: ${entity.metadata.influenceScore.toFixed(2)}`,
            confidence: 0.85,
            expectedBenefit: {
                newNodesEstimate: 8,
                qualityScore: 0.9,
                diversityBoost: 0.5
            },
            riskFactors: ["May create dense clusters"]
        }));
    }

    async generateCoverageRecommendations(
        currentGraph: EnhancedEntityExpansionData,
        candidates: any[]
    ): Promise<ExpansionRecommendation[]> {
        const peripheralCandidates = candidates.filter(e => e.centrality.degree <= 2);
        
        return peripheralCandidates.slice(0, 2).map(entity => ({
            entityName: entity.name,
            reason: "Expands network coverage to new areas",
            confidence: 0.7,
            expectedBenefit: {
                newNodesEstimate: 6,
                qualityScore: 0.6,
                diversityBoost: 0.8
            },
            riskFactors: ["May be disconnected", "Lower confidence"]
        }));
    }

    async generateTrendingRecommendations(
        currentGraph: EnhancedEntityExpansionData
    ): Promise<ExpansionRecommendation[]> {
        // This would integrate with trending analysis
        // For now, return placeholder recommendations
        return [{
            entityName: "Trending Topic",
            reason: "Currently trending in knowledge base",
            confidence: 0.75,
            expectedBenefit: {
                newNodesEstimate: 10,
                qualityScore: 0.8,
                diversityBoost: 0.7
            },
            riskFactors: ["Trend may be temporary"]
        }];
    }
}

/**
 * Performance Monitoring System
 */
export class ExpansionPerformanceMonitor {
    private expansionHistory: Array<{
        timestamp: number;
        nodeCount: number;
        edgeCount: number;
        expansionTime: number;
        qualityScore: number;
    }> = [];

    recordExpansion(
        expansionData: EnhancedEntityExpansionData,
        expansionTime: number
    ): void {
        this.expansionHistory.push({
            timestamp: Date.now(),
            nodeCount: expansionData.entities.length,
            edgeCount: expansionData.relationships.length,
            expansionTime,
            qualityScore: expansionData.metadata.qualityScore
        });

        // Keep only last 100 expansions
        if (this.expansionHistory.length > 100) {
            this.expansionHistory.shift();
        }
    }

    getRecommendations(metrics: ExpansionMetrics): string[] {
        const recommendations: string[] = [];

        if (metrics.efficiency.nodesPerSecond < 5) {
            recommendations.push("Consider reducing expansion factor for better performance");
        }

        if (metrics.efficiency.cacheHitRate < 0.3) {
            recommendations.push("Enable caching or increase cache size");
        }

        if (metrics.quality.averageConfidence < 0.5) {
            recommendations.push("Increase minimum confidence threshold");
        }

        if (metrics.coverage.entityTypesDiversity < 0.3) {
            recommendations.push("Enable diversity-focused expansion");
        }

        return recommendations;
    }
}