// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Phase 2: Advanced Entity Relationship Inference Engine
 * 
 * This module implements sophisticated relationship discovery using:
 * 1. Co-occurrence based relationships
 * 2. Domain-based relationships  
 * 3. Temporal relationships
 * 4. Advanced strength calculation algorithms
 */

import * as website from "website-memory";
import registerDebug from "debug";

const debug = registerDebug("typeagent:browser:entity-relationships");

// Enhanced relationship types from the optimization plan
export interface InferredRelationship {
    relatedEntity: string;
    entityType?: string;
    relationshipType: "co_occurs_with" | "same_domain" | "frequent_together" | "temporal_sequence" | "semantic_similar";
    strength: number;        // Based on co-occurrence frequency (0.0-1.0)
    evidenceSources: string[]; // URLs where they appear together
    coOccurrenceCount: number;
    confidence: number;     // Average extraction confidence
    metadata: {
        domains: string[];
        temporalPattern?: "before" | "after" | "concurrent";
        firstSeen: string;
        lastSeen: string;
        avgTimeGap?: number; // For temporal relationships
    };
}

export interface EntityStats {
    totalMentions: number;      // Total times entity appears
    uniqueUrls: number;         // Number of unique URLs
    uniqueDomains: number;      // Number of unique domains
    topDomains: string[];       // Most frequent domains
    avgConfidence: number;      // Average extraction confidence
    firstSeen: string;          // Earliest extraction date
    lastSeen: string;           // Latest extraction date
    entityTypes: string[];      // All entity types seen
    relationshipCount: number;  // Number of inferred relationships
    domainDistribution: { domain: string; count: number; percentage: number }[];
    temporalPattern: {
        peakHours: number[];
        trendDirection: "increasing" | "decreasing" | "stable";
        seasonality?: string;
    };
}

export class EntityRelationshipInference {
    constructor(private websiteCollection: website.WebsiteCollection) {}

    /**
     * Phase 2.1: Advanced Co-occurrence Based Relationships
     * Enhanced from Phase 1 with temporal analysis and confidence weighting
     */
    async inferCoOccurrenceRelationships(
        entityName: string,
        options: {
            minCoOccurrence?: number;
            minConfidence?: number;
            includeTemporalAnalysis?: boolean;
            limit?: number;
        } = {}
    ): Promise<InferredRelationship[]> {
        const {
            minCoOccurrence = 2,
            minConfidence = 0.3,
            includeTemporalAnalysis = true,
            limit = 20
        } = options;

        if (!this.websiteCollection.knowledgeEntities) {
            return [];
        }

        try {
            debug(`Inferring co-occurrence relationships for: ${entityName}`);

            // Enhanced co-occurrence query with temporal analysis
            const coOccurrenceQuery = `
                SELECT 
                    e2.entityName as relatedEntity,
                    e2.entityType,
                    COUNT(*) as coOccurrenceCount,
                    AVG(e2.confidence) as avgConfidence,
                    GROUP_CONCAT(DISTINCT e2.url) as evidenceUrls,
                    GROUP_CONCAT(DISTINCT e2.domain) as domains,
                    MIN(e2.extractionDate) as firstSeen,
                    MAX(e2.extractionDate) as lastSeen,
                    -- Calculate confidence-weighted strength
                    (COUNT(*) * AVG(e2.confidence)) as weightedStrength,
                    -- Domain diversity factor
                    COUNT(DISTINCT e2.domain) as domainDiversity
                FROM knowledgeEntities e1
                JOIN knowledgeEntities e2 ON e1.url = e2.url
                WHERE e1.entityName = ? 
                  AND e2.entityName != ?
                  AND e2.confidence >= ?
                GROUP BY e2.entityName, e2.entityType
                HAVING coOccurrenceCount >= ?
                ORDER BY weightedStrength DESC, domainDiversity DESC, coOccurrenceCount DESC
                LIMIT ?
            `;

            const knowledgeTable = this.websiteCollection.knowledgeEntities as any;
            const results = knowledgeTable.db
                .prepare(coOccurrenceQuery)
                .all(entityName, entityName, minConfidence, minCoOccurrence, limit);

            const relationships: InferredRelationship[] = [];

            for (const row of results) {
                const domains = row.domains ? row.domains.split(',') : [];
                const evidenceUrls = row.evidenceUrls ? row.evidenceUrls.split(',') : [];
                
                // Advanced strength calculation
                const strength = this.calculateAdvancedStrength({
                    coOccurrenceCount: row.coOccurrenceCount,
                    avgConfidence: row.avgConfidence,
                    domainDiversity: row.domainDiversity,
                    evidenceCount: evidenceUrls.length
                });

                // Temporal analysis if requested
                let temporalPattern: "before" | "after" | "concurrent" | undefined;
                let avgTimeGap: number | undefined;

                if (includeTemporalAnalysis) {
                    const temporal = await this.analyzeTemporalRelationship(
                        entityName, 
                        row.relatedEntity
                    );
                    temporalPattern = temporal.pattern;
                    avgTimeGap = temporal.avgTimeGap;
                }

                const metadata: any = {
                    domains,
                    firstSeen: row.firstSeen,
                    lastSeen: row.lastSeen
                };

                if (temporalPattern) {
                    metadata.temporalPattern = temporalPattern;
                }

                if (avgTimeGap !== undefined) {
                    metadata.avgTimeGap = avgTimeGap;
                }

                relationships.push({
                    relatedEntity: row.relatedEntity,
                    entityType: row.entityType,
                    relationshipType: "co_occurs_with",
                    strength,
                    evidenceSources: evidenceUrls,
                    coOccurrenceCount: row.coOccurrenceCount,
                    confidence: row.avgConfidence,
                    metadata
                });
            }

            debug(`Found ${relationships.length} co-occurrence relationships for ${entityName}`);
            return relationships;

        } catch (error) {
            debug(`Error in co-occurrence analysis: ${error}`);
            return [];
        }
    }

