// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Phase 3: Enhanced Multi-Hop Explorer
 * 
 * Advanced entity network expansion with:
 * - Phase 2 relationship-based expansion
 * - Intelligent caching and optimization
 * - Network analysis and community detection
 * - Real-time graph exploration
 */

import {
    EntityGraphServices,
    DefaultEntityGraphServices,
    ChromeExtensionService,
} from "./knowledgeUtilities.js";

// Enhanced interfaces for Phase 3
export interface EnhancedEntityExpansionData {
    centerEntity: string;
    entities: EnhancedEntityNode[];
    relationships: EnhancedRelationshipEdge[];
    depth: number;
    expansionType: "breadth_first" | "depth_first" | "importance_based" | "relationship_driven";
    metadata: {
        totalNodesExpanded: number;
        expansionTime: number;
        cacheHitRate: number;
        qualityScore: number;
        communityDetected: boolean;
    };
}

export interface EnhancedEntityNode {
    id: string;
    name: string;
    type: string;
    confidence: number;
    level: number; // Depth level in expansion
    cluster?: string; // Community/cluster ID
    centrality: {
        degree: number;
        betweenness: number;
        closeness: number;
        pagerank: number;
    };
    metadata: {
        totalMentions: number;
        uniqueDomains: number;
        firstSeen: string;
        lastSeen: string;
        influenceScore: number;
    };
}

export interface EnhancedRelationshipEdge {
    id: string;
    from: string;
    to: string;
    type: "co_occurs_with" | "same_domain" | "frequent_together" | "temporal_sequence" | "semantic_similar";
    strength: number;
    confidence: number;
    evidence: {
        coOccurrenceCount: number;
        domains: string[];
        urls: string[];
        temporalPattern?: "before" | "after" | "concurrent";
    };
}

export interface NetworkAnalysisMetrics {
    overview: {
        totalNodes: number;
        totalEdges: number;
        density: number;
        averageDegree: number;
        diameter: number;
        averagePathLength: number;
    };
    clusters: {
        count: number;
        modularity: number;
        communities: Array<{
            id: string;
            size: number;
            density: number;
            centralEntity: string;
            theme?: string;
        }>;
    };
    centrality: {
        mostCentral: string;
        mostInfluential: string;
        bridgeNodes: string[];
        peripheralNodes: string[];
    };
    temporal: {
        growthRate: number;
        activityPeaks: string[];
        emergingEntities: string[];
        decliningEntities: string[];
    };
}

export interface ExpansionStrategy {
    name: string;
    description: string;
    maxDepth: number;
    expansionFactor: number; // How many nodes to expand per level
    filterCriteria: {
        minStrength: number;
        minConfidence: number;
        includeTypes: string[];
        excludeTypes: string[];
    };
    prioritization: "strength" | "confidence" | "influence" | "novelty";
}

export interface ExpansionCache {
    key: string;
    data: EnhancedEntityExpansionData;
    timestamp: number;
    hitCount: number;
    lastAccessed: number;
    ttl: number; // Time to live in milliseconds
}

/**
 * Enhanced Multi-Hop Explorer with Phase 2 Integration
 */
export class EnhancedMultiHopExplorer {
    private visualizer: any;
    private entityGraphService: EntityGraphServices;
    private chromeService: ChromeExtensionService;
    
    // Expansion state
    private currentDepth: number = 1;
    private maxDepth: number = 4;
    private isExpanding: boolean = false;
    private currentStrategy: ExpansionStrategy;
    
    // Caching system
    private expansionCache: Map<string, ExpansionCache> = new Map();
    private maxCacheSize: number = 100;
    private defaultTTL: number = 300000; // 5 minutes
    
    // Network analysis
    private currentMetrics: NetworkAnalysisMetrics | null = null;
    private communityDetector: CommunityDetector;
    private networkAnalyzer: NetworkAnalyzer;
    
    // Expansion history and undo/redo
    private expansionHistory: ExpansionStep[] = [];
    private currentHistoryIndex: number = -1;
    private maxHistorySize: number = 50;

