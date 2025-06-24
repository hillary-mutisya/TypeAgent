// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { ActionContext, TypeAgentAction } from "@typeagent/agent-sdk";
import { createActionResult } from "@typeagent/agent-sdk/helpers/action";
import {
    ImportWebsiteData,
    SearchWebsites,
    GetWebsiteStats,
} from "./actionsSchema.mjs";
import * as website from "website-memory";
import * as kp from "knowpro";
import registerDebug from "debug";
import { openai as ai } from "aiclient";
import { 
    createJsonTranslator,
    TypeChatJsonTranslator,
    TypeChatLanguageModel,
} from "typechat";
import { createTypeScriptJsonValidator } from "typechat/ts";

export interface BrowserActionContext {
    browserControl?: any | undefined;
    webSocket?: any | undefined;
    webAgentChannels?: any | undefined;
    crossWordState?: any | undefined;
    browserConnector?: any | undefined;
    browserProcess?: any | undefined;
    tabTitleIndex?: any | undefined;
    allowDynamicAgentDomains?: string[];
    websiteCollection?: website.WebsiteCollection | undefined;
    fuzzyMatchingModel?: any | undefined;
    index: website.IndexData | undefined;
}

const debug = registerDebug("typeagent:browser:website-memory");

// Temporal context interface for LLM-based temporal intent extraction
interface TemporalContext {
    intent: 'recent' | 'earliest' | 'none';
    confidence: number;
    cleanedQuery: string;
    temporalKeywords: string[];
    reasoning?: string;
}

// TypeScript schema for LLM temporal analysis
const temporalAnalysisSchema = `
interface TemporalAnalysis {
    intent: 'recent' | 'earliest' | 'none';
    confidence: number;
    cleanedQuery: string;
    temporalKeywords: string[];
    reasoning?: string;
}`;

// Lazy-initialized LLM model for temporal analysis
let temporalAnalysisModel: TypeChatLanguageModel | undefined;
let temporalAnalysisTranslator: TypeChatJsonTranslator<TemporalContext> | undefined;

function getTemporalAnalysisModel(): TypeChatLanguageModel {
    if (!temporalAnalysisModel) {
        const apiSettings = ai.azureApiSettingsFromEnv(
            ai.ModelType.Chat,
            undefined,
            "gpt-4o-mini" // Use faster model for temporal analysis
        );
        temporalAnalysisModel = ai.createChatModel(
            apiSettings, 
            undefined, 
            undefined, 
            ["temporalAnalysis"]
        );
    }
    return temporalAnalysisModel;
}

function getTemporalAnalysisTranslator(): TypeChatJsonTranslator<TemporalContext> {
    if (!temporalAnalysisTranslator) {
        const validator = createTypeScriptJsonValidator<TemporalContext>(
            temporalAnalysisSchema,
            "TemporalAnalysis"
        );
        temporalAnalysisTranslator = createJsonTranslator(getTemporalAnalysisModel(), validator);
        
        // Custom prompt for temporal analysis
        temporalAnalysisTranslator.createRequestPrompt = (input: string) => {
            return `Analyze this search query for temporal intent related to browsing history or bookmarks:

Query: "${input}"

Determine:
1. Temporal intent: 'recent' (for newest/latest items), 'earliest' (for oldest/first items), or 'none'
2. Confidence: 0.0-1.0 (how certain you are about the temporal intent)
3. Cleaned query: Remove temporal keywords but keep the core search terms
4. Temporal keywords: List the words that indicated temporal intent
5. Reasoning: Brief explanation of your analysis

Temporal indicators:
- Recent/Latest: "most recent", "latest", "newest", "last", "recent", "final", "current", "new"
- Earliest/First: "first", "earliest", "oldest", "initial", "original", "beginning"

Examples:
- "most recent github repo I bookmarked" → intent: "recent", confidence: 0.95, cleanedQuery: "github repo I bookmarked", temporalKeywords: ["most recent"]
- "first stackoverflow answer I saved" → intent: "earliest", confidence: 0.9, cleanedQuery: "stackoverflow answer I saved", temporalKeywords: ["first"]  
- "python documentation" → intent: "none", confidence: 0.95, cleanedQuery: "python documentation", temporalKeywords: []

Return only valid JSON.`;
        };
    }
    return temporalAnalysisTranslator;
}

