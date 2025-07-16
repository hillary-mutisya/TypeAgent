// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { ErrorHandler, ErrorRecovery, PipelineContext } from '../core/types.js';

/**
 * Graceful degradation error handler
 * Allows pipeline to continue with reduced functionality when AI steps fail
 */
export class GracefulDegradationHandler implements ErrorHandler {
    private readonly aiStepNames = ['ai-knowledge-extraction', 'ai-analysis', 'knowledge-extraction'];
    
    canHandle(error: Error, stepName: string, context: PipelineContext): boolean {
        // Handle AI-related failures gracefully
        return this.aiStepNames.includes(stepName) || 
               stepName.includes('ai-') ||
               error.message.includes('AI') ||
               error.message.includes('model');
    }
    
    async handle(error: Error, stepName: string, context: PipelineContext): Promise<ErrorRecovery> {
        context.logStep(stepName, `AI step failed, continuing with basic processing: ${error.message}`, 'warn');
        
        // Set flag to indicate AI processing failed
        context.setState('ai-processing-failed', true);
        context.setState('fallback-mode', 'basic');
        
        // Provide empty AI result to continue pipeline
        const fallbackData = this.createFallbackResult(stepName);
        
        return {
            canContinue: true,
            data: fallbackData,
        };
    }
    
    private createFallbackResult(stepName: string): any {
        if (stepName.includes('knowledge')) {
            return {
                entities: [],
                topics: [],
                actions: [],
                inverseActions: [],
            };
        }
        
        return {}; // Generic empty result
    }
}

/**
 * Retry error handler with exponential backoff
 */
export class RetryErrorHandler implements ErrorHandler {
    private maxRetries: number;
    private baseDelayMs: number;
    private retryableErrors: string[];
    
    constructor(options: {
        maxRetries?: number;
        baseDelayMs?: number;
        retryableErrors?: string[];
    } = {}) {
        this.maxRetries = options.maxRetries || 3;
        this.baseDelayMs = options.baseDelayMs || 1000;
        this.retryableErrors = options.retryableErrors || [
            'timeout',
            'network',
            'connection',
            'temporary',
        ];
    }
    
    canHandle(error: Error, stepName: string, context: PipelineContext): boolean {
        const retryCount = context.getState<number>(`${stepName}-retry-count`) || 0;
        
        if (retryCount >= this.maxRetries) {
            return false;
        }
        
        // Check if error is retryable
        const errorMessage = error.message.toLowerCase();
        return this.retryableErrors.some(pattern => errorMessage.includes(pattern));
    }
    
    async handle(error: Error, stepName: string, context: PipelineContext): Promise<ErrorRecovery> {
        const retryCount = context.getState<number>(`${stepName}-retry-count`) || 0;
        const newRetryCount = retryCount + 1;
        
        context.setState(`${stepName}-retry-count`, newRetryCount);
        
        // Calculate delay with exponential backoff
        const delay = this.baseDelayMs * Math.pow(2, retryCount);
        
        context.logStep(stepName, `Retrying step (attempt ${newRetryCount}/${this.maxRetries}) after ${delay}ms delay`, 'warn');
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, delay));
        
        return {
            canContinue: true,
            retryStep: true,
        };
    }
}

/**
 * Validation error handler for input validation failures
 */
export class ValidationErrorHandler implements ErrorHandler {
    canHandle(error: Error, stepName: string, context: PipelineContext): boolean {
        return error.message.includes('Validation failed') ||
               error.message.includes('Invalid input') ||
               error.name === 'ValidationError';
    }
    
    async handle(error: Error, stepName: string, context: PipelineContext): Promise<ErrorRecovery> {
        context.logStep(stepName, `Validation failed: ${error.message}`, 'error');
        
        // Validation errors typically cannot be recovered from
        return {
            canContinue: false,
        };
    }
}

/**
 * Timeout error handler
 */
export class TimeoutErrorHandler implements ErrorHandler {
    private allowedTimeouts: Map<string, number> = new Map();
    
    constructor(stepTimeoutLimits: Record<string, number> = {}) {
        Object.entries(stepTimeoutLimits).forEach(([stepName, limit]) => {
            this.allowedTimeouts.set(stepName, limit);
        });
    }
    
    canHandle(error: Error, stepName: string, context: PipelineContext): boolean {
        return error.message.includes('timeout') || error.message.includes('timed out');
    }
    
    async handle(error: Error, stepName: string, context: PipelineContext): Promise<ErrorRecovery> {
        const timeoutCount = context.getState<number>(`${stepName}-timeout-count`) || 0;
        const allowedTimeouts = this.allowedTimeouts.get(stepName) || 1;
        
        if (timeoutCount < allowedTimeouts) {
            context.setState(`${stepName}-timeout-count`, timeoutCount + 1);
            context.logStep(stepName, `Step timed out, retrying (${timeoutCount + 1}/${allowedTimeouts})`, 'warn');
            
            return {
                canContinue: true,
                retryStep: true,
            };
        }
        
        context.logStep(stepName, `Step timed out after ${allowedTimeouts} attempts, skipping`, 'error');
        
        return {
            canContinue: true, // Continue pipeline but skip this step
            data: undefined,   // No data from timed out step
        };
    }
}

/**
 * Composite error handler that tries multiple handlers in sequence
 */
export class CompositeErrorHandler implements ErrorHandler {
    constructor(private handlers: ErrorHandler[]) {}
    
    canHandle(error: Error, stepName: string, context: PipelineContext): boolean {
        return this.handlers.some(handler => handler.canHandle(error, stepName, context));
    }
    
    async handle(error: Error, stepName: string, context: PipelineContext): Promise<ErrorRecovery> {
        for (const handler of this.handlers) {
            if (handler.canHandle(error, stepName, context)) {
                try {
                    return await handler.handle(error, stepName, context);
                } catch (handlerError) {
                    context.logStep(stepName, `Error handler failed: ${handlerError}`, 'warn');
                    // Continue to next handler
                }
            }
        }
        
        // No handler could handle the error
        return {
            canContinue: false,
        };
    }
}
