// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { PDFAnnotation } from "../../server/features/pdf/pdfTypes";
import { SelectionInfo } from "./textSelectionManager";
import { PDFApiService } from "../services/pdfApiService";
import { QuestionService } from "../services/questionService";
import { HighlightColor } from "../components/ColorPicker";

/**
 * Annotation Manager for PDF highlighting and annotation management
 * Handles creating, updating, and rendering annotations in PDF.js
 */

export interface AnnotationCreationData {
    type: "highlight" | "note" | "question";
    selection: SelectionInfo;
    color?: HighlightColor;
    content?: string;
    blockquoteContent?: string; // For notes with blockquote content
    screenshotData?: any; // For screenshot-based annotations
    question?: string; // For question annotations
    questionContext?: any; // Question context data
}

export interface RenderedAnnotation {
    id: string;
    annotation: PDFAnnotation;
    elements: HTMLElement[];
}

export class AnnotationManager {
    private pdfViewer: any;
    private eventBus: any;
    private apiService: PDFApiService;
    private questionService: QuestionService;
    private documentId: string | null = null;
    private annotations: Map<string, RenderedAnnotation> = new Map();
    private annotationLayer: HTMLElement | null = null;

    constructor(pdfViewer: any, apiService: PDFApiService, eventBus?: any) {
        this.pdfViewer = pdfViewer;
        this.eventBus = eventBus;
        this.apiService = apiService;
        this.questionService = new QuestionService(apiService);

        // Set up event listeners for scale changes if event bus is available
        if (this.eventBus) {
            this.setupEventListeners();
        }
    }

    /**
     * Set up event listeners for PDF.js events
     */
    private setupEventListeners(): void {
        // Listen for page rendering to re-render annotations
        this.eventBus.on("pagerendered", (evt: any) => {
            this.reRenderAnnotationsOnPage(evt.pageNumber);
        });

        // Listen for scale changes to re-position annotations
        this.eventBus.on("scalechanging", (evt: any) => {
            setTimeout(() => {
                this.reRenderAllAnnotations();
            }, 100); // Small delay to ensure page is re-rendered
        });
    }

    /**
     * Set the current document ID
     */
    setDocumentId(documentId: string): void {
        this.documentId = documentId;
    }

    /**
     * Load annotations for the current document
     * Note: This now only loads custom annotations (notes, questions)
     * PDF.js highlights are handled by PDFJSHighlightManager
     */
    async loadAnnotations(): Promise<void> {
        if (!this.documentId) {
            console.warn("No document ID set for loading annotations");
            return;
        }

        try {
            const allAnnotations = await this.apiService.getAnnotations(
                this.documentId,
            );

            // Filter out PDF.js highlights - only load custom annotations
            const customAnnotations = allAnnotations.filter(
                (annotation) =>
                    annotation.storage !== "pdfjs" &&
                    (annotation.type === "note" ||
                        annotation.type === "question" ||
                        (annotation.type === "highlight" &&
                            annotation.storage !== "pdfjs")),
            );

            // Clear existing annotations
            this.clearAllAnnotations();

            // Render each custom annotation
            for (const annotation of customAnnotations) {
                await this.renderAnnotation(annotation);
            }

            console.log(
                `✅ Loaded ${customAnnotations.length} custom annotations (${allAnnotations.length - customAnnotations.length} PDF.js highlights handled separately)`,
            );
        } catch (error) {
            console.error("❌ Failed to load annotations:", error);
        }
    }

    /**
     * Create a new annotation from selection
     */
    async createAnnotation(
        data: AnnotationCreationData,
    ): Promise<PDFAnnotation | null> {
        if (!this.documentId) {
            console.error("No document ID set for creating annotation");
            return null;
        }

        try {
            // Convert selection to annotation data
            const annotationData = this.selectionToAnnotation(data);

            // Save annotation via API
            const savedAnnotation = await this.apiService.addAnnotation(
                this.documentId,
                annotationData,
            );

            // Render the annotation
            await this.renderAnnotation(savedAnnotation);

            console.log("✅ Created annotation:", savedAnnotation.id);
            return savedAnnotation;
        } catch (error) {
            console.error("❌ Failed to create annotation:", error);
            return null;
        }
    }

