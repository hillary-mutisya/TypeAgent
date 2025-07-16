// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import {
    PipelineDefinition,
    PipelineResult,
    ExecutionOptions,
    StepExecutionResult,
    ErrorRecovery,
    PipelineStepConfig,
    PipelineStartEvent,
    PipelineCompleteEvent,
    PipelineErrorEvent,
    StepStartEvent,
    StepCompleteEvent,
    StepErrorEvent,
} from './types.js';
import { 
    PipelineContext, 
    DefaultPipelineContext, 
    ConsoleLogger, 
    InMemoryMetricsCollector,
    SimpleServiceContainer,
} from './PipelineContext.js';

/**
 * Core pipeline executor that orchestrates step execution
 */
export class Pipeline {
    constructor(private definition: PipelineDefinition) {}

    /**
     * Execute the pipeline with the given input
     */
    async execute<TInput, TOutput>(
        input: TInput,
        options: ExecutionOptions = {}
    ): Promise<PipelineResult<TOutput>> {
        const pipelineId = this.generatePipelineId();
        const context = this.createContext(pipelineId, options);
        
        const result: PipelineResult<TOutput> = {
            success: false,
            startTime: new Date(),
            steps: [],
        };

        try {
            // Notify observers of pipeline start
            await this.notifyObservers('pipeline-start', {
                pipelineId,
                input,
                context,
                timestamp: new Date(),
            });
            
            let currentData: any = input;
            let shouldContinue = true;
            
            for (let i = 0; i < this.definition.steps.length && shouldContinue; i++) {
                const stepConfig = this.definition.steps[i];
                
                // Check abort signal
                if (context.signal?.aborted) {
                    throw new Error('Pipeline execution aborted');
                }
                
                // Check conditional execution
                if (stepConfig.condition && !stepConfig.condition(context)) {
                    context.logStep(stepConfig.step.name, 'Skipped due to condition');
                    continue;
                }

                const stepResult = await this.executeStep(
                    stepConfig,
                    currentData,
                    context,
                    pipelineId
                );

                result.steps.push(stepResult);

                if (!stepResult.success) {
                    // Try error recovery
                    const recovery = await this.handleError(
                        stepResult.error || new Error('Step failed with unknown error'),
                        stepConfig,
                        context,
                        pipelineId
                    );
                    
                    if (!recovery.canContinue) {
                        result.error = stepResult.error || new Error('Step failed');
                        shouldContinue = false;
                    } else {
                        // Use recovery data or continue with current data
                        currentData = recovery.data !== undefined ? recovery.data : currentData;
                        
                        if (recovery.skipRemainingSteps) {
                            shouldContinue = false;
                        }
                    }
                } else {
                    currentData = stepResult.data;
                }
            }

            result.success = !result.error;
            result.data = currentData;
            result.endTime = new Date();
            result.totalExecutionTime = result.endTime.getTime() - result.startTime.getTime();

            await this.notifyObservers('pipeline-complete', {
                pipelineId,
                result,
                timestamp: new Date(),
            });
            
        } catch (error) {
            result.error = error as Error;
            result.endTime = new Date();
            result.totalExecutionTime = result.endTime.getTime() - result.startTime.getTime();
            
            await this.notifyObservers('pipeline-error', {
                pipelineId,
                error: error as Error,
                result,
                timestamp: new Date(),
            });
        }

        return result;
    }

    /**
     * Execute a single step with error handling and monitoring
     */
    private async executeStep(
        stepConfig: PipelineStepConfig,
        input: any,
        context: PipelineContext,
        pipelineId: string
    ): Promise<StepExecutionResult> {
        const startTime = Date.now();
        const stepName = stepConfig.step.name;
        
        try {
            // Notify observers of step start
            await this.notifyObservers('step-start', {
                pipelineId,
                stepName,
                input,
                timestamp: new Date(),
            });

            // Validation (if supported)
            if (stepConfig.step.validate) {
                const validation = await stepConfig.step.validate(input, context);
                if (!validation.valid) {
                    const error = new Error(
                        `Validation failed for step ${stepName}: ${validation.errors?.join(', ')}`
                    );
                    throw error;
                }
            }

            // Execute the step with timeout if configured
            let result;
            if (stepConfig.options.timeout) {
                result = await this.executeWithTimeout(
                    () => stepConfig.step.execute(input, context),
                    stepConfig.options.timeout
                );
            } else {
                result = await stepConfig.step.execute(input, context);
            }
            
            const executionTime = Date.now() - startTime;
            
            // Update context metrics
            context.addMetric(`${stepName}.execution_time`, executionTime);
            if (result.metrics) {
                Object.entries(result.metrics.customMetrics || {}).forEach(([key, value]) => {
                    context.addMetric(`${stepName}.${key}`, value);
                });
            }

            // Notify observers of step completion
            await this.notifyObservers('step-complete', {
                pipelineId,
                stepName,
                result,
                executionTime,
                timestamp: new Date(),
            });

            const executionResult: StepExecutionResult = {
                stepName,
                success: result.success,
                data: result.data,
                executionTime,
            };
            
            if (result.error) {
                executionResult.error = result.error;
            }
            
            if (result.metadata) {
                executionResult.metadata = result.metadata;
            }

            return executionResult;

        } catch (error) {
            const executionTime = Date.now() - startTime;
            
            context.logStep(stepName, `Failed: ${(error as Error).message}`, 'error');
            
            // Notify observers of step error
            await this.notifyObservers('step-error', {
                pipelineId,
                stepName,
                error: error as Error,
                executionTime,
                timestamp: new Date(),
            });

            return {
                stepName,
                success: false,
                error: error as Error,
                executionTime,
            };
        }
    }

