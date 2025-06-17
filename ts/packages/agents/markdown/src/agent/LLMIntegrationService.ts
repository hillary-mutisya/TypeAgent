// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { MarkdownAgent } from "./translator.js";
import { MarkdownUpdateResult, DocumentOperation } from "./markdownOperationSchema.js";
import findConfig from "find-config";
import dotenv from "dotenv";

// Load environment variables from .env file if needed
if (!process.env["AZURE_OPENAI_ENDPOINT"] && !process.env["OPENAI_ENDPOINT"]) {
    const dotEnvPath = findConfig(".env");
    if (dotEnvPath) {
        console.log(`🔧 [LLMIntegrationService] Loading environment variables from: ${dotEnvPath}`);
        dotenv.config({ path: dotEnvPath });
    }
}

/**
 * Core service that bridges AI commands with real LLM integration
 * Replaces mock responses with actual TypeAgent LLM capabilities
 */
export class LLMIntegrationService {
    private markdownAgent: MarkdownAgent<MarkdownUpdateResult> | null = null;
    private config: LLMConfig;
    private initializationPromise: Promise<void>;

    constructor(
        modelType: "GPT_35_TURBO" | "GPT_4" | "GPT_4o",
        config: Partial<LLMConfig> = {}
    ) {
        this.config = { ...DEFAULT_LLM_CONFIG, ...config };
        this.initializationPromise = this.initializeMarkdownAgent(modelType);
    }

    private async initializeMarkdownAgent(modelType: string): Promise<void> {
        try {
            console.log(`🔧 Initializing MarkdownAgent with model: ${modelType}`);
            
            // Use existing createMarkdownAgent function
            const { createMarkdownAgent } = await import("./translator.js");
            this.markdownAgent = await createMarkdownAgent(modelType as any);
            
            console.log(`✅ LLM Integration Service initialized with ${modelType}`);
        } catch (error) {
            console.error("❌ Failed to initialize MarkdownAgent:", error);
            console.error("Stack trace:", (error as Error).stack);
            
            // Log specific error details for debugging
            if (error instanceof Error) {
                if (error.message.includes("AZURE_OPENAI")) {
                    console.error("💡 Azure OpenAI configuration issue. Check environment variables:");
                    console.error("- AZURE_OPENAI_API_KEY");
                    console.error("- AZURE_OPENAI_API_INSTANCE_NAME"); 
                    console.error("- AZURE_OPENAI_API_DEPLOYMENT_NAME");
                } else if (error.message.includes("schema") || error.message.includes("file")) {
                    console.error("💡 Schema file loading issue. Check file paths and permissions.");
                } else {
                    console.error("💡 Generic initialization error:", error.message);
                }
            }
            
            throw error;
        }
    }

    private async ensureInitialized(): Promise<void> {
        await this.initializationPromise;
        if (!this.markdownAgent) {
            throw new Error("MarkdownAgent not initialized");
        }
    }

    /**
     * Main entry point - replaces AIAgentCollaborator.executeAICommand()
     */
    async processAIRequest(
        command: "continue" | "diagram" | "augment" | "research",
        parameters: any,
        context: AIRequestContext,
        streamingCallback?: StreamingCallback
    ): Promise<AIResult> {
        await this.ensureInitialized();
        
        console.log(`🤖 LLMIntegrationService processing ${command} command`);

        // Determine if this operation should stream
        const shouldStream = this.shouldStreamOperation(command, parameters);
        
        if (shouldStream && streamingCallback) {
            return await this.processStreamingRequest(command, parameters, context, streamingCallback);
        } else {
            return await this.processValidateFirstRequest(command, parameters, context);
        }
    }

    /**
     * Determine if operation should use streaming based on command and config
     */
    private shouldStreamOperation(command: string, parameters: any): boolean {
        if (!this.config.streamingEnabled) {
            return false;
        }

        switch (command) {
            case "continue":
                return this.config.streaming.continueStreaming;
            case "research":
                return this.config.streaming.researchStreaming;
            case "augment":
                return this.config.streaming.augmentStreaming && 
                       parameters.scope === "document";
            case "diagram":
                return false; // Never stream - syntax validation critical
            default:
                return false;
        }
    }

    /**
     * Process requests with streaming support
     */
    private async processStreamingRequest(
        command: string,
        parameters: any,
        context: AIRequestContext,
        streamingCallback: StreamingCallback
    ): Promise<AIResult> {
        switch (command) {
            case "continue":
                return await this.streamContinueRequest(parameters, context, streamingCallback);
            case "research":
                return await this.streamResearchRequest(parameters, context, streamingCallback);
            case "augment":
                return await this.streamAugmentRequest(parameters, context, streamingCallback);
            default:
                throw new Error(`Streaming not supported for command: ${command}`);
        }
    }

