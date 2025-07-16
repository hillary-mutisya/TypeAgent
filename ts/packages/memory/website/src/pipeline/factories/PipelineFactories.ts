// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { Pipeline, PipelineBuilder } from '../core/index.js';
import { HtmlValidationStep } from '../steps/HtmlValidationStep.js';
import { ContentExtractionStep } from '../steps/ContentExtractionStep.js';
import { 
    GracefulDegradationHandler, 
    RetryErrorHandler, 
    CompositeErrorHandler 
} from '../errors/ErrorHandlers.js';
import { ConsoleObserver, PerformanceObserver } from '../observers/PipelineObservers.js';

/**
 * Factory functions for creating common pipeline configurations
 */

export interface PipelineFactoryOptions {
    enableLogging?: boolean;
    enableMetrics?: boolean;
    enableRetry?: boolean;
    logLevel?: 'debug' | 'info' | 'warn' | 'error';
    timeout?: number;
}

/**
 * Create a basic pipeline for simple HTML processing
 * Includes validation and content extraction without AI
 */
export function createBasicPipeline(options: PipelineFactoryOptions = {}): Pipeline {
    const builder = new PipelineBuilder()
        .addStep(new HtmlValidationStep({
            allowFragments: true,
            sanitizeContent: true,
        }))
        .addStep(new ContentExtractionStep({
            mode: 'basic',
            extractImages: false,
            extractLinks: false,
        }));

    // Add error handling
    if (options.enableRetry) {
        builder.addErrorHandler(new RetryErrorHandler({
            maxRetries: 2,
            baseDelayMs: 1000,
        }));
    }

    // Add observability
    if (options.enableLogging) {
        builder.addObserver(new ConsoleObserver({
            showTimings: true,
            showInput: false,
            showOutput: false,
        }));
    }

    if (options.enableMetrics) {
        builder.addObserver(new PerformanceObserver());
    }

    // Configure pipeline
    builder.configure({
        timeout: options.timeout || 30000,
        enableMetrics: options.enableMetrics || false,
        enableLogging: options.enableLogging || false,
        logLevel: options.logLevel || 'info',
    });

    return builder.build();
}

/**
 * Create a comprehensive pipeline for full HTML processing
 * Includes all extraction features and error handling
 */
export function createComprehensivePipeline(options: PipelineFactoryOptions = {}): Pipeline {
    const builder = new PipelineBuilder()
        .addStep(new HtmlValidationStep({
            allowFragments: true,
            sanitizeContent: true,
        }))
        .addStep(new ContentExtractionStep({
            mode: 'comprehensive',
            extractImages: true,
            extractLinks: true,
            extractHeadings: true,
        }));

    // Add comprehensive error handling
    const errorHandler = new CompositeErrorHandler([
        new RetryErrorHandler({
            maxRetries: 3,
            baseDelayMs: 1000,
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

    // Configure pipeline
    builder.configure({
        timeout: options.timeout || 60000,
        enableMetrics: options.enableMetrics !== false,
        enableLogging: options.enableLogging !== false,
        logLevel: options.logLevel || 'info',
        abortOnFirstError: false, // Continue processing on errors
    });

    return builder.build();
}

/**
 * Create a custom pipeline with specific steps
 */
export function createCustomPipeline(
    steps: any[],
    options: PipelineFactoryOptions = {}
): Pipeline {
    const builder = new PipelineBuilder();

    // Add provided steps
    steps.forEach(step => builder.addStep(step));

    // Add default error handling
    builder.addErrorHandler(new GracefulDegradationHandler());
    
    if (options.enableRetry) {
        builder.addErrorHandler(new RetryErrorHandler());
    }

    // Add observability
    if (options.enableLogging) {
        builder.addObserver(new ConsoleObserver());
    }

    if (options.enableMetrics) {
        builder.addObserver(new PerformanceObserver());
    }

    return builder.build();
}

/**
 * Create a pipeline optimized for batch processing
 */
export function createBatchPipeline(options: PipelineFactoryOptions = {}): Pipeline {
    const builder = new PipelineBuilder()
        .addStep(new HtmlValidationStep({
            allowFragments: true,
            sanitizeContent: true,
            maxLength: 5 * 1024 * 1024, // 5MB for batch processing
        }))
        .addStep(new ContentExtractionStep({
            mode: 'basic', // Faster for batch processing
            extractImages: false,
            extractLinks: false,
            maxContentLength: 2 * 1024 * 1024, // 2MB
        }));

    // Add error handling optimized for batch processing
    builder.addErrorHandler(new GracefulDegradationHandler());

    // Minimal logging for batch processing
    if (options.enableLogging) {
        builder.addObserver(new ConsoleObserver({
            showTimings: false,
            showInput: false,
            showOutput: false,
        }));
    }

    // Always enable metrics for batch processing
    builder.addObserver(new PerformanceObserver());

    // Configure for batch processing
    builder.configure({
        timeout: options.timeout || 15000, // Shorter timeout for batch
        enableMetrics: true,
        enableLogging: options.enableLogging || false,
        logLevel: 'warn', // Only warnings and errors
        abortOnFirstError: false,
    });

    return builder.build();
}