/**
 * Extract temporal intent using LLM analysis with regex fallback
 */
export async function extractTemporalContextWithLLM(query: string): Promise<TemporalContext> {
    try {
        debug(`Analyzing temporal intent with LLM for query: "${query}"`);
        
        const translator = getTemporalAnalysisTranslator();
        const response = await translator.translate(query);
        
        if (response.success) {
            const result = response.data;
            debug(`LLM temporal analysis result: ${JSON.stringify(result)}`);
            
            // Validate and clamp confidence
            result.confidence = Math.max(0, Math.min(1, result.confidence || 0));
            
            // Ensure cleaned query is not empty
            if (!result.cleanedQuery || result.cleanedQuery.trim() === '') {
                result.cleanedQuery = query;
            }
            
            return result;
        } else {
            debug(`LLM temporal analysis failed: ${response.message}`);
            throw new Error(response.message);
        }
    } catch (error) {
        debug(`LLM temporal analysis error: ${error}, falling back to regex`);
        return detectTemporalIntentRegex(query);
    }
}

/**
 * Resolve URL using website visit history (bookmarks, browser history)
 * This provides a more personalized alternative to web search
 */
export async function resolveURLWithHistory(
    context: { agentContext: BrowserActionContext },
    site: string,
): Promise<string | undefined> {
    debug(`Attempting to resolve '${site}' using website visit history`);

    const websiteCollection = context.agentContext.websiteCollection;
    if (!websiteCollection || websiteCollection.messages.length === 0) {
        debug("No website collection available or empty");
        return undefined;
    }

    try {
        // Use knowpro searchConversationKnowledge for semantic search
        const matches = await kp.searchConversationKnowledge(
            websiteCollection,
            // search group
            {
                booleanOp: "or", // Use OR to be more permissive
                terms: siteQueryToSearchTerms(site),
            },
            // when filter
            {
                // No specific knowledge type filter - search across all types
            },
            // options
            {
                exactMatch: false, // Allow fuzzy matching
            },
        );

        if (!matches || matches.size === 0) {
            debug(`No semantic matches found in history for query: '${site}'`);
            return undefined;
        }

        debug(`Found ${matches.size} semantic matches for: '${site}'`);

        const candidates: { url: string; score: number; metadata: any }[] = [];
        const processedMessages = new Set<number>();

        matches.forEach((match: kp.SemanticRefSearchResult) => {
            match.semanticRefMatches.forEach(
                (refMatch: kp.ScoredSemanticRefOrdinal) => {
                    if (refMatch.score >= 0.3) {
                        // Lower threshold for broader matching
                        const semanticRef: kp.SemanticRef | undefined =
                            websiteCollection.semanticRefs.get(
                                refMatch.semanticRefOrdinal,
                            );
                        if (semanticRef) {
                            const messageOrdinal =
                                semanticRef.range.start.messageOrdinal;
                            if (
                                messageOrdinal !== undefined &&
                                !processedMessages.has(messageOrdinal)
                            ) {
                                processedMessages.add(messageOrdinal);

                                const website =
                                    websiteCollection.messages.get(
                                        messageOrdinal,
                                    );
                                if (website && website.metadata) {
                                    const metadata = website.metadata;
                                    let totalScore = refMatch.score;

                                    // Apply additional scoring based on special patterns and recency
                                    totalScore += calculateWebsiteScore(
                                        [site],
                                        metadata,
                                        undefined, // No temporal intent for URL resolution
                                    );

                                    candidates.push({
                                        url: metadata.url,
                                        score: totalScore,
                                        metadata: metadata,
                                    });
                                }
                            }
                        }
                    }
                },
            );
        });

        if (candidates.length === 0) {
            debug(`No qualifying candidates found for query: '${site}'`);
            return undefined;
        }

        // Sort by total score (highest first) and remove duplicates
        const uniqueCandidates = new Map<
            string,
            { url: string; score: number; metadata: any }
        >();
        candidates.forEach((candidate) => {
            const existing = uniqueCandidates.get(candidate.url);
            if (!existing || candidate.score > existing.score) {
                uniqueCandidates.set(candidate.url, candidate);
            }
        });

        const sortedCandidates = Array.from(uniqueCandidates.values()).sort(
            (a, b) => b.score - a.score,
        );

        const bestMatch = sortedCandidates[0];

        debug(
            `Found best match from history (score: ${bestMatch.score.toFixed(2)}): '${bestMatch.metadata.title || bestMatch.url}' -> ${bestMatch.url}`,
        );
        debug(
            `Match details: domain=${bestMatch.metadata.domain}, source=${bestMatch.metadata.websiteSource}`,
        );

        return bestMatch.url;
    } catch (error) {
        debug(`Error searching website history: ${error}`);
        return undefined;
    }
}