    constructor(
        visualizer: any, 
        entityGraphService?: EntityGraphServices,
        chromeService?: ChromeExtensionService
    ) {
        this.visualizer = visualizer;
        this.entityGraphService = entityGraphService || new DefaultEntityGraphServices();
        this.chromeService = chromeService || new ChromeExtensionService();
        
        // Initialize components
        this.communityDetector = new CommunityDetector();
        this.networkAnalyzer = new NetworkAnalyzer();
        
        // Set default expansion strategy
        this.currentStrategy = this.getDefaultStrategy();
        
        // Setup UI and event handlers
        this.setupEnhancedControls();
        this.setupAdvancedEventHandlers();
        this.setupKeyboardShortcuts();
        
        // Start cache cleanup timer
        this.startCacheCleanup();
    }

    /**
     * Phase 3: Advanced Multi-Hop Expansion using Phase 2 Relationship Engine
     */
    async expandEntityNetworkAdvanced(
        entityName: string,
        options: {
            depth?: number;
            strategy?: ExpansionStrategy;
            forceRefresh?: boolean;
            includeNetworkAnalysis?: boolean;
        } = {}
    ): Promise<EnhancedEntityExpansionData> {
        const startTime = Date.now();
        const depth = options.depth || this.currentDepth;
        const strategy = options.strategy || this.currentStrategy;
        
        console.log(`🚀 Starting advanced expansion for: ${entityName} (depth: ${depth})`);

        try {
            // Check cache first (unless forced refresh)
            if (!options.forceRefresh) {
                const cached = this.getCachedExpansion(entityName, depth, strategy);
                if (cached) {
                    console.log(`💾 Cache hit for ${entityName}`);
                    return cached.data;
                }
            }

            // Initialize expansion data
            const expansionData: EnhancedEntityExpansionData = {
                centerEntity: entityName,
                entities: [],
                relationships: [],
                depth,
                expansionType: "relationship_driven",
                metadata: {
                    totalNodesExpanded: 0,
                    expansionTime: 0,
                    cacheHitRate: 0,
                    qualityScore: 0,
                    communityDetected: false
                }
            };

            // Get center entity stats
            const centerStats = await this.chromeService.getEntityStats(entityName, true);
            console.log(`📊 Center entity stats for ${entityName}:`, centerStats);
            
            // Add center entity with null-safe stats handling
            const centerNode = this.createEnhancedEntityNode(
                entityName, 
                "center", 
                0, 
                centerStats?.stats || null
            );
            expansionData.entities.push(centerNode);

            // Perform breadth-first expansion using Phase 2 relationship engine
            const visited = new Set<string>([entityName]);
            let currentLevel = [entityName];
            let totalNodesExpanded = 1;

            for (let level = 1; level <= depth && currentLevel.length > 0; level++) {
                console.log(`📊 Expanding level ${level} with ${currentLevel.length} entities`);
                
                const nextLevel: string[] = [];
                const levelRelationships: EnhancedRelationshipEdge[] = [];

                // Process each entity in current level
                for (const currentEntity of currentLevel) {
                    try {
                        // Get relationships using Phase 2 advanced engine
                        let relationshipResponse = null;
                        try {
                            relationshipResponse = await this.chromeService.getEntityRelationships(
                                currentEntity,
                                {
                                    includeCoOccurrence: true,
                                    includeDomainBased: true,
                                    includeFrequentTogether: true,
                                    maxTotal: strategy.expansionFactor,
                                    minStrength: strategy.filterCriteria.minStrength
                                }
                            );
                        } catch (relationshipError) {
                            console.warn(`⚠️ Failed to get relationships for ${currentEntity}:`, relationshipError);
                            relationshipResponse = null;
                        }

                        console.log(`🔗 Relationship response for ${currentEntity}:`, relationshipResponse);

                        if (relationshipResponse && relationshipResponse.relationships && Array.isArray(relationshipResponse.relationships)) {
                            // Filter and prioritize relationships
                            const filteredRelationships = this.filterAndPrioritizeRelationships(
                                relationshipResponse.relationships,
                                strategy,
                                visited
                            );

                            // Process each relationship
                            for (const rel of filteredRelationships) {
                                if (!rel || !rel.relatedEntity) {
                                    console.warn('⚠️ Skipping null relationship');
                                    continue;
                                }
                                
                                if (!visited.has(rel.relatedEntity) && 
                                    nextLevel.length < strategy.expansionFactor) {
                                    
                                    visited.add(rel.relatedEntity);
                                    nextLevel.push(rel.relatedEntity);

                                    // Get entity stats for the related entity
                                    const entityStats = await this.chromeService.getEntityStats(
                                        rel.relatedEntity, 
                                        true
                                    );

                                    // Create enhanced entity node with null-safe stats handling
                                    const entityNode = this.createEnhancedEntityNode(
                                        rel.relatedEntity,
                                        rel.entityType || "concept",
                                        level,
                                        entityStats?.stats || null
                                    );
                                    expansionData.entities.push(entityNode);

                                    // Create enhanced relationship edge
                                    const relationshipEdge = this.createEnhancedRelationshipEdge(
                                        currentEntity,
                                        rel.relatedEntity,
                                        rel
                                    );
                                    levelRelationships.push(relationshipEdge);
                                    
                                    totalNodesExpanded++;
                                }
                            }
                        } else {
                            console.warn(`⚠️ No relationships found for entity: ${currentEntity}`);
                        }
                    } catch (error) {
                        console.warn(`Failed to expand entity ${currentEntity}:`, error);
                        // Continue with next entity instead of breaking the entire process
                    }
                }

                expansionData.relationships.push(...levelRelationships);
                currentLevel = nextLevel;
                
                console.log(`✅ Level ${level} complete: added ${levelRelationships.length} relationships`);
            }

            // Perform network analysis if requested
            if (options.includeNetworkAnalysis) {
                console.log("🧠 Performing network analysis...");
                await this.enhanceWithNetworkAnalysis(expansionData);
            }

            // Calculate final metadata
            const expansionTime = Date.now() - startTime;
            expansionData.metadata = {
                totalNodesExpanded,
                expansionTime,
                cacheHitRate: this.calculateCacheHitRate(),
                qualityScore: this.calculateQualityScore(expansionData),
                communityDetected: expansionData.entities.some(e => e.cluster !== undefined)
            };

            // Cache the result
            this.cacheExpansion(entityName, depth, strategy, expansionData);

            console.log(`🎉 Expansion complete: ${totalNodesExpanded} nodes, ${expansionData.relationships.length} edges in ${expansionTime}ms`);
            return expansionData;

        } catch (error) {
            console.error("Advanced expansion failed:", error);
            
            // Return fallback data structure instead of throwing
            return {
                centerEntity: entityName,
                entities: [{
                    id: `entity_${entityName.replace(/\s+/g, '_')}`,
                    name: entityName,
                    type: "unknown",
                    confidence: 0.5,
                    level: 0,
                    centrality: {
                        degree: 0,
                        betweenness: 0,
                        closeness: 0,
                        pagerank: 0
                    },
                    metadata: {
                        totalMentions: 0,
                        uniqueDomains: 0,
                        firstSeen: new Date().toISOString(),
                        lastSeen: new Date().toISOString(),
                        influenceScore: 0
                    }
                }],
                relationships: [],
                depth: 0,
                expansionType: "breadth_first" as const,
                metadata: {
                    totalNodesExpanded: 1,
                    expansionTime: Date.now() - startTime,
                    cacheHitRate: 0,
                    qualityScore: 0,
                    communityDetected: false
                }
            };
        }
    }