    /**
     * Update an existing annotation
     */
    async updateAnnotation(
        annotationId: string,
        updates: Partial<PDFAnnotation>,
    ): Promise<void> {
        if (!this.documentId) {
            console.error("No document ID set for updating annotation");
            return;
        }

        try {
            // Update via API
            const updatedAnnotation = await this.apiService.updateAnnotation(
                this.documentId,
                annotationId,
                updates,
            );

            // Re-render the annotation
            await this.removeAnnotation(annotationId);
            await this.renderAnnotation(updatedAnnotation);

            console.log("✅ Updated annotation:", annotationId);
        } catch (error) {
            console.error("❌ Failed to update annotation:", error);
        }
    }

    /**
     * Delete an annotation
     */
    async deleteAnnotation(annotationId: string): Promise<void> {
        if (!this.documentId) {
            console.error("No document ID set for deleting annotation");
            return;
        }

        try {
            // Delete via API
            await this.apiService.deleteAnnotation(
                this.documentId,
                annotationId,
            );

            // Remove from display
            await this.removeAnnotation(annotationId);

            console.log("✅ Deleted annotation:", annotationId);
        } catch (error) {
            console.error("❌ Failed to delete annotation:", error);
        }
    }

    /**
     * Get annotation at specific coordinates
     */
    getAnnotationAtPoint(x: number, y: number): RenderedAnnotation | null {
        const element = document.elementFromPoint(x, y);
        if (!element) return null;

        // Check if the element or its parent is an annotation
        const annotationElement = element.closest(
            "[data-annotation-id]",
        ) as HTMLElement;
        if (!annotationElement) return null;

        const annotationId =
            annotationElement.getAttribute("data-annotation-id");
        if (!annotationId) return null;

        return this.annotations.get(annotationId) || null;
    }

