// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import {
    PipelineConfig,
    ILogger,
    IMetricsCollector,
    ServiceContainer,
    PipelineContext,
} from './types.js';

// Re-export for external use
export type { PipelineContext } from './types.js';

/**
 * Default implementation of PipelineContext
 */
export class DefaultPipelineContext implements PipelineContext {
    public readonly id: string;
    public readonly startTime: Date;
    public readonly config: PipelineConfig;
    public readonly state: Map<string, any>;
    public readonly logger: ILogger;
    public readonly metrics: IMetricsCollector;
    public readonly services: ServiceContainer;
    public readonly signal?: AbortSignal;
    
    constructor(
        id: string,
        config: PipelineConfig,
        logger: ILogger,
        metrics: IMetricsCollector,
        services: ServiceContainer,
        signal?: AbortSignal
    ) {
        this.id = id;
        this.startTime = new Date();
        this.config = config;
        this.state = new Map();
        this.logger = logger;
        this.metrics = metrics;
        this.services = services;
        if (signal !== undefined) {
            this.signal = signal;
        }
    }
    
    setState(key: string, value: any): void {
        this.state.set(key, value);
        this.logger.debug(`State updated: ${key}`, { value });
    }
    
    getState<T>(key: string): T | undefined {
        return this.state.get(key) as T | undefined;
    }
    
    addMetric(name: string, value: number): void {
        this.metrics.addMetric(name, value, { pipelineId: this.id });
    }
    
    logStep(
        stepName: string, 
        message: string, 
        level: 'debug' | 'info' | 'warn' | 'error' = 'info'
    ): void {
        this.logger[level](`[${stepName}] ${message}`, { 
            pipelineId: this.id,
            stepName 
        });
    }
}

/**
 * Simple console-based logger implementation
 */
export class ConsoleLogger implements ILogger {
    private logLevel: string;
    
    constructor(logLevel: string = 'info') {
        this.logLevel = logLevel;
    }
    
    debug(message: string, meta?: any): void {
        if (this.shouldLog('debug')) {
            console.debug(`[DEBUG] ${message}`, meta ? JSON.stringify(meta) : '');
        }
    }
    
    info(message: string, meta?: any): void {
        if (this.shouldLog('info')) {
            console.info(`[INFO] ${message}`, meta ? JSON.stringify(meta) : '');
        }
    }
    
    warn(message: string, meta?: any): void {
        if (this.shouldLog('warn')) {
            console.warn(`[WARN] ${message}`, meta ? JSON.stringify(meta) : '');
        }
    }
    
    error(message: string, meta?: any): void {
        if (this.shouldLog('error')) {
            console.error(`[ERROR] ${message}`, meta ? JSON.stringify(meta) : '');
        }
    }
    
    private shouldLog(level: string): boolean {
        const levels = ['debug', 'info', 'warn', 'error'];
        const currentLevelIndex = levels.indexOf(this.logLevel);
        const messageLevelIndex = levels.indexOf(level);
        return messageLevelIndex >= currentLevelIndex;
    }
}

/**
 * Simple in-memory metrics collector
 */
export class InMemoryMetricsCollector implements IMetricsCollector {
    private metrics: Map<string, number> = new Map();
    private counters: Map<string, number> = new Map();
    
    addMetric(name: string, value: number, tags?: Record<string, string>): void {
        const key = this.createKey(name, tags);
        this.metrics.set(key, value);
    }
    
    incrementCounter(name: string, tags?: Record<string, string>): void {
        const key = this.createKey(name, tags);
        const current = this.counters.get(key) || 0;
        this.counters.set(key, current + 1);
    }
    
    recordTiming(name: string, duration: number, tags?: Record<string, string>): void {
        this.addMetric(`${name}.duration`, duration, tags);
    }
    
    getMetrics(): Record<string, number> {
        const result: Record<string, number> = {};
        
        for (const [key, value] of this.metrics) {
            result[key] = value;
        }
        
        for (const [key, value] of this.counters) {
            result[`${key}.count`] = value;
        }
        
        return result;
    }
    
    private createKey(name: string, tags?: Record<string, string>): string {
        if (!tags || Object.keys(tags).length === 0) {
            return name;
        }
        
        const tagString = Object.entries(tags)
            .map(([k, v]) => `${k}=${v}`)
            .join(',');
            
        return `${name}{${tagString}}`;
    }
}

/**
 * Simple service container implementation
 */
export class SimpleServiceContainer implements ServiceContainer {
    private services: Map<string, any> = new Map();
    
    get<T>(key: string): T | undefined {
        return this.services.get(key) as T | undefined;
    }
    
    set<T>(key: string, value: T): void {
        this.services.set(key, value);
    }
    
    has(key: string): boolean {
        return this.services.has(key);
    }
}