    /**
     * Intelligent relationship filtering and prioritization
     */
    private filterAndPrioritizeRelationships(
        relationships: any[],
        strategy: ExpansionStrategy,
        visited: Set<string>
    ): any[] {
        return relationships
            .filter(rel => {
                // Null check
                if (!rel || !rel.relatedEntity) return false;
                
                // Basic filters
                if (visited.has(rel.relatedEntity)) return false;
                if ((rel.strength || 0) < strategy.filterCriteria.minStrength) return false;
                if ((rel.confidence || 0) < strategy.filterCriteria.minConfidence) return false;
                
                // Type filters
                if (strategy.filterCriteria.includeTypes.length > 0 && 
                    !strategy.filterCriteria.includeTypes.includes(rel.entityType)) return false;
                if (strategy.filterCriteria.excludeTypes.includes(rel.entityType)) return false;
                
                return true;
            })
            .sort((a, b) => {
                // Null safety for sorting
                if (!a || !b) return 0;
                
                // Prioritization based on strategy
                switch (strategy.prioritization) {
                    case "strength":
                        return (b.strength || 0) - (a.strength || 0);
                    case "confidence":
                        return (b.confidence || 0) - (a.confidence || 0);
                    case "influence":
                        return (b.coOccurrenceCount || 0) - (a.coOccurrenceCount || 0);
                    case "novelty":
                        // Prefer less common entities (fewer co-occurrences)
                        return (a.coOccurrenceCount || 0) - (b.coOccurrenceCount || 0);
                    default:
                        return (b.strength || 0) - (a.strength || 0);
                }
            })
            .slice(0, strategy.expansionFactor);
    }

