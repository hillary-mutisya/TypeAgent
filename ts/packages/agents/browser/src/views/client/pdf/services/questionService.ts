// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { PDFApiService } from "./pdfApiService.js";

/**
 * Client-side service for handling PDF questions
 */
export class QuestionService {
    private apiService: PDFApiService;

    constructor(apiService: PDFApiService) {
        this.apiService = apiService;
    }

    /**
     * Create question context from text selection
     */
    createTextQuestionContext(
        selectedText: string,
        pageText: string,
        pageNumber: number,
    ): any {
        return {
            type: "text",
            textContent: selectedText,
            pageText: pageText,
            pageNumber: pageNumber,
        };
    }

    /**
     * Create question context from screenshot
     */
    createScreenshotQuestionContext(
        selectedScreenshot: string,
        pageScreenshot: string,
        pageNumber: number,
    ): any {
        return {
            type: "screenshot",
            screenshot: selectedScreenshot,
            pageScreenshot: pageScreenshot,
            pageNumber: pageNumber,
        };
    }

    /**
     * Submit a question with context
     */
    async submitQuestion(
        documentId: string,
        annotationId: string,
        question: string,
        context: any,
    ): Promise<any> {
        try {
            const result = await this.apiService.submitQuestion(
                documentId,
                annotationId,
                question,
                context,
            );
            return result;
        } catch (error) {
            console.error("Failed to submit question:", error);
            throw error;
        }
    }

    /**
     * Mark question response as read
     */
    async markQuestionRead(
        documentId: string,
        annotationId: string,
    ): Promise<void> {
        try {
            await this.apiService.markQuestionRead(documentId, annotationId);
        } catch (error) {
            console.error("Failed to mark question as read:", error);
            throw error;
        }
    }

    /**
     * Parse markdown content for display
     */
    parseMarkdownResponse(markdownContent: string): string {
        // For now, return the content as-is
        // In a full implementation, you might want to use a markdown parser
        // like marked.js or a React markdown component
        return markdownContent;
    }

    /**
     * Check if response has unread indicator
     */
    hasUnreadResponse(annotation: any): boolean {
        return (
            annotation.questionData?.response?.hasUnreadResponse === true
        );
    }

    /**
     * Get response status for display
     */
    getResponseStatus(annotation: any): "pending" | "complete" | "error" | null {
        return annotation.questionData?.response?.status || null;
    }

    /**
     * Get response content for display
     */
    getResponseContent(annotation: any): string {
        return annotation.questionData?.response?.content || "";
    }

    /**
     * Format question for display
     */
    formatQuestionForDisplay(annotation: any): string {
        return annotation.questionData?.question || "";
    }

    /**
     * Get context type for display
     */
    getContextType(annotation: any): "text" | "screenshot" | null {
        return annotation.questionData?.context?.type || null;
    }

    /**
     * Get context description for display
     */
    getContextDescription(annotation: any): string {
        const context = annotation.questionData?.context;
        if (!context) return "";

        if (context.type === "text") {
            const textLength = context.textContent?.length || 0;
            return `Text selection (${textLength} characters) on page ${context.pageNumber}`;
        } else if (context.type === "screenshot") {
            return `Screenshot from page ${context.pageNumber}`;
        }

        return "";
    }
}
