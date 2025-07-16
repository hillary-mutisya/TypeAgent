// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import {
    PipelineObserver,
    PipelineStartEvent,
    PipelineCompleteEvent,
    PipelineErrorEvent,
    StepStartEvent,
    StepCompleteEvent,
    StepErrorEvent,
} from '../core/types.js';

/**
 * Console-based pipeline observer for debugging
 */
export class ConsoleObserver implements PipelineObserver {
    private showInput: boolean;
    private showOutput: boolean;
    private showTimings: boolean;

    constructor(options: {
        showInput?: boolean;
        showOutput?: boolean;
        showTimings?: boolean;
    } = {}) {
        this.showInput = options.showInput ?? false;
        this.showOutput = options.showOutput ?? false;
        this.showTimings = options.showTimings ?? true;
    }

    async onPipelineStart(event: PipelineStartEvent): Promise<void> {
        console.log(`🚀 Pipeline ${event.pipelineId} started`);
        if (this.showInput) {
            console.log('Input:', JSON.stringify(event.input, null, 2));
        }
    }

    async onPipelineComplete(event: PipelineCompleteEvent): Promise<void> {
        const duration = event.result.totalExecutionTime || 0;
        console.log(`✅ Pipeline ${event.pipelineId} completed in ${duration}ms`);
        console.log(`   Steps: ${event.result.steps.length}, Success: ${event.result.success}`);
        
        if (this.showOutput && event.result.data) {
            console.log('Output:', JSON.stringify(event.result.data, null, 2));
        }
    }

    async onPipelineError(event: PipelineErrorEvent): Promise<void> {
        console.error(`❌ Pipeline ${event.pipelineId} failed: ${event.error.message}`);
        if (event.result.totalExecutionTime) {
            console.error(`   Duration: ${event.result.totalExecutionTime}ms`);
        }
    }

    async onStepStart(event: StepStartEvent): Promise<void> {
        console.log(`  ▶️  Step: ${event.stepName}`);
    }

    async onStepComplete(event: StepCompleteEvent): Promise<void> {
        const status = event.result.success ? '✅' : '❌';
        let message = `  ${status} ${event.stepName}`;
        
        if (this.showTimings) {
            message += ` (${event.executionTime}ms)`;
        }
        
        console.log(message);
    }

    async onStepError(event: StepErrorEvent): Promise<void> {
        console.error(`  ❌ ${event.stepName} failed: ${event.error.message}`);
        if (this.showTimings) {
            console.error(`     Duration: ${event.executionTime}ms`);
        }
    }
}

/**
 * Performance metrics observer
 */
export class PerformanceObserver implements PipelineObserver {
    private metrics: Map<string, number[]> = new Map();
    private pipelineMetrics: Map<string, any> = new Map();

    async onPipelineStart(event: PipelineStartEvent): Promise<void> {
        this.pipelineMetrics.set(event.pipelineId, {
            startTime: event.timestamp.getTime(),
            steps: [],
        });
    }

    async onPipelineComplete(event: PipelineCompleteEvent): Promise<void> {
        const pipelineData = this.pipelineMetrics.get(event.pipelineId);
        if (pipelineData) {
            pipelineData.endTime = event.timestamp.getTime();
            pipelineData.totalTime = pipelineData.endTime - pipelineData.startTime;
            pipelineData.success = event.result.success;
        }
    }

    async onStepComplete(event: StepCompleteEvent): Promise<void> {
        // Record step timing
        const stepTimes = this.metrics.get(event.stepName) || [];
        stepTimes.push(event.executionTime);
        this.metrics.set(event.stepName, stepTimes);

        // Record in pipeline data
        const pipelineData = this.pipelineMetrics.get(event.pipelineId);
        if (pipelineData) {
            pipelineData.steps.push({
                name: event.stepName,
                duration: event.executionTime,
                success: event.result.success,
            });
        }
    }

    /**
     * Get performance report for all recorded executions
     */
    getPerformanceReport(): any {
        const report: any = {
            stepMetrics: {},
            pipelineMetrics: Array.from(this.pipelineMetrics.values()),
        };

        // Calculate step statistics
        for (const [stepName, times] of this.metrics) {
            const sortedTimes = times.sort((a, b) => a - b);
            report.stepMetrics[stepName] = {
                count: times.length,
                averageTime: times.reduce((a, b) => a + b) / times.length,
                minTime: Math.min(...times),
                maxTime: Math.max(...times),
                medianTime: sortedTimes[Math.floor(sortedTimes.length / 2)],
                p95Time: sortedTimes[Math.floor(sortedTimes.length * 0.95)],
            };
        }

        return report;
    }

    /**
     * Get statistics for a specific step
     */
    getStepStatistics(stepName: string): any {
        const times = this.metrics.get(stepName);
        if (!times || times.length === 0) {
            return null;
        }

        const sortedTimes = times.sort((a, b) => a - b);
        return {
            count: times.length,
            averageTime: times.reduce((a, b) => a + b) / times.length,
            minTime: Math.min(...times),
            maxTime: Math.max(...times),
            medianTime: sortedTimes[Math.floor(sortedTimes.length / 2)],
            p95Time: sortedTimes[Math.floor(sortedTimes.length * 0.95)],
        };
    }

    /**
     * Reset all collected metrics
     */
    reset(): void {
        this.metrics.clear();
        this.pipelineMetrics.clear();
    }
}

/**
 * Progress observer for long-running pipelines
 */
export class ProgressObserver implements PipelineObserver {
    private progressCallback: ((progress: ProgressInfo) => void) | undefined;
    private currentPipeline: {
        id: string;
        totalSteps: number;
        completedSteps: number;
        startTime: number;
    } | undefined;