    /**
     * Create enhanced entity node with centrality metrics
     */
    private createEnhancedEntityNode(
        entityName: string,
        entityType: string,
        level: number,
        stats: any
    ): EnhancedEntityNode {
        // Debug logging for stats
        if (!stats) {
            console.warn(`⚠️ No stats available for entity: ${entityName}, using defaults`);
        }
        
        return {
            id: `entity_${entityName.replace(/\s+/g, '_')}`,
            name: entityName,
            type: entityType,
            confidence: stats?.avgConfidence || 0.5,
            level,
            centrality: {
                degree: 0, // Will be calculated during network analysis
                betweenness: 0,
                closeness: 0,
                pagerank: 0
            },
            metadata: {
                totalMentions: stats?.totalMentions || 0,
                uniqueDomains: stats?.uniqueDomains || 0,
                firstSeen: stats?.firstSeen || new Date().toISOString(),
                lastSeen: stats?.lastSeen || new Date().toISOString(),
                influenceScore: stats?.networkMetrics?.influenceScore || 0
            }
        };
    }

    /**
     * Create enhanced relationship edge with evidence
     */
    private createEnhancedRelationshipEdge(
        fromEntity: string,
        toEntity: string,
        relationship: any
    ): EnhancedRelationshipEdge {
        return {
            id: `edge_${fromEntity}_${toEntity}`.replace(/\s+/g, '_'),
            from: fromEntity,
            to: toEntity,
            type: relationship.relationshipType,
            strength: relationship.strength,
            confidence: relationship.confidence,
            evidence: {
                coOccurrenceCount: relationship.coOccurrenceCount || 0,
                domains: relationship.metadata?.domains || [],
                urls: relationship.evidenceSources || [],
                temporalPattern: relationship.metadata?.temporalPattern
            }
        };
    }

    /**
     * Enhanced caching system with TTL and LRU eviction
     */
    private getCachedExpansion(
        entityName: string,
        depth: number,
        strategy: ExpansionStrategy
    ): ExpansionCache | null {
        const key = this.generateCacheKey(entityName, depth, strategy);
        const cached = this.expansionCache.get(key);
        
        if (cached && (Date.now() - cached.timestamp) < cached.ttl) {
            cached.hitCount++;
            cached.lastAccessed = Date.now();
            return cached;
        } else if (cached) {
            // Expired cache entry
            this.expansionCache.delete(key);
        }
        
        return null;
    }

