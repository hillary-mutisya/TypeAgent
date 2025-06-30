// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { AnnotationManager, AnnotationCreationData } from "../core/annotationManager";
import { PDFApiService } from "../services/pdfApiService";
import { PDFSSEClient } from "../services/pdfSSEClient";
import { QuestionForm } from "../components/QuestionForm";
import { notify } from "../components/NotificationSystem";

/**
 * Main PDF Question Integration
 * Handles the complete question workflow including UI, API calls, and real-time updates
 */
export class PDFQuestionIntegration {
    private annotationManager: AnnotationManager;
    private apiService: PDFApiService;
    private sseClient: PDFSSEClient | null = null;
    private documentId: string | null = null;
    private currentQuestionForm: QuestionForm | null = null;

    constructor(
        annotationManager: AnnotationManager,
        apiService: PDFApiService,
    ) {
        this.annotationManager = annotationManager;
        this.apiService = apiService;
    }

    /**
     * Initialize question integration for a document
     */
    async initialize(documentId: string): Promise<void> {
        this.documentId = documentId;
        this.setupSSE();
        console.log("✅ PDF Question Integration initialized for document:", documentId);
    }

    /**
     * Set up Server-Sent Events for real-time updates
     */
    private setupSSE(): void {
        if (!this.documentId) return;

        this.sseClient = new PDFSSEClient(this.documentId);

        // Handle question response updates
        this.sseClient.on("question-response", (data) => {
            console.log("📡 Question response received:", data);
            this.handleQuestionResponse(data);
        });

        // Handle question errors
        this.sseClient.on("question-error", (data) => {
            console.log("📡 Question error received:", data);
            this.handleQuestionError(data);
        });

        // Handle user notifications
        this.sseClient.on("user-notification", (data) => {
            console.log("📡 User notification received:", data);
            this.handleUserNotification(data);
        });

        // Handle general annotation updates
        this.sseClient.on("annotation-updated", (data) => {
            console.log("📡 Annotation updated:", data);
            this.handleAnnotationUpdate(data);
        });
    }

    /**
     * Show question form for creating a new question
     */
    showQuestionForm(annotationData: AnnotationCreationData): void {
        // Close any existing form
        this.closeQuestionForm();

        this.currentQuestionForm = new QuestionForm(
            annotationData,
            (question, data) => this.submitQuestion(question, data),
            () => this.closeQuestionForm(),
        );

        this.currentQuestionForm.show();
    }

    /**
     * Close the current question form
     */
    private closeQuestionForm(): void {
        if (this.currentQuestionForm) {
            this.currentQuestionForm.hide();
            this.currentQuestionForm = null;
        }
    }

    /**
     * Submit a question annotation
     */
    private async submitQuestion(
        question: string,
        data: AnnotationCreationData,
    ): Promise<void> {
        try {
            // Close the form
            this.closeQuestionForm();

            // Show processing notification
            notify.info("Submitting your question...");

            // Create the question annotation
            const annotation = await this.annotationManager.createQuestionAnnotation(
                data,
                question,
            );

            if (annotation) {
                notify.success("Question submitted! Processing your request...");
            } else {
                notify.error("Failed to create question annotation");
            }
        } catch (error) {
            console.error("Failed to submit question:", error);
            notify.error("Failed to submit question. Please try again.");
            this.closeQuestionForm();
        }
    }

    /**
     * Handle question response from SSE
     */
    private handleQuestionResponse(annotation: any): void {
        console.log("Handling question response:", annotation);

        // Update the annotation manager
        this.annotationManager.handleQuestionUpdate(annotation);

        // Show success notification
        if (annotation.questionData?.response?.status === "complete") {
            notify.success("Your question has been answered!");
        }
    }

    /**
     * Handle question error from SSE
     */
    private handleQuestionError(annotation: any): void {
        console.log("Handling question error:", annotation);

        // Update the annotation manager
        this.annotationManager.handleQuestionUpdate(annotation);

        // Show error notification if there's a message
        const errorMessage = annotation.questionData?.response?.notificationMessage;
        if (errorMessage) {
            notify.error(errorMessage);
        }
    }

    /**
     * Handle user notifications from SSE
     */
    private handleUserNotification(data: any): void {
        const { message, type } = data;
        
        switch (type) {
            case "error":
                notify.error(message);
                break;
            case "warning":
                notify.warning(message);
                break;
            case "success":
                notify.success(message);
                break;
            case "info":
            default:
                notify.info(message);
                break;
        }
    }

    /**
     * Handle general annotation updates
     */
    private handleAnnotationUpdate(annotation: any): void {
        if (annotation.type === "question") {
            this.annotationManager.handleQuestionUpdate(annotation);
        }
    }

    /**
     * Create a question from text selection
     */
    createTextQuestion(
        selection: any,
        pageNumber: number,
    ): void {
        const annotationData: AnnotationCreationData = {
            type: "question",
            selection: {
                ...selection,
                pageNumber,
            },
        };

        this.showQuestionForm(annotationData);
    }

    /**
     * Create a question from screenshot
     */
    createScreenshotQuestion(
        selection: any,
        pageNumber: number,
        screenshotData: any,
    ): void {
        const annotationData: AnnotationCreationData = {
            type: "question",
            selection: {
                ...selection,
                pageNumber,
            },
            screenshotData,
        };

        this.showQuestionForm(annotationData);
    }

    /**
     * Get question integration status
     */
    getStatus(): {
        initialized: boolean;
        documentId: string | null;
        sseConnected: boolean;
    } {
        return {
            initialized: this.documentId !== null,
            documentId: this.documentId,
            sseConnected: this.sseClient !== null,
        };
    }

    /**
     * Clean up resources
     */
    destroy(): void {
        if (this.sseClient) {
            this.sseClient.close();
            this.sseClient = null;
        }

        this.closeQuestionForm();
        this.documentId = null;

        console.log("🧹 PDF Question Integration destroyed");
    }
}

// Global instance for easy access
let globalQuestionIntegration: PDFQuestionIntegration | null = null;

/**
 * Initialize global question integration
 */
export function initializeQuestionIntegration(
    annotationManager: AnnotationManager,
    apiService: PDFApiService,
): PDFQuestionIntegration {
    if (globalQuestionIntegration) {
        globalQuestionIntegration.destroy();
    }

    globalQuestionIntegration = new PDFQuestionIntegration(
        annotationManager,
        apiService,
    );

    return globalQuestionIntegration;
}

/**
 * Get global question integration instance
 */
export function getQuestionIntegration(): PDFQuestionIntegration | null {
    return globalQuestionIntegration;
}
