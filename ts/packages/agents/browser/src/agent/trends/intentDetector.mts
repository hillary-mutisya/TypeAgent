// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { ActivityCluster, UserIntent, IntentStage } from "./types.mjs";
import registerDebug from "debug";

const debug = registerDebug("typeagent:browser:trends:intent");

export class IntentDetector {
    private readonly intentPatterns = new Map<string, IntentPattern>();

    constructor() {
        this.initializeIntentPatterns();
    }

    /**
     * Detect user intent from activity cluster
     */
    async detectIntent(cluster: ActivityCluster): Promise<UserIntent | null> {
        debug(`Detecting intent for cluster: ${cluster.name}`);
        
        // Try each intent pattern
        const matches: Array<{ intent: UserIntent; score: number }> = [];
        
        for (const [intentName, pattern] of this.intentPatterns) {
            const match = this.matchPattern(cluster, intentName, pattern);
            if (match && match.confidence > 0.3) {
                matches.push({ intent: match, score: match.confidence });
            }
        }
        
        // Return the best match
        if (matches.length > 0) {
            matches.sort((a, b) => b.score - a.score);
            const bestMatch = matches[0].intent;
            
            // Enhance with stage detection
            bestMatch.stage = this.detectStage(cluster, bestMatch);
            bestMatch.suggestedActions = this.generateSuggestedActions(bestMatch);
            
            debug(`Detected intent: ${bestMatch.intent} (${bestMatch.confidence})`);
            return bestMatch;
        }
        
        return null;
    }

    /**
     * Match cluster against intent pattern
     */
    private matchPattern(
        cluster: ActivityCluster, 
        intentName: string, 
        pattern: IntentPattern
    ): UserIntent | null {
        let confidence = 0;
        const evidence = {
            topics: [] as string[],
            entities: [] as string[],
            domains: [] as string[],
            timespan: this.calculateTimespan(cluster),
            visitCount: cluster.visitCount
        };

        // Check topic matches
        const topicMatches = cluster.topics.filter(topic => 
            pattern.topics.some(pt => 
                topic.toLowerCase().includes(pt.toLowerCase()) ||
                pt.toLowerCase().includes(topic.toLowerCase())
            )
        );
        evidence.topics = topicMatches;
        confidence += (topicMatches.length / pattern.topics.length) * pattern.topicWeight;

        // Check entity matches  
        const entityMatches = cluster.entities.filter(entity =>
            pattern.entities.some(pe => 
                entity.toLowerCase().includes(pe.toLowerCase()) ||
                pe.toLowerCase().includes(entity.toLowerCase())
            )
        );
        evidence.entities = entityMatches;
        confidence += (entityMatches.length / Math.max(1, pattern.entities.length)) * pattern.entityWeight;

        // Check domain matches
        const domainMatches = cluster.domains.filter(domain =>
            pattern.domains.some(pd => domain.includes(pd))
        );
        evidence.domains = domainMatches;
        confidence += (domainMatches.length / Math.max(1, pattern.domains.length)) * pattern.domainWeight;

        // Apply intensity bonus
        if (cluster.intensity > pattern.minIntensity) {
            confidence += pattern.intensityBonus;
        }

        // Apply duration filter
        if (evidence.timespan < pattern.minDuration || evidence.timespan > pattern.maxDuration) {
            confidence *= 0.5; // Reduce confidence for wrong duration
        }

        // Minimum confidence threshold
        if (confidence < 0.3) {
            return null;
        }

        return {
            intent: intentName,
            confidence: Math.min(0.95, confidence),
            supportingEvidence: evidence
        };
    }