    /**
     * Handle errors using registered error handlers
     */
    private async handleError(
        error: Error,
        stepConfig: PipelineStepConfig,
        context: PipelineContext,
        pipelineId: string
    ): Promise<ErrorRecovery> {
        const stepName = stepConfig.step.name;
        
        // Try each error handler
        for (const handler of this.definition.errorHandlers) {
            if (handler.canHandle(error, stepName, context)) {
                try {
                    const recovery = await handler.handle(error, stepName, context);
                    context.logStep(stepName, `Error handled: ${recovery.canContinue ? 'continuing' : 'stopping'}`);
                    return recovery;
                } catch (handlerError) {
                    context.logStep(stepName, `Error handler failed: ${handlerError}`, 'error');
                }
            }
        }

        // Default error handling - stop pipeline
        return {
            canContinue: false,
        };
    }

    /**
     * Execute a function with timeout
     */
    private async executeWithTimeout<T>(
        fn: () => Promise<T>,
        timeoutMs: number
    ): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error(`Step execution timed out after ${timeoutMs}ms`));
            }, timeoutMs);

            fn()
                .then(result => {
                    clearTimeout(timeoutId);
                    resolve(result);
                })
                .catch(error => {
                    clearTimeout(timeoutId);
                    reject(error);
                });
        });
    }

    /**
     * Create pipeline execution context
     */
    private createContext(
        pipelineId: string,
        options: ExecutionOptions
    ): PipelineContext {
        const config = {
            ...this.definition.config,
            ...options.config,
        };

        const logger = new ConsoleLogger(config.logLevel || 'info');
        const metrics = new InMemoryMetricsCollector();
        const services = new SimpleServiceContainer();

        // Allow context override
        if (options.context) {
            Object.assign(services, options.context);
        }

        return new DefaultPipelineContext(
            pipelineId,
            config,
            logger,
            metrics,
            services,
            options.signal
        );
    }

    /**
     * Notify all observers of an event
     */
    private async notifyObservers(
        eventType: string,
        event: PipelineStartEvent | PipelineCompleteEvent | PipelineErrorEvent | 
               StepStartEvent | StepCompleteEvent | StepErrorEvent
    ): Promise<void> {
        const promises = this.definition.observers.map(async observer => {
            try {
                switch (eventType) {
                    case 'pipeline-start':
                        if (observer.onPipelineStart) {
                            await observer.onPipelineStart(event as PipelineStartEvent);
                        }
                        break;
                    case 'pipeline-complete':
                        if (observer.onPipelineComplete) {
                            await observer.onPipelineComplete(event as PipelineCompleteEvent);
                        }
                        break;
                    case 'pipeline-error':
                        if (observer.onPipelineError) {
                            await observer.onPipelineError(event as PipelineErrorEvent);
                        }
                        break;
                    case 'step-start':
                        if (observer.onStepStart) {
                            await observer.onStepStart(event as StepStartEvent);
                        }
                        break;
                    case 'step-complete':
                        if (observer.onStepComplete) {
                            await observer.onStepComplete(event as StepCompleteEvent);
                        }
                        break;
                    case 'step-error':
                        if (observer.onStepError) {
                            await observer.onStepError(event as StepErrorEvent);
                        }
                        break;
                }
            } catch (observerError) {
                // Don't let observer errors break pipeline execution
                console.error(`Observer error in ${eventType}:`, observerError);
            }
        });

        await Promise.all(promises);
    }

    /**
     * Generate unique pipeline ID
     */
    private generatePipelineId(): string {
        return `pipeline-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get pipeline configuration
     */
    public getConfig() {
        return { ...this.definition.config };
    }

    /**
     * Get pipeline step information
     */
    public getSteps() {
        return this.definition.steps.map(step => ({
            name: step.step.name,
            version: step.step.version,
            description: step.step.description,
            id: step.id,
        }));
    }
}
