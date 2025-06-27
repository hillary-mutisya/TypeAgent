// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { PDFApiService } from '../services/pdfApiService';

/**
 * Drawing stroke data structure
 */
export interface DrawingStroke {
    points: { x: number; y: number; pressure?: number }[];
    color: string;
    thickness: number;
    timestamp: number;
}

/**
 * Drawing data structure
 */
export interface Drawing {
    id: string;
    documentId: string;
    page: number;
    strokes: DrawingStroke[];
    createdAt: string;
    updatedAt: string;
    userId?: string;
}

/**
 * Ink Manager for freehand drawing on PDF pages
 */
export class InkManager {
    private drawings: Map<string, Drawing> = new Map();
    private canvases: Map<number, HTMLCanvasElement> = new Map();
    private contexts: Map<number, CanvasRenderingContext2D> = new Map();
    private isInkMode = false;
    private isDrawing = false;
    private currentStroke: DrawingStroke | null = null;
    private currentColor = '#000000';
    private currentThickness = 2;
    private documentId: string | null = null;
    private pdfApiService: PDFApiService;
    private lastPoint: { x: number; y: number } | null = null;

    constructor(pdfApiService: PDFApiService) {
        this.pdfApiService = pdfApiService;
        this.setupEventHandlers();
    }

    /**
     * Set document ID
     */
    setDocumentId(documentId: string): void {
        this.documentId = documentId;
    }

    /**
     * Toggle ink mode
     */
    toggleInkMode(): void {
        this.isInkMode = !this.isInkMode;
        
        // Update cursor style
        const viewer = document.getElementById('viewerContainer');
        if (viewer) {
            if (this.isInkMode) {
                viewer.style.cursor = 'crosshair';
                viewer.classList.add('ink-mode');
            } else {
                viewer.style.cursor = 'default';
                viewer.classList.remove('ink-mode');
            }
        }

        // Update canvas pointer events
        this.canvases.forEach(canvas => {
            canvas.style.pointerEvents = this.isInkMode ? 'auto' : 'none';
        });

        // Dispatch mode change event
        const event = new CustomEvent('inkModeChanged', {
            detail: { isActive: this.isInkMode }
        });
        document.dispatchEvent(event);
    }

    /**
     * Check if ink mode is active
     */
    isInkModeActive(): boolean {
        return this.isInkMode;
    }

    /**
     * Set ink color
     */
    setInkColor(color: string): void {
        this.currentColor = color;
    }

    /**
     * Get current ink color
     */
    getCurrentColor(): string {
        return this.currentColor;
    }

    /**
     * Set ink thickness
     */
    setInkThickness(thickness: number): void {
        this.currentThickness = Math.max(1, Math.min(20, thickness));
    }

    /**
     * Get current ink thickness
     */
    getCurrentThickness(): number {
        return this.currentThickness;
    }    /**
     * Setup event handlers
     */
    private setupEventHandlers(): void {
        // Mouse events
        document.addEventListener('mousedown', (event) => {
            if (this.isInkMode) {
                this.startDrawing(event);
            }
        });

        document.addEventListener('mousemove', (event) => {
            if (this.isInkMode && this.isDrawing) {
                this.continueDrawing(event);
            }
        });

        document.addEventListener('mouseup', (event) => {
            if (this.isInkMode && this.isDrawing) {
                this.finishDrawing(event);
            }
        });

        // Touch events for mobile
        document.addEventListener('touchstart', (event) => {
            if (this.isInkMode) {
                event.preventDefault();
                const touch = event.touches[0];
                this.startDrawing(touch);
            }
        }, { passive: false });

        document.addEventListener('touchmove', (event) => {
            if (this.isInkMode && this.isDrawing) {
                event.preventDefault();
                const touch = event.touches[0];
                this.continueDrawing(touch);
            }
        }, { passive: false });

        document.addEventListener('touchend', (event) => {
            if (this.isInkMode && this.isDrawing) {
                event.preventDefault();
                this.finishDrawing(event);
            }
        }, { passive: false });

        // Prevent context menu on canvas
        document.addEventListener('contextmenu', (event) => {
            if (this.isInkMode) {
                const target = event.target as HTMLElement;
                if (target.tagName === 'CANVAS' && target.classList.contains('ink-canvas')) {
                    event.preventDefault();
                }
            }
        });
    }

