// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import {
    PDFQuestionMessage,
    PDFQuestionResult,
    PDFQuestionResultMessage,
} from "./ipcTypes.js";
import { QuestionContext } from "./pdfTypes.js";
import registerDebug from "debug";

const debug = registerDebug("typeagent:views:server:pdf:agent");

/**
 * Service for communicating with the agent process via IPC
 */
export class AgentCommunicationService {
    private pendingRequests: Map<
        string,
        {
            resolve: (value: PDFQuestionResult) => void;
            reject: (error: Error) => void;
            timeout: NodeJS.Timeout;
        }
    > = new Map();
    private requestCounter = 0;
    private readonly ipcTimeout: number;

    constructor() {
        this.ipcTimeout = parseInt(
            process.env.PDF_QUESTION_TIMEOUT || "30000",
        );
        this.setupIPCHandler();
        debug("AgentCommunicationService initialized");
    }

    /**
     * Send question to agent process and wait for response
     */
    async sendQuestionToAgent(
        documentId: string,
        annotationId: string,
        question: string,
        context: QuestionContext,
    ): Promise<PDFQuestionResult> {
        return new Promise((resolve, reject) => {
            const requestId = `pdf_question_${++this.requestCounter}`;

            debug(
                `Sending question to agent: ${requestId}, question: "${question.substring(0, 50)}..."`,
            );

            // Set up timeout
            const timeout = setTimeout(() => {
                this.pendingRequests.delete(requestId);
                debug(`Question ${requestId} timed out after ${this.ipcTimeout}ms`);
                
                const timeoutResult: PDFQuestionResult = {
                    success: false,
                    type: "timeout",
                    error: "Agent communication timeout",
                    response: {
                        content: "I'm sorry, but I'm currently unable to process your question due to a service timeout. Please try again in a moment.",
                        status: "error",
                        timestamp: new Date().toISOString(),
                        hasUnreadResponse: true,
                        notificationMessage: "Question processing timed out. Please try again."
                    }
                };
                
                resolve(timeoutResult);
            }, this.ipcTimeout);

            // Store the request
            this.pendingRequests.set(requestId, { resolve, reject, timeout });

            // Create IPC message
            const message: PDFQuestionMessage = {
                type: "pdfQuestion",
                requestId,
                documentId,
                annotationId,
                question,
                context,
                timestamp: Date.now(),
            };

            // Send to agent process
            if (process.send) {
                process.send(message);
                debug(`Sent IPC message to agent: ${requestId}`);
            } else {
                // No IPC available (development scenario)
                clearTimeout(timeout);
                this.pendingRequests.delete(requestId);
                debug("No IPC available, returning error");
                
                const errorResult: PDFQuestionResult = {
                    success: false,
                    type: "error", 
                    error: "Agent process not available",
                    response: {
                        content: "I'm sorry, but the AI service is currently unavailable. Please try again later or use mock mode for development.",
                        status: "error",
                        timestamp: new Date().toISOString(),
                        hasUnreadResponse: true,
                        notificationMessage: "AI service unavailable. Please try again later."
                    }
                };
                
                resolve(errorResult);
            }
        });
    }

    /**
     * Set up handler for IPC messages from agent
     */
    private setupIPCHandler(): void {
        if (process.on) {
            process.on("message", (message: any) => {
                if (message && message.type === "pdfQuestionResult") {
                    this.handleAgentResponse(message as PDFQuestionResultMessage);
                } else if (message && message.type === "pdfQuestion") {
                    // Handle direct question processing if running in the same process
                    this.handleDirectQuestion(message as PDFQuestionMessage);
                }
            });
            debug("IPC message handler registered");
        }
    }

    /**
     * Handle direct question processing (when running in the same process)
     */
    private async handleDirectQuestion(message: PDFQuestionMessage): Promise<void> {
        debug(`Handling direct question: ${message.requestId}`);
        
        try {
            // For now, return a placeholder response indicating where real integration would happen
            // In a complete implementation, this would call the PDF question handler
            const response = {
                content: `## Real Agent Response

**Question**: ${message.question}

**Context**: ${message.context.type} on page ${message.context.pageNumber}

This is where the real agent would process your question using the PDF question handler. The integration points are:

1. **Agent Handler**: \`src/agent/pdf/questionHandler.mts\`
2. **IPC Communication**: This service handles the message passing
3. **LLM Integration**: The handler would call your preferred LLM service

To complete the integration:
- Wire up the PDF question handler in the agent process
- Configure LLM service endpoints and authentication  
- Handle vision models for screenshot questions
- Implement proper error handling and retries

*This response was generated by the agent communication service.*`,
                status: "complete" as const,
                timestamp: new Date().toISOString(),
                hasUnreadResponse: true
            };
            
            // Send response back
            const result: PDFQuestionResult = {
                success: true,
                response,
                type: "success"
            };
            
            const responseMessage: PDFQuestionResultMessage = {
                type: "pdfQuestionResult",
                requestId: message.requestId,
                result
            };
            
            // Simulate receiving the response
            this.handleAgentResponse(responseMessage);
            
        } catch (error) {
            debug(`Error in direct question handling: ${error}`);
            
            const errorResult: PDFQuestionResult = {
                success: false,
                type: "error",
                error: error instanceof Error ? error.message : "Unknown error",
                response: {
                    content: "I'm sorry, but I encountered an error while processing your question. Please try again.",
                    status: "error",
                    timestamp: new Date().toISOString(),
                    hasUnreadResponse: true,
                    notificationMessage: "Question processing failed. Please try again."
                }
            };
            
            const responseMessage: PDFQuestionResultMessage = {
                type: "pdfQuestionResult",
                requestId: message.requestId,
                result: errorResult
            };
            
            this.handleAgentResponse(responseMessage);
        }
    }

    /**
     * Handle response from agent
     */
    private handleAgentResponse(message: PDFQuestionResultMessage): void {
        const { requestId, result } = message;
        const pendingRequest = this.pendingRequests.get(requestId);

        if (pendingRequest) {
            debug(`Received response from agent for ${requestId}`);
            
            clearTimeout(pendingRequest.timeout);
            this.pendingRequests.delete(requestId);
            
            // Ensure the response has the unread flag set
            if (result.response) {
                result.response.hasUnreadResponse = true;
            }
            
            pendingRequest.resolve(result);
        } else {
            debug(`Received response for unknown request: ${requestId}`);
        }
    }

    /**
     * Clean up any pending requests (useful for testing)
     */
    cleanup(): void {
        for (const [, request] of this.pendingRequests) {
            clearTimeout(request.timeout);
            request.reject(new Error("Service shutting down"));
        }
        this.pendingRequests.clear();
        debug("Cleaned up pending requests");
    }
}
