// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { AIAgentCollaborator } from "./AIAgentCollaborator.js";

/**
 * Handles asynchronous research and content generation operations
 * Manages AI requests that may take longer than immediate user interactions
 */
export class AsyncResearchHandler {
    private aiCollaborator: AIAgentCollaborator;
    private requestQueue: Map<string, QueuedRequest> = new Map();
    private processingQueue: Set<string> = new Set();
    private requestCounter: number = 0;

    constructor(aiCollaborator: AIAgentCollaborator) {
        this.aiCollaborator = aiCollaborator;
    }

    /**
     * Queue an AI research request with context preservation
     */
    async queueResearchRequest(
        command: "continue" | "diagram" | "augment" | "research",
        parameters: any,
        position: number,
        priority: "high" | "medium" | "low" = "medium",
    ): Promise<string> {
        const requestId = this.generateRequestId();

        const queuedRequest: QueuedRequest = {
            id: requestId,
            command,
            parameters,
            position,
            priority,
            queuedAt: Date.now(),
            status: "queued",
        };

        this.requestQueue.set(requestId, queuedRequest);

        console.log(
            `📋 Queued AI request: ${command} (${requestId}) with priority ${priority}`,
        );

        // Start processing if not already busy
        this.processNextRequest();

        return requestId;
    }

    /**
     * Process the next request in the queue
     */
    private async processNextRequest(): Promise<void> {
        // Don't start new requests if already processing max concurrent requests
        if (this.processingQueue.size >= this.getMaxConcurrentRequests()) {
            return;
        }

        // Find highest priority queued request
        const nextRequest = this.getNextQueuedRequest();
        if (!nextRequest) {
            return;
        }

        // Move from queue to processing
        this.requestQueue.delete(nextRequest.id);
        this.processingQueue.add(nextRequest.id);
        nextRequest.status = "processing";

        try {
            // Create a basic insertion context from the position
            const insertionContext: any = {
                originalPosition: nextRequest.position,
                surroundingText: "",
                sectionHeading: undefined,
            };

            // Start the AI collaborator processing
            await this.aiCollaborator.startAsyncRequest(
                nextRequest.id,
                nextRequest.command as any,
                nextRequest.parameters,
                insertionContext,
            );
        } catch (error) {
            console.error(
                `Failed to process AI request ${nextRequest.id}:`,
                error,
            );
        } finally {
            // Remove from processing queue
            this.processingQueue.delete(nextRequest.id);

            // Process next request if any
            this.processNextRequest();
        }
    }

    /**
     * Get next queued request by priority
     */
    private getNextQueuedRequest(): QueuedRequest | null {
        const queuedRequests = Array.from(this.requestQueue.values())
            .filter((req) => req.status === "queued")
            .sort((a, b) => {
                // Sort by priority first, then by queue time
                const priorityOrder = { high: 3, medium: 2, low: 1 };
                const priorityDiff =
                    priorityOrder[b.priority] - priorityOrder[a.priority];
                if (priorityDiff !== 0) return priorityDiff;

                return a.queuedAt - b.queuedAt; // FIFO for same priority
            });

        return queuedRequests[0] || null;
    }

    /**
     * Cancel a queued or processing request
     */
    cancelRequest(requestId: string): boolean {
        if (this.requestQueue.has(requestId)) {
            this.requestQueue.delete(requestId);
            console.log(`❌ Cancelled queued AI request: ${requestId}`);
            return true;
        }

        if (this.processingQueue.has(requestId)) {
            // For processing requests, we can't immediately cancel,
            // but we can mark them for cancellation
            console.log(
                `⏹️ Marked processing AI request for cancellation: ${requestId}`,
            );
            return true;
        }

        return false;
    }

    /**
     * Handle special research requests that require external data
     */
    async handleResearchRequest(
        query: string,
        context: { fullContent: string; position: number; timestamp: number },
        position: number,
    ): Promise<string> {
        const requestId = await this.queueResearchRequest(
            "research",
            { query, context },
            position,
            "medium",
        );

        console.log(`🔍 Started research request for: "${query}"`);
        return requestId;
    }

    /**
     * Handle continue writing requests with context analysis
     */
    async handleContinueRequest(
        position: number,
        hint?: string,
    ): Promise<string> {
        const requestId = await this.queueResearchRequest(
            "continue",
            { hint, contextAnalysis: true },
            position,
            "high", // Continue requests are high priority for user experience
        );

        console.log(
            `✍️ Started continue writing request at position ${position}`,
        );
        return requestId;
    }

    /**
     * Handle diagram generation with smart analysis
     */
    async handleDiagramRequest(
        description: string,
        diagramType: "mermaid" | "plantuml" | "auto",
        position: number,
    ): Promise<string> {
        const requestId = await this.queueResearchRequest(
            "diagram",
            { description, diagramType },
            position,
            "medium",
        );

        console.log(`📊 Started diagram generation for: "${description}"`);
        return requestId;
    }