    /**
     * Start drawing
     */
    private startDrawing(event: MouseEvent | Touch): void {
        const canvas = this.getCanvasFromEvent(event);
        if (!canvas) {
            return;
        }

        const pageNum = this.getPageNumberFromCanvas(canvas);
        if (!pageNum) {
            return;
        }

        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        // Start new stroke
        this.currentStroke = {
            points: [{ x, y }],
            color: this.currentColor,
            thickness: this.currentThickness,
            timestamp: Date.now()
        };

        this.isDrawing = true;
        this.lastPoint = { x, y };

        // Begin path on canvas
        const context = this.contexts.get(pageNum);
        if (context) {
            context.beginPath();
            context.moveTo(x, y);
            context.strokeStyle = this.currentColor;
            context.lineWidth = this.currentThickness;
            context.lineCap = 'round';
            context.lineJoin = 'round';
        }
    }

    /**
     * Continue drawing
     */
    private continueDrawing(event: MouseEvent | Touch): void {
        if (!this.currentStroke || !this.lastPoint) {
            return;
        }

        const canvas = this.getCanvasFromEvent(event);
        if (!canvas) {
            return;
        }

        const pageNum = this.getPageNumberFromCanvas(canvas);
        if (!pageNum) {
            return;
        }

        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        // Add point to stroke
        this.currentStroke.points.push({ x, y });

        // Draw line segment
        const context = this.contexts.get(pageNum);
        if (context) {
            context.lineTo(x, y);
            context.stroke();
        }

        this.lastPoint = { x, y };
    }

    /**
     * Finish drawing
     */
    private async finishDrawing(event: MouseEvent | TouchEvent): Promise<void> {
        if (!this.currentStroke) {
            return;
        }

        const canvas = this.getCanvasFromEvent(event);
        if (!canvas) {
            return;
        }

        const pageNum = this.getPageNumberFromCanvas(canvas);
        if (!pageNum) {
            return;
        }

        // Finish the stroke
        this.isDrawing = false;

        // Save stroke if it has enough points
        if (this.currentStroke.points.length > 1) {
            await this.saveStroke(pageNum, this.currentStroke);
        }

        this.currentStroke = null;
        this.lastPoint = null;
    }

    /**
     * Get canvas from event
     */
    private getCanvasFromEvent(event: MouseEvent | Touch): HTMLCanvasElement | null {
        const target = (event as any).target || document.elementFromPoint(event.clientX, event.clientY);
        
        if (target && target.tagName === 'CANVAS' && target.classList.contains('ink-canvas')) {
            return target as HTMLCanvasElement;
        }

        return null;
    }

    /**
     * Get page number from canvas
     */
    private getPageNumberFromCanvas(canvas: HTMLCanvasElement): number | null {
        const pageAttr = canvas.getAttribute('data-page-number');
        if (pageAttr) {
            return parseInt(pageAttr, 10);
        }

        // Find page number from canvas map
        for (const [pageNum, canvasElement] of this.canvases.entries()) {
            if (canvasElement === canvas) {
                return pageNum;
            }
        }

        return null;
    }

    /**
     * Save stroke to server
     */
    private async saveStroke(pageNum: number, stroke: DrawingStroke): Promise<void> {
        if (!this.documentId) {
            return;
        }

        try {
            // Create or update drawing
            let drawing = this.getDrawingForPage(pageNum);
            
            if (!drawing) {
                // Create new drawing
                const drawingData: Omit<Drawing, 'id' | 'createdAt' | 'updatedAt'> = {
                    documentId: this.documentId,
                    page: pageNum,
                    strokes: [stroke]
                };

                drawing = await this.pdfApiService.addDrawing(this.documentId, drawingData);
                this.drawings.set(drawing.id, drawing);
            } else {
                // Add stroke to existing drawing
                drawing.strokes.push(stroke);
                drawing.updatedAt = new Date().toISOString();
                
                const updatedDrawing = await this.pdfApiService.updateDrawing(
                    this.documentId,
                    drawing.id,
                    drawing
                );
                this.drawings.set(drawing.id, updatedDrawing);
            }

            console.log('✏️ Stroke saved:', stroke);

        } catch (error) {
            console.error('Failed to save stroke:', error);
        }
    }

    /**
     * Get drawing for specific page
     */
    private getDrawingForPage(pageNum: number): Drawing | null {
        for (const drawing of this.drawings.values()) {
            if (drawing.page === pageNum) {
                return drawing;
            }
        }
        return null;
    }