/**
 * Convert site query to knowpro search terms
 */
function siteQueryToSearchTerms(site: string): any[] {
    const terms: any[] = [];
    const siteQuery = site.toLowerCase().trim();

    // Add the main query as a search term
    terms.push({ term: { text: siteQuery } });

    // Add individual words if it's a multi-word query
    const words = siteQuery.split(/\s+/).filter((word) => word.length > 2);
    words.forEach((word) => {
        if (word !== siteQuery) {
            terms.push({ term: { text: word } });
        }
    });

    return terms;
}

/**
 * Get timestamp from website for temporal sorting
 */
function getWebsiteTimestamp(website: website.Website): Date | null {
    const metadata = website.metadata;
    const timestampStr = metadata.visitDate || metadata.bookmarkDate;
    if (timestampStr) {
        try {
            return new Date(timestampStr);
        } catch (error) {
            debug(`Error parsing timestamp: ${timestampStr}`);
            return null;
        }
    }
    return null;
}

/**
 * Fallback regex-based temporal intent detection (enhanced version)
 */
function detectTemporalIntentRegex(query: string): TemporalContext {
    const queryLower = query.toLowerCase();
    
    // Recent/latest indicators - expanded patterns
    const recentMatch = queryLower.match(/(most recent|latest|newest|last|recent|final|current|new)/);
    if (recentMatch) {
        return {
            intent: 'recent',
            confidence: 0.8,
            cleanedQuery: query.replace(new RegExp(recentMatch[0], 'gi'), '').trim(),
            temporalKeywords: [recentMatch[0]],
            reasoning: `Detected recent temporal keyword: "${recentMatch[0]}"`
        };
    }
    
    // Earliest/first indicators - expanded patterns  
    const earliestMatch = queryLower.match(/(first|earliest|oldest|initial|original|beginning)/);
    if (earliestMatch) {
        return {
            intent: 'earliest',
            confidence: 0.8,
            cleanedQuery: query.replace(new RegExp(earliestMatch[0], 'gi'), '').trim(),
            temporalKeywords: [earliestMatch[0]],
            reasoning: `Detected earliest temporal keyword: "${earliestMatch[0]}"`
        };
    }
    
    return {
        intent: 'none',
        confidence: 0.9,
        cleanedQuery: query,
        temporalKeywords: [],
        reasoning: 'No temporal keywords detected'
    };
}

/**
 * Detect temporal intent from search query (Legacy function - now calls LLM version)
 */
function detectTemporalIntent(searchFilters: string[]): 'recent' | 'earliest' | 'none' {
    const combined = searchFilters.join(' ');
    const context = detectTemporalIntentRegex(combined);
    return context.intent;
}

/**
 * Calculate temporal score based on intent
 */
