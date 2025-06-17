// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as Y from "yjs";
import { TypeAgentYjsProvider } from "./TypeAgentYjsProvider.js";
import { UserPresence, InsertionContext } from "./collaborationTypes.js";

// Local AI Result interface to avoid conflicts
interface LocalAIResult {
    type: "text" | "mermaid" | "code";
    content: string;
    confidence: number;
}

// Forward declaration for LLMIntegrationService to avoid circular dependency
interface LLMIntegrationService {
    processAIRequest(
        command: "continue" | "diagram" | "augment" | "research",
        parameters: any,
        context: any
    ): Promise<LocalAIResult>;
}

/**
 * AI Agent that appears as a collaborative user in the editing session
 * Handles asynchronous AI operations while maintaining real-time collaboration
 */
export class AIAgentCollaborator {
    private userId: string = "ai-agent";
    private userName: string = "AI Assistant";
    private userColor: string = "#4A90E2";
    private userAvatar: string = "🤖";

    private collaborationProvider: TypeAgentYjsProvider | null;
    private activeRequests: Map<string, AIRequest> = new Map();
    private insertionContexts: Map<string, InsertionContext> = new Map();
    private llmService?: LLMIntegrationService;

    constructor(collaborationProvider: TypeAgentYjsProvider | null) {
        this.collaborationProvider = collaborationProvider;
        
        if (this.collaborationProvider) {
            this.setupAIPresence();
        } else {
            console.log("🔄 AI Collaborator initialized without direct Yjs access - using view process for operations");
        }
    }

    /**
     * Set the LLM service for real AI integration
     */
    setLLMService(llmService: LLMIntegrationService): void {
        this.llmService = llmService;
        console.log("🧠 AI Collaborator connected to LLM service");
    }

    /**
     * Setup AI as a collaborative user with presence awareness
     */
    private setupAIPresence(): void {
        if (!this.collaborationProvider) {
            console.log("🔄 AI presence setup skipped - no collaboration provider");
            return;
        }
        
        const context = this.collaborationProvider.getContext();

        // Set AI user presence
        if (context.provider && context.provider.awareness) {
            const aiPresence: UserPresence = {
                id: this.userId,
                name: this.userName,
                avatar: this.userAvatar,
                color: this.userColor,
                lastSeen: Date.now(),
                isAI: true,
                status: {
                    working: false,
                    type: "idle",
                    description: "Ready to assist",
                },
            };

            // Add AI to user presence
            context.userPresence.set(this.userId, aiPresence);

            // Notify of AI joining
            if (context.onUserJoin) {
                context.onUserJoin(aiPresence);
            }
        }
    }

    /**
     * Start an asynchronous AI request (continue, diagram, augment)
     */
    async startAsyncRequest(
        requestId: string,
        command: "continue" | "diagram" | "augment",
        parameters: any,
        position: number,
    ): Promise<void> {
        console.log(`🤖 AI starting async request: ${command} (${requestId})`);

        // Capture current document state for context preservation
        const documentSnapshot = this.captureDocumentSnapshot();
        const surroundingContext = this.extractSurroundingContext(position);

        // Create insertion context for smart positioning
        const insertionContext: InsertionContext = {
            originalPosition: position,
            surroundingText: surroundingContext.text,
            requestType: command,
            timestamp: Date.now(),
            documentSnapshot: documentSnapshot,
        };

        // Add optional section heading if available
        if (surroundingContext.section) {
            insertionContext.sectionHeading = surroundingContext.section;
        }

        this.insertionContexts.set(requestId, insertionContext);

        // Create AI request tracking
        const aiRequest: AIRequest = {
            id: requestId,
            command,
            parameters,
            status: "started",
            startTime: Date.now(),
            insertionContext,
        };

        this.activeRequests.set(requestId, aiRequest);

        // Update AI presence to show working status
        this.updateAIStatus(true, command, `Processing ${command} request`);

        // Send status to collaboration context
        if (this.collaborationProvider?.getContext().onAIStatus) {
            this.collaborationProvider.getContext().onAIStatus!({
                requestId,
                status: "started",
                description: `AI started ${command} operation`,
            });
        }

        // Start async processing
        this.processAsyncRequest(aiRequest);
    }