    /**
     * Convert selection to annotation data
     */
    private selectionToAnnotation(
        data: AnnotationCreationData,
    ): Partial<PDFAnnotation> {
        const {
            selection,
            type,
            color,
            content,
            blockquoteContent,
            screenshotData,
        } = data;

        // For screenshot-based annotations, use the screenshot region coordinates directly
        let bounds;
        if (screenshotData && screenshotData.region) {
            // Screenshot coordinates are already relative to the page
            bounds = {
                x: screenshotData.region.x,
                y: screenshotData.region.y,
                width: screenshotData.region.width,
                height: screenshotData.region.height,
            };
        } else {
            // For text selections, calculate coordinates from selection rectangles
            bounds = this.calculateSelectionBounds(selection);
        }

        const annotation: Partial<PDFAnnotation> = {
            documentId: this.documentId!,
            page: selection.pageNumber,
            type,
            coordinates: bounds,
            storage: "custom", // Mark as custom annotation (not PDF.js)
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        // Add type-specific properties
        if (type === "highlight" && color) {
            annotation.color = color.color;
            annotation.opacity = 0.3;
        }

        if (content) {
            annotation.content = content;
        }

        // Store additional metadata for notes
        if (type === "note" || type === "question") {
            annotation.metadata = {
                blockquoteContent,
                screenshotData,
                hasScreenshot: !!screenshotData,
                hasBlockquote: !!blockquoteContent,
                creationScale: this.pdfViewer.currentScale || 1, // Store creation scale
            };
        }

        return annotation;
    }

    /**
     * Calculate bounds from selection rectangles
     */
    private calculateSelectionBounds(selection: SelectionInfo): {
        x: number;
        y: number;
        width: number;
        height: number;
    } {
        const rects = selection.rects;
        if (rects.length === 0) {
            return { x: 0, y: 0, width: 0, height: 0 };
        }

        // Find the page element to get relative coordinates
        const pageElement = this.getPageElement(selection.pageNumber);
        if (!pageElement) {
            return { x: 0, y: 0, width: 0, height: 0 };
        }

        const pageRect = pageElement.getBoundingClientRect();

        // Calculate bounds relative to page
        let minLeft = Infinity;
        let maxRight = -Infinity;
        let minTop = Infinity;
        let maxBottom = -Infinity;

        for (const rect of rects) {
            const relativeLeft = rect.left - pageRect.left;
            const relativeTop = rect.top - pageRect.top;
            const relativeRight = rect.right - pageRect.left;
            const relativeBottom = rect.bottom - pageRect.top;

            minLeft = Math.min(minLeft, relativeLeft);
            maxRight = Math.max(maxRight, relativeRight);
            minTop = Math.min(minTop, relativeTop);
            maxBottom = Math.max(maxBottom, relativeBottom);
        }

        return {
            x: minLeft,
            y: minTop,
            width: maxRight - minLeft,
            height: maxBottom - minTop,
        };
    }

    /**
     * Render an annotation on the page
     */
    private async renderAnnotation(annotation: PDFAnnotation): Promise<void> {
        const pageElement = this.getPageElement(annotation.page);
        if (!pageElement) {
            console.warn(
                `Page ${annotation.page} not found for annotation ${annotation.id}`,
            );
            return;
        }

        // Create annotation element based on type
        let annotationElement: HTMLElement;

        switch (annotation.type) {
            case "highlight":
                annotationElement = this.createHighlightElement(annotation);
                break;
            case "note":
                annotationElement = this.createNoteElement(annotation);
                break;
            case "question":
                annotationElement = this.createQuestionElement(annotation);
                break;
            default:
                console.warn(`Unknown annotation type: ${annotation.type}`);
                return;
        }

        // Position the annotation
        this.positionAnnotationElement(
            annotationElement,
            annotation,
            pageElement,
        );

        // Add to annotation layer
        const annotationLayer = this.getOrCreateAnnotationLayer(pageElement);
        annotationLayer.appendChild(annotationElement);

        // Store rendered annotation
        this.annotations.set(annotation.id, {
            id: annotation.id,
            annotation,
            elements: [annotationElement],
        });
    }

    /**
     * Create highlight element
     */
    private createHighlightElement(annotation: PDFAnnotation): HTMLElement {
        const element = document.createElement("div");
        element.className = "pdf-highlight";
        element.setAttribute("data-annotation-id", annotation.id);
        element.style.backgroundColor = annotation.color || "#ffff00";
        element.style.opacity = (annotation.opacity || 0.3).toString();
        element.style.cursor = "pointer";

        // Add tooltip if there's content
        if (annotation.content) {
            element.title = annotation.content;
        }

        return element;
    }

    /**
     * Create note element with enhanced hover support
     */
    private createNoteElement(annotation: PDFAnnotation): HTMLElement {
        const element = document.createElement("div");
        element.className = "pdf-note";
        element.setAttribute("data-annotation-id", annotation.id);

        // Create tooltip content for hover
        const tooltipContent = this.createNoteTooltipContent(annotation);

        element.innerHTML = `
            <div class="note-icon">
                <i class="fas fa-sticky-note"></i>
            </div>
            <div class="note-tooltip" style="display: none;">
                ${tooltipContent}
            </div>
        `;

        // Add hover handlers for tooltip (only tooltip, no click flyout)
        this.addNoteHoverHandlers(element, annotation);

        return element;
    }

    /**
     * Create tooltip content for note/question hover
     */
    private createNoteTooltipContent(annotation: PDFAnnotation): string {
        let content = "";

        // Add blockquote if available
        if (annotation.metadata?.blockquoteContent) {
            content += `
                <div class="tooltip-blockquote">
                    <blockquote>${this.escapeHtml(annotation.metadata.blockquoteContent)}</blockquote>
                </div>
            `;
        }

        // Add screenshot if available
        if (annotation.metadata?.screenshotData) {
            content += `
                <div class="tooltip-screenshot">
                    <img src="${annotation.metadata.screenshotData.imageData}" alt="Screenshot" />
                </div>
            `;
        }

        // Add content rendered from markdown (works for both notes and questions)
        if (annotation.content) {
            const contentType =
                annotation.type === "question" ? "question" : "note";
            content += `
                <div class="tooltip-${contentType}-content">
                    ${this.markdownToHtml(annotation.content)}
                </div>
            `;
        }

        return content;
    }

    /**
     * Add hover handlers for note tooltips
     */
    private addNoteHoverHandlers(
        element: HTMLElement,
        annotation: PDFAnnotation,
    ): void {
        const tooltip = element.querySelector(".note-tooltip") as HTMLElement;
        if (!tooltip) return;

        let hoverTimeout: NodeJS.Timeout;

        element.addEventListener("mouseenter", () => {
            hoverTimeout = setTimeout(() => {
                // Position tooltip
                const rect = element.getBoundingClientRect();
                tooltip.style.position = "fixed";
                tooltip.style.left = `${rect.right + 10}px`;
                tooltip.style.top = `${rect.top}px`;
                tooltip.style.zIndex = "10001";
                tooltip.style.display = "block";
            }, 500); // Show after 500ms
        });

        element.addEventListener("mouseleave", () => {
            clearTimeout(hoverTimeout);
            tooltip.style.display = "none";
        });
    }

    /**
     * Create question element
     */
    private createQuestionElement(annotation: PDFAnnotation): HTMLElement {
        const element = document.createElement("div");
        element.className = "pdf-question";
        element.setAttribute("data-annotation-id", annotation.id);

        // Check if there's an unread response
        const hasUnreadResponse = this.questionService.hasUnreadResponse(annotation);
        const responseStatus = this.questionService.getResponseStatus(annotation);

        // Create the question icon with optional unread indicator
        const questionIcon = document.createElement("div");
        questionIcon.className = "question-icon";
        
        if (hasUnreadResponse) {
            questionIcon.classList.add("has-unread");
        }
        
        if (responseStatus === "pending") {
            questionIcon.classList.add("pending");
        } else if (responseStatus === "error") {
            questionIcon.classList.add("error");
        }

        questionIcon.innerHTML = `
            <i class="fas fa-question-circle"></i>
            ${hasUnreadResponse ? '<div class="unread-indicator"></div>' : ''}
        `;

        // Create tooltip content for hover
        const tooltipContent = this.createQuestionTooltipContent(annotation);

        const tooltip = document.createElement("div");
        tooltip.className = "question-tooltip";
        tooltip.style.display = "none";
        tooltip.innerHTML = tooltipContent;

        element.appendChild(questionIcon);
        element.appendChild(tooltip);

        // Add interaction handlers
        this.addQuestionInteractionHandlers(element, annotation);

        return element;
    }

    /**
     * Create tooltip content specifically for questions
     */
    private createQuestionTooltipContent(annotation: PDFAnnotation): string {
        let content = "";

        // Add question text
        const question = this.questionService.formatQuestionForDisplay(annotation);
        if (question) {
            content += `
                <div class="tooltip-question">
                    <h4>Question</h4>
                    <p>${this.escapeHtml(question)}</p>
                </div>
            `;
        }

        // Add context information
        const contextType = this.questionService.getContextType(annotation);
        const contextDescription = this.questionService.getContextDescription(annotation);
        if (contextDescription) {
            content += `
                <div class="tooltip-context">
                    <small class="context-info">${this.escapeHtml(contextDescription)}</small>
                </div>
            `;
        }

        // Add response if available
        const responseContent = this.questionService.getResponseContent(annotation);
        const responseStatus = this.questionService.getResponseStatus(annotation);
        
        if (responseStatus === "pending") {
            content += `
                <div class="tooltip-response pending">
                    <h4>Response</h4>
                    <p class="processing-message">
                        <i class="fas fa-spinner fa-spin"></i> Processing your question...
                    </p>
                </div>
            `;
        } else if (responseStatus === "error") {
            content += `
                <div class="tooltip-response error">
                    <h4>Response</h4>
                    <p class="error-message">
                        <i class="fas fa-exclamation-triangle"></i> ${this.escapeHtml(responseContent)}
                    </p>
                </div>
            `;
        } else if (responseStatus === "complete" && responseContent) {
            // Parse and render markdown response
            const parsedResponse = this.questionService.parseMarkdownResponse(responseContent);
            content += `
                <div class="tooltip-response complete">
                    <h4>AI Response</h4>
                    <div class="response-content">${parsedResponse}</div>
                </div>
            `;
        }

        return content;
    }

    /**
     * Add interaction handlers for question annotations
     */
    private addQuestionInteractionHandlers(element: HTMLElement, annotation: PDFAnnotation): void {
        const tooltip = element.querySelector(".question-tooltip") as HTMLElement;
        const icon = element.querySelector(".question-icon") as HTMLElement;

        if (!tooltip || !icon) return;

        let hoverTimeout: NodeJS.Timeout;

        // Show tooltip on hover
        icon.addEventListener("mouseenter", () => {
            clearTimeout(hoverTimeout);
            
            // Update tooltip content in case status changed
            tooltip.innerHTML = this.createQuestionTooltipContent(annotation);
            tooltip.style.display = "block";
            
            // Mark as read if there's an unread response
            if (this.questionService.hasUnreadResponse(annotation)) {
                this.markQuestionAsRead(annotation.id);
            }
        });

        // Hide tooltip when leaving
        icon.addEventListener("mouseleave", () => {
            hoverTimeout = setTimeout(() => {
                tooltip.style.display = "none";
            }, 100);
        });

        // Keep tooltip visible when hovering over it
        tooltip.addEventListener("mouseenter", () => {
            clearTimeout(hoverTimeout);
        });

        tooltip.addEventListener("mouseleave", () => {
            hoverTimeout = setTimeout(() => {
                tooltip.style.display = "none";
            }, 100);
        });

        // Handle click for editing/detailed view
        icon.addEventListener("click", (e) => {
            e.stopPropagation();
            this.openQuestionEditor(annotation);
        });
    }

    /**
     * Mark a question response as read
     */
    private async markQuestionAsRead(annotationId: string): Promise<void> {
        if (!this.documentId) return;

        try {
            await this.questionService.markQuestionRead(this.documentId, annotationId);
            
            // Update the visual indicator
            const element = document.querySelector(`[data-annotation-id="${annotationId}"]`);
            if (element) {
                const icon = element.querySelector(".question-icon");
                if (icon) {
                    icon.classList.remove("has-unread");
                    const unreadIndicator = icon.querySelector(".unread-indicator");
                    if (unreadIndicator) {
                        unreadIndicator.remove();
                    }
                }
            }
        } catch (error) {
            console.error("Failed to mark question as read:", error);
        }
    }

    /**
     * Open question editor/detail view
     */
    private openQuestionEditor(annotation: PDFAnnotation): void {
        // This would open a modal or side panel for editing the question
        // For now, just log that it would open
        console.log("Opening question editor for:", annotation.id);
        
        // TODO: Implement question editor modal
        // This would show:
        // - The original question
        // - Context information  
        // - Full response with proper markdown rendering
        // - Option to ask follow-up questions
        // - Edit/delete options
    }

    /**
     * Position annotation element on page with scale awareness
     */
    private positionAnnotationElement(
        element: HTMLElement,
        annotation: PDFAnnotation,
        pageElement: HTMLElement,
    ): void {
        const { x, y, width, height } = annotation.coordinates;

        // Get current scale for proper positioning
        const currentScale = this.pdfViewer.currentScale || 1;
        const creationScale = annotation.metadata?.creationScale || 1;
        const scaleRatio = currentScale / creationScale;

        element.style.position = "absolute";
        element.style.pointerEvents = "auto";
        element.style.zIndex = "10";

        if (annotation.type === "note" || annotation.type === "question") {
            // Position note/question icon in the top-right corner of the selected area
            // Base size that scales with zoom
            const baseIconSize = 20; // Base size at 1x scale
            const baseMargin = 2; // Base margin at 1x scale

            const scaledIconSize = baseIconSize * scaleRatio;
            const scaledMargin = baseMargin * scaleRatio;

            // Calculate position: top-right corner with scaled positioning
            const scaledX = x * scaleRatio;
            const scaledY = y * scaleRatio;
            const scaledWidth = width * scaleRatio;

            element.style.left = `${scaledX + scaledWidth - scaledIconSize - scaledMargin}px`;
            element.style.top = `${scaledY + scaledMargin}px`;
            element.style.width = `${scaledIconSize}px`;
            element.style.height = `${scaledIconSize}px`;
        } else {
            // For other annotation types (highlights, questions), use full area with scaling
            element.style.left = `${x * scaleRatio}px`;
            element.style.top = `${y * scaleRatio}px`;
            element.style.width = `${width * scaleRatio}px`;
            element.style.height = `${height * scaleRatio}px`;
        }
    }

    /**
     * Get or create annotation layer for a page
     */
    private getOrCreateAnnotationLayer(pageElement: HTMLElement): HTMLElement {
        let annotationLayer = pageElement.querySelector(
            ".custom-annotation-layer",
        ) as HTMLElement;

        if (!annotationLayer) {
            annotationLayer = document.createElement("div");
            annotationLayer.className = "custom-annotation-layer";
            annotationLayer.style.position = "absolute";
            annotationLayer.style.top = "0";
            annotationLayer.style.left = "0";
            annotationLayer.style.width = "100%";
            annotationLayer.style.height = "100%";
            annotationLayer.style.pointerEvents = "none";
            annotationLayer.style.zIndex = "5";

            pageElement.style.position = "relative";
            pageElement.appendChild(annotationLayer);
        }

        return annotationLayer;
    }

    /**
     * Escape HTML to prevent XSS
     */
    private escapeHtml(text: string): string {
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Simple markdown to HTML converter
     */
    private markdownToHtml(markdown: string): string {
        let html = markdown;

        // Convert basic markdown formatting
        html = html
            // Headers
            .replace(/^### (.*$)/gim, "<h3>$1</h3>")
            .replace(/^## (.*$)/gim, "<h2>$1</h2>")
            .replace(/^# (.*$)/gim, "<h1>$1</h1>")
            // Bold
            .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
            // Italic
            .replace(/\*(.*?)\*/g, "<em>$1</em>")
            // Code
            .replace(/`(.*?)`/g, "<code>$1</code>")
            // Links
            .replace(
                /\[([^\]]+)\]\(([^)]+)\)/g,
                '<a href="$2" target="_blank">$1</a>',
            )
            // Line breaks
            .replace(/\n/g, "<br>");

        // Handle lists
        html = html.replace(/^- (.*)$/gim, "<li>$1</li>");
        html = html.replace(/(<li>.*<\/li>)/gs, "<ul>$1</ul>");

        return html;
    }
    private getPageElement(pageNumber: number): HTMLElement | null {
        return document.querySelector(
            `[data-page-number="${pageNumber}"]`,
        ) as HTMLElement;
    }

    /**
     * Remove annotation from display
     */
    private async removeAnnotation(annotationId: string): Promise<void> {
        const rendered = this.annotations.get(annotationId);
        if (!rendered) return;

        // Remove DOM elements
        rendered.elements.forEach((element) => {
            if (element.parentNode) {
                element.parentNode.removeChild(element);
            }
        });

        // Remove from map
        this.annotations.delete(annotationId);
    }

    /**
     * Clear all annotations
     */
    private clearAllAnnotations(): void {
        for (const [id] of this.annotations) {
            this.removeAnnotation(id);
        }
    }

    /**
     * Re-render annotations on a specific page
     */
    private reRenderAnnotationsOnPage(pageNumber: number): void {
        try {
            for (const [id, renderedAnnotation] of this.annotations) {
                if (renderedAnnotation.annotation.page === pageNumber) {
                    // Remove existing elements
                    this.removeAnnotationFromDOM(id);
                    // Re-render
                    this.renderAnnotation(renderedAnnotation.annotation);
                }
            }
        } catch (error) {
            console.error(
                `❌ Failed to re-render annotations on page ${pageNumber}:`,
                error,
            );
        }
    }

    /**
     * Re-render all annotations (useful after zoom/scale changes)
     */
    private reRenderAllAnnotations(): void {
        try {
            for (const [id, renderedAnnotation] of this.annotations) {
                // Remove existing elements
                this.removeAnnotationFromDOM(id);
                // Re-render with updated positioning
                this.renderAnnotation(renderedAnnotation.annotation);
            }
        } catch (error) {
            console.error("❌ Failed to re-render all annotations:", error);
        }
    }

    /**
     * Remove annotation elements from DOM (helper for re-rendering)
     */
    private removeAnnotationFromDOM(annotationId: string): void {
        const rendered = this.annotations.get(annotationId);
        if (!rendered) return;

        // Remove DOM elements
        rendered.elements.forEach((element) => {
            if (element.parentNode) {
                element.parentNode.removeChild(element);
            }
        });

        // Update the rendered annotation to clear elements array
        rendered.elements = [];
    }

    /**
     * Create and submit a question annotation
     */
    async createQuestionAnnotation(
        data: AnnotationCreationData,
        question: string,
    ): Promise<PDFAnnotation | null> {
        if (!this.documentId || !question.trim()) {
            console.error("Missing document ID or question text");
            return null;
        }

        try {
            // First create the annotation
            const annotationData = this.selectionToAnnotation({
                ...data,
                type: "question",
                question,
            });

            // Add question-specific data
            const questionContext = this.createQuestionContext(data);
            annotationData.questionData = {
                question: question.trim(),
                context: questionContext,
                response: {
                    content: "",
                    status: "pending",
                    timestamp: new Date().toISOString(),
                    hasUnreadResponse: false,
                },
            };

            // Save annotation via API
            const savedAnnotation = await this.apiService.addAnnotation(
                this.documentId,
                annotationData,
            );

            // Render the annotation with pending status
            await this.renderAnnotation(savedAnnotation);

            // Submit the question for processing
            await this.submitQuestion(savedAnnotation.id, question, questionContext);

            console.log("✅ Created question annotation:", savedAnnotation.id);
            return savedAnnotation;
        } catch (error) {
            console.error("❌ Failed to create question annotation:", error);
            return null;
        }
    }

    /**
     * Create question context from annotation data
     */
    private createQuestionContext(data: AnnotationCreationData): any {
        if (data.screenshotData) {
            // Screenshot-based question
            return this.questionService.createScreenshotQuestionContext(
                data.screenshotData.imageData,
                data.screenshotData.pageScreenshot || "",
                data.selection.pageNumber,
            );
        } else {
            // Text-based question
            const selectedText = data.selection.text || "";
            const pageText = this.getPageTextContent(data.selection.pageNumber);
            
            return this.questionService.createTextQuestionContext(
                selectedText,
                pageText,
                data.selection.pageNumber,
            );
        }
    }

    /**
     * Submit question for processing
     */
    private async submitQuestion(
        annotationId: string,
        question: string,
        context: any,
    ): Promise<void> {
        if (!this.documentId) return;

        try {
            const result = await this.questionService.submitQuestion(
                this.documentId,
                annotationId,
                question,
                context,
            );

            console.log("✅ Question submitted:", result);
        } catch (error) {
            console.error("❌ Failed to submit question:", error);
            
            // Update annotation to show error status
            this.updateQuestionStatus(annotationId, "error");
        }
    }

    /**
     * Update question annotation status
     */
    private updateQuestionStatus(annotationId: string, status: "pending" | "complete" | "error"): void {
        const element = document.querySelector(`[data-annotation-id="${annotationId}"]`);
        if (element) {
            const icon = element.querySelector(".question-icon");
            if (icon) {
                icon.classList.remove("pending", "complete", "error");
                icon.classList.add(status);
            }
        }
    }

    /**
     * Get text content for a page (for question context)
     */
    private getPageTextContent(pageNumber: number): string {
        // This would extract text content from the PDF page
        // For now, return a placeholder
        // In a full implementation, this would use PDF.js text extraction
        return `Page ${pageNumber} text content would be extracted here using PDF.js text layer.`;
    }

    /**
     * Handle SSE updates for question responses
     */
    handleQuestionUpdate(annotation: PDFAnnotation): void {
        const rendered = this.annotations.get(annotation.id);
        if (!rendered) return;

        // Update the stored annotation data
        rendered.annotation = annotation;

        // Update visual indicators
        const element = rendered.elements[0];
        if (element) {
            const icon = element.querySelector(".question-icon");
            const tooltip = element.querySelector(".question-tooltip");
            
            if (icon && tooltip) {
                // Update status classes
                const status = this.questionService.getResponseStatus(annotation);
                icon.classList.remove("pending", "complete", "error");
                if (status) {
                    icon.classList.add(status);
                }

                // Update unread indicator
                const hasUnread = this.questionService.hasUnreadResponse(annotation);
                if (hasUnread) {
                    icon.classList.add("has-unread");
                    if (!icon.querySelector(".unread-indicator")) {
                        const indicator = document.createElement("div");
                        indicator.className = "unread-indicator";
                        icon.appendChild(indicator);
                    }
                } else {
                    icon.classList.remove("has-unread");
                    const indicator = icon.querySelector(".unread-indicator");
                    if (indicator) {
                        indicator.remove();
                    }
                }

                // Update tooltip content
                tooltip.innerHTML = this.createQuestionTooltipContent(annotation);
            }
        }
    }

    /**
     * Clean up and remove all annotations
     */
    destroy(): void {
        this.clearAllAnnotations();
        this.annotations.clear();
        this.documentId = null;
    }
}