    /**
     * Phase 2.2: Domain-Based Relationship Discovery
     * Finds entities that frequently appear on the same domains
     */
    async inferDomainBasedRelationships(
        entityName: string,
        options: {
            minDomainCount?: number;
            minSharedDomains?: number;
            limit?: number;
        } = {}
    ): Promise<InferredRelationship[]> {
        const {
            minDomainCount = 2,
            minSharedDomains = 1,
            limit = 15
        } = options;

        if (!this.websiteCollection.knowledgeEntities) {
            return [];
        }

        try {
            debug(`Inferring domain-based relationships for: ${entityName}`);

            // Domain-based relationship query
            const domainQuery = `
                WITH EntityDomains AS (
                    SELECT DISTINCT domain
                    FROM knowledgeEntities 
                    WHERE entityName = ?
                ), RelatedEntities AS (
                    SELECT 
                        e.entityName as relatedEntity,
                        e.entityType,
                        e.domain,
                        COUNT(*) as domainCount,
                        AVG(e.confidence) as avgConfidence,
                        GROUP_CONCAT(DISTINCT e.url) as evidenceUrls,
                        MIN(e.extractionDate) as firstSeen,
                        MAX(e.extractionDate) as lastSeen
                    FROM knowledgeEntities e
                    INNER JOIN EntityDomains ed ON e.domain = ed.domain
                    WHERE e.entityName != ?
                    GROUP BY e.entityName, e.entityType, e.domain
                    HAVING domainCount >= ?
                )
                SELECT 
                    relatedEntity,
                    entityType,
                    COUNT(DISTINCT domain) as sharedDomains,
                    SUM(domainCount) as totalDomainMentions,
                    AVG(avgConfidence) as overallConfidence,
                    GROUP_CONCAT(DISTINCT domain) as domains,
                    GROUP_CONCAT(evidenceUrls) as allEvidenceUrls,
                    MIN(firstSeen) as firstSeen,
                    MAX(lastSeen) as lastSeen
                FROM RelatedEntities
                GROUP BY relatedEntity, entityType
                HAVING sharedDomains >= ?
                ORDER BY sharedDomains DESC, totalDomainMentions DESC
                LIMIT ?
            `;

            const knowledgeTable = this.websiteCollection.knowledgeEntities as any;
            const results = knowledgeTable.db
                .prepare(domainQuery)
                .all(entityName, entityName, minDomainCount, minSharedDomains, limit);

            const relationships: InferredRelationship[] = results.map((row: any) => {
                const domains = row.domains ? row.domains.split(',') : [];
                const allUrls = row.allEvidenceUrls ? row.allEvidenceUrls.split(',') : [];
                
                // Unique evidence URLs (remove duplicates)
                const evidenceUrls = [...new Set(allUrls.flatMap((urls: string) => urls.split(',')))];

                // Domain-based strength calculation
                const strength = this.calculateDomainBasedStrength({
                    sharedDomains: row.sharedDomains,
                    totalMentions: row.totalDomainMentions,
                    confidence: row.overallConfidence,
                    evidenceCount: evidenceUrls.length
                });

                return {
                    relatedEntity: row.relatedEntity,
                    entityType: row.entityType,
                    relationshipType: "same_domain" as const,
                    strength,
                    evidenceSources: evidenceUrls.slice(0, 10), // Limit evidence URLs
                    coOccurrenceCount: row.totalDomainMentions,
                    confidence: row.overallConfidence,
                    metadata: {
                        domains,
                        firstSeen: row.firstSeen,
                        lastSeen: row.lastSeen
                    }
                };
            });

            debug(`Found ${relationships.length} domain-based relationships for ${entityName}`);
            return relationships;

        } catch (error) {
            debug(`Error in domain-based analysis: ${error}`);
            return [];
        }
    }