    /**
     * Process AI request asynchronously
     */
    private async processAsyncRequest(request: AIRequest): Promise<void> {
        try {
            // Update status to processing
            this.updateRequestStatus(
                request.id,
                "processing",
                "Generating content...",
            );

            // Simulate AI processing time (replace with actual AI calls)
            const result = await this.executeAICommand(request);

            // When AI completes, find the best insertion point
            const currentInsertionPoint = this.findOptimalInsertionPoint(
                request.insertionContext,
            );

            // Apply AI result to document
            this.applyAIResult(result, currentInsertionPoint);

            // Update status to completed
            this.updateRequestStatus(
                request.id,
                "completed",
                "Content generated successfully",
            );
        } catch (error) {
            console.error(`AI request ${request.id} failed:`, error);
            this.updateRequestStatus(
                request.id,
                "failed",
                `Error: ${(error as Error).message}`,
            );
        } finally {
            // Clean up
            this.activeRequests.delete(request.id);
            this.insertionContexts.delete(request.id);

            // Reset AI status if no more active requests
            if (this.activeRequests.size === 0) {
                this.updateAIStatus(false, undefined, "Ready to assist");
            }
        }
    }

    /**
     * Execute the actual AI command using LLM Integration Service
     */
    private async executeAICommand(request: AIRequest): Promise<LocalAIResult> {
        if (this.llmService) {
            // Get current content - use empty string if no collaboration provider
            const currentContent = this.collaborationProvider?.getMarkdownContent() || "";
            
            const context = {
                currentContent: currentContent,
                cursorPosition: request.insertionContext.originalPosition,
                surroundingText: request.insertionContext.surroundingText,
                sectionHeading: request.insertionContext.sectionHeading,
            };

            console.log(`🤖 Processing ${request.command} with LLM service`);
            
            const result = await this.llmService.processAIRequest(
                request.command,
                request.parameters,
                context
            );

            return {
                type: result.type,
                content: result.content,
                confidence: result.confidence
            };
        } else {
            // Fallback to mock responses for backward compatibility
            console.log(`🤖 Using mock response for ${request.command} (LLM service not available)`);
            return this.getMockResponse(request);
        }
    }

    /**
     * Fallback mock responses when LLM service is not available
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
     * Capture current document state for context preservation
     */
    private captureDocumentSnapshot(): Uint8Array {
        if (!this.collaborationProvider) {
            console.log("🔄 Document snapshot skipped - no collaboration provider");
            return new Uint8Array(); // Return empty state
        }
        
        const ydoc = this.collaborationProvider.getDocument();
        return Y.encodeStateAsUpdate(ydoc);
    }

    /**
     * Extract surrounding context for smart insertion
     */
    private extractSurroundingContext(position: number): {
        text: string;
        section?: string;
    } {
        if (!this.collaborationProvider) {
            console.log("🔄 Context extraction skipped - no collaboration provider");
            return { text: "" };
        }
        
        const content = this.collaborationProvider.getMarkdownContent();
        const lines = content.split("\n");

        // Find the line containing the position
        let currentPos = 0;
        let lineIndex = 0;

        for (let i = 0; i < lines.length; i++) {
            if (currentPos + lines[i].length >= position) {
                lineIndex = i;
                break;
            }
            currentPos += lines[i].length + 1; // +1 for newline
        }

        // Extract surrounding lines for context
        const startLine = Math.max(0, lineIndex - 2);
        const endLine = Math.min(lines.length - 1, lineIndex + 2);
        const surroundingText = lines.slice(startLine, endLine + 1).join("\n");

        // Find nearest section heading
        let sectionHeading: string | undefined;
        for (let i = lineIndex; i >= 0; i--) {
            if (lines[i].startsWith("#")) {
                sectionHeading = lines[i];
                break;
            }
        }

        const result = {
            text: surroundingText,
        } as { text: string; section?: string };

        if (sectionHeading) {
            result.section = sectionHeading;
        }

        return result;
    }

    /**
     * Find optimal insertion point considering document changes
     */
    private findOptimalInsertionPoint(context: InsertionContext): number {
        if (!this.collaborationProvider) {
            console.log("🔄 Using original position - no collaboration provider");
            return context.originalPosition;
        }
        
        const currentContent = this.collaborationProvider.getMarkdownContent();

        // Strategy 1: Try original position if document hasn't changed much
        if (this.isOriginalPositionValid(context, currentContent)) {
            return context.originalPosition;
        }

        // Strategy 2: Find similar context in current document
        const similarPosition = this.findSimilarContext(
            context,
            currentContent,
        );
        if (similarPosition !== -1) {
            return similarPosition;
        }

        // Strategy 3: Use section-based insertion
        if (context.sectionHeading) {
            const sectionPosition = this.findSectionEnd(
                context.sectionHeading,
                currentContent,
            );
            if (sectionPosition !== -1) {
                return sectionPosition;
            }
        }

        // Strategy 4: Fallback to end of document
        return currentContent.length;
    }

    /**
     * Check if original position is still valid
     */
    private isOriginalPositionValid(
        context: InsertionContext,
        currentContent: string,
    ): boolean {
        const originalLines = context.surroundingText.split("\n");

        // Simple heuristic: check if surrounding text still exists nearby
        const contextText = originalLines.slice(1, -1).join("\n"); // Remove first/last lines for fuzzy matching
        return currentContent.includes(contextText);
    }

