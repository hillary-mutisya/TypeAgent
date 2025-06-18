// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { InsertionContext } from "./collaborationTypes.js";

// Local AI Result interface to avoid conflicts
interface LocalAIResult {
    type: "text" | "mermaid" | "code";
    content: string;
    confidence: number;
}

/**
 * AI Agent that provides mock responses for backward compatibility
 * All real LLM operations now go through markdownActionHandler → translator.js flow
 */
export class AIAgentCollaborator {
    // AI identity (preserved for future use)
    // private userId: string = "ai-agent";
    // private userName: string = "AI Assistant";
    // private userColor: string = "#4A90E2";
    // private userAvatar: string = "🤖";

    private activeRequests: Map<string, AIRequest> = new Map();
    private insertionContexts: Map<string, InsertionContext> = new Map();

    constructor() {
        // AIAgentCollaborator now works without direct collaboration provider
        // All document operations go through the view process via IPC
        console.log("🔄 AI Collaborator initialized for view process operations only");
    }

    /**
     * Start an asynchronous AI request (continue, diagram, augment)
     * Note: Real operations now go through markdownActionHandler
     */
    async startAsyncRequest(
        requestId: string,
        command: "continue" | "diagram" | "augment",
        parameters: any,
        insertionContext: InsertionContext,
    ): Promise<void> {
        console.log(`🤖 AI request queued: ${requestId} (${command})`);
        
        const request: AIRequest = {
            id: requestId,
            command,
            parameters,
            insertionContext,
            timestamp: Date.now(),
            status: "queued",
        };

        this.activeRequests.set(requestId, request);
        this.insertionContexts.set(requestId, insertionContext);

        // Process asynchronously with mock response
        setTimeout(async () => {
            try {
                request.status = "processing";
                const result = await this.executeAICommand(request);
                
                request.status = "completed";
                request.result = result;
                
                console.log(`✅ AI request completed: ${requestId}`);
            } catch (error) {
                request.status = "failed";
                request.error = error as Error;
                console.error(`❌ AI request failed: ${requestId}`, error);
            } finally {
                // Clean up after completion
                setTimeout(() => {
                    this.activeRequests.delete(requestId);
                    this.insertionContexts.delete(requestId);
                }, 30000); // Keep for 30 seconds for debugging
            }
        }, 100);
    }

    /**
     * Execute the actual AI command using mock responses
     * Real LLM operations handled by markdownActionHandler → translator.js
     */
    private async executeAICommand(request: AIRequest): Promise<LocalAIResult> {
        // AIAgentCollaborator now only provides mock responses for backward compatibility
        // All real LLM operations should go through the translator.js flow in markdownActionHandler
        console.log(`🤖 Using mock response for ${request.command} (real LLM operations handled by translator)`);
        return this.getMockResponse(request);
    }

    /**
     * Fallback mock responses for development and testing
     */
    private getMockResponse(request: AIRequest): LocalAIResult {
        // Simulate processing time
        switch (request.command) {
            case "continue":
                return {
                    type: "text",
                    content: "This is AI-generated content that continues the document. The AI analyzed the context and generated relevant content that fits naturally with the existing text.",
                    confidence: 0.85,
                };

            case "diagram":
                const description = request.parameters.description || "process flow";
                return {
                    type: "mermaid",
                    content: `graph TD\n    A[Start: ${description}] --> B{Decision}\n    B -->|Yes| C[Process A]\n    B -->|No| D[Process B]\n    C --> E[End]\n    D --> E`,
                    confidence: 0.9,
                };

            case "augment":
                const instruction = request.parameters.instruction || "improve formatting";
                return {
                    type: "text",
                    content: `\n> ✨ **AI Enhancement Applied**: ${instruction}\n\nThe AI has analyzed the document and applied the requested improvements. This includes better structure, formatting, and content organization.\n`,
                    confidence: 0.8,
                };

            default:
                throw new Error(`Unknown AI command: ${request.command}`);
        }
    }

    /**
     * Check if there are active AI requests
     */
    hasActiveRequests(): boolean {
        return this.activeRequests.size > 0;
    }

    /**
     * Get active request IDs
     */
    getActiveRequestIds(): string[] {
        return Array.from(this.activeRequests.keys());
    }

    /**
     * Get request status
     */
    getRequestStatus(requestId: string): AIRequestStatus | undefined {
        const request = this.activeRequests.get(requestId);
        return request?.status;
    }

    /**
     * Cancel an active request
     */
    cancelRequest(requestId: string): boolean {
        const request = this.activeRequests.get(requestId);
        if (request && request.status !== "completed") {
            request.status = "cancelled";
            this.activeRequests.delete(requestId);
            this.insertionContexts.delete(requestId);
            console.log(`🚫 AI request cancelled: ${requestId}`);
            return true;
        }
        return false;
    }
}

// Type definitions for AI request management
interface AIRequest {
    id: string;
    command: "continue" | "diagram" | "augment";
    parameters: any;
    insertionContext: InsertionContext;
    timestamp: number;
    status: AIRequestStatus;
    result?: LocalAIResult;
    error?: Error;
}

type AIRequestStatus = "queued" | "processing" | "completed" | "failed" | "cancelled";