    /**
     * Create canvas overlay for page
     */
    createCanvasForPage(pageNum: number, pageElement: HTMLElement): void {
        // Remove existing canvas
        this.removeCanvasForPage(pageNum);

        // Get page dimensions
        const pageRect = pageElement.getBoundingClientRect();
        const computedStyle = window.getComputedStyle(pageElement);
        
        // Create canvas
        const canvas = document.createElement('canvas');
        canvas.className = 'ink-canvas';
        canvas.setAttribute('data-page-number', pageNum.toString());
        
        // Set canvas size to match page
        canvas.width = pageElement.offsetWidth;
        canvas.height = pageElement.offsetHeight;
        
        canvas.style.cssText = `
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            pointer-events: ${this.isInkMode ? 'auto' : 'none'};
            z-index: 3;
            touch-action: none;
        `;

        // Position page element relatively
        pageElement.style.position = 'relative';
        pageElement.appendChild(canvas);

        // Get canvas context
        const context = canvas.getContext('2d');
        if (context) {
            // Configure context
            context.lineCap = 'round';
            context.lineJoin = 'round';
            context.imageSmoothingEnabled = true;
        }

        // Store references
        this.canvases.set(pageNum, canvas);
        if (context) {
            this.contexts.set(pageNum, context);
        }

        // Render existing drawings
        this.renderDrawingsForPage(pageNum);
    }

    /**
     * Remove canvas for page
     */
    removeCanvasForPage(pageNum: number): void {
        const canvas = this.canvases.get(pageNum);
        if (canvas && canvas.parentNode) {
            canvas.parentNode.removeChild(canvas);
        }
        
        this.canvases.delete(pageNum);
        this.contexts.delete(pageNum);
    }

    /**
     * Clear all canvases
     */
    clearAllCanvases(): void {
        this.canvases.forEach((canvas, pageNum) => {
            this.removeCanvasForPage(pageNum);
        });
    }

    /**
     * Render drawings for specific page
     */
    private renderDrawingsForPage(pageNum: number): void {
        const context = this.contexts.get(pageNum);
        if (!context) {
            return;
        }

        // Clear canvas
        context.clearRect(0, 0, context.canvas.width, context.canvas.height);

        // Get drawings for this page
        const drawings = this.getDrawingsForPage(pageNum);
        
        // Render each drawing
        drawings.forEach(drawing => {
            this.renderDrawing(context, drawing);
        });
    }

    /**
     * Render single drawing on context
     */
    private renderDrawing(context: CanvasRenderingContext2D, drawing: Drawing): void {
        drawing.strokes.forEach(stroke => {
            this.renderStroke(context, stroke);
        });
    }

    /**
     * Render single stroke on context
     */
    private renderStroke(context: CanvasRenderingContext2D, stroke: DrawingStroke): void {
        if (stroke.points.length < 2) {
            return;
        }

        context.beginPath();
        context.strokeStyle = stroke.color;
        context.lineWidth = stroke.thickness;
        context.lineCap = 'round';
        context.lineJoin = 'round';

        // Move to first point
        const firstPoint = stroke.points[0];
        context.moveTo(firstPoint.x, firstPoint.y);

        // Draw lines to subsequent points
        for (let i = 1; i < stroke.points.length; i++) {
            const point = stroke.points[i];
            context.lineTo(point.x, point.y);
        }

        context.stroke();
    }    /**
     * Load drawings for document
     */
    async loadDrawings(documentId: string): Promise<void> {
        try {
            const drawings = await this.pdfApiService.getDrawings(documentId);
            
            // Clear existing drawings
            this.clearAllDrawings();

            // Store drawings
            drawings.forEach((drawing: Drawing) => {
                this.drawings.set(drawing.id, drawing);
            });

            // Re-render all pages with drawings
            this.canvases.forEach((canvas, pageNum) => {
                this.renderDrawingsForPage(pageNum);
            });

            console.log(`✏️ Loaded ${drawings.length} drawings`);

        } catch (error) {
            // Gracefully handle missing API endpoints during development
            if (error instanceof Error && error.message.includes('404')) {
                console.log('✏️ No server-side drawing storage available yet');
                return;
            }
            console.error('Failed to load drawings:', error);
        }
    }

    /**
     * Clear all drawings
     */
    clearAllDrawings(): void {
        // Clear from memory
        this.drawings.clear();
        
        // Clear all canvases
        this.contexts.forEach(context => {
            context.clearRect(0, 0, context.canvas.width, context.canvas.height);
        });
    }

