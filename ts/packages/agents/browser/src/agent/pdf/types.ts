// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * PDF agent types
 */

export interface PDFQuestionContext {
    type: "text" | "screenshot";
    textContent?: string;
    pageText?: string;
    screenshot?: string; // base64 encoded
    pageScreenshot?: string; // base64 encoded
    pageNumber: number;
}

export interface PDFQuestionRequest {
    documentId: string;
    annotationId: string;
    question: string;
    context: PDFQuestionContext;
}

export interface PDFQuestionResponse {
    content: string; // markdown response
    status: "pending" | "complete" | "error";
    timestamp: string;
    hasUnreadResponse?: boolean;
    notificationMessage?: string; // For error notifications
}
