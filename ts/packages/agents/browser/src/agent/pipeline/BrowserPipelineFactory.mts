// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { 
    Pipeline, 
    PipelineBuilder, 
    HtmlValidationStep, 
    ContentExtractionStep,
    GracefulDegradationHandler,
    RetryErrorHandler,
    ConsoleObserver,
    PerformanceObserver,
    CompositeErrorHandler,
} from 'website-memory';
import { 
    LiveDOMExtractionStep, 
    BrowserKnowledgeExtractionStep, 
    DiscoveryIntegrationStep,
} from './BrowserPipelineSteps.mjs';
import { ExtractionMode } from 'website-memory';
import { SessionContext } from '@typeagent/agent-sdk';
import { BrowserActionContext } from '../actionHandler.mjs';

export interface BrowserPipelineOptions {
    mode?: ExtractionMode;
    enableLiveDOM?: boolean;
    enableKnowledge?: boolean;
    enableDiscovery?: boolean;
    enableScreenshots?: boolean;
    enableLogging?: boolean;
    enableMetrics?: boolean;
    timeout?: number;
    maxConcurrent?: number;
}

/**
 * Factory for creating browser-optimized pipelines
 */
export class BrowserPipelineFactory {
    
    /**
     * Create a pipeline optimized for website import (bookmarks/history)
     */
    static createWebsiteImportPipeline(options: BrowserPipelineOptions = {}): Pipeline {
        const builder = new PipelineBuilder()
            .addStep(new HtmlValidationStep({
                allowFragments: true,
                sanitizeContent: true,
            }))
            .addStep(new ContentExtractionStep({
                mode: options.mode === 'basic' ? 'basic' : 'comprehensive',
                extractImages: options.mode !== 'basic',
                extractLinks: options.mode !== 'basic',
                extractHeadings: options.mode !== 'basic',
            }));

        // Add error handling
        const errorHandler = new CompositeErrorHandler([
            new RetryErrorHandler({
                maxRetries: 2,
                baseDelayMs: 1000,
            }),
            new GracefulDegradationHandler(),
        ]);
        builder.addErrorHandler(errorHandler);

        // Add observability if requested
        if (options.enableLogging !== false) {
            builder.addObserver(new ConsoleObserver({
                showTimings: true,
            }));
        }

        if (options.enableMetrics !== false) {
            builder.addObserver(new PerformanceObserver());
        }

        return builder
            .configure({
                timeout: options.timeout || 30000,
                enableMetrics: options.enableMetrics !== false,
                enableLogging: options.enableLogging !== false,
                abortOnFirstError: false,
            })
            .build();
    }

    /**
     * Create a pipeline for live browser content processing
     */
    static createLiveBrowserPipeline(
        sessionContext: SessionContext<BrowserActionContext>,
        options: BrowserPipelineOptions = {}
    ): Pipeline {
        const builder = new PipelineBuilder();

        // Add live DOM extraction if enabled
        if (options.enableLiveDOM !== false) {
            const liveStepOptions: any = {};
            if (options.enableScreenshots !== undefined) {
                liveStepOptions.enableScreenshots = options.enableScreenshots;
            }
            if (options.enableDiscovery !== undefined) {
                liveStepOptions.enableDiscovery = options.enableDiscovery;
            }
            if (options.timeout !== undefined) {
                liveStepOptions.timeout = options.timeout;
            }
            
            builder.addStep(new LiveDOMExtractionStep(liveStepOptions));
        }

        // Add standard content processing
        builder
            .addStep(new HtmlValidationStep({
                allowFragments: true,
                sanitizeContent: true,
            }))
            .addStep(new ContentExtractionStep({
                mode: options.mode === 'basic' ? 'basic' : 'comprehensive',
                extractImages: options.mode !== 'basic',
                extractLinks: options.mode !== 'basic',
                extractHeadings: options.mode !== 'basic',
            }));

        // Add knowledge extraction if enabled and not in basic mode
        if (options.enableKnowledge !== false && options.mode !== 'basic') {
            builder.addStep(new BrowserKnowledgeExtractionStep(
                sessionContext,
                options.mode || 'content'
            ));
        }

        // Add discovery integration if enabled
        if (options.enableDiscovery) {
            builder.addStep(new DiscoveryIntegrationStep(sessionContext));
        }

        // Add comprehensive error handling for live browser scenarios
        const errorHandler = new CompositeErrorHandler([
            new RetryErrorHandler({
                maxRetries: 1, // Fewer retries for live scenarios
                baseDelayMs: 500,
                retryableErrors: ['timeout', 'network', 'temporary'],
            }),
            new GracefulDegradationHandler(),
        ]);
        builder.addErrorHandler(errorHandler);

        // Add observability
        if (options.enableLogging !== false) {
            builder.addObserver(new ConsoleObserver({
                showTimings: true,
                showInput: false,
                showOutput: false,
            }));
        }

        if (options.enableMetrics !== false) {
            builder.addObserver(new PerformanceObserver());
        }

        return builder
            .configure({
                timeout: options.timeout || 15000, // Shorter timeout for live scenarios
                maxConcurrency: options.maxConcurrent || 3,
                enableMetrics: options.enableMetrics !== false,
                enableLogging: options.enableLogging !== false,
                abortOnFirstError: false,
            })
            .build();
    }