    /**
     * Handle document augmentation requests
     */
    async handleAugmentRequest(
        instruction: string,
        scope: "selection" | "section" | "document",
        position: number,
    ): Promise<string> {
        const requestId = await this.queueResearchRequest(
            "augment",
            { instruction, scope },
            position,
            "low", // Augmentation can wait
        );

        console.log(`🔧 Started document augmentation: "${instruction}"`);
        return requestId;
    }

    /**
     * Get queue status for UI display
     */
    getQueueStatus(): QueueStatus {
        const queued = Array.from(this.requestQueue.values());
        const processing = Array.from(this.processingQueue);

        return {
            queuedCount: queued.length,
            processingCount: processing.length,
            queuedRequests: queued.map((req) => ({
                id: req.id,
                command: req.command,
                priority: req.priority,
                queuedAt: req.queuedAt,
                status: req.status,
            })),
            processingRequests: processing,
        };
    }

    /**
     * Estimate completion time for a request
     */
    estimateCompletionTime(requestId: string): number | null {
        const request = this.requestQueue.get(requestId);
        if (!request) return null;

        // Base time estimates per command type (in milliseconds)
        const baseEstimates = {
            continue: 3000,
            diagram: 5000,
            augment: 4000,
            research: 8000,
        };

        const baseTime = baseEstimates[request.command] || 5000;

        // Add queue wait time
        const queuePosition = this.getQueuePosition(requestId);
        const queueWaitTime = queuePosition * 2000; // Assume 2s per queued request

        return baseTime + queueWaitTime;
    }

    /**
     * Get position of request in queue
     */
    private getQueuePosition(requestId: string): number {
        const queuedRequests = Array.from(this.requestQueue.values())
            .filter((req) => req.status === "queued")
            .sort((a, b) => {
                const priorityOrder = { high: 3, medium: 2, low: 1 };
                const priorityDiff =
                    priorityOrder[b.priority] - priorityOrder[a.priority];
                if (priorityDiff !== 0) return priorityDiff;
                return a.queuedAt - b.queuedAt;
            });

        return queuedRequests.findIndex((req) => req.id === requestId);
    }

    /**
     * Generate unique request ID
     */
    private generateRequestId(): string {
        return `ai-req-${Date.now()}-${++this.requestCounter}`;
    }

    /**
     * Get maximum concurrent requests based on system capabilities
     */
    private getMaxConcurrentRequests(): number {
        // For now, limit to 2 concurrent AI operations
        // This can be made configurable based on system resources
        return 2;
    }

    /**
     * Clear completed and failed requests from tracking
     */
    cleanup(): void {
        const now = Date.now();
        const maxAge = 5 * 60 * 1000; // 5 minutes

        for (const [id, request] of this.requestQueue.entries()) {
            if (now - request.queuedAt > maxAge) {
                this.requestQueue.delete(id);
                console.log(`🧹 Cleaned up old request: ${id}`);
            }
        }
    }

    /**
     * Get detailed analytics about AI request patterns
     */
    getAnalytics(): RequestAnalytics {
        const requests = Array.from(this.requestQueue.values());

        const commandCounts = requests.reduce(
            (acc, req) => {
                acc[req.command] = (acc[req.command] || 0) + 1;
                return acc;
            },
            {} as Record<string, number>,
        );

        const averageQueueTime =
            requests.length > 0
                ? requests.reduce(
                      (sum, req) => sum + (Date.now() - req.queuedAt),
                      0,
                  ) / requests.length
                : 0;

        return {
            totalRequests: requests.length,
            commandCounts,
            averageQueueTime,
            processingCapacity: this.getMaxConcurrentRequests(),
            currentLoad:
                this.processingQueue.size / this.getMaxConcurrentRequests(),
        };
    }
}

/**
 * Queued request interface
 */
interface QueuedRequest {
    id: string;
    command: "continue" | "diagram" | "augment" | "research";
    parameters: any;
    position: number;
    priority: "high" | "medium" | "low";
    queuedAt: number;
    status: "queued" | "processing" | "completed" | "failed";
}

/**
 * Queue status interface
 */
interface QueueStatus {
    queuedCount: number;
    processingCount: number;
    queuedRequests: Array<{
        id: string;
        command: string;
        priority: string;
        queuedAt: number;
        status: string;
    }>;
    processingRequests: string[];
}

/**
 * Request analytics interface
 */
interface RequestAnalytics {
    totalRequests: number;
    commandCounts: Record<string, number>;
    averageQueueTime: number;
    processingCapacity: number;
    currentLoad: number;
}