function calculateTemporalScore(metadata: any, intent: 'recent' | 'earliest' | 'none'): number {
    if (intent === 'none' || !(metadata.visitDate || metadata.bookmarkDate)) {
        return 0;
    }
    
    const visitDate = new Date(metadata.visitDate || metadata.bookmarkDate);
    const daysSinceVisit = (Date.now() - visitDate.getTime()) / (1000 * 60 * 60 * 24);
    
    if (intent === 'recent') {
        // Favor newer items
        if (daysSinceVisit < 7) return 2.0;
        if (daysSinceVisit < 30) return 1.5;
        if (daysSinceVisit < 365) return 1.0;
        return 0.5;
    } else if (intent === 'earliest') {
        // Favor older items
        if (daysSinceVisit > 365 * 5) return 2.0;  // 5+ years old
        if (daysSinceVisit > 365 * 2) return 1.5;  // 2+ years old
        if (daysSinceVisit > 365) return 1.0;      // 1+ year old
        return 0.5;
    }
    
    return 0;
}

/**
 * Calculate additional scoring based on website metadata
 */
export function calculateWebsiteScore(
    searchFilters: string[],
    metadata: any,
    temporalIntent?: 'recent' | 'earliest' | 'none'
): number {
    let score = 0;

    const title = metadata.title?.toLowerCase() || "";
    const domain = metadata.domain?.toLowerCase() || "";
    const url = metadata.url.toLowerCase();
    const folder = metadata.folder?.toLowerCase() || "";

    for (const filter of searchFilters) {
        const queryLower = filter.toLowerCase();

        // Direct domain matches get highest boost
        if (
            domain === queryLower ||
            domain === `www.${queryLower}` ||
            domain.endsWith(`.${queryLower}`)
        ) {
            score += 3.0;
        } else if (domain.includes(queryLower)) {
            score += 2.0;
        }

        if (title.includes(queryLower)) {
            score += 1.5;
        }

        if (url.includes(queryLower)) {
            score += 1.0;
        }

        if (
            metadata.websiteSource === "bookmark" &&
            folder.includes(queryLower)
        ) {
            score += 1.0;
        }

        // Temporal scoring based on intent
        if (temporalIntent && temporalIntent !== 'none') {
            score += calculateTemporalScore(metadata, temporalIntent);
        } else {
            // Default recency bonus when no temporal intent
            if (metadata.visitDate || metadata.bookmarkDate) {
                const visitDate = new Date(
                    metadata.visitDate || metadata.bookmarkDate,
                );
                const daysSinceVisit =
                    (Date.now() - visitDate.getTime()) / (1000 * 60 * 60 * 24);
                if (daysSinceVisit < 7) score += 0.5;
                else if (daysSinceVisit < 30) score += 0.3;
            }
        }

        // Frequency bonus
        if (metadata.visitCount && metadata.visitCount > 5) {
            score += Math.min(metadata.visitCount / 20, 0.5);
        }
    }

    return score;
}

/**
 * Find websites matching search criteria using knowpro search utilities
 */