    /**
     * Process requests with validation-first approach
     */
    private async processValidateFirstRequest(
        command: string,
        parameters: any,
        context: AIRequestContext
    ): Promise<AIResult> {
        switch (command) {
            case "continue":
                return await this.processContinueRequest(parameters, context);
            case "diagram":
                return await this.processDiagramRequest(parameters, context);
            case "augment":
                return await this.processAugmentRequest(parameters, context);
            case "research":
                return await this.processResearchRequest(parameters, context);
            default:
                throw new Error(`Unknown AI command: ${command}`);
        }
    }

    /**
     * Generate contextual content continuation with streaming
     */
    private async streamContinueRequest(
        parameters: any,
        context: AIRequestContext,
        streamingCallback: StreamingCallback
    ): Promise<AIResult> {
        try {
            await this.ensureInitialized();
            
            const prompt = this.buildContinuePrompt(context, parameters.hint);
            console.log(`🤖 Generated prompt for continue request: ${prompt.substring(0, 100)}...`);
            
            streamingCallback.onProgress("Analyzing context and generating continuation...");
            
            console.log(`📝 Calling markdownAgent.updateDocument with content length: ${context.currentContent.length}`);
            
            const response = await this.markdownAgent!.updateDocument(
                context.currentContent,
                prompt
            );

            console.log(`📊 LLM Response received:`, {
                success: response.success,
                hasData: response.success ? !!response.data : false,
                hasOperations: response.success ? !!(response.data?.operations) : false,
                operationsCount: response.success ? (response.data?.operations?.length || 0) : 0
            });

            if (response.success && response.data.operations) {
                // Simulate streaming by breaking content into chunks
                const content = this.extractContentFromOperations(response.data.operations);
                console.log(`✂️ Extracted content length: ${content.length}`);
                
                await this.simulateStreaming(content, streamingCallback);

                return {
                    type: "text",
                    content,
                    confidence: 0.85,
                    operations: response.data.operations
                };
            } else {
                const errorMsg = `LLM response unsuccessful: success=${response.success}`;
                console.error("❌", errorMsg);
                
                if (!response.success) {
                    console.error("Response error details:", response);
                }
                
                throw new Error("Failed to generate continuation - LLM response was unsuccessful");
            }
        } catch (error) {
            console.error("❌ Stream continue request failed:", error);
            console.error("Error details:", {
                name: (error as Error).name,
                message: (error as Error).message,
                stack: (error as Error).stack
            });
            
            streamingCallback.onProgress("Error generating content");
            throw error;
        }
    }

    /**
     * Generate content continuation without streaming
     */
    private async processContinueRequest(
        parameters: any,
        context: AIRequestContext
    ): Promise<AIResult> {
        const prompt = this.buildContinuePrompt(context, parameters.hint);
        
        const response = await this.markdownAgent!.updateDocument(
            context.currentContent,
            prompt
        );

        if (response.success && response.data.operations) {
            const content = this.extractContentFromOperations(response.data.operations);
            return {
                type: "text",
                content,
                confidence: 0.85,
                operations: response.data.operations
            };
        } else {
            throw new Error("Failed to generate continuation");
        }
    }

    /**
     * Generate Mermaid diagrams with validation
     */
    private async processDiagramRequest(
        parameters: any,
        context: AIRequestContext
    ): Promise<AIResult> {
        const description = parameters.description || "process flow";
        const prompt = this.buildDiagramPrompt(description, parameters.diagramType);
        
        const response = await this.markdownAgent!.updateDocument(
            context.currentContent,
            prompt
        );

        if (response.success && response.data.operations) {
            const content = this.extractContentFromOperations(response.data.operations);
            
            // Validate Mermaid syntax
            const validationResult = this.validateMermaidSyntax(content);
            if (!validationResult.isValid) {
                console.warn("Generated diagram has syntax issues:", validationResult.errors);
            }

            return {
                type: "mermaid",
                content,
                confidence: validationResult.isValid ? 0.9 : 0.6,
                operations: response.data.operations
            };
        } else {
            throw new Error("Failed to generate diagram");
        }
    }

    /**
     * Build specialized prompt for content continuation
     */
    private buildContinuePrompt(context: AIRequestContext, hint?: string): string {
        let prompt = `Continue writing the markdown document from where it currently ends. `;
        
        if (hint) {
            prompt += `User hint: "${hint}". `;
        }

        prompt += `Analyze the existing content for:
- Writing style and tone
- Current topic and direction
- Document structure and formatting
- Target audience level

Generate 2-3 paragraphs that naturally continue the content while maintaining consistency. 
Ensure the continuation fits seamlessly with the existing text.`;

        return prompt;
    }

    /**
     * Build specialized prompt for diagram generation
     */
    private buildDiagramPrompt(description: string, diagramType: string): string {
        return `Create a Mermaid diagram based on this description: "${description}".

Choose the most appropriate diagram type:
- flowchart (graph TD/LR) for processes and workflows
- sequence diagram (sequenceDiagram) for interactions
- class diagram (classDiagram) for data structures
- pie chart (pie) for data distributions

Generate valid Mermaid syntax that clearly represents the described concept.
Use clear, descriptive labels and logical structure.`;
    }

