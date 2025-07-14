// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

export interface KnowledgeExtractionResult {
    entities: Entity[];
    relationships: Relationship[];
    keyTopics: string[];
    suggestedQuestions: string[];
    summary: string;
}

export interface EnhancedKnowledgeExtractionResult
    extends KnowledgeExtractionResult {
    // Actions are no longer part of knowledge extraction
    contentMetrics: {
        readingTime: number;
        wordCount: number;
    };
}

// Action-related interfaces removed as part of knowledge extraction simplification

export interface Entity {
    name: string;
    type: string;
    description?: string;
    confidence: number;
}

export interface Relationship {
    from: string;
    relationship: string;
    to: string;
    confidence: number;
}

export interface KnowledgeQueryResponse {
    answer: string;
    sources: WebPageReference[];
    relatedEntities: Entity[];
}

export interface EnhancedQueryRequest {
    query: string;
    url?: string;
    searchScope: "current_page" | "all_indexed" | "domain" | "topic";
    filters?: {
        domain?: string;
        timeRange?: "week" | "month" | "quarter" | "year";
    };
    maxResults?: number;
}

export interface EnhancedQueryResponse extends KnowledgeQueryResponse {
    metadata: {
        totalFound: number;
        searchScope: string;
        filtersApplied: string[];
        suggestions: QuerySuggestion[];
        processingTime: number;
        temporalQuery?:
            | {
                  timeframe: string;
                  queryType: string;
                  extractedTimeTerms: string[];
              }
            | undefined;
    };
    relationships?: any[];
    temporalPatterns?: TemporalPattern[];
}

export interface TemporalPattern {
    type:
        | "learning_sequence"
        | "topic_progression"
        | "domain_exploration"
        | "content_evolution";
    timespan: string;
    items: TemporalPatternItem[];
    confidence: number;
    description: string;
}

export interface TemporalPatternItem {
    url: string;
    title: string;
    visitDate: string;
    contentType: string;
    topics: string[];
    domain: string;
}

export interface QuerySuggestion {
    type: "refinement" | "expansion" | "related" | "temporal";
    query: string;
    explanation: string;
    filters?: any;
}

export interface WebPageReference {
    url: string;
    title: string;
    relevanceScore: number;
    lastIndexed: string;
}
