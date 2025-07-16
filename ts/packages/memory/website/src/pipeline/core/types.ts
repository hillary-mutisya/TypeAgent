// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Core types and interfaces for the TypeAgent data processing pipeline
 */

export interface StepResult<T = any> {
    success: boolean;
    data?: T;
    error?: Error;
    metadata?: Record<string, any>;
    metrics?: StepMetrics;
}

export interface StepMetrics {
    executionTime: number;
    memoryUsed?: number;
    itemsProcessed?: number;
    customMetrics?: Record<string, number>;
}

export interface ValidationResult {
    valid: boolean;
    errors?: string[];
    warnings?: string[];
}

export interface StepConfig {
    [key: string]: any;
}

export interface LogLevel {
    DEBUG: 'debug';
    INFO: 'info';
    WARN: 'warn';
    ERROR: 'error';
}

export interface ILogger {
    debug(message: string, meta?: any): void;
    info(message: string, meta?: any): void;
    warn(message: string, meta?: any): void;
    error(message: string, meta?: any): void;
}

export interface IMetricsCollector {
    addMetric(name: string, value: number, tags?: Record<string, string>): void;
    incrementCounter(name: string, tags?: Record<string, string>): void;
    recordTiming(name: string, duration: number, tags?: Record<string, string>): void;
    getMetrics(): Record<string, number>;
}

export interface ServiceContainer {
    get<T>(key: string): T | undefined;
    set<T>(key: string, value: T): void;
    has(key: string): boolean;
}

export interface PipelineConfig {
    timeout?: number;
    maxRetries?: number;
    enableMetrics?: boolean;
    enableLogging?: boolean;
    logLevel?: 'debug' | 'info' | 'warn' | 'error';
    abortOnFirstError?: boolean;
    [key: string]: any;
}

export interface StepOptions {
    skipOnError?: boolean;
    timeout?: number;
    retryConfig?: {
        maxRetries: number;
        backoffMs: number;
    };
}

// Forward declaration for PipelineStep interface
export interface PipelineStep<TInput = any, TOutput = any> {
    readonly name: string;
    readonly description?: string;
    readonly version: string;
    
    execute(input: TInput, context: PipelineContext): Promise<StepResult<TOutput>>;
    validate?(input: TInput, context: PipelineContext): Promise<ValidationResult>;
    configure?(config: StepConfig): void;
    cleanup?(): Promise<void>;
    
    getInputSchema?(): any;
    getOutputSchema?(): any;
    getRequiredDependencies?(): string[];
}

// Forward declaration for PipelineContext interface
export interface PipelineContext {
    readonly id: string;
    readonly startTime: Date;
    readonly config: PipelineConfig;
    
    state: Map<string, any>;
    logger: ILogger;
    metrics: IMetricsCollector;
    services: ServiceContainer;
    signal?: AbortSignal;
    
    setState(key: string, value: any): void;
    getState<T>(key: string): T | undefined;
    addMetric(name: string, value: number): void;
    logStep(stepName: string, message: string, level?: 'debug' | 'info' | 'warn' | 'error'): void;
}

export interface PipelineStepConfig {
    step: PipelineStep;
    options: StepOptions;
    id: string;
    condition?: (context: PipelineContext) => boolean;
}

export interface StepExecutionResult {
    stepName: string;
    success: boolean;
    data?: any;
    error?: Error;
    executionTime: number;
    metadata?: Record<string, any>;
}

export interface PipelineResult<T = any> {
    success: boolean;
    data?: T;
    error?: Error;
    startTime: Date;
    endTime?: Date;
    steps: StepExecutionResult[];
    totalExecutionTime?: number;
}

export interface ExecutionOptions {
    signal?: AbortSignal;
    context?: Partial<PipelineContext>;
    config?: Partial<PipelineConfig>;
}

export interface PipelineDefinition {
    steps: PipelineStepConfig[];
    errorHandlers: ErrorHandler[];
    observers: PipelineObserver[];
    config: Partial<PipelineConfig>;
}

// Event types for pipeline observability
export interface PipelineStartEvent {
    pipelineId: string;
    input: any;
    context: PipelineContext;
    timestamp: Date;
}

export interface PipelineCompleteEvent {
    pipelineId: string;
    result: PipelineResult;
    timestamp: Date;
}

export interface PipelineErrorEvent {
    pipelineId: string;
    error: Error;
    result: Partial<PipelineResult>;
    timestamp: Date;
}

export interface StepStartEvent {
    pipelineId: string;
    stepName: string;
    input: any;
    timestamp: Date;
}

export interface StepCompleteEvent {
    pipelineId: string;
    stepName: string;
    result: StepResult;
    executionTime: number;
    timestamp: Date;
}

export interface StepErrorEvent {
    pipelineId: string;
    stepName: string;
    error: Error;
    executionTime: number;
    timestamp: Date;
}

// Abstract interfaces for extensibility
export interface ErrorHandler {
    canHandle(error: Error, stepName: string, context: PipelineContext): boolean;
    handle(error: Error, stepName: string, context: PipelineContext): Promise<ErrorRecovery>;
}

export interface ErrorRecovery {
    canContinue: boolean;
    data?: any;
    skipRemainingSteps?: boolean;
    retryStep?: boolean;
}

export interface PipelineObserver {
    onPipelineStart?(event: PipelineStartEvent): Promise<void>;
    onPipelineComplete?(event: PipelineCompleteEvent): Promise<void>;
    onPipelineError?(event: PipelineErrorEvent): Promise<void>;
    onStepStart?(event: StepStartEvent): Promise<void>;
    onStepComplete?(event: StepCompleteEvent): Promise<void>;
    onStepError?(event: StepErrorEvent): Promise<void>;
}

export interface MergeStrategy {
    merge(results: StepResult[]): StepResult;
}