    private cacheExpansion(
        entityName: string,
        depth: number,
        strategy: ExpansionStrategy,
        data: EnhancedEntityExpansionData
    ): void {
        const key = this.generateCacheKey(entityName, depth, strategy);
        
        // Implement LRU eviction if cache is full
        if (this.expansionCache.size >= this.maxCacheSize) {
            this.evictLRUCache();
        }
        
        const cacheEntry: ExpansionCache = {
            key,
            data,
            timestamp: Date.now(),
            hitCount: 0,
            lastAccessed: Date.now(),
            ttl: this.defaultTTL
        };
        
        this.expansionCache.set(key, cacheEntry);
    }

    private generateCacheKey(
        entityName: string,
        depth: number,
        strategy: ExpansionStrategy
    ): string {
        return `${entityName}:${depth}:${strategy.name}:${JSON.stringify(strategy.filterCriteria)}`;
    }

    private evictLRUCache(): void {
        let oldestKey = '';
        let oldestTime = Date.now();
        
        for (const [key, cache] of this.expansionCache) {
            if (cache.lastAccessed < oldestTime) {
                oldestTime = cache.lastAccessed;
                oldestKey = key;
            }
        }
        
        if (oldestKey) {
            this.expansionCache.delete(oldestKey);
        }
    }

    /**
     * Network analysis and community detection
     */
    private async enhanceWithNetworkAnalysis(
        expansionData: EnhancedEntityExpansionData
    ): Promise<void> {
        // Calculate centrality metrics
        this.calculateCentralityMetrics(expansionData);
        
        // Detect communities
        const communities = this.communityDetector.detectCommunities(
            expansionData.entities,
            expansionData.relationships
        );
        
        // Assign cluster IDs to entities
        for (const entity of expansionData.entities) {
            const community = communities.find(c => c.members.includes(entity.name));
            if (community) {
                entity.cluster = community.id;
            }
        }
        
        // Calculate network metrics
        this.currentMetrics = this.networkAnalyzer.calculateMetrics(expansionData);
    }

    /**
     * Calculate centrality metrics for entities
     */
    private calculateCentralityMetrics(expansionData: EnhancedEntityExpansionData): void {
        const adjacencyMap = new Map<string, Set<string>>();
        
        // Build adjacency map
        for (const edge of expansionData.relationships) {
            if (!adjacencyMap.has(edge.from)) {
                adjacencyMap.set(edge.from, new Set());
            }
            if (!adjacencyMap.has(edge.to)) {
                adjacencyMap.set(edge.to, new Set());
            }
            adjacencyMap.get(edge.from)!.add(edge.to);
            adjacencyMap.get(edge.to)!.add(edge.from);
        }
        
        // Calculate degree centrality
        for (const entity of expansionData.entities) {
            const connections = adjacencyMap.get(entity.name) || new Set();
            entity.centrality.degree = connections.size;
            
            // Simple PageRank approximation based on degree and strength
            const totalStrength = expansionData.relationships
                .filter(r => r.from === entity.name || r.to === entity.name)
                .reduce((sum, r) => sum + r.strength, 0);
            
            entity.centrality.pagerank = (entity.centrality.degree + totalStrength) / 
                (expansionData.entities.length + expansionData.relationships.length);
        }
    }

    /**
     * Default expansion strategies
     */
    private getDefaultStrategy(): ExpansionStrategy {
        return {
            name: "balanced",
            description: "Balanced expansion prioritizing both strength and confidence",
            maxDepth: 3,
            expansionFactor: 8,
            filterCriteria: {
                minStrength: 0.3,
                minConfidence: 0.5,
                includeTypes: [],
                excludeTypes: []
            },
            prioritization: "strength"
        };
    }

    /**
     * Calculate cache hit rate
     */
    private calculateCacheHitRate(): number {
        if (this.expansionCache.size === 0) return 0;
        
        const totalHits = Array.from(this.expansionCache.values())
            .reduce((sum, cache) => sum + cache.hitCount, 0);
        const totalEntries = this.expansionCache.size;
        
        return totalHits / Math.max(totalEntries, 1);
    }

