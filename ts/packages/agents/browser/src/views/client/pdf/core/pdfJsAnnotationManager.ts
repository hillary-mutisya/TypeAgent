// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { PDFApiService } from '../services/pdfApiService';

declare global {
    interface Window {
        pdfjsLib: any;
    }
}

/**
 * PDF.js compatible annotation data structure
 */
export interface PdfJsAnnotation {
    id: string;
    annotationType: number; // PDF.js annotation type constants
    subtype: string;
    rect: [number, number, number, number]; // [x1, y1, x2, y2] in PDF coordinates
    color: [number, number, number]; // RGB values 0-1
    quadPoints?: number[]; // For text highlighting
    contents: string;
    page: number;
    createdAt: string;
    updatedAt: string;
}

/**
 * Highlight creation data from text selection
 */
export interface HighlightCreationData {
    selectedText: string;
    selection: Selection;
    color: string;
    pageElement: HTMLElement;
    pageNumber: number;
    pdfCoordinates?: any[]; // PDF.js native coordinates if available
}

/**
 * PDF.js Native Annotation Manager
 * Uses PDF.js AnnotationLayer for proper annotation rendering
 */
export class PdfJsAnnotationManager {
    private annotations: Map<number, PdfJsAnnotation[]> = new Map(); // page -> annotations
    private annotationLayers: Map<number, HTMLElement> = new Map(); // page -> layer element
    private pdfApiService: PDFApiService;
    private documentId: string | null = null;
    private pdfDoc: any = null;

    // PDF.js annotation type constants
    private static readonly ANNOTATION_TYPES = {
        HIGHLIGHT: 9, // PDF.js AnnotationType.HIGHLIGHT
        TEXT: 1,      // PDF.js AnnotationType.TEXT
        FREETEXT: 3   // PDF.js AnnotationType.FREETEXT
    };

    constructor(pdfApiService: PDFApiService) {
        this.pdfApiService = pdfApiService;
        this.setupEventHandlers();
    }

    /**
     * Initialize with PDF document
     */
    initialize(documentId: string, pdfDoc: any): void {
        this.documentId = documentId;
        this.pdfDoc = pdfDoc;
        console.log('📝 PDF.js Annotation Manager initialized for document:', documentId);
    }

    /**
     * Setup event handlers for annotation interactions
     */
    private setupEventHandlers(): void {
        // Listen for PDF.js native text selection events
        document.addEventListener('pdfjs-native-text-selected', (event: any) => {
            if (event.detail) {
                this.handlePdfJsNativeSelection(event.detail);
            }
        });

        // Listen for annotation clicks
        document.addEventListener('click', (event) => {
            this.handleAnnotationClick(event);
        });
    }

    /**
     * Handle PDF.js native text selection
     */
    private handlePdfJsNativeSelection(selectionData: any): void {
        // Emit event for annotation tools to handle
        const event = new CustomEvent('pdfjs-text-selected', {
            detail: {
                selectedText: selectionData.selectedText,
                pageNumber: selectionData.pageNumber,
                pageElement: selectionData.pageElement,
                selection: selectionData.selection,
                pdfCoordinates: selectionData.pdfCoordinates,
                color: '#ffff00' // Default color, will be overridden by tool
            }
        });
        document.dispatchEvent(event);
    }

    /**
     * Create a highlight annotation from PDF.js native text selection
     */
    async createHighlightFromSelection(data: HighlightCreationData): Promise<void> {
        if (!this.documentId || !this.pdfDoc) {
            console.error('PDF.js Annotation Manager not initialized');
            return;
        }

        try {
            // If we have PDF coordinates from native selection, use them directly
            if (data.pdfCoordinates && data.pdfCoordinates.length > 0) {
                const pdfAnnotation = this.createAnnotationFromPdfCoordinates(
                    data.selectedText,
                    data.color,
                    data.pageNumber,
                    data.pdfCoordinates
                );

                if (pdfAnnotation) {
                    await this.saveAndRenderAnnotation(pdfAnnotation, data.pageNumber);
                }
            } else {
                // Fallback to converting browser selection to PDF coordinates
                await this.createHighlightFromBrowserSelection(data);
            }

        } catch (error) {
            console.error('Failed to create PDF.js annotation:', error);
        }
    }