    /**
     * Detect the current stage of the intent
     */
    private detectStage(cluster: ActivityCluster, intent: UserIntent): IntentStage {
        const topics = cluster.topics.map(t => t.toLowerCase());
        const domains = cluster.domains;
        
        // Discovery stage indicators
        const discoveryTerms = ["what is", "introduction", "overview", "basics", "guide"];
        if (topics.some(t => discoveryTerms.some(dt => t.includes(dt)))) {
            return IntentStage.DISCOVERY;
        }
        
        // Research stage indicators
        const researchTerms = ["review", "specs", "features", "comparison", "detailed"];
        if (topics.some(t => researchTerms.some(rt => t.includes(rt)))) {
            return IntentStage.RESEARCH;
        }
        
        // Comparison stage indicators
        const comparisonTerms = ["vs", "versus", "compare", "best", "top", "alternatives"];
        const hasComparisonTerms = topics.some(t => comparisonTerms.some(ct => t.includes(ct)));
        const hasMultipleBrands = this.hasMultipleBrands(cluster.entities);
        if (hasComparisonTerms || hasMultipleBrands) {
            return IntentStage.COMPARISON;
        }
        
        // Decision stage indicators
        const decisionTerms = ["buy", "purchase", "price", "deal", "order", "checkout"];
        const hasEcommerceDomains = domains.some(d => 
            ["amazon", "ebay", "shop", "store", "buy"].some(ed => d.includes(ed))
        );
        if (topics.some(t => decisionTerms.some(dt => t.includes(dt))) || hasEcommerceDomains) {
            return IntentStage.DECISION;
        }
        
        // Default to research if we can't determine
        return IntentStage.RESEARCH;
    }

    /**
     * Generate suggested actions based on intent and stage
     */
    private generateSuggestedActions(intent: UserIntent): string[] {
        const actions: string[] = [];
        
        switch (intent.intent) {
            case "Car Purchase Research":
                switch (intent.stage) {
                    case IntentStage.DISCOVERY:
                        actions.push("Research car categories and types");
                        actions.push("Set budget parameters");
                        break;
                    case IntentStage.RESEARCH:
                        actions.push("Compare specific models");
                        actions.push("Read professional reviews");
                        break;
                    case IntentStage.COMPARISON:
                        actions.push("Create comparison spreadsheet");
                        actions.push("Visit dealerships for test drives");
                        break;
                    case IntentStage.DECISION:
                        actions.push("Get financing quotes");
                        actions.push("Negotiate with dealers");
                        break;
                }
                break;
                
            case "Travel Planning":
                switch (intent.stage) {
                    case IntentStage.DISCOVERY:
                        actions.push("Research destinations");
                        actions.push("Set travel dates and budget");
                        break;
                    case IntentStage.RESEARCH:
                        actions.push("Look into accommodations");
                        actions.push("Research activities and attractions");
                        break;
                    case IntentStage.COMPARISON:
                        actions.push("Compare flight prices");
                        actions.push("Compare hotel options");
                        break;
                    case IntentStage.DECISION:
                        actions.push("Book flights and accommodation");
                        actions.push("Create detailed itinerary");
                        break;
                }
                break;
                
            case "Technology Research":
                actions.push("Read technical documentation");
                actions.push("Check compatibility requirements");
                actions.push("Look for tutorials and examples");
                break;
                
            case "Home Improvement":
                actions.push("Get project cost estimates");
                actions.push("Research contractors and reviews");
                actions.push("Create project timeline");
                break;
        }
        
        return actions;
    }

    /**
     * Check if entities contain multiple brands (indicating comparison)
     */
    private hasMultipleBrands(entities: string[]): boolean {
        const commonBrands = [
            // Car brands
            "toyota", "honda", "ford", "tesla", "bmw", "mercedes", "audi", "lexus",
            // Tech brands  
            "apple", "google", "microsoft", "amazon", "facebook", "netflix",
            // General brands
            "samsung", "lg", "sony", "panasonic", "dell", "hp"
        ];
        
        const brandMatches = entities.filter(entity =>
            commonBrands.some(brand => 
                entity.toLowerCase().includes(brand)
            )
        );
        
        return brandMatches.length > 1;
    }

