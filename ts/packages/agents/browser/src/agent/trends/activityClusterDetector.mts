// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { TopicVector, ActivityCluster, ClusteringOptions, TimeRange } from "./types.mjs";
import registerDebug from "debug";

const debug = registerDebug("typeagent:browser:trends:clustering");

export class ActivityClusterDetector {
    private readonly defaultOptions: ClusteringOptions = {
        minClusterSize: 3,
        maxClusterAge: 90,
        similarityThreshold: 0.3,
        timeWindowHours: 72 // 3 days
    };

    /**
     * Detect activity clusters from topic vectors
     */
    async detectClusters(
        vectors: TopicVector[], 
        options?: Partial<ClusteringOptions>
    ): Promise<ActivityCluster[]> {
        const opts = { ...this.defaultOptions, ...options };
        debug(`Detecting clusters from ${vectors.length} vectors`);
        
        // Filter vectors by age
        const cutoffDate = new Date(Date.now() - opts.maxClusterAge * 24 * 60 * 60 * 1000);
        const recentVectors = vectors.filter(v => v.timestamp >= cutoffDate);
        
        if (recentVectors.length === 0) {
            return [];
        }
        
        // Sort vectors by timestamp for temporal grouping
        const sortedVectors = recentVectors.sort((a, b) => 
            a.timestamp.getTime() - b.timestamp.getTime()
        );
        
        // Perform clustering
        const clusters = this.performClustering(sortedVectors, opts);
        
        // Convert to ActivityCluster format
        const activityClusters = clusters.map(cluster => 
            this.createActivityCluster(cluster, opts)
        );
        
        // Filter out small clusters
        const significantClusters = activityClusters.filter(
            c => c.websites.length >= opts.minClusterSize
        );
        
        debug(`Detected ${significantClusters.length} significant clusters`);
        return significantClusters;
    }

    /**
     * Perform temporal and semantic clustering
     */
    private performClustering(
        vectors: TopicVector[], 
        options: ClusteringOptions
    ): TopicVector[][] {
        const clusters: TopicVector[][] = [];
        const visited = new Set<number>();
        
        for (let i = 0; i < vectors.length; i++) {
            if (visited.has(i)) continue;
            
            const cluster: TopicVector[] = [vectors[i]];
            visited.add(i);
            
            // Find similar vectors within time window
            for (let j = i + 1; j < vectors.length; j++) {
                if (visited.has(j)) continue;
                
                // Check temporal proximity
                const timeDiff = Math.abs(
                    vectors[j].timestamp.getTime() - vectors[i].timestamp.getTime()
                ) / (1000 * 60 * 60); // Hours
                
                if (timeDiff > options.timeWindowHours) {
                    break; // Vectors are sorted, so no need to check further
                }
                
                // Check if vector is similar to any in cluster
                const isSimilar = cluster.some(clusterVector => 
                    this.calculateSimilarity(vectors[j], clusterVector) >= options.similarityThreshold
                );
                
                if (isSimilar) {
                    cluster.push(vectors[j]);
                    visited.add(j);
                }
            }
            
            clusters.push(cluster);
        }
        
        return clusters;
    }

    /**
     * Calculate similarity between two topic vectors
     */
    private calculateSimilarity(v1: TopicVector, v2: TopicVector): number {
        // Calculate topic similarity
        const topicSim = this.jaccardSimilarity(v1.topics, v2.topics);
        
        // Calculate entity similarity
        const entitySim = this.jaccardSimilarity(v1.entities, v2.entities);
        
        // Calculate domain similarity
        const domainSim = this.jaccardSimilarity(v1.domains, v2.domains);
        
        // Calculate page type similarity
        const pageTypeSim = this.jaccardSimilarity(v1.pageTypes, v2.pageTypes);
        
        // Weighted combination
        const similarity = (
            topicSim * 0.4 +      // Topics are most important
            entitySim * 0.3 +     // Entities are second
            domainSim * 0.2 +     // Domains provide context
            pageTypeSim * 0.1     // Page types are least important
        );
        
        // Apply weight factor
        const weightFactor = Math.min(v1.weight, v2.weight) / Math.max(v1.weight, v2.weight);
        
        return similarity * weightFactor;
    }

    /**
     * Calculate Jaccard similarity between two sets
     */
    private jaccardSimilarity(set1: string[], set2: string[]): number {
        const s1 = new Set(set1.map(s => s.toLowerCase()));
        const s2 = new Set(set2.map(s => s.toLowerCase()));
        
        if (s1.size === 0 && s2.size === 0) return 1;
        if (s1.size === 0 || s2.size === 0) return 0;
        
        const intersection = new Set([...s1].filter(x => s2.has(x)));
        const union = new Set([...s1, ...s2]);
        
        return intersection.size / union.size;
    }

