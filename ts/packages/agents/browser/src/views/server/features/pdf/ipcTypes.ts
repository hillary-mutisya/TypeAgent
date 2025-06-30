// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { QuestionContext, QuestionResponse } from "./pdfTypes.js";

/**
 * IPC Message Types for PDF Question Communication with Agent
 */

// Server → Agent: PDF question requests
export interface PDFQuestionMessage {
    type: "pdfQuestion";
    requestId: string;
    documentId: string;
    annotationId: string;
    question: string;
    context: QuestionContext;
    timestamp: number;
}

// Agent → Server: PDF question results
export interface PDFQuestionResultMessage {
    type: "pdfQuestionResult";
    requestId: string;
    result: PDFQuestionResult;
}

export interface PDFQuestionResult {
    success: boolean;
    response?: QuestionResponse;
    error?: string;
    type: "success" | "error" | "timeout";
}

// Union type for all PDF IPC messages
export type PDFIPCMessage = PDFQuestionMessage | PDFQuestionResultMessage;
