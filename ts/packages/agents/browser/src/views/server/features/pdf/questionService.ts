// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import {
    QuestionContext,
    QuestionResponse,
    QuestionAnnotationData,
} from "./pdfTypes.js";
import { PDFQuestionResult } from "./ipcTypes.js";
import registerDebug from "debug";

const debug = registerDebug("typeagent:views:server:pdf:question");

/**
 * Service for processing PDF questions with configurable mock/real mode
 */
export class QuestionService {
    private readonly useMockLLM: boolean;
    private readonly mockDelay: number;
    private readonly ipcTimeout: number;

    constructor() {
        // Parse environment variables with defaults
        this.useMockLLM = process.env.PDF_MOCK_LLM !== "false"; // Default true
        this.mockDelay = parseInt(process.env.PDF_MOCK_DELAY || "3000");
        this.ipcTimeout = parseInt(
            process.env.PDF_QUESTION_TIMEOUT || "30000",
        );

        debug(
            `QuestionService initialized - mockMode: ${this.useMockLLM}, mockDelay: ${this.mockDelay}ms, timeout: ${this.ipcTimeout}ms`,
        );
    }

    /**
     * Process a question and return a response
     */
    async processQuestion(
        documentId: string,
        annotationId: string,
        question: string,
        context: QuestionContext,
    ): Promise<PDFQuestionResult> {
        debug(
            `Processing question for annotation ${annotationId}: "${question.substring(0, 100)}..."`,
        );

        if (this.useMockLLM) {
            return await this.getMockResponse(question, context);
        } else {
            return await this.getRealResponse(
                documentId,
                annotationId,
                question,
                context,
            );
        }
    }

    /**
     * Generate mock response with configured delay
     */
    private async getMockResponse(
        question: string,
        context: QuestionContext,
    ): Promise<PDFQuestionResult> {
        debug(`Generating mock response with ${this.mockDelay}ms delay`);

        // Wait for configured delay to simulate processing
        await new Promise((resolve) => setTimeout(resolve, this.mockDelay));

        const mockContent = this.generateMockContent(question, context);

        const response: QuestionResponse = {
            content: mockContent,
            status: "complete",
            timestamp: new Date().toISOString(),
            hasUnreadResponse: true,
        };

        return {
            success: true,
            response,
            type: "success",
        };
    }

    /**
     * Get real response from agent via IPC
     */
    private async getRealResponse(
        documentId: string,
        annotationId: string,
        question: string,
        context: QuestionContext,
    ): Promise<PDFQuestionResult> {
        debug("Attempting real agent communication");

        try {
            // Import the agent communication service
            const { AgentCommunicationService } = await import("./agentCommunication.js");
            const agentComm = new AgentCommunicationService();
            
            const result = await agentComm.sendQuestionToAgent(
                documentId,
                annotationId,
                question,
                context
            );
            
            return result;
        } catch (error) {
            debug("Error in real response handling:", error);

            const response: QuestionResponse = {
                content:
                    "I'm sorry, but I'm currently unable to process your question due to a service error. Please try again in a moment.",
                status: "error",
                timestamp: new Date().toISOString(),
                hasUnreadResponse: true,
                notificationMessage:
                    "Question processing failed. Please try again.",
            };

            return {
                success: false,
                response,
                type: "error",
                error: error instanceof Error ? error.message : "Unknown error",
            };
        }
    }

    /**
     * Generate helpful mock content based on question and context
     */
    private generateMockContent(
        question: string,
        context: QuestionContext,
    ): string {
        const contextInfo =
            context.type === "text"
                ? `text selection on page ${context.pageNumber}`
                : `screenshot from page ${context.pageNumber}`;

        return `**This is a simulated AI response for development purposes.**

Based on your question about the document content and the ${contextInfo}, here's what I can tell you:

## Your Question
"${question}"

## Simulated Analysis
- This is a mock response to help with development and testing
- In production, the AI would analyze your specific context
- For text questions, it would examine the selected text and surrounding content  
- For screenshot questions, it would analyze the visual elements in the image

## Key Points
- **Context Type**: ${context.type === "text" ? "Text Selection" : "Screenshot"}
- **Page**: ${context.pageNumber}
- **Processing Mode**: Mock/Development
${context.textContent ? `- **Selected Text**: "${context.textContent.substring(0, 100)}${context.textContent.length > 100 ? "..." : ""}"` : ""}

## Next Steps
To enable real AI responses:
1. Set \`PDF_MOCK_LLM=false\` in your environment
2. Ensure the agent service is properly configured
3. Connect to your preferred LLM service

*This response was generated in ${this.mockDelay / 1000} seconds to simulate realistic processing time.*`;
    }

    /**
     * Create question annotation data from input
     */
    createQuestionData(
        question: string,
        context: QuestionContext,
    ): QuestionAnnotationData {
        return {
            question,
            context,
            response: {
                content: "",
                status: "pending",
                timestamp: new Date().toISOString(),
                hasUnreadResponse: false,
            },
        };
    }

    /**
     * Update annotation with response
     */
    updateAnnotationWithResponse(
        questionData: QuestionAnnotationData,
        response: QuestionResponse,
    ): QuestionAnnotationData {
        return {
            ...questionData,
            response,
        };
    }
}