    /**
     * Create an ActivityCluster from a group of vectors
     */
    private createActivityCluster(
        vectors: TopicVector[], 
        options: ClusteringOptions
    ): ActivityCluster {
        // Aggregate topics and entities
        const topicCounts = new Map<string, number>();
        const entityCounts = new Map<string, number>();
        const domains = new Set<string>();
        const urls = new Set<string>();
        
        vectors.forEach(vector => {
            // Count topics
            vector.topics.forEach(topic => {
                topicCounts.set(topic, (topicCounts.get(topic) || 0) + vector.weight);
            });
            
            // Count entities
            vector.entities.forEach(entity => {
                entityCounts.set(entity, (entityCounts.get(entity) || 0) + vector.weight);
            });
            
            // Collect domains and URLs
            vector.domains.forEach(domain => domains.add(domain));
            vector.urls.forEach(url => urls.add(url));
        });
        
        // Get top topics and entities
        const topTopics = this.getTopItems(topicCounts, 10);
        const topEntities = this.getTopItems(entityCounts, 10);
        
        // Calculate time range
        const timestamps = vectors.map(v => v.timestamp.getTime());
        const timeRange: TimeRange = {
            start: new Date(Math.min(...timestamps)),
            end: new Date(Math.max(...timestamps))
        };
        
        // Calculate intensity (activity per day)
        const durationDays = Math.max(1, 
            (timeRange.end.getTime() - timeRange.start.getTime()) / (1000 * 60 * 60 * 24)
        );
        const intensity = Math.min(1, vectors.length / (durationDays * 5)); // Normalize to 5 visits/day = 1.0
        
        // Generate cluster name
        const name = this.generateClusterName(topTopics, topEntities, Array.from(domains));
        
        return {
            id: this.generateClusterId(),
            name,
            topics: topTopics,
            entities: topEntities,
            domains: Array.from(domains),
            timeRange,
            intensity,
            websites: Array.from(urls),
            visitCount: vectors.reduce((sum, v) => sum + (v.weight >= 1 ? 1 : 0), 0),
            uniqueDomains: domains.size
        };
    }

    /**
     * Get top items from a count map
     */
    private getTopItems(counts: Map<string, number>, limit: number): string[] {
        return Array.from(counts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([item]) => item);
    }

    /**
     * Generate a human-readable name for the cluster
     */
    private generateClusterName(
        topics: string[], 
        entities: string[], 
        domains: string[]
    ): string {
        // Try to use entities first for more specific names
        if (entities.length > 0) {
            const mainEntity = entities[0];
            const mainTopic = topics[0];
            
            // Check for common patterns
            if (this.isCarRelated(topics, entities)) {
                return `${mainEntity} Car Research`;
            } else if (this.isTravelRelated(topics, domains)) {
                return `${mainEntity} Travel Planning`;
            } else if (this.isShoppingRelated(topics, domains)) {
                return `${mainEntity} Shopping`;
            } else if (this.isNewsRelated(domains)) {
                return `${mainEntity} News & Updates`;
            } else if (this.isTechRelated(topics, domains)) {
                return `${mainEntity} Tech Research`;
            }
            
            // Generic pattern
            return mainTopic ? `${mainEntity} - ${mainTopic}` : mainEntity;
        }
        
        // Fall back to topics
        if (topics.length > 0) {
            const mainTopics = topics.slice(0, 2).join(" & ");
            return mainTopics.charAt(0).toUpperCase() + mainTopics.slice(1);
        }
        
        // Last resort: use domain
        if (domains.length > 0) {
            return `Activity on ${domains[0]}`;
        }
        
        return "Unknown Activity";
    }

    /**
     * Pattern detection helpers
     */
    private isCarRelated(topics: string[], entities: string[]): boolean {
        const carKeywords = ["car", "auto", "vehicle", "suv", "sedan", "truck", "mpg", "dealer"];
        const carBrands = ["toyota", "honda", "ford", "tesla", "bmw", "mercedes", "audi"];
        
        const allTerms = [...topics, ...entities].map(t => t.toLowerCase());
        return allTerms.some(term => 
            carKeywords.some(keyword => term.includes(keyword)) ||
            carBrands.some(brand => term.includes(brand))
        );
    }

    private isTravelRelated(topics: string[], domains: string[]): boolean {
        const travelKeywords = ["travel", "flight", "hotel", "vacation", "trip", "booking"];
        const travelDomains = ["booking.com", "expedia", "airbnb", "tripadvisor", "kayak"];
        
        return topics.some(topic => 
            travelKeywords.some(keyword => topic.toLowerCase().includes(keyword))
        ) || domains.some(domain => 
            travelDomains.some(td => domain.includes(td))
        );
    }

    private isShoppingRelated(topics: string[], domains: string[]): boolean {
        const shoppingKeywords = ["buy", "price", "deal", "sale", "review", "compare"];
        const shoppingDomains = ["amazon", "ebay", "target", "walmart", "bestbuy"];
        
        return topics.some(topic => 
            shoppingKeywords.some(keyword => topic.toLowerCase().includes(keyword))
        ) || domains.some(domain => 
            shoppingDomains.some(sd => domain.includes(sd))
        );
    }

    private isNewsRelated(domains: string[]): boolean {
        const newsDomains = ["cnn", "bbc", "reuters", "nytimes", "wsj", "guardian"];
        return domains.some(domain => 
            newsDomains.some(nd => domain.includes(nd))
        );
    }

    private isTechRelated(topics: string[], domains: string[]): boolean {
        const techKeywords = ["software", "programming", "code", "api", "developer", "tech"];
        const techDomains = ["github", "stackoverflow", "dev.to", "medium.com"];
        
        return topics.some(topic => 
            techKeywords.some(keyword => topic.toLowerCase().includes(keyword))
        ) || domains.some(domain => 
            techDomains.some(td => domain.includes(td))
        );
    }

    /**
     * Generate unique cluster ID
     */
    private generateClusterId(): string {
        return `cluster_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}