    /**
     * Create a pipeline for HTML file import processing
     */
    static createFileImportPipeline(
        sessionContext?: SessionContext<BrowserActionContext>,
        options: BrowserPipelineOptions = {}
    ): Pipeline {
        const builder = new PipelineBuilder()
            .addStep(new HtmlValidationStep({
                allowFragments: true,
                sanitizeContent: true,
                maxLength: 10 * 1024 * 1024, // 10MB for file imports
            }))
            .addStep(new ContentExtractionStep({
                mode: options.mode === 'basic' ? 'basic' : 'comprehensive',
                extractImages: options.mode !== 'basic',
                extractLinks: options.mode !== 'basic',
                extractHeadings: options.mode !== 'basic',
                maxContentLength: 5 * 1024 * 1024, // 5MB content limit
            }));

        // Add knowledge extraction for non-basic modes if session context provided
        if (sessionContext && options.enableKnowledge !== false && options.mode !== 'basic') {
            builder.addStep(new BrowserKnowledgeExtractionStep(
                sessionContext,
                options.mode || 'content'
            ));
        }

        // Add error handling optimized for batch file processing
        builder.addErrorHandler(new GracefulDegradationHandler());

        // Minimal logging for batch processing
        if (options.enableLogging) {
            builder.addObserver(new ConsoleObserver({
                showTimings: false,
            }));
        }

        // Always enable metrics for batch processing analysis
        builder.addObserver(new PerformanceObserver());

        return builder
            .configure({
                timeout: options.timeout || 20000,
                enableMetrics: true,
                enableLogging: options.enableLogging || false,
                logLevel: 'warn', // Only warnings and errors for batch
                abortOnFirstError: false,
            })
            .build();
    }

    /**
     * Create a custom pipeline with specific configuration
     */
    static createCustomPipeline(
        steps: any[],
        sessionContext?: SessionContext<BrowserActionContext>,
        options: BrowserPipelineOptions = {}
    ): Pipeline {
        const builder = new PipelineBuilder();

        // Add provided steps
        steps.forEach(step => builder.addStep(step));

        // Add default error handling
        builder.addErrorHandler(new GracefulDegradationHandler());
        
        if (options.enableLogging) {
            builder.addObserver(new ConsoleObserver());
        }

        if (options.enableMetrics !== false) {
            builder.addObserver(new PerformanceObserver());
        }

        return builder
            .configure({
                timeout: options.timeout || 30000,
                enableMetrics: options.enableMetrics !== false,
                enableLogging: options.enableLogging || false,
            })
            .build();
    }
}

/**
 * Convenience function to create a pipeline based on processing mode
 */
export function createProcessingPipeline(
    mode: 'website-import' | 'live-browser' | 'file-import',
    sessionContext?: SessionContext<BrowserActionContext>,
    options: BrowserPipelineOptions = {}
): Pipeline {
    switch (mode) {
        case 'website-import':
            return BrowserPipelineFactory.createWebsiteImportPipeline(options);
        case 'live-browser':
            if (!sessionContext) {
                throw new Error('Session context required for live browser pipeline');
            }
            return BrowserPipelineFactory.createLiveBrowserPipeline(sessionContext, options);
        case 'file-import':
            return BrowserPipelineFactory.createFileImportPipeline(sessionContext, options);
        default:
            throw new Error(`Unknown pipeline mode: ${mode}`);
    }
}

/**
 * Helper function to convert processing options to pipeline options
 */
export function convertProcessingOptionsToPipelineOptions(
    processingOptions: any
): BrowserPipelineOptions {
    return {
        mode: processingOptions.mode || 'content',
        enableKnowledge: processingOptions.mode !== 'basic',
        enableDiscovery: processingOptions.mode === 'actions' || processingOptions.mode === 'full',
        enableLogging: true,
        enableMetrics: true,
        timeout: processingOptions.contentTimeout || processingOptions.timeout,
        maxConcurrent: processingOptions.maxConcurrent || 5,
    };
}