    /**
     * Delete drawing
     */
    async deleteDrawing(drawingId: string): Promise<void> {
        if (!this.documentId) {
            return;
        }

        try {
            // Delete from server
            await this.pdfApiService.deleteDrawing(this.documentId, drawingId);

            // Get drawing to find page
            const drawing = this.drawings.get(drawingId);
            const pageNum = drawing?.page;

            // Remove from local storage
            this.drawings.delete(drawingId);

            // Re-render page if we know which page
            if (pageNum) {
                this.renderDrawingsForPage(pageNum);
            }

            console.log('🗑️ Drawing deleted:', drawingId);

        } catch (error) {
            console.error('Failed to delete drawing:', error);
        }
    }

    /**
     * Clear page drawings
     */
    async clearPageDrawings(pageNum: number): Promise<void> {
        if (!this.documentId) {
            return;
        }

        const pageDrawings = this.getDrawingsForPage(pageNum);
        
        for (const drawing of pageDrawings) {
            await this.deleteDrawing(drawing.id);
        }
    }

    /**
     * Undo last stroke on page
     */
    async undoLastStroke(pageNum: number): Promise<void> {
        const drawing = this.getDrawingForPage(pageNum);
        if (!drawing || drawing.strokes.length === 0) {
            return;
        }

        // Remove last stroke
        drawing.strokes.pop();
        drawing.updatedAt = new Date().toISOString();

        try {
            if (drawing.strokes.length === 0) {
                // Delete empty drawing
                await this.deleteDrawing(drawing.id);
            } else {
                // Update drawing on server
                const updatedDrawing = await this.pdfApiService.updateDrawing(
                    this.documentId!,
                    drawing.id,
                    drawing
                );
                this.drawings.set(drawing.id, updatedDrawing);
                
                // Re-render page
                this.renderDrawingsForPage(pageNum);
            }

            console.log('↶ Last stroke undone');

        } catch (error) {
            console.error('Failed to undo stroke:', error);
        }
    }

    /**
     * Get all drawings
     */
    getAllDrawings(): Drawing[] {
        return Array.from(this.drawings.values());
    }

    /**
     * Get drawings for specific page
     */
    getDrawingsForPage(pageNum: number): Drawing[] {
        return this.getAllDrawings().filter(d => d.page === pageNum);
    }

    /**
     * Export drawings as image data URL
     */
    exportPageDrawings(pageNum: number): string | null {
        const canvas = this.canvases.get(pageNum);
        if (!canvas) {
            return null;
        }

        return canvas.toDataURL('image/png');
    }

    /**
     * Import drawings from image data
     */
    async importPageDrawings(pageNum: number, imageDataUrl: string): Promise<void> {
        const canvas = this.canvases.get(pageNum);
        const context = this.contexts.get(pageNum);
        
        if (!canvas || !context) {
            return;
        }

        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                // Clear existing drawings
                context.clearRect(0, 0, canvas.width, canvas.height);
                
                // Draw imported image
                context.drawImage(img, 0, 0);
                
                resolve();
            };
            img.onerror = reject;
            img.src = imageDataUrl;
        });
    }

    /**
     * Resize canvas when page changes
     */
    resizeCanvas(pageNum: number, newWidth: number, newHeight: number): void {
        const canvas = this.canvases.get(pageNum);
        const context = this.contexts.get(pageNum);
        
        if (!canvas || !context) {
            return;
        }

        // Store current drawing data
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        
        // Resize canvas
        canvas.width = newWidth;
        canvas.height = newHeight;
        
        // Restore drawing (scaled if necessary)
        const scaleX = newWidth / imageData.width;
        const scaleY = newHeight / imageData.height;
        
        if (scaleX !== 1 || scaleY !== 1) {
            // Create temporary canvas for scaling
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = imageData.width;
            tempCanvas.height = imageData.height;
            const tempContext = tempCanvas.getContext('2d')!;
            tempContext.putImageData(imageData, 0, 0);
            
            // Draw scaled image
            context.drawImage(tempCanvas, 0, 0, newWidth, newHeight);
        } else {
            // Restore without scaling
            context.putImageData(imageData, 0, 0);
        }
    }

    /**
     * Get stroke count for page
     */
    getStrokeCountForPage(pageNum: number): number {
        return this.getDrawingsForPage(pageNum)
            .reduce((count, drawing) => count + drawing.strokes.length, 0);
    }

    /**
     * Check if page has drawings
     */
    pageHasDrawings(pageNum: number): boolean {
        return this.getDrawingsForPage(pageNum).length > 0;
    }
}