    constructor(progressCallback?: (progress: ProgressInfo) => void) {
        this.progressCallback = progressCallback;
    }

    async onPipelineStart(event: PipelineStartEvent): Promise<void> {
        // We don't know total steps yet, will update in first step
        this.currentPipeline = {
            id: event.pipelineId,
            totalSteps: 0,
            completedSteps: 0,
            startTime: event.timestamp.getTime(),
        };
    }

    async onStepStart(event: StepStartEvent): Promise<void> {
        if (this.currentPipeline && this.currentPipeline.totalSteps === 0) {
            // This is a hack - we don't know total steps upfront
            // In a real implementation, this would be passed from pipeline definition
            this.currentPipeline.totalSteps = 5; // Default estimate
        }
    }

    async onStepComplete(event: StepCompleteEvent): Promise<void> {
        if (this.currentPipeline) {
            this.currentPipeline.completedSteps++;
            this.reportProgress();
        }
    }

    async onStepError(event: StepErrorEvent): Promise<void> {
        if (this.currentPipeline) {
            this.currentPipeline.completedSteps++;
            this.reportProgress();
        }
    }

    async onPipelineComplete(event: PipelineCompleteEvent): Promise<void> {
        if (this.currentPipeline) {
            this.currentPipeline.completedSteps = this.currentPipeline.totalSteps;
            this.reportProgress();
            this.currentPipeline = undefined;
        }
    }

    private reportProgress(): void {
        if (!this.currentPipeline || !this.progressCallback) {
            return;
        }

        const { completedSteps, totalSteps, startTime } = this.currentPipeline;
        const elapsed = Date.now() - startTime;
        const percentage = Math.round((completedSteps / totalSteps) * 100);
        
        const progressInfo: ProgressInfo = {
            percentage,
            completedSteps,
            totalSteps,
            elapsedTime: elapsed,
            estimatedRemainingTime: totalSteps > completedSteps 
                ? Math.round((elapsed / completedSteps) * (totalSteps - completedSteps))
                : 0,
        };

        this.progressCallback(progressInfo);
    }
}

export interface ProgressInfo {
    percentage: number;
    completedSteps: number;
    totalSteps: number;
    elapsedTime: number;
    estimatedRemainingTime: number;
}

/**
 * File-based logging observer
 */
export class FileLoggingObserver implements PipelineObserver {
    private logEntries: LogEntry[] = [];

    async onPipelineStart(event: PipelineStartEvent): Promise<void> {
        this.logEntries.push({
            timestamp: event.timestamp,
            level: 'info',
            event: 'pipeline-start',
            pipelineId: event.pipelineId,
            message: 'Pipeline started',
        });
    }

    async onPipelineComplete(event: PipelineCompleteEvent): Promise<void> {
        this.logEntries.push({
            timestamp: event.timestamp,
            level: 'info',
            event: 'pipeline-complete',
            pipelineId: event.pipelineId,
            message: `Pipeline completed: ${event.result.success ? 'success' : 'failure'}`,
            metadata: {
                duration: event.result.totalExecutionTime,
                stepCount: event.result.steps.length,
            },
        });
    }

    async onPipelineError(event: PipelineErrorEvent): Promise<void> {
        const errorStack = event.error.stack || '';
        this.logEntries.push({
            timestamp: event.timestamp,
            level: 'error',
            event: 'pipeline-error',
            pipelineId: event.pipelineId,
            message: `Pipeline failed: ${event.error.message}`,
            error: errorStack,
        });
    }

    async onStepStart(event: StepStartEvent): Promise<void> {
        this.logEntries.push({
            timestamp: event.timestamp,
            level: 'debug',
            event: 'step-start',
            pipelineId: event.pipelineId,
            stepName: event.stepName,
            message: `Step started: ${event.stepName}`,
        });
    }

    async onStepComplete(event: StepCompleteEvent): Promise<void> {
        this.logEntries.push({
            timestamp: event.timestamp,
            level: event.result.success ? 'info' : 'warn',
            event: 'step-complete',
            pipelineId: event.pipelineId,
            stepName: event.stepName,
            message: `Step completed: ${event.stepName} (${event.result.success ? 'success' : 'failure'})`,
            metadata: {
                duration: event.executionTime,
                success: event.result.success,
            },
        });
    }

    async onStepError(event: StepErrorEvent): Promise<void> {
        const errorStack = event.error.stack || '';
        this.logEntries.push({
            timestamp: event.timestamp,
            level: 'error',
            event: 'step-error',
            pipelineId: event.pipelineId,
            stepName: event.stepName,
            message: `Step failed: ${event.stepName} - ${event.error.message}`,
            error: errorStack,
            metadata: {
                duration: event.executionTime,
            },
        });
    }

    /**
     * Get all log entries
     */
    getLogs(): LogEntry[] {
        return [...this.logEntries];
    }

    /**
     * Get logs for a specific pipeline
     */
    getPipelineLogs(pipelineId: string): LogEntry[] {
        return this.logEntries.filter(entry => entry.pipelineId === pipelineId);
    }

    /**
     * Clear all logs
     */
    clearLogs(): void {
        this.logEntries = [];
    }

    /**
     * Export logs as JSON string
     */
    exportLogs(): string {
        return JSON.stringify(this.logEntries, null, 2);
    }
}

interface LogEntry {
    timestamp: Date;
    level: 'debug' | 'info' | 'warn' | 'error';
    event: string;
    pipelineId: string;
    stepName?: string;
    message: string;
    error?: string;
    metadata?: any;
}
