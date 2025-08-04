// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { Website } from "website-memory";
import { TopicVector } from "./types.mjs";
import registerDebug from "debug";

const debug = registerDebug("typeagent:browser:trends:topicVector");

export class TopicVectorGenerator {
    private readonly stopWords = new Set([
        "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
        "of", "with", "by", "from", "up", "about", "into", "through", "during",
        "before", "after", "above", "below", "between", "under", "again",
        "further", "then", "once", "is", "are", "was", "were", "been", "be",
        "have", "has", "had", "do", "does", "did", "will", "would", "should",
        "could", "may", "might", "must", "can", "this", "that", "these", "those"
    ]);

    /**
     * Generate topic vectors from a collection of websites
     */
    async generateVectors(websites: Website[]): Promise<TopicVector[]> {
        debug(`Generating topic vectors for ${websites.length} websites`);
        
        const vectors: TopicVector[] = [];
        
        for (const website of websites) {
            try {
                const vector = this.generateVectorForWebsite(website);
                if (vector) {
                    vectors.push(vector);
                }
            } catch (error) {
                debug(`Failed to generate vector for ${website.metadata.url}:`, error);
            }
        }
        
        debug(`Generated ${vectors.length} topic vectors`);
        return vectors;
    }

    /**
     * Generate a topic vector for a single website
     */
    private generateVectorForWebsite(website: Website): TopicVector | null {
        const metadata = website.metadata;
        
        // Extract topics from various sources
        const topics = this.extractTopics(website);
        const entities = this.extractEntities(website);
        
        if (topics.length === 0 && entities.length === 0) {
            // Skip websites with no extractable content
            return null;
        }
        
        // Calculate weight based on visit count and recency
        const weight = this.calculateWeight(website);
        
        // Get timestamp (prefer visit date over bookmark date)
        const timestamp = metadata.visitDate 
            ? new Date(metadata.visitDate)
            : metadata.bookmarkDate 
                ? new Date(metadata.bookmarkDate)
                : new Date();
        
        return {
            topics,
            entities,
            domains: [metadata.domain || this.extractDomain(metadata.url)],
            urls: [metadata.url],
            weight,
            timestamp,
            pageTypes: metadata.pageType ? [metadata.pageType] : []
        };
    }

    /**
     * Extract topics from website knowledge and content
     */
    private extractTopics(website: Website): string[] {
        const topics = new Set<string>();
        
        // Add knowledge topics
        if (website.knowledge?.topics) {
            website.knowledge.topics.forEach(topic => {
                if (this.isValidTopic(topic)) {
                    topics.add(topic.toLowerCase());
                }
            });
        }
        
        // Add keywords from metadata
        if (website.metadata.keywords) {
            website.metadata.keywords.forEach(keyword => {
                if (this.isValidTopic(keyword)) {
                    topics.add(keyword.toLowerCase());
                }
            });
        }
        
        // Extract topics from title
        if (website.metadata.title) {
            const titleTopics = this.extractTopicsFromText(website.metadata.title);
            titleTopics.forEach(topic => topics.add(topic));
        }
        
        // Extract topics from description
        if (website.metadata.description) {
            const descTopics = this.extractTopicsFromText(website.metadata.description);
            descTopics.forEach(topic => topics.add(topic));
        }
        
        // Limit to top 20 topics
        return Array.from(topics).slice(0, 20);
    }

    /**
     * Extract entities from website knowledge
     */
    private extractEntities(website: Website): string[] {
        const entities = new Set<string>();
        
        if (website.knowledge?.entities) {
            website.knowledge.entities.forEach(entity => {
                // Add entity name
                entities.add(entity.name);
                
                // Add entity types as context
                if (entity.type) {
                    entity.type.forEach(type => {
                        if (type && type.length > 2) {
                            entities.add(type);
                        }
                    });
                }
            });
        }
        
        // Extract potential entities from structured data
        if (website.metadata.structuredData) {
            const structuredEntities = this.extractEntitiesFromStructuredData(
                website.metadata.structuredData
            );
            structuredEntities.forEach(entity => entities.add(entity));
        }
        
        // Limit to top 15 entities
        return Array.from(entities).slice(0, 15);
    }