    /**
     * Create annotation from PDF.js native coordinates
     */
    private createAnnotationFromPdfCoordinates(
        text: string,
        color: string,
        pageNumber: number,
        pdfCoordinates: any[]
    ): PdfJsAnnotation | null {
        try {
            const rgbColor = this.hexToRgb(color);

            // Convert PDF.js text div coordinates to annotation rectangles
            const rects: Array<[number, number, number, number]> = [];
            const quadPoints: number[] = [];

            pdfCoordinates.forEach(coord => {
                // PDF.js text divs are already in PDF coordinate space
                const rect: [number, number, number, number] = [
                    coord.x,
                    coord.y,
                    coord.x + coord.width,
                    coord.y + coord.height
                ];
                rects.push(rect);

                // Add quad points for this rectangle
                quadPoints.push(
                    coord.x, coord.y,                    // bottom-left
                    coord.x + coord.width, coord.y,     // bottom-right
                    coord.x + coord.width, coord.y + coord.height, // top-right
                    coord.x, coord.y + coord.height     // top-left
                );
            });

            // Create bounding rectangle
            const boundingRect = this.getBoundingRect(rects);

            const annotation: PdfJsAnnotation = {
                id: this.generateId(),
                annotationType: PdfJsAnnotationManager.ANNOTATION_TYPES.HIGHLIGHT,
                subtype: 'Highlight',
                rect: boundingRect,
                color: rgbColor,
                quadPoints: quadPoints,
                contents: text,
                page: pageNumber,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            return annotation;

        } catch (error) {
            console.error('Error creating annotation from PDF coordinates:', error);
            return null;
        }
    }

    /**
     * Fallback: Create highlight from browser selection
     */
    private async createHighlightFromBrowserSelection(data: HighlightCreationData): Promise<void> {
        // Get the PDF page
        const page = await this.pdfDoc.getPage(data.pageNumber);
        const viewport = page.getViewport({ scale: 1.0 });

        // Convert selection to PDF coordinates (fallback method)
        const pdfAnnotation = await this.selectionToPdfAnnotation(
            data.selection,
            data.selectedText,
            data.color,
            data.pageNumber,
            page,
            viewport
        );

        if (pdfAnnotation) {
            await this.saveAndRenderAnnotation(pdfAnnotation, data.pageNumber);
        }
    }

    /**
     * Save annotation and render it
     */
    private async saveAndRenderAnnotation(annotation: PdfJsAnnotation, pageNumber: number): Promise<void> {
        // Save annotation via API
        const savedAnnotation = await this.pdfApiService.addAnnotation(this.documentId!, {
            type: 'highlight',
            page: pageNumber,
            content: annotation.contents,
            color: this.rgbToHex(annotation.color),
            pdfAnnotation: annotation
        });

        // Store locally
        this.addAnnotationToPage(pageNumber, annotation);

        // Re-render annotation layer for this page
        await this.renderAnnotationLayer(pageNumber);

        // Clear selection
        window.getSelection()?.removeAllRanges();

        console.log('✨ PDF.js annotation created from native selection:', savedAnnotation);
    }

    /**
     * Convert text selection to PDF.js annotation format
     */
    private async selectionToPdfAnnotation(
        selection: Selection,
        text: string,
        color: string,
        pageNumber: number,
        page: any,
        viewport: any
    ): Promise<PdfJsAnnotation | null> {
        try {
            const range = selection.getRangeAt(0);
            const rects = range.getClientRects();

            if (rects.length === 0) return null;

            // Convert HTML color to RGB array
            const rgbColor = this.hexToRgb(color);

            // Get page element for coordinate conversion
            const pageElement = this.findPageElement(range.commonAncestorContainer);
            if (!pageElement) return null;

            // Convert screen coordinates to PDF coordinates
            const pdfRects = this.screenToPdfCoordinates(rects, pageElement, viewport);
            if (pdfRects.length === 0) return null;

            // Create bounding rectangle (union of all rects)
            const boundingRect = this.getBoundingRect(pdfRects);

            // Create quad points for highlight (all rectangle corners)
            const quadPoints = this.rectsToQuadPoints(pdfRects);

            const annotation: PdfJsAnnotation = {
                id: this.generateId(),
                annotationType: PdfJsAnnotationManager.ANNOTATION_TYPES.HIGHLIGHT,
                subtype: 'Highlight',
                rect: boundingRect,
                color: rgbColor,
                quadPoints: quadPoints,
                contents: text,
                page: pageNumber,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            return annotation;

        } catch (error) {
            console.error('Error converting selection to PDF annotation:', error);
            return null;
        }
    }

    /**
     * Render annotation layer for a specific page
     */
    async renderAnnotationLayer(pageNumber: number): Promise<void> {
        if (!this.pdfDoc) return;

        try {
            const page = await this.pdfDoc.getPage(pageNumber);
            const pageElement = this.getPageElement(pageNumber);
            if (!pageElement) return;

            // Get current scale from page rendering
            const canvas = pageElement.querySelector('canvas') as HTMLCanvasElement;
            if (!canvas) return;

            const canvasStyle = window.getComputedStyle(canvas);
            const displayWidth = parseFloat(canvasStyle.width);
            const canvasWidth = canvas.width;
            const scale = displayWidth / canvasWidth;

            const viewport = page.getViewport({ scale });

            // Create or get annotation layer div
            let annotationLayerDiv = this.annotationLayers.get(pageNumber);
            if (!annotationLayerDiv) {
                annotationLayerDiv = document.createElement('div');
                annotationLayerDiv.className = 'annotationLayer';
                annotationLayerDiv.style.cssText = `
                    position: absolute;
                    left: 0;
                    top: 0;
                    right: 0;
                    bottom: 0;
                    overflow: hidden;
                    pointer-events: auto;
                    z-index: 2;
                `;
                pageElement.appendChild(annotationLayerDiv);
                this.annotationLayers.set(pageNumber, annotationLayerDiv);
            }

            // Clear existing annotations
            annotationLayerDiv.innerHTML = '';

            // Get annotations for this page
            const pageAnnotations = this.annotations.get(pageNumber) || [];

            // Convert our annotations to PDF.js format
            const pdfjsAnnotations = pageAnnotations.map(ann => this.toPdfjsFormat(ann));

            // Render using PDF.js AnnotationLayer
            if (window.pdfjsLib && window.pdfjsLib.AnnotationLayer) {
                const renderParameters = {
                    viewport: viewport,
                    div: annotationLayerDiv,
                    annotations: pdfjsAnnotations,
                    page: page,
                    linkService: null, // We don't need link service for highlights
                    downloadManager: null,
                    annotationStorage: null
                };

                window.pdfjsLib.AnnotationLayer.render(renderParameters);
            } else {
                // Fallback: render annotations manually
                this.renderAnnotationsManually(annotationLayerDiv, pageAnnotations, viewport);
            }

            console.log(`📝 Rendered ${pageAnnotations.length} annotations for page ${pageNumber}`);

        } catch (error) {
            console.error('Error rendering annotation layer:', error);
        }
    }

    /**
     * Fallback manual annotation rendering
     */
    private renderAnnotationsManually(
        container: HTMLElement,
        annotations: PdfJsAnnotation[],
        viewport: any
    ): void {
        annotations.forEach(annotation => {
            if (annotation.annotationType === PdfJsAnnotationManager.ANNOTATION_TYPES.HIGHLIGHT) {
                this.renderHighlightAnnotation(container, annotation, viewport);
            }
        });
    }

    /**
     * Render a single highlight annotation manually
     */
    private renderHighlightAnnotation(
        container: HTMLElement,
        annotation: PdfJsAnnotation,
        viewport: any
    ): void {
        if (!annotation.quadPoints || annotation.quadPoints.length === 0) return;

        // Create highlight elements from quad points
        for (let i = 0; i < annotation.quadPoints.length; i += 8) {
            const quad = annotation.quadPoints.slice(i, i + 8);
            if (quad.length < 8) continue;

            // Convert PDF coordinates to screen coordinates
            const [x1, y1, x2, y2, x3, y3, x4, y4] = quad;
            
            // Transform coordinates using viewport
            const screenRect = viewport.convertToViewportRectangle([
                Math.min(x1, x2, x3, x4),
                Math.min(y1, y2, y3, y4),
                Math.max(x1, x2, x3, x4),
                Math.max(y1, y2, y3, y4)
            ]);

            const highlightElement = document.createElement('div');
            highlightElement.className = 'pdfjs-highlight';
            highlightElement.style.cssText = `
                position: absolute;
                left: ${screenRect[0]}px;
                top: ${screenRect[1]}px;
                width: ${screenRect[2] - screenRect[0]}px;
                height: ${screenRect[3] - screenRect[1]}px;
                background-color: rgba(${annotation.color.map(c => Math.round(c * 255)).join(',')}, 0.3);
                pointer-events: auto;
                cursor: pointer;
                mix-blend-mode: multiply;
            `;

            // Add interaction handlers
            highlightElement.addEventListener('click', (e) => {
                e.stopPropagation();
                this.handleAnnotationClick(e, annotation);
            });

            container.appendChild(highlightElement);
        }
    }

    /**
     * Handle annotation click events
     */
    private handleAnnotationClick(event: MouseEvent, annotation?: PdfJsAnnotation): void {
        // If annotation is provided, it's from manual rendering
        if (annotation) {
            console.log('Annotation clicked:', annotation);
            // Emit event for context menu, etc.
            const customEvent = new CustomEvent('pdfjs-annotation-clicked', {
                detail: { annotation, event }
            });
            document.dispatchEvent(customEvent);
        }
    }

    /**
     * Utility methods
     */
    private findPageElement(node: Node): HTMLElement | null {
        let element = node.nodeType === Node.ELEMENT_NODE ? node as HTMLElement : node.parentElement;
        while (element) {
            if (element.classList?.contains('page')) {
                return element;
            }
            element = element.parentElement;
        }
        return null;
    }

    private getPageNumber(pageElement: HTMLElement): number | null {
        const pageAttr = pageElement.getAttribute('data-page-number');
        return pageAttr ? parseInt(pageAttr, 10) : null;
    }

    private getPageElement(pageNumber: number): HTMLElement | null {
        return document.querySelector(`[data-page-number="${pageNumber}"]`) as HTMLElement;
    }

    private hexToRgb(hex: string): [number, number, number] {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? [
            parseInt(result[1], 16) / 255,
            parseInt(result[2], 16) / 255,
            parseInt(result[3], 16) / 255
        ] : [1, 1, 0]; // Default yellow
    }

    private rgbToHex(rgb: [number, number, number]): string {
        const toHex = (c: number) => {
            const hex = Math.round(c * 255).toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        };
        return '#' + toHex(rgb[0]) + toHex(rgb[1]) + toHex(rgb[2]);
    }

    private screenToPdfCoordinates(
        rects: DOMRectList, 
        pageElement: HTMLElement, 
        viewport: any
    ): Array<[number, number, number, number]> {
        const pageRect = pageElement.getBoundingClientRect();
        const pdfRects: Array<[number, number, number, number]> = [];

        for (let i = 0; i < rects.length; i++) {
            const rect = rects[i];
            
            // Convert to page-relative coordinates
            const relativeRect = {
                left: rect.left - pageRect.left,
                top: rect.top - pageRect.top,
                right: rect.right - pageRect.left,
                bottom: rect.bottom - pageRect.top
            };

            // Convert to PDF coordinates using viewport
            const pdfRect = viewport.convertToPdfPoint(relativeRect.left, relativeRect.top);
            const pdfRect2 = viewport.convertToPdfPoint(relativeRect.right, relativeRect.bottom);

            pdfRects.push([pdfRect[0], pdfRect[1], pdfRect2[0], pdfRect2[1]]);
        }

        return pdfRects;
    }

    private getBoundingRect(rects: Array<[number, number, number, number]>): [number, number, number, number] {
        if (rects.length === 0) return [0, 0, 0, 0];

        let minX = rects[0][0], minY = rects[0][1];
        let maxX = rects[0][2], maxY = rects[0][3];

        for (const rect of rects) {
            minX = Math.min(minX, rect[0]);
            minY = Math.min(minY, rect[1]);
            maxX = Math.max(maxX, rect[2]);
            maxY = Math.max(maxY, rect[3]);
        }

        return [minX, minY, maxX, maxY];
    }

    private rectsToQuadPoints(rects: Array<[number, number, number, number]>): number[] {
        const quadPoints: number[] = [];

        for (const rect of rects) {
            const [x1, y1, x2, y2] = rect;
            // Add quad points for rectangle (clockwise from bottom-left)
            quadPoints.push(x1, y1, x2, y1, x2, y2, x1, y2);
        }

        return quadPoints;
    }

    private toPdfjsFormat(annotation: PdfJsAnnotation): any {
        return {
            annotationType: annotation.annotationType,
            subtype: annotation.subtype,
            rect: annotation.rect,
            color: annotation.color,
            quadPoints: annotation.quadPoints,
            contents: annotation.contents,
            id: annotation.id
        };
    }

    private addAnnotationToPage(pageNumber: number, annotation: PdfJsAnnotation): void {
        if (!this.annotations.has(pageNumber)) {
            this.annotations.set(pageNumber, []);
        }
        this.annotations.get(pageNumber)!.push(annotation);
    }

    private generateId(): string {
        return 'ann_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Public API methods
     */

    /**
     * Load annotations for the document
     */
    async loadAnnotations(): Promise<void> {
        if (!this.documentId) return;

        try {
            const annotations = await this.pdfApiService.getAnnotations(this.documentId);
            
            // Clear existing annotations
            this.annotations.clear();

            // Process loaded annotations
            for (const annotation of annotations) {
                if (annotation.pdfAnnotation) {
                    this.addAnnotationToPage(annotation.page, annotation.pdfAnnotation);
                }
            }

            console.log(`📝 Loaded ${annotations.length} PDF.js annotations`);

        } catch (error) {
            console.error('Failed to load annotations:', error);
        }
    }

    /**
     * Clear all annotations
     */
    clearAllAnnotations(): void {
        this.annotations.clear();
        this.annotationLayers.forEach((layer, pageNumber) => {
            layer.remove();
        });
        this.annotationLayers.clear();
    }

    /**
     * Re-render all annotation layers (called on zoom)
     */
    async refreshAllAnnotations(): Promise<void> {
        for (const pageNumber of this.annotations.keys()) {
            await this.renderAnnotationLayer(pageNumber);
        }
        console.log('🔄 Refreshed all PDF.js annotation layers');
    }
}
