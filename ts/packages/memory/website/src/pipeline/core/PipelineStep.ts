// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import {
    StepResult,
    ValidationResult,
    StepConfig,
    PipelineContext,
    PipelineStep,
} from './types.js';

/**
 * Abstract base class for pipeline steps with common functionality
 */
export abstract class BasePipelineStep<TInput = any, TOutput = any> 
    implements PipelineStep<TInput, TOutput> {
    
    public abstract readonly name: string;
    public abstract readonly version: string;
    public readonly description?: string;
    
    protected config: StepConfig = {};
    
    public abstract execute(
        input: TInput, 
        context: PipelineContext
    ): Promise<StepResult<TOutput>>;
    
    public configure(config: StepConfig): void {
        this.config = { ...this.config, ...config };
    }
    
    public async validate(
        input: TInput, 
        context: PipelineContext
    ): Promise<ValidationResult> {
        // Default validation - override in subclasses for specific validation
        if (input === undefined || input === null) {
            return {
                valid: false,
                errors: [`Step ${this.name} received null or undefined input`],
            };
        }
        
        return { valid: true };
    }
    
    protected createResult<T>(
        success: boolean,
        data?: T,
        error?: Error,
        metadata?: Record<string, any>
    ): StepResult<T> {
        const result: StepResult<T> = {
            success,
        };
        
        if (data !== undefined) {
            result.data = data;
        }
        
        if (error !== undefined) {
            result.error = error;
        }
        
        if (metadata !== undefined) {
            result.metadata = metadata;
        }
        
        return result;
    }
    
    protected createSuccessResult<T>(
        data: T,
        metadata?: Record<string, any>
    ): StepResult<T> {
        return this.createResult(true, data, undefined, metadata);
    }
    
    protected createErrorResult<T>(
        error: Error,
        metadata?: Record<string, any>
    ): StepResult<T> {
        const result: StepResult<T> = {
            success: false,
            error,
        };
        
        if (metadata !== undefined) {
            result.metadata = metadata;
        }
        
        return result;
    }
    
    protected measureExecution<T>(
        fn: () => Promise<T>
    ): Promise<{ result: T; executionTime: number }> {
        const startTime = Date.now();
        return fn().then(result => ({
            result,
            executionTime: Date.now() - startTime,
        }));
    }
}