    /**
     * Calculate weight based on visit patterns and recency
     */
    private calculateWeight(website: Website): number {
        let weight = 1.0;
        
        // Increase weight based on visit count
        if (website.metadata.visitCount) {
            weight += Math.log(website.metadata.visitCount) * 0.2;
        }
        
        // Increase weight for typed visits (direct navigation)
        if (website.metadata.typedCount) {
            weight += website.metadata.typedCount * 0.1;
        }
        
        // Apply recency factor
        const lastVisit = website.metadata.lastVisitTime || website.metadata.visitDate;
        if (lastVisit) {
            const daysSinceVisit = (Date.now() - new Date(lastVisit).getTime()) / (1000 * 60 * 60 * 24);
            const recencyFactor = Math.max(0.5, 1 - (daysSinceVisit / 90)); // Decay over 90 days
            weight *= recencyFactor;
        }
        
        // Boost weight for certain page types
        if (website.metadata.pageType) {
            const boostTypes = ["commerce", "documentation", "travel"];
            if (boostTypes.includes(website.metadata.pageType)) {
                weight *= 1.2;
            }
        }
        
        return Math.min(weight, 5.0); // Cap at 5.0
    }

    /**
     * Extract topics from free text
     */
    private extractTopicsFromText(text: string): string[] {
        const topics: string[] = [];
        
        // Basic tokenization and filtering
        const words = text.toLowerCase()
            .replace(/[^\w\s-]/g, ' ')
            .split(/\s+/)
            .filter(word => 
                word.length > 3 && 
                !this.stopWords.has(word) &&
                !word.match(/^\d+$/) // Not just numbers
            );
        
        // Look for multi-word phrases (bigrams)
        for (let i = 0; i < words.length - 1; i++) {
            const bigram = `${words[i]} ${words[i + 1]}`;
            if (this.isValidPhrase(bigram)) {
                topics.push(bigram);
            }
        }
        
        // Add significant single words
        words.forEach(word => {
            if (this.isSignificantWord(word)) {
                topics.push(word);
            }
        });
        
        return topics;
    }

    /**
     * Extract entities from structured data
     */
    private extractEntitiesFromStructuredData(structuredData: any): string[] {
        const entities: string[] = [];
        
        // Handle common structured data formats
        if (structuredData.name) {
            entities.push(structuredData.name);
        }
        
        if (structuredData.brand?.name) {
            entities.push(structuredData.brand.name);
        }
        
        if (structuredData.author?.name) {
            entities.push(structuredData.author.name);
        }
        
        if (structuredData.manufacturer) {
            entities.push(structuredData.manufacturer);
        }
        
        return entities.filter(e => e && e.length > 2);
    }

    /**
     * Check if a topic is valid
     */
    private isValidTopic(topic: string): boolean {
        return topic.length > 2 && 
               !this.stopWords.has(topic.toLowerCase()) &&
               !topic.match(/^\d+$/);
    }

    /**
     * Check if a phrase is valid
     */
    private isValidPhrase(phrase: string): boolean {
        const words = phrase.split(' ');
        return words.every(word => !this.stopWords.has(word)) &&
               phrase.length > 5 &&
               phrase.length < 50;
    }

    /**
     * Check if a word is significant enough to be a topic
     */
    private isSignificantWord(word: string): boolean {
        // Could be enhanced with TF-IDF or other scoring
        return word.length > 4 && 
               !word.match(/^(http|www|com|org|net)/) &&
               !this.stopWords.has(word);
    }

    /**
     * Extract domain from URL
     */
    private extractDomain(url: string): string {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname.replace(/^www\./, '');
        } catch {
            return url;
        }
    }
}