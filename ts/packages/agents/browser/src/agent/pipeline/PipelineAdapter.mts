// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Adapter layer to integrate the new pipeline system with existing htmlProcessor
 * Maintains backward compatibility while providing pipeline benefits internally
 */

import { 
    BrowserPipelineFactory, 
    convertProcessingOptionsToPipelineOptions,
    BrowserPipelineOptions 
} from './BrowserPipelineFactory.mjs';
import { WebsiteData, ProcessingOptions, FileMetadata } from '../htmlProcessor.mjs';
import { SessionContext } from '@typeagent/agent-sdk';
import { BrowserActionContext } from '../actionHandler.mjs';

/**
 * Pipeline-powered implementation of HTML processing
 * Replaces the monolithic processing with modular pipeline execution
 */
export class PipelineHtmlProcessor {
    
    /**
     * Process HTML content using the new pipeline system
     * Maintains compatibility with existing processHtmlContent function
     */
    static async processHtmlContent(
        html: string,
        sourceIdentifier: string,
        options: ProcessingOptions = {},
        fileMetadata?: FileMetadata,
        sessionContext?: SessionContext<BrowserActionContext>
    ): Promise<WebsiteData> {
        
        // Convert legacy options to pipeline options
        const pipelineOptions = convertProcessingOptionsToPipelineOptions(options);
        
        // Create appropriate pipeline
        const pipeline = BrowserPipelineFactory.createWebsiteImportPipeline(pipelineOptions);
        
        // Prepare input for pipeline
        const pipelineInput = {
            html,
            url: sourceIdentifier,
            title: fileMetadata?.filename,
            metadata: fileMetadata,
            source: fileMetadata ? 'file_import' : 'bookmark_import',
        };
        
        // Execute pipeline
        const result = await pipeline.execute(pipelineInput);
        
        if (!result.success) {
            throw new Error(`Pipeline processing failed: ${result.error?.message}`);
        }
        
        // Convert pipeline result to legacy WebsiteData format
        return this.convertPipelineResultToWebsiteData(
            result.data,
            sourceIdentifier,
            fileMetadata,
            options
        );
    }
    
    /**
     * Process live browser content using pipeline
     */
    static async processLiveBrowserContent(
        sessionContext: SessionContext<BrowserActionContext>,
        options: ProcessingOptions = {}
    ): Promise<WebsiteData> {
        
        const pipelineOptions: BrowserPipelineOptions = {
            ...convertProcessingOptionsToPipelineOptions(options),
            enableLiveDOM: true,
            enableScreenshots: false, // Can be enabled based on options
            enableDiscovery: options.mode === 'actions' || options.mode === 'full',
        };
        
        // Create live browser pipeline
        const pipeline = BrowserPipelineFactory.createLiveBrowserPipeline(
            sessionContext, 
            pipelineOptions
        );
        
        // Execute with browser context
        const result = await pipeline.execute({
            browserContext: sessionContext.agentContext,
        });
        
        if (!result.success) {
            throw new Error(`Live browser processing failed: ${result.error?.message}`);
        }
        
        // Convert result
        return this.convertPipelineResultToWebsiteData(
            result.data as any,
            (result.data as any)?.url || 'live-browser',
            undefined,
            options
        );
    }
    
    /**
     * Process batch of HTML files using pipeline
     */
    static async processHtmlBatch(
        htmlFiles: Array<{
            html: string;
            identifier: string;
            metadata?: FileMetadata;
        }>,
        options: ProcessingOptions = {},
        progressCallback?: (current: number, total: number, item: string) => void,
        sessionContext?: SessionContext<BrowserActionContext>
    ): Promise<WebsiteData[]> {
        
        const results: WebsiteData[] = [];
        const total = htmlFiles.length;
        
        // Create file import pipeline (optimized for batch processing)
        const pipelineOptions = convertProcessingOptionsToPipelineOptions(options);
        const pipeline = BrowserPipelineFactory.createFileImportPipeline(
            sessionContext, 
            pipelineOptions
        );
        
        for (let i = 0; i < htmlFiles.length; i++) {
            const file = htmlFiles[i];
            
            try {
                if (progressCallback && i % 5 === 0) {
                    progressCallback(i + 1, total, file.identifier);
                }
                
                // Prepare input
                const pipelineInput = {
                    html: file.html,
                    url: file.identifier,
                    title: file.metadata?.filename,
                    metadata: file.metadata,
                    source: 'file_import',
                };
                
                // Execute pipeline
                const result = await pipeline.execute(pipelineInput);
                
                if (result.success) {
                    const websiteData = this.convertPipelineResultToWebsiteData(
                        result.data,
                        file.identifier,
                        file.metadata,
                        options
                    );
                    results.push(websiteData);
                } else {
                    console.error(`Failed to process ${file.identifier}:`, result.error);
                }
                
            } catch (error) {
                console.error(`Failed to process ${file.identifier}:`, error);
            }
        }
        
        if (progressCallback) {
            progressCallback(total, total, 'Completed');
        }
        
        return results;
    }
    