export async function findRequestedWebsites(
    searchFilters: string[],
    context: BrowserActionContext,
    exactMatch: boolean = false,
    minScore: number = 0.5,
    temporalIntent: 'recent' | 'earliest' | 'none' = "none"
): Promise<website.Website[]> {
    if (
        !context.websiteCollection ||
        context.websiteCollection.messages.length === 0
    ) {
        return [];
    }

    try {
        debug(`Provided temporal intent: ${temporalIntent} for filters: ${searchFilters.join(', ')}`);

        const matches = await kp.searchConversationKnowledge(
            context.websiteCollection,
            // search group
            {
                booleanOp: "or", // Use OR to match any of the search filters
                terms: searchFiltersToSearchTerms(searchFilters),
            },
            // when filter
            {
                // No specific knowledge type filter - search across all types
            },
            // options
            {
                exactMatch: exactMatch,
            },
        );

        if (!matches || matches.size === 0) {
            debug(
                `No semantic matches found for search filters: ${searchFilters.join(", ")}`,
            );
            return [];
        }

        debug(
            `Found ${matches.size} semantic matches for search filters: ${searchFilters.join(", ")}`,
        );

        const results: { website: website.Website; score: number }[] = [];
        const processedMessages = new Set<number>();

        matches.forEach((match: kp.SemanticRefSearchResult) => {
            match.semanticRefMatches.forEach(
                (refMatch: kp.ScoredSemanticRefOrdinal) => {
                    if (refMatch.score >= minScore) {
                        const semanticRef: kp.SemanticRef | undefined =
                            context.websiteCollection!.semanticRefs.get(
                                refMatch.semanticRefOrdinal,
                            );
                        if (semanticRef) {
                            const messageOrdinal =
                                semanticRef.range.start.messageOrdinal;
                            if (
                                messageOrdinal !== undefined &&
                                !processedMessages.has(messageOrdinal)
                            ) {
                                processedMessages.add(messageOrdinal);

                                const websiteData =
                                    context.websiteCollection!.messages.get(
                                        messageOrdinal,
                                    );
                                if (websiteData) {
                                    let totalScore = refMatch.score;

                                    // Apply additional scoring based on metadata matches
                                    totalScore += calculateWebsiteScore(
                                        searchFilters,
                                        websiteData.metadata,
                                        temporalIntent,
                                    );

                                    results.push({
                                        website: websiteData,
                                        score: totalScore,
                                    });
                                }
                            }
                        }
                    }
                },
            );
        });

        // Sort by score (highest first) and remove duplicates
        const uniqueResults = new Map<
            string,
            { website: website.Website; score: number }
        >();
        results.forEach((result) => {
            const url = result.website.metadata.url;
            const existing = uniqueResults.get(url);
            if (!existing || result.score > existing.score) {
                uniqueResults.set(url, result);
            }
        });

        let sortedResults = Array.from(uniqueResults.values());

        // Apply temporal sorting when temporal intent is detected
        if (temporalIntent !== 'none') {
            debug(`Applying temporal sorting for intent: ${temporalIntent}`);
            sortedResults.sort((a, b) => {
                const aDate = getWebsiteTimestamp(a.website);
                const bDate = getWebsiteTimestamp(b.website);
                
                // Debug logging for temporal sorting
                debug(`Comparing timestamps: ${a.website.metadata.url} (${aDate?.toISOString()}) vs ${b.website.metadata.url} (${bDate?.toISOString()})`);
                
                if (!aDate && !bDate) {
                    // If neither has a date, fall back to score sorting
                    return b.score - a.score;
                } else if (!aDate) {
                    // Items without dates go to the end
                    return 1;
                } else if (!bDate) {
                    // Items without dates go to the end
                    return -1;
                } else {
                    // Both have dates, sort by temporal intent
                    if (temporalIntent === 'recent') {
                        // Most recent first (newer dates first)
                        return bDate.getTime() - aDate.getTime();
                    } else if (temporalIntent === 'earliest') {
                        // Earliest first (older dates first)
                        return aDate.getTime() - bDate.getTime();
                    }
                }
                
                // Fallback to score sorting
                return b.score - a.score;
            });
            
            debug(`After temporal sorting (${temporalIntent}), first result: ${sortedResults[0]?.website.metadata.url} (${getWebsiteTimestamp(sortedResults[0]?.website)?.toISOString()})`);
        } else {
            // Default score-based sorting when no temporal intent
            sortedResults.sort((a, b) => b.score - a.score);
        }

    return sortedResults.map((r) => r.website);

    } catch (error) {
        debug(`Error in legacy website search: ${error}`);
        return [];
    }
}
/**
 * Apply temporal sorting to results
 */
