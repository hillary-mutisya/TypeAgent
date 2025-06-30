// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import {
    PDFQuestionRequest,
    PDFQuestionResponse,
    PDFQuestionContext,
} from "./types.js";
import registerDebug from "debug";

const debug = registerDebug("typeagent:agent:pdf:question");

/**
 * Handler for PDF question processing in the agent
 */
export class PDFQuestionHandler {
    /**
     * Process a PDF question and generate a response
     */
    async processQuestion(
        request: PDFQuestionRequest,
    ): Promise<PDFQuestionResponse> {
        debug(
            `Processing PDF question for document ${request.documentId}: "${request.question.substring(0, 50)}..."`,
        );

        try {
            // This is where real LLM integration would happen
            // For now, return a placeholder response
            const response = await this.generateLLMResponse(
                request.question,
                request.context,
            );

            return {
                content: response,
                status: "complete",
                timestamp: new Date().toISOString(),
                hasUnreadResponse: true,
            };
        } catch (error) {
            debug("Error processing PDF question:", error);

            return {
                content:
                    "I apologize, but I encountered an error while processing your question. Please try again.",
                status: "error",
                timestamp: new Date().toISOString(),
                hasUnreadResponse: true,
                notificationMessage:
                    "Question processing failed. Please try again.",
            };
        }
    }

    /**
     * Generate LLM response based on question and context
     */
    private async generateLLMResponse(
        question: string,
        context: PDFQuestionContext,
    ): Promise<string> {
        // This is where you would integrate with your LLM service
        // For example, using OpenAI API, Anthropic Claude, or local models

        const prompt = this.createPromptFromContext(question, context);

        // Placeholder for actual LLM call
        debug("Generated prompt for LLM:", prompt.substring(0, 200) + "...");

        // For now, return a structured response indicating the integration point
        return this.createPlaceholderResponse(question, context);
    }

    /**
     * Create a prompt for the LLM based on the question and context
     */
    private createPromptFromContext(
        question: string,
        context: PDFQuestionContext,
    ): string {
        let prompt = `You are an AI assistant helping a user understand a PDF document. Answer their question based on the provided context.\n\n`;

        prompt += `User Question: ${question}\n\n`;

        if (context.type === "text") {
            prompt += `Context Type: Text Selection\n`;
            prompt += `Page Number: ${context.pageNumber}\n`;

            if (context.textContent) {
                prompt += `Selected Text: "${context.textContent}"\n\n`;
            }

            if (context.pageText) {
                prompt += `Full Page Context:\n${context.pageText}\n\n`;
            }

            prompt += `Please answer the user's question based on the selected text and surrounding page context. Provide a clear, helpful response in markdown format.`;
        } else if (context.type === "screenshot") {
            prompt += `Context Type: Screenshot\n`;
            prompt += `Page Number: ${context.pageNumber}\n`;
            prompt += `The user has provided a screenshot from the PDF document.\n\n`;
            prompt += `Please analyze the image and answer the user's question. Provide a clear, helpful response in markdown format.`;
        }

        return prompt;
    }

    /**
     * Create a placeholder response for development
     */
    private createPlaceholderResponse(
        question: string,
        context: PDFQuestionContext,
    ): string {
        const contextType =
            context.type === "text" ? "text selection" : "screenshot";

        return `## AI Response

Based on your question about the ${contextType} from page ${context.pageNumber}, here's my analysis:

### Your Question
"${question}"

### Analysis
**Context Type**: ${context.type === "text" ? "Text Selection" : "Screenshot"}  
**Page**: ${context.pageNumber}  
**Processing**: Real LLM Integration

${
    context.type === "text" && context.textContent
        ? `**Selected Content**: "${context.textContent.substring(0, 200)}${context.textContent.length > 200 ? "..." : ""}"`
        : ""
}

### Response
This is where the actual LLM would provide a detailed analysis of your question based on the PDF content. The LLM would:

1. **Analyze the context** - Whether text or visual content
2. **Understand your question** - What specifically you're asking about
3. **Provide relevant insights** - Based on the document content
4. **Format the response** - In clear, readable markdown

### Next Steps
To complete the LLM integration:
1. Add your LLM service API calls to \`generateLLMResponse()\`
2. Configure authentication and endpoints
3. Handle text vs image contexts appropriately
4. Implement proper error handling and retries

*This response was generated by the PDF question handler in real mode.*`;
    }
}