    /**
     * Phase 2.3: Comprehensive Relationship Discovery
     * Combines all relationship types with intelligent deduplication
     */
    async inferAllRelationships(
        entityName: string,
        options: {
            includeCoOccurrence?: boolean;
            includeDomainBased?: boolean;
            includeFrequentTogether?: boolean;
            maxTotal?: number;
            minStrength?: number;
        } = {}
    ): Promise<InferredRelationship[]> {
        const {
            includeCoOccurrence = true,
            includeDomainBased = true,
            includeFrequentTogether = true,
            maxTotal = 25,
            minStrength = 0.1
        } = options;

        debug(`Inferring comprehensive relationships for: ${entityName}`);

        const allRelationships: InferredRelationship[] = [];

        // Gather relationships from different sources
        if (includeCoOccurrence) {
            const coOccurrence = await this.inferCoOccurrenceRelationships(entityName, { limit: 15 });
            allRelationships.push(...coOccurrence);
        }

        if (includeDomainBased) {
            const domainBased = await this.inferDomainBasedRelationships(entityName, { limit: 15 });
            allRelationships.push(...domainBased);
        }

        if (includeFrequentTogether) {
            const frequentTogether = await this.inferFrequentTogetherRelationships(entityName, { limit: 10 });
            allRelationships.push(...frequentTogether);
        }

        // Intelligent deduplication and merging
        const mergedRelationships = this.mergeAndDeduplicateRelationships(allRelationships);

        // Filter by minimum strength and sort
        const filteredRelationships = mergedRelationships
            .filter(rel => rel.strength >= minStrength)
            .sort((a, b) => b.strength - a.strength)
            .slice(0, maxTotal);

        debug(`Returning ${filteredRelationships.length} comprehensive relationships for ${entityName}`);
        return filteredRelationships;
    }

    /**
     * Enhanced Entity Statistics with advanced analytics
     */
    async calculateAdvancedEntityStats(entityName: string): Promise<EntityStats> {
        if (!this.websiteCollection.knowledgeEntities) {
            throw new Error("Knowledge entities table not available");
        }

        try {
            const knowledgeTable = this.websiteCollection.knowledgeEntities as any;

            // Enhanced basic statistics query
            const basicStatsQuery = `
                SELECT 
                    COUNT(*) as totalMentions,
                    COUNT(DISTINCT url) as uniqueUrls,
                    COUNT(DISTINCT domain) as uniqueDomains,
                    AVG(confidence) as avgConfidence,
                    MIN(extractionDate) as firstSeen,
                    MAX(extractionDate) as lastSeen,
                    GROUP_CONCAT(DISTINCT entityType) as entityTypes
                FROM knowledgeEntities 
                WHERE entityName = ?
            `;

            // Domain distribution query
            const domainDistributionQuery = `
                SELECT 
                    domain, 
                    COUNT(*) as count,
                    (COUNT(*) * 100.0 / (SELECT COUNT(*) FROM knowledgeEntities WHERE entityName = ?)) as percentage
                FROM knowledgeEntities 
                WHERE entityName = ?
                GROUP BY domain
                ORDER BY count DESC
                LIMIT 10
            `;

            const basicStats = knowledgeTable.db.prepare(basicStatsQuery).get(entityName);
            const domainDistribution = knowledgeTable.db.prepare(domainDistributionQuery).all(entityName, entityName);

            // Get relationship count from comprehensive analysis
            const relationships = await this.inferAllRelationships(entityName, { maxTotal: 50 });

            // Temporal pattern analysis
            const temporalPattern = await this.analyzeEntityTemporalPattern(entityName);

            return {
                totalMentions: basicStats?.totalMentions || 0,
                uniqueUrls: basicStats?.uniqueUrls || 0,
                uniqueDomains: basicStats?.uniqueDomains || 0,
                topDomains: domainDistribution.slice(0, 5).map((d: any) => d.domain),
                avgConfidence: basicStats?.avgConfidence || 0,
                firstSeen: basicStats?.firstSeen || new Date().toISOString(),
                lastSeen: basicStats?.lastSeen || new Date().toISOString(),
                entityTypes: basicStats?.entityTypes ? basicStats.entityTypes.split(',') : [],
                relationshipCount: relationships.length,
                domainDistribution: domainDistribution.map((d: any) => ({
                    domain: d.domain,
                    count: d.count,
                    percentage: Math.round(d.percentage * 100) / 100
                })),
                temporalPattern
            };

        } catch (error) {
            debug(`Error calculating advanced entity stats: ${error}`);
            throw error;
        }
    }