function applyTemporalSorting(
    results: { website: website.Website; score: number }[],
    intent: 'recent' | 'earliest'
): { website: website.Website; score: number }[] {
    return results.sort((a, b) => {
        const aDate = getWebsiteTimestamp(a.website);
        const bDate = getWebsiteTimestamp(b.website);
        
        // Debug logging for temporal sorting
        debug(`Comparing timestamps: ${a.website.metadata.url} (${aDate?.toISOString()}) vs ${b.website.metadata.url} (${bDate?.toISOString()})`);
        
        if (!aDate && !bDate) {
            return b.score - a.score; // Fallback to score
        } else if (!aDate) {
            return 1; // Items without dates go to end
        } else if (!bDate) {
            return -1; // Items without dates go to end
        } else {
            if (intent === 'recent') {
                return bDate.getTime() - aDate.getTime(); // Newest first
            } else {
                return aDate.getTime() - bDate.getTime(); // Oldest first
            }
        }
    });
}

/**
 * Legacy version of findRequestedWebsites (fallback when LLM fails)
 */
export async function findRequestedWebsitesLegacy(
    searchFilters: string[],
    context: BrowserActionContext,
    exactMatch: boolean = false,
    minScore: number = 0.5,
): Promise<website.Website[]> {
    if (
        !context.websiteCollection ||
        context.websiteCollection.messages.length === 0
    ) {
        return [];
    }

    try {
        // Detect temporal intent from search filters
        const temporalIntent = detectTemporalIntent(searchFilters);
        debug(`Legacy temporal intent detection: ${temporalIntent} for filters: ${searchFilters.join(', ')}`);

        const matches = await kp.searchConversationKnowledge(
            context.websiteCollection,
            {
                booleanOp: "or",
                terms: searchFiltersToSearchTerms(searchFilters),
            },
            {},
            { exactMatch }
        );

        if (!matches || matches.size === 0) {
            return [];
        }

        const results: { website: website.Website; score: number }[] = [];
        const processedMessages = new Set<number>();

        matches.forEach((match: kp.SemanticRefSearchResult) => {
            match.semanticRefMatches.forEach(
                (refMatch: kp.ScoredSemanticRefOrdinal) => {
                    if (refMatch.score >= minScore) {
                        const semanticRef: kp.SemanticRef | undefined =
                            context.websiteCollection!.semanticRefs.get(
                                refMatch.semanticRefOrdinal,
                            );
                        if (semanticRef) {
                            const messageOrdinal =
                                semanticRef.range.start.messageOrdinal;
                            if (
                                messageOrdinal !== undefined &&
                                !processedMessages.has(messageOrdinal)
                            ) {
                                processedMessages.add(messageOrdinal);

                                const websiteData =
                                    context.websiteCollection!.messages.get(
                                        messageOrdinal,
                                    );
                                if (websiteData) {
                                    let totalScore = refMatch.score;
                                    totalScore += calculateWebsiteScore(
                                        searchFilters,
                                        websiteData.metadata,
                                        temporalIntent,
                                    );

                                    results.push({
                                        website: websiteData,
                                        score: totalScore,
                                    });
                                }
                            }
                        }
                    }
                },
            );
        });

        // Remove duplicates
        const uniqueResults = new Map<
            string,
            { website: website.Website; score: number }
        >();
        results.forEach((result) => {
            const url = result.website.metadata.url;
            const existing = uniqueResults.get(url);
            if (!existing || result.score > existing.score) {
                uniqueResults.set(url, result);
            }
        });

        let sortedResults = Array.from(uniqueResults.values());

        // Apply temporal sorting when temporal intent is detected
        if (temporalIntent !== 'none') {
            debug(`Applying legacy temporal sorting for intent: ${temporalIntent}`);
            sortedResults = applyTemporalSorting(sortedResults, temporalIntent);
        } else {
            sortedResults.sort((a, b) => b.score - a.score);
        }

        debug(`Legacy method returning ${sortedResults.length} results`);
        return sortedResults.map((r) => r.website);

    } catch (error) {
        debug(`Error in legacy website search: ${error}`);
        return [];
    }
}

/**
 * Convert search filters to knowpro search terms
 */
function searchFiltersToSearchTerms(filters: string[]): any[] {
    const terms: any[] = [];

    filters.forEach((filter) => {
        // Add the main filter as a search term
        terms.push({ term: { text: filter } });

        // Add individual words if it's a multi-word filter
        const words = filter
            .toLowerCase()
            .split(/\s+/)
            .filter((word) => word.length > 2);
        words.forEach((word) => {
            if (word !== filter.toLowerCase()) {
                terms.push({ term: { text: word } });
            }
        });
    });

    return terms;
}

/**
 * Import website data from browser history or bookmarks
 */
export async function importWebsiteData(
    context: ActionContext<BrowserActionContext>,
    action: TypeAgentAction<ImportWebsiteData>,
) {
    try {
        context.actionIO.setDisplay("Importing website data...");

        const { source, type, limit, days, folder } = action.parameters;
        const defaultPaths = website.getDefaultBrowserPaths();

        let filePath: string;
        if (source === "chrome") {
            filePath =
                type === "bookmarks"
                    ? defaultPaths.chrome.bookmarks
                    : defaultPaths.chrome.history;
        } else {
            filePath =
                type === "bookmarks"
                    ? defaultPaths.edge.bookmarks
                    : defaultPaths.edge.history;
        }

        const progressCallback = (
            current: number,
            total: number,
            item: string,
        ) => {
            if (current % 100 === 0) {
                // Update every 100 items
                context.actionIO.setDisplay(
                    `Importing... ${current}/${total}: ${item.substring(0, 50)}...`,
                );
            }
        };

        // Build options object with only defined values
        const importOptions: any = {};
        if (limit !== undefined) importOptions.limit = limit;
        if (days !== undefined) importOptions.days = days;
        if (folder !== undefined) importOptions.folder = folder;

        const websites = await website.importWebsites(
            source,
            type,
            filePath,
            importOptions,
            progressCallback,
        );

        if (!context.sessionContext.agentContext.websiteCollection) {
            context.sessionContext.agentContext.websiteCollection =
                new website.WebsiteCollection();
        }

        context.sessionContext.agentContext.websiteCollection.addWebsites(
            websites,
        );
        await context.sessionContext.agentContext.websiteCollection.buildIndex();

        // Ensure website index exists for persistence
        if (!context.sessionContext.agentContext.index) {
            // No website index exists, we need to create one
            debug("No website index found, creating default index for persistence");
            
            // Get available website indexes (should be empty, but check anyway)
            const existingIndexes = await context.sessionContext.indexes("website");
            if (existingIndexes.length === 0) {
                debug("Creating new website index for imported data");
                debug("Warning: No website index available. Data will be lost on restart.");
                debug("Please create a website index using '@index create website default default' command");
                
                const result = createActionResult(
                    `Successfully imported ${websites.length} ${type} from ${source}. WARNING: No website index exists - data will be lost on restart. Please create an index using '@index  create website default default' first.`,
                );
                return result;
            } else {
                // Use the first available index
                context.sessionContext.agentContext.index = existingIndexes[0];
            }
        }

        // Persist the updated website collection to disk
        if (context.sessionContext.agentContext.index?.path) {
            try {
                context.actionIO.setDisplay("Saving website index...");
                await context.sessionContext.agentContext.websiteCollection.writeToFile(
                    context.sessionContext.agentContext.index.path,
                    "index"
                );
                debug(`Saved website index to ${context.sessionContext.agentContext.index.path}`);
            } catch (saveError) {
                debug(`Warning: Failed to save website index: ${saveError}`);
                // Don't fail the import if save fails, just warn
            }
        } else {
            debug("Warning: No index path available, website collection not persisted");
        }

        const result = createActionResult(
            `Successfully imported ${websites.length} ${type} from ${source}.`,
        );
        return result;
    } catch (error: any) {
        return createActionResult(
            `Failed to import website data: ${error.message}`,
            true,
        );
    }
}

/**
 * Search through imported website data
 */