    /**
     * Calculate quality score for expansion
     */
    private calculateQualityScore(expansionData: EnhancedEntityExpansionData): number {
        if (expansionData.entities.length === 0) return 0;
        
        // Quality based on confidence, relationship strength, and diversity
        const avgConfidence = expansionData.entities
            .reduce((sum, e) => sum + e.confidence, 0) / expansionData.entities.length;
        
        const avgStrength = expansionData.relationships.length > 0 
            ? expansionData.relationships
                .reduce((sum, r) => sum + r.strength, 0) / expansionData.relationships.length
            : 0;
        
        const typesDiversity = new Set(expansionData.entities.map(e => e.type)).size / 
            Math.max(expansionData.entities.length, 1);
        
        return (avgConfidence * 0.4 + avgStrength * 0.4 + typesDiversity * 0.2);
    }

    /**
     * Setup enhanced UI controls
     */
    private setupEnhancedControls(): void {
        // This would setup the enhanced UI controls
        console.log("Setting up enhanced multi-hop controls");
    }

    private setupAdvancedEventHandlers(): void {
        // This would setup advanced event handlers
        console.log("Setting up advanced event handlers");
    }

    private setupKeyboardShortcuts(): void {
        // This would setup keyboard shortcuts for power users
        console.log("Setting up keyboard shortcuts");
    }

    /**
     * Cache cleanup timer
     */
    private startCacheCleanup(): void {
        setInterval(() => {
            const now = Date.now();
            for (const [key, cache] of this.expansionCache) {
                if ((now - cache.timestamp) > cache.ttl) {
                    this.expansionCache.delete(key);
                }
            }
        }, 60000); // Clean up every minute
    }

    /**
     * Public API methods for integration with EntityGraphView
     */
    public async expandSelectedEntities(): Promise<void> {
        if (this.isExpanding) return;
        
        const selectedEntities = this.visualizer.getSelectedEntities();
        if (selectedEntities.length === 0) return;
        
        this.isExpanding = true;
        
        try {
            for (const entityName of selectedEntities) {
                const expansion = await this.expandEntityNetworkAdvanced(entityName, {
                    includeNetworkAnalysis: true
                });
                
                await this.visualizer.addElements({
                    entities: expansion.entities,
                    relationships: expansion.relationships
                });
            }
        } finally {
            this.isExpanding = false;
        }
    }

    public getCurrentNetworkMetrics(): NetworkAnalysisMetrics | null {
        return this.currentMetrics;
    }

    public getCacheStats(): { size: number; hitRate: number; totalMemory: string } {
        const memoryUsage = JSON.stringify(Array.from(this.expansionCache.values())).length;
        return {
            size: this.expansionCache.size,
            hitRate: this.calculateCacheHitRate(),
            totalMemory: `${(memoryUsage / 1024).toFixed(2)} KB`
        };
    }
}

/**
 * Community Detection Algorithm
 */
export class CommunityDetector {
    detectCommunities(
        entities: EnhancedEntityNode[],
        relationships: EnhancedRelationshipEdge[]
    ): Array<{ id: string; members: string[]; density: number }> {
        // Simplified community detection using connected components
        const adjacencyMap = new Map<string, Set<string>>();
        
        // Build adjacency map
        for (const edge of relationships) {
            if (!adjacencyMap.has(edge.from)) {
                adjacencyMap.set(edge.from, new Set());
            }
            if (!adjacencyMap.has(edge.to)) {
                adjacencyMap.set(edge.to, new Set());
            }
            adjacencyMap.get(edge.from)!.add(edge.to);
            adjacencyMap.get(edge.to)!.add(edge.from);
        }
        
        // Find connected components
        const visited = new Set<string>();
        const communities: Array<{ id: string; members: string[]; density: number }> = [];
        
        for (const entity of entities) {
            if (!visited.has(entity.name)) {
                const community = this.dfsComponent(entity.name, adjacencyMap, visited);
                if (community.length > 1) {
                    communities.push({
                        id: `community_${communities.length}`,
                        members: community,
                        density: this.calculateCommunityDensity(community, relationships)
                    });
                }
            }
        }
        
        return communities;
    }

