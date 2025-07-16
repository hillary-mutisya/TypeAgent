// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import {
    PipelineStep,
    PipelineStepConfig,
    StepOptions,
    ErrorHandler,
    PipelineObserver,
    PipelineConfig,
    PipelineDefinition,
    MergeStrategy,
    StepResult,
} from './types.js';
import { Pipeline } from './PipelineExecutor.js';

/**
 * Builder class for creating configured pipelines
 * Provides a fluent interface for pipeline construction
 */
export class PipelineBuilder {
    private steps: PipelineStepConfig[] = [];
    private errorHandlers: ErrorHandler[] = [];
    private observers: PipelineObserver[] = [];
    private config: Partial<PipelineConfig> = {};
    private stepCounter = 0;

    /**
     * Add a processing step to the pipeline
     */
    addStep<TInput, TOutput>(
        step: PipelineStep<TInput, TOutput>,
        options: StepOptions = {}
    ): PipelineBuilder {
        this.steps.push({
            step,
            options,
            id: step.name + '-' + (++this.stepCounter),
        });
        return this;
    }

    /**
     * Add a step that only executes if a condition is met
     */
    addConditionalStep<TInput, TOutput>(
        condition: (context: any) => boolean,
        step: PipelineStep<TInput, TOutput>,
        options: StepOptions = {}
    ): PipelineBuilder {
        this.steps.push({
            step,
            options,
            id: step.name + '-conditional-' + (++this.stepCounter),
            condition,
        });
        return this;
    }

    /**
     * Add multiple steps that run in parallel
     */
    addParallelSteps(
        steps: PipelineStep[],
        mergeStrategy?: MergeStrategy,
        options: StepOptions = {}
    ): PipelineBuilder {
        const parallelStep = new ParallelStepGroup(steps, mergeStrategy);
        this.steps.push({
            step: parallelStep,
            options,
            id: 'parallel-group-' + (++this.stepCounter),
        });
        return this;
    }

    /**
     * Add an error handler to the pipeline
     */
    addErrorHandler(handler: ErrorHandler): PipelineBuilder {
        this.errorHandlers.push(handler);
        return this;
    }

    /**
     * Add an observer for pipeline events
     */
    addObserver(observer: PipelineObserver): PipelineBuilder {
        this.observers.push(observer);
        return this;
    }

    /**
     * Configure the pipeline with options
     */
    configure(config: Partial<PipelineConfig>): PipelineBuilder {
        this.config = { ...this.config, ...config };
        return this;
    }

    /**
     * Build the final pipeline
     */
    build(): Pipeline {
        const definition: PipelineDefinition = {
            steps: [...this.steps],
            errorHandlers: [...this.errorHandlers],
            observers: [...this.observers],
            config: this.config,
        };

        return new Pipeline(definition);
    }

    /**
     * Create a copy of this builder for reuse
     */
    clone(): PipelineBuilder {
        const builder = new PipelineBuilder();
        builder.steps = [...this.steps];
        builder.errorHandlers = [...this.errorHandlers];
        builder.observers = [...this.observers];
        builder.config = { ...this.config };
        builder.stepCounter = this.stepCounter;
        return builder;
    }
}

/**
 * Special step that executes multiple steps in parallel
 */
class ParallelStepGroup implements PipelineStep {
    readonly name: string = 'parallel-group';
    readonly version: string = '1.0.0';
    readonly description: string = 'Executes multiple steps in parallel';

    constructor(
        private steps: PipelineStep[],
        private mergeStrategy?: MergeStrategy
    ) {}

    async execute(input: any, context: any): Promise<any> {
        const startTime = Date.now();
        
        try {
            // Execute all steps in parallel
            const promises = this.steps.map(step => 
                step.execute(input, context).catch((error: Error) => ({
                    success: false,
                    error,
                    data: undefined,
                }))
            );

            const results = await Promise.all(promises);
            const executionTime = Date.now() - startTime;

            // Check if any step failed
            const failures = results.filter((result: StepResult) => !result.success);
            if (failures.length > 0) {
                return {
                    success: false,
                    error: new Error(`Parallel execution failed: ${failures.length} of ${results.length} steps failed`),
                    metadata: {
                        totalSteps: results.length,
                        failedSteps: failures.length,
                        failures: failures.map((f: StepResult) => f.error?.message),
                    },
                    metrics: {
                        executionTime,
                        itemsProcessed: results.length,
                    },
                };
            }

            // Merge results if strategy provided
            let finalData;
            if (this.mergeStrategy) {
                const mergeResult = this.mergeStrategy.merge(results);
                finalData = mergeResult.data;
            } else {
                // Default: return all results as array
                finalData = results.map((r: StepResult) => r.data);
            }

            return {
                success: true,
                data: finalData,
                metadata: {
                    totalSteps: results.length,
                    parallelExecution: true,
                },
                metrics: {
                    executionTime,
                    itemsProcessed: results.length,
                },
            };

            return {
                success: true,
                data: finalData,
                metadata: {
                    totalSteps: results.length,
                    parallelExecution: true,
                },
                metrics: {
                    executionTime,
                    itemsProcessed: results.length,
                },
            };

        } catch (error) {
            return {
                success: false,
                error: error as Error,
                metrics: {
                    executionTime: Date.now() - startTime,
                },
            };
        }
    }
}

/**
 * Simple merge strategy that combines all results into an array
 */
export class ArrayMergeStrategy implements MergeStrategy {
    merge(results: StepResult[]): StepResult {
        return {
            success: true,
            data: results.map((r: StepResult) => r.data),
        };
    }
}

/**
 * Merge strategy that takes the first successful result
 */
export class FirstSuccessfulMergeStrategy implements MergeStrategy {
    merge(results: StepResult[]): StepResult {
        const successful = results.find((r: StepResult) => r.success);
        if (successful) {
            return successful;
        }
        
        return {
            success: false,
            error: new Error('No successful results to merge'),
        };
    }
}

/**
 * Merge strategy that combines all successful results
 */
export class CombineMergeStrategy implements MergeStrategy {
    merge(results: StepResult[]): StepResult {
        const successful = results.filter((r: StepResult) => r.success);
        if (successful.length === 0) {
            return {
                success: false,
                error: new Error('No successful results to merge'),
            };
        }

        // Simple object merge for now
        const combined = {};
        successful.forEach((result: StepResult) => {
            if (result.data && typeof result.data === 'object') {
                Object.assign(combined, result.data);
            }
        });

        return {
            success: true,
            data: combined,
        };
    }
}