    /**
     * Calculate timespan in days
     */
    private calculateTimespan(cluster: ActivityCluster): number {
        return (cluster.timeRange.end.getTime() - cluster.timeRange.start.getTime()) / (1000 * 60 * 60 * 24);
    }

    /**
     * Initialize predefined intent patterns
     */
    private initializeIntentPatterns(): void {
        // Car Purchase Research
        this.intentPatterns.set("Car Purchase Research", {
            topics: ["car", "auto", "vehicle", "suv", "sedan", "truck", "mpg", "review", "price"],
            entities: ["toyota", "honda", "ford", "tesla", "bmw", "mercedes"],
            domains: ["cars.com", "autotrader", "edmunds", "carmax", "kelley"],
            topicWeight: 0.4,
            entityWeight: 0.3,
            domainWeight: 0.3,
            intensityBonus: 0.1,
            minIntensity: 0.2,
            minDuration: 1,
            maxDuration: 90
        });

        // Travel Planning
        this.intentPatterns.set("Travel Planning", {
            topics: ["travel", "flight", "hotel", "vacation", "trip", "destination", "booking"],
            entities: ["paris", "london", "tokyo", "new york", "california"],
            domains: ["booking.com", "expedia", "airbnb", "tripadvisor", "kayak"],
            topicWeight: 0.4,
            entityWeight: 0.2,
            domainWeight: 0.4,
            intensityBonus: 0.1,
            minIntensity: 0.3,
            minDuration: 1,
            maxDuration: 180
        });

        // Technology Research  
        this.intentPatterns.set("Technology Research", {
            topics: ["software", "programming", "code", "api", "tutorial", "documentation"],
            entities: ["javascript", "python", "react", "node", "aws", "docker"],
            domains: ["github.com", "stackoverflow", "docs", "developer"],
            topicWeight: 0.5,
            entityWeight: 0.3,
            domainWeight: 0.2,
            intensityBonus: 0.05,
            minIntensity: 0.1,
            minDuration: 0.5,
            maxDuration: 365
        });

        // Home Improvement
        this.intentPatterns.set("Home Improvement", {
            topics: ["renovation", "remodel", "diy", "home", "kitchen", "bathroom", "paint"],
            entities: ["home depot", "lowes", "ikea", "contractor"],
            domains: ["homedepot", "lowes", "wayfair", "pinterest"],
            topicWeight: 0.4,
            entityWeight: 0.2,
            domainWeight: 0.4,
            intensityBonus: 0.1,
            minIntensity: 0.2,
            minDuration: 2,
            maxDuration: 365
        });

        // Shopping Research
        this.intentPatterns.set("Shopping Research", {
            topics: ["buy", "purchase", "review", "price", "deal", "compare", "best"],
            entities: ["amazon", "target", "walmart", "bestbuy"],
            domains: ["amazon", "ebay", "target", "walmart", "bestbuy"],
            topicWeight: 0.3,
            entityWeight: 0.2,
            domainWeight: 0.5,
            intensityBonus: 0.1,
            minIntensity: 0.2,
            minDuration: 0.5,
            maxDuration: 30
        });

        // Health & Fitness
        this.intentPatterns.set("Health & Fitness Research", {
            topics: ["health", "fitness", "diet", "exercise", "nutrition", "workout"],
            entities: ["gym", "yoga", "protein", "vitamins"],
            domains: ["webmd", "healthline", "mayo", "fitness"],
            topicWeight: 0.5,
            entityWeight: 0.2,
            domainWeight: 0.3,
            intensityBonus: 0.05,
            minIntensity: 0.1,
            minDuration: 1,
            maxDuration: 365
        });
    }
}

interface IntentPattern {
    topics: string[];
    entities: string[];
    domains: string[];
    topicWeight: number;
    entityWeight: number;
    domainWeight: number;
    intensityBonus: number;
    minIntensity: number;
    minDuration: number;  // days
    maxDuration: number;  // days
}