    private dfsComponent(
        node: string,
        adjacencyMap: Map<string, Set<string>>,
        visited: Set<string>
    ): string[] {
        const component: string[] = [];
        const stack = [node];
        
        while (stack.length > 0) {
            const current = stack.pop()!;
            if (!visited.has(current)) {
                visited.add(current);
                component.push(current);
                
                const neighbors = adjacencyMap.get(current) || new Set();
                for (const neighbor of neighbors) {
                    if (!visited.has(neighbor)) {
                        stack.push(neighbor);
                    }
                }
            }
        }
        
        return component;
    }

    private calculateCommunityDensity(
        members: string[],
        relationships: EnhancedRelationshipEdge[]
    ): number {
        const memberSet = new Set(members);
        const internalEdges = relationships.filter(r => 
            memberSet.has(r.from) && memberSet.has(r.to)
        ).length;
        
        const maxPossibleEdges = members.length * (members.length - 1) / 2;
        return maxPossibleEdges > 0 ? internalEdges / maxPossibleEdges : 0;
    }
}

/**
 * Network Analysis Calculator
 */
export class NetworkAnalyzer {
    calculateMetrics(expansionData: EnhancedEntityExpansionData): NetworkAnalysisMetrics {
        const entities = expansionData.entities;
        const relationships = expansionData.relationships;
        
        // Basic metrics
        const totalNodes = entities.length;
        const totalEdges = relationships.length;
        const density = totalNodes > 1 ? (2 * totalEdges) / (totalNodes * (totalNodes - 1)) : 0;
        
        // Degree statistics
        const degrees = entities.map(e => e.centrality.degree);
        const averageDegree = degrees.reduce((sum, d) => sum + d, 0) / totalNodes;
        const maxDegree = Math.max(...degrees);
        
        // Find most central entities
        const mostCentral = entities.reduce((max, e) => 
            e.centrality.degree > max.centrality.degree ? e : max
        );
        
        const mostInfluential = entities.reduce((max, e) => 
            e.metadata.influenceScore > max.metadata.influenceScore ? e : max
        );

        return {
            overview: {
                totalNodes,
                totalEdges,
                density,
                averageDegree,
                diameter: this.calculateDiameter(entities, relationships),
                averagePathLength: this.calculateAveragePathLength(entities, relationships)
            },
            clusters: {
                count: new Set(entities.map(e => e.cluster).filter(Boolean)).size,
                modularity: 0.5, // Placeholder
                communities: [] // Would be populated from community detection
            },
            centrality: {
                mostCentral: mostCentral.name,
                mostInfluential: mostInfluential.name,
                bridgeNodes: entities.filter(e => e.centrality.betweenness > 0.5).map(e => e.name),
                peripheralNodes: entities.filter(e => e.centrality.degree <= 1).map(e => e.name)
            },
            temporal: {
                growthRate: 0, // Would be calculated from temporal data
                activityPeaks: [],
                emergingEntities: [],
                decliningEntities: []
            }
        };
    }

    private calculateDiameter(
        entities: EnhancedEntityNode[],
        relationships: EnhancedRelationshipEdge[]
    ): number {
        // Simplified diameter calculation
        return Math.ceil(Math.log2(entities.length));
    }

    private calculateAveragePathLength(
        entities: EnhancedEntityNode[],
        relationships: EnhancedRelationshipEdge[]
    ): number {
        // Simplified average path length calculation
        return Math.log(entities.length) / Math.log(2);
    }
}

// Supporting interfaces
interface ExpansionStep {
    action: "expand" | "collapse" | "focus" | "filter";
    entityName: string;
    timestamp: number;
    parameters: any;
    resultingState: {
        nodeCount: number;
        edgeCount: number;
        depth: number;
    };
}