export async function searchWebsites(
    context: ActionContext<BrowserActionContext>,
    action: TypeAgentAction<SearchWebsites>,
) {
    try {
        const websiteCollection =
            context.sessionContext.agentContext.websiteCollection;
        if (!websiteCollection || websiteCollection.messages.length === 0) {
            return createActionResult(
                "No website data available. Please import website data first.",
                true,
            );
        }

        context.actionIO.setDisplay("Searching websites...");

        const {
            originalUserRequest,
            query,
            domain,
            temporalIntent,
            pageType,
            source,
            limit = 10,
            minScore = 0.5,
        } = action.parameters;

        debug(`Original request ${originalUserRequest}. LLM-provided query: ${query}`)

        // Build search filters
        const searchFilters = [originalUserRequest];
        if (domain) searchFilters.push(domain);
        if (pageType) searchFilters.push(pageType);

        // Use the improved search function
        let matchedWebsites = await findRequestedWebsites(
            searchFilters,
            context.sessionContext.agentContext,
            false,
            minScore,
            temporalIntent
        );

        // Apply additional filters
        if (source) {
            matchedWebsites = matchedWebsites.filter(
                (site) => site.metadata.websiteSource === source,
            );
        }

        // Limit results
        matchedWebsites = matchedWebsites.slice(0, limit);

        if (matchedWebsites.length === 0) {
            return createActionResult(
                "No websites found matching the search criteria.",
            );
        }

        const resultText = matchedWebsites
            .map((site, i) => {
                const metadata = site.metadata;
                return `${i + 1}. ${metadata.title || metadata.url}\n   URL: ${metadata.url}\n   Domain: ${metadata.domain} | Type: ${metadata.pageType} | Source: ${metadata.websiteSource}\n`;
            })
            .join("\n");

        return createActionResult(
            `Found ${matchedWebsites.length} websites:\n\n${resultText}`,
        );
    } catch (error: any) {
        return createActionResult(
            `Failed to search websites: ${error.message}`,
            true,
        );
    }
}

/**
 * Get statistics about imported website data
 */
export async function getWebsiteStats(
    context: ActionContext<BrowserActionContext>,
    action: TypeAgentAction<GetWebsiteStats>,
) {
    try {
        const websiteCollection =
            context.sessionContext.agentContext.websiteCollection;
        if (!websiteCollection || websiteCollection.messages.length === 0) {
            return createActionResult(
                "No website data available. Please import website data first.",
                true,
            );
        }

        const { groupBy = "domain", limit = 10 } = action.parameters || {};
        const websites = websiteCollection.messages.getAll();

        let stats: { [key: string]: number } = {};
        let totalCount = websites.length;

        for (const site of websites) {
            const metadata = site.metadata;
            let key: string;

            switch (groupBy) {
                case "domain":
                    key = metadata.domain || "unknown";
                    break;
                case "pageType":
                    key = metadata.pageType || "general";
                    break;
                case "source":
                    key = metadata.websiteSource;
                    break;
                default:
                    key = metadata.domain || "unknown";
            }

            stats[key] = (stats[key] || 0) + 1;
        }

        // Sort by count and limit
        const sortedStats = Object.entries(stats)
            .sort(([, a], [, b]) => b - a)
            .slice(0, limit);

        let resultText = `Website Statistics (Total: ${totalCount} sites)\n\n`;
        resultText += `Top ${groupBy}s:\n`;

        for (const [key, count] of sortedStats) {
            const percentage = ((count / totalCount) * 100).toFixed(1);
            resultText += `  ${key}: ${count} sites (${percentage}%)\n`;
        }

        // Add some additional stats
        if (groupBy !== "source") {
            const sourceCounts = { bookmark: 0, history: 0, reading_list: 0 };
            for (const site of websites) {
                sourceCounts[site.metadata.websiteSource]++;
            }
            resultText += `\nBy Source:\n`;
            for (const [source, count] of Object.entries(sourceCounts)) {
                if (count > 0) {
                    const percentage = ((count / totalCount) * 100).toFixed(1);
                    resultText += `  ${source}: ${count} sites (${percentage}%)\n`;
                }
            }
        }

        return createActionResult(resultText);
    } catch (error: any) {
        return createActionResult(
            `Failed to get website stats: ${error.message}`,
            true,
        );
    }
}