    /**
     * Find similar context in current document
     */
    private findSimilarContext(
        context: InsertionContext,
        currentContent: string,
    ): number {
        const lines = currentContent.split("\n");
        const originalLines = context.surroundingText.split("\n");

        // Look for the most distinctive line from the original context
        const searchLine = originalLines.find(
            (line) => line.trim().length > 10,
        );
        if (!searchLine) return -1;

        const foundIndex = lines.findIndex((line) =>
            line.includes(searchLine.trim()),
        );
        if (foundIndex === -1) return -1;

        // Return position at end of found line
        let position = 0;
        for (let i = 0; i <= foundIndex; i++) {
            position += lines[i].length + 1; // +1 for newline
        }

        return position;
    }

    /**
     * Find end of section for section-based insertion
     */
    private findSectionEnd(sectionHeading: string, content: string): number {
        const lines = content.split("\n");
        const headingLevel = sectionHeading.match(/^#+/)?.[0].length || 1;

        let sectionStartIndex = -1;
        let sectionEndIndex = lines.length;

        // Find section start
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim() === sectionHeading.trim()) {
                sectionStartIndex = i;
                break;
            }
        }

        if (sectionStartIndex === -1) return -1;

        // Find section end (next heading of same or higher level)
        for (let i = sectionStartIndex + 1; i < lines.length; i++) {
            const line = lines[i];
            if (line.startsWith("#")) {
                const currentLevel = line.match(/^#+/)?.[0].length || 1;
                if (currentLevel <= headingLevel) {
                    sectionEndIndex = i;
                    break;
                }
            }
        }

        // Return position at end of section
        let position = 0;
        for (let i = 0; i < sectionEndIndex; i++) {
            position += lines[i].length + 1;
        }

        return position;
    }

    /**
     * Apply AI result to document at optimal position
     */
    private applyAIResult(result: LocalAIResult, position: number): void {
        let insertText: string;

        switch (result.type) {
            case "text":
                insertText = `\n${result.content}\n`;
                break;
            case "mermaid":
                insertText = `\n\`\`\`mermaid\n${result.content}\n\`\`\`\n`;
                break;
            default:
                insertText = `\n${result.content}\n`;
        }

        // Apply to Yjs document (this will sync to all users)
        if (this.collaborationProvider) {
            this.collaborationProvider.applyTextOperation(position, insertText);
        } else {
            console.log("🔄 Text operation skipped - no collaboration provider");
        }

        console.log(
            `🤖 AI applied ${result.type} content at position ${position}`,
        );
    }

    /**
     * Update AI presence status
     */
    private updateAIStatus(
        working: boolean,
        type?: string,
        description?: string,
    ): void {
        if (!this.collaborationProvider) {
            console.log(`🔄 AI status update skipped - no collaboration provider: ${type}`);
            return;
        }
        
        const context = this.collaborationProvider.getContext();
        const aiPresence = context.userPresence.get(this.userId);

        if (aiPresence) {
            const statusUpdate = {
                working,
            } as { working: boolean; type?: string; description?: string };

            if (type) {
                statusUpdate.type = type;
            }
            if (description) {
                statusUpdate.description = description;
            }

            aiPresence.status = statusUpdate;
            aiPresence.lastSeen = Date.now();

            context.userPresence.set(this.userId, aiPresence);
        }
    }

    /**
     * Update request status and notify collaboration context
     */
    private updateRequestStatus(
        requestId: string,
        status: "started" | "processing" | "completed" | "failed",
        description: string,
    ): void {
        const request = this.activeRequests.get(requestId);
        if (request) {
            request.status = status;
        }

        // Notify collaboration context
        if (this.collaborationProvider?.getContext().onAIStatus) {
            this.collaborationProvider.getContext().onAIStatus!({
                requestId,
                status,
                description,
            });
        }
    }

    /**
     * Get current AI status for UI display
     */
    getAIStatus(): UserPresence | undefined {
        return this.collaborationProvider
            ?.getContext()
            ?.userPresence?.get(this.userId) || undefined;
    }

    /**
     * Get active AI requests
     */
    getActiveRequests(): AIRequest[] {
        return Array.from(this.activeRequests.values());
    }
}

/**
 * AI Request interface
 */
interface AIRequest {
    id: string;
    command: "continue" | "diagram" | "augment";
    parameters: any;
    status: "started" | "processing" | "completed" | "failed";
    startTime: number;
    insertionContext: InsertionContext;
}

/**
 * AI Result interface
 */
interface LocalAIResult {
    type: "text" | "mermaid" | "code";
    content: string;
    confidence: number;
}