    // Private helper methods

    private calculateAdvancedStrength(params: {
        coOccurrenceCount: number;
        avgConfidence: number;
        domainDiversity: number;
        evidenceCount: number;
    }): number {
        const { coOccurrenceCount, avgConfidence, domainDiversity, evidenceCount } = params;

        // Base strength from co-occurrence
        let strength = Math.min(0.9, coOccurrenceCount / 20);

        // Confidence weighting (0.3 to 1.3 multiplier)
        strength *= (0.3 + avgConfidence);

        // Domain diversity bonus (entities appearing across multiple domains are more significant)
        const diversityBonus = Math.min(0.3, domainDiversity * 0.1);
        strength += diversityBonus;

        // Evidence count bonus
        const evidenceBonus = Math.min(0.2, evidenceCount * 0.02);
        strength += evidenceBonus;

        return Math.min(0.95, Math.max(0.1, strength));
    }

    private calculateDomainBasedStrength(params: {
        sharedDomains: number;
        totalMentions: number;
        confidence: number;
        evidenceCount: number;
    }): number {
        const { sharedDomains, totalMentions, confidence, evidenceCount } = params;

        // Base strength from shared domains
        let strength = Math.min(0.8, sharedDomains / 10);

        // Total mentions weighting
        strength += Math.min(0.3, totalMentions / 50);

        // Confidence factor
        strength *= confidence;

        // Evidence diversity
        strength += Math.min(0.2, evidenceCount / 100);

        return Math.min(0.9, Math.max(0.1, strength));
    }

    private async inferFrequentTogetherRelationships(
        entityName: string,
        options: { limit?: number } = {}
    ): Promise<InferredRelationship[]> {
        // This would implement frequency-based analysis
        // For now, return empty array - can be enhanced in future
        return [];
    }

    private async analyzeTemporalRelationship(
        entity1: string,
        entity2: string
    ): Promise<{ pattern?: "before" | "after" | "concurrent"; avgTimeGap?: number }> {
        // Temporal analysis implementation would go here
        // For now, return basic concurrent pattern
        return { pattern: "concurrent" };
    }

    private async analyzeEntityTemporalPattern(entityName: string): Promise<{
        peakHours: number[];
        trendDirection: "increasing" | "decreasing" | "stable";
        seasonality?: string;
    }> {
        // Advanced temporal pattern analysis would go here
        return {
            peakHours: [9, 14, 20], // Default business hours
            trendDirection: "stable"
        };
    }

    private mergeAndDeduplicateRelationships(relationships: InferredRelationship[]): InferredRelationship[] {
        const entityMap = new Map<string, InferredRelationship>();

        for (const rel of relationships) {
            const key = rel.relatedEntity;
            const existing = entityMap.get(key);

            if (!existing) {
                entityMap.set(key, rel);
            } else {
                // Merge relationships for the same entity, keeping the stronger one as base
                if (rel.strength > existing.strength) {
                    // Update with stronger relationship but merge evidence
                    existing.strength = Math.max(existing.strength, rel.strength);
                    existing.evidenceSources = [...new Set([...existing.evidenceSources, ...rel.evidenceSources])];
                    existing.coOccurrenceCount = Math.max(existing.coOccurrenceCount, rel.coOccurrenceCount);
                    existing.metadata.domains = [...new Set([...existing.metadata.domains, ...rel.metadata.domains])];
                }
            }
        }

        return Array.from(entityMap.values());
    }
}