    /**
     * Convert pipeline result to legacy WebsiteData format
     * Ensures backward compatibility with existing code
     */
    private static convertPipelineResultToWebsiteData(
        pipelineData: any,
        sourceIdentifier: string,
        fileMetadata?: FileMetadata,
        options: ProcessingOptions = {}
    ): WebsiteData {
        
        // Extract data from pipeline result
        const pageContent = pipelineData.pageContent || pipelineData;
        const knowledge = pipelineData.knowledge;
        const extractionResult = pipelineData.extractionResult;
        
        // Determine domain
        const domain = this.extractDomainFromUrl(sourceIdentifier);
        
        // Build WebsiteData object
        const websiteData: WebsiteData = {
            url: sourceIdentifier,
            title: pageContent.title || fileMetadata?.filename || 'Untitled',
            content: pageContent.mainContent || '',
            domain,
            metadata: {
                websiteSource: fileMetadata ? 'file_import' : 'bookmark_import',
                url: sourceIdentifier,
                title: pageContent.title || fileMetadata?.filename || 'Untitled',
                domain,
                pageType: this.determinePageType(pageContent, knowledge),
                importDate: new Date().toISOString(),
                lastModified: fileMetadata?.lastModified || new Date(),
                preserveStructure: true,
            },
            visitCount: 1,
            lastVisited: new Date(),
        };
        
        // Add file metadata if present
        if (fileMetadata) {
            websiteData.metadata.filename = fileMetadata.filename;
            websiteData.metadata.fileSize = fileMetadata.fileSize;
            websiteData.metadata.filePath = fileMetadata.filePath;
        }
        
        // Add extracted content details
        if (pageContent.links) {
            websiteData.metadata.links = pageContent.links.map((l: any) => 
                typeof l === 'string' ? l : l.href
            );
        }
        
        if (pageContent.images) {
            websiteData.metadata.images = pageContent.images;
        }
        
        // Add knowledge data if available
        if (knowledge) {
            websiteData.metadata.entitiesFound = knowledge.entities?.length || 0;
            websiteData.metadata.topicsFound = knowledge.topics?.length || 0;
            websiteData.metadata.actionsFound = knowledge.actions?.length || 0;
        }
        
        // Add extraction result for compatibility
        if (extractionResult) {
            websiteData.extractionResult = extractionResult;
        } else {
            // Create minimal extraction result for compatibility
            const qualityMetrics = knowledge ? {
                confidence: 0.5,
                entityCount: knowledge.entities?.length || 0,
                topicCount: knowledge.topics?.length || 0,
                actionCount: knowledge.actions?.length || 0,
                extractionTime: 0,
                knowledgeStrategy: 'basic' as const,
            } : {
                confidence: 0.1,
                entityCount: 0,
                topicCount: 0,
                actionCount: 0,
                extractionTime: 0,
                knowledgeStrategy: 'basic' as const,
            };
            
            websiteData.extractionResult = {
                pageContent,
                success: true,
                extractionTime: 0,
                extractionMode: options.mode || 'content',
                aiProcessingUsed: !!knowledge,
                knowledge,
                qualityMetrics,
                source: 'pipeline',
                timestamp: new Date().toISOString(),
                processingTime: 0,
            };
        }
        
        return websiteData;
    }
    
    /**
     * Extract domain from URL (helper function)
     */
    private static extractDomainFromUrl(url: string): string {
        if (url.startsWith('file://') || !url.includes('://')) {
            return 'local_files';
        }
        
        try {
            const urlObj = new URL(url);
            return urlObj.hostname || 'unknown';
        } catch {
            return 'local_files';
        }
    }
    
    /**
     * Determine page type from content and knowledge
     */
    private static determinePageType(pageContent: any, knowledge?: any): string {
        // Use knowledge if available
        if (knowledge?.topics && knowledge.topics.length > 0) {
            const topTopic = knowledge.topics[0];
            if (topTopic.name) {
                return topTopic.name.toLowerCase();
            }
        }
        
        // Fallback to content analysis
        const title = pageContent.title?.toLowerCase() || '';
        
        if (title.includes('blog') || title.includes('article')) {
            return 'article';
        }
        
        if (title.includes('documentation') || title.includes('docs')) {
            return 'documentation';
        }
        
        if (title.includes('product') || title.includes('shop')) {
            return 'product';
        }
        
        return 'document';
    }
}

/**
 * Backward compatibility wrapper - maintains exact same interface as original
 */
export async function processHtmlContentWithPipeline(
    html: string,
    sourceIdentifier: string,
    options: ProcessingOptions = {},
    fileMetadata?: FileMetadata,
): Promise<WebsiteData> {
    return PipelineHtmlProcessor.processHtmlContent(
        html,
        sourceIdentifier,
        options,
        fileMetadata
    );
}

/**
 * Backward compatibility wrapper for batch processing
 */
export async function processHtmlBatchWithPipeline(
    htmlFiles: Array<{
        html: string;
        identifier: string;
        metadata?: FileMetadata;
    }>,
    options: ProcessingOptions = {},
    progressCallback?: (current: number, total: number, item: string) => void,
): Promise<WebsiteData[]> {
    return PipelineHtmlProcessor.processHtmlBatch(
        htmlFiles,
        options,
        progressCallback
    );
}