    /**
     * Extract text content from document operations
     */
    private extractContentFromOperations(operations: DocumentOperation[]): string {
        return operations
            .map(op => {
                if (op.type === "insert" && op.content) {
                    return op.content.map(item => this.contentItemToText(item)).join("");
                }
                return "";
            })
            .join("");
    }

    /**
     * Convert content item to text (reuse existing logic)
     */
    private contentItemToText(item: any): string {
        if (item.text) {
            return item.text;
        }

        if (item.content) {
            return item.content
                .map((child: any) => this.contentItemToText(child))
                .join("");
        }

        switch (item.type) {
            case "paragraph":
                return "\n" + (item.content ? item.content.map(this.contentItemToText).join("") : "") + "\n";
            case "heading":
                const level = item.attrs?.level || 1;
                const prefix = "#".repeat(level) + " ";
                return "\n" + prefix + (item.content ? item.content.map(this.contentItemToText).join("") : "") + "\n";
            case "mermaid":
                return "\n```mermaid\n" + (item.attrs?.content || "") + "\n```\n";
            default:
                return item.content ? item.content.map(this.contentItemToText).join("") : "";
        }
    }

    /**
     * Simulate streaming by breaking content into chunks
     * TODO: Replace with real streaming in Phase 2
     */
    private async simulateStreaming(
        content: string,
        streamingCallback: StreamingCallback
    ): Promise<void> {
        const words = content.split(" ");
        const chunkSize = 3; // Stream 3 words at a time
        
        for (let i = 0; i < words.length; i += chunkSize) {
            const chunk = words.slice(i, i + chunkSize).join(" ");
            const isLast = i + chunkSize >= words.length;
            
            streamingCallback.onContent(chunk + (isLast ? "" : " "));
            
            // Small delay to simulate real streaming
            await new Promise(resolve => setTimeout(resolve, 150));
        }
    }

    /**
     * Basic Mermaid syntax validation
     */
    private validateMermaidSyntax(content: string): ValidationResult {
        // Extract Mermaid code from markdown
        const mermaidMatch = content.match(/```mermaid\n([\s\S]*?)\n```/);
        if (!mermaidMatch) {
            return { isValid: false, errors: ["No Mermaid code block found"] };
        }

        const mermaidCode = mermaidMatch[1];
        const errors: string[] = [];

        // Basic syntax checks
        if (!mermaidCode.trim()) {
            errors.push("Empty Mermaid diagram");
        }

        // Check for common diagram types
        const validStarters = [
            "graph", "flowchart", "sequenceDiagram", "classDiagram", 
            "pie", "gantt", "gitgraph", "journey"
        ];
        
        const hasValidStarter = validStarters.some(starter => 
            mermaidCode.trim().startsWith(starter)
        );

        if (!hasValidStarter) {
            errors.push("Diagram doesn't start with a valid Mermaid diagram type");
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    private async streamResearchRequest(parameters: any, context: AIRequestContext, streamingCallback: StreamingCallback): Promise<AIResult> {
        throw new Error("Research streaming not yet implemented");
    }

    private async streamAugmentRequest(parameters: any, context: AIRequestContext, streamingCallback: StreamingCallback): Promise<AIResult> {
        throw new Error("Augment streaming not yet implemented");
    }

    private async processAugmentRequest(parameters: any, context: AIRequestContext): Promise<AIResult> {
        throw new Error("Augment processing not yet implemented");
    }

    private async processResearchRequest(parameters: any, context: AIRequestContext): Promise<AIResult> {
        throw new Error("Research processing not yet implemented");
    }
}

// Type definitions
export interface AIRequestContext {
    currentContent: string;
    cursorPosition: number;
    surroundingText: string;
    sectionHeading?: string;
    documentMetadata?: {
        style: "technical" | "casual" | "academic";
        complexity: "beginner" | "intermediate" | "advanced";
        topics: string[];
    };
}

export interface AIResult {
    type: "text" | "mermaid" | "code";
    content: string;
    confidence: number;
    operations?: DocumentOperation[];
    validationWarnings?: string[];
    sources?: any[];
}

export interface StreamingCallback {
    onContent(delta: string): void;
    onProgress(status: string): void;
    onComplete?(): void;
    onError?(error: Error): void;
}

export interface ValidationResult {
    isValid: boolean;
    errors: string[];
}

export interface LLMConfig {
    streamingEnabled: boolean;
    streaming: {
        continueStreaming: boolean;
        researchStreaming: boolean;
        augmentStreaming: boolean;
        diagramStreaming: boolean;
        maxStreamingTokens: number;
        tokenBufferSize: number;
        validationDelay: number;
        showProgressIndicators: boolean;
    };
}

export const DEFAULT_LLM_CONFIG: LLMConfig = {
    streamingEnabled: true,
    streaming: {
        continueStreaming: true,
        researchStreaming: true,
        augmentStreaming: false,
        diagramStreaming: false,
        maxStreamingTokens: 1000,
        tokenBufferSize: 10,
        validationDelay: 500,
        showProgressIndicators: true,
    }
};
