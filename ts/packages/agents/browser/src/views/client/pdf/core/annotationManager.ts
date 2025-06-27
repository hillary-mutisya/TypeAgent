// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { TextLayerManager } from './textLayerManager';
import { HighlightManager, Highlight } from './highlightManager';
import { NoteManager, Note } from './noteManager';
import { InkManager, Drawing } from './inkManager';
import { PDFApiService } from '../services/pdfApiService';

/**
 * Unified annotation data type
 */
export type Annotation = Highlight | Note | Drawing;

/**
 * Annotation tool types
 */
export type AnnotationTool = 'select' | 'highlight' | 'note' | 'ink';

/**
 * Annotation filter options
 */
export interface AnnotationFilter {
    type?: string[];
    page?: number;
    userId?: string;
    dateRange?: {
        start: string;
        end: string;
    };
}

/**
 * Unified Annotation Manager that coordinates all annotation types
 */
export class AnnotationManager {
    private textLayerManager: TextLayerManager;
    private highlightManager: HighlightManager;
    private noteManager: NoteManager;
    private inkManager: InkManager;
    private pdfApiService: PDFApiService;
    private currentTool: AnnotationTool = 'select';
    private documentId: string | null = null;

    constructor(pdfApiService: PDFApiService) {
        this.pdfApiService = pdfApiService;
        this.textLayerManager = new TextLayerManager();
        this.highlightManager = new HighlightManager(pdfApiService);
        this.noteManager = new NoteManager(pdfApiService);
        this.inkManager = new InkManager(pdfApiService);
        
        this.setupEventHandlers();
    }

    /**
     * Initialize annotation system for document
     */
    async initialize(documentId: string, pdfDoc: any): Promise<void> {
        this.documentId = documentId;
        
        // Set document ID for all managers
        this.highlightManager.setDocumentId(documentId);
        this.noteManager.setDocumentId(documentId);
        this.inkManager.setDocumentId(documentId);
        this.textLayerManager.setPDFDocument(pdfDoc);

        // Load existing annotations
        await this.loadAllAnnotations();

        console.log('📝 Annotation system initialized for document:', documentId);
    }

    /**
     * Setup annotation-related event handlers
     */
    private setupEventHandlers(): void {
        // Listen for tool change events
        document.addEventListener('annotationToolChanged', (event: any) => {
            this.setActiveTool(event.detail.tool);
        });

        // Listen for page render events
        document.addEventListener('pageRendered', (event: any) => {
            const { pageNum, pageElement, viewport } = event.detail;
            this.setupPageAnnotations(pageNum, pageElement, viewport);
        });

        // Listen for page cleanup events
        document.addEventListener('pageCleanup', (event: any) => {
            const { pageNum } = event.detail;
            this.cleanupPageAnnotations(pageNum);
        });

        // Listen for annotation selection events
        document.addEventListener('highlightSelected', (event: any) => {
            this.handleAnnotationSelection('highlight', event.detail);
        });

        // Listen for real-time annotation updates
        document.addEventListener('annotationUpdate', (event: any) => {
            this.handleRemoteAnnotationUpdate(event.detail);
        });
    }

    /**
     * Setup annotations for a specific page
     */
    async setupPageAnnotations(pageNum: number, pageElement: HTMLElement, viewport: any): Promise<void> {
        try {
            // Set page number attribute for easy identification
            pageElement.setAttribute('data-page-number', pageNum.toString());

            // Enable text layer for text selection and highlighting
            await this.textLayerManager.enableTextLayer(pageNum, pageElement, viewport);

            // Create ink canvas overlay
            this.inkManager.createCanvasForPage(pageNum, pageElement);

            console.log(`📄 Page ${pageNum} annotations setup complete`);

        } catch (error) {
            console.error(`Failed to setup annotations for page ${pageNum}:`, error);
        }
    }

    /**
     * Cleanup annotations for a specific page
     */
    cleanupPageAnnotations(pageNum: number): void {
        // Remove text layer
        this.textLayerManager.removeTextLayer(pageNum);

        // Remove ink canvas
        this.inkManager.removeCanvasForPage(pageNum);
    }

    /**
     * Load all annotations for the document
     */
    async loadAllAnnotations(): Promise<void> {
        if (!this.documentId) {
            return;
        }

        try {
            // Load annotations in parallel
            await Promise.all([
                this.highlightManager.loadHighlights(this.documentId),
                this.noteManager.loadNotes(this.documentId),
                this.inkManager.loadDrawings(this.documentId)
            ]);

            console.log('📚 All annotations loaded');

        } catch (error) {
            console.error('Failed to load annotations:', error);
        }
    }

    /**
     * Set active annotation tool
     */
    setActiveTool(tool: AnnotationTool): void {
        // Deactivate current tool
        this.deactivateCurrentTool();

        // Set new tool
        this.currentTool = tool;

        // Activate new tool
        this.activateCurrentTool();

        // Dispatch tool change event
        const event = new CustomEvent('activeToolChanged', {
            detail: { tool: this.currentTool }
        });
        document.dispatchEvent(event);

        console.log('🔧 Active annotation tool changed to:', tool);
    }

    /**
     * Get current active tool
     */
    getActiveTool(): AnnotationTool {
        return this.currentTool;
    }

    /**
     * Deactivate current tool
     */
    private deactivateCurrentTool(): void {
        switch (this.currentTool) {
            case 'highlight':
                if (this.highlightManager.isHighlightModeActive()) {
                    this.highlightManager.toggleHighlightMode();
                }
                break;
            case 'note':
                if (this.noteManager.isNoteModeActive()) {
                    this.noteManager.toggleNoteMode();
                }
                break;
            case 'ink':
                if (this.inkManager.isInkModeActive()) {
                    this.inkManager.toggleInkMode();
                }
                break;
        }
    }

    /**
     * Activate current tool
     */
    private activateCurrentTool(): void {
        switch (this.currentTool) {
            case 'highlight':
                this.highlightManager.toggleHighlightMode();
                break;
            case 'note':
                this.noteManager.toggleNoteMode();
                break;
            case 'ink':
                this.inkManager.toggleInkMode();
                break;
            case 'select':
            default:
                // Select tool is the default - no special activation needed
                break;
        }
    }

    /**
     * Get all annotations
     */
    getAllAnnotations(): Annotation[] {
        const highlights = this.highlightManager.getAllHighlights();
        const notes = this.noteManager.getAllNotes();
        const drawings = this.inkManager.getAllDrawings();

        return [...highlights, ...notes, ...drawings];
    }

    /**
     * Get annotations for specific page
     */
    getAnnotationsForPage(pageNum: number): Annotation[] {
        const highlights = this.highlightManager.getHighlightsForPage(pageNum);
        const notes = this.noteManager.getNotesForPage(pageNum);
        const drawings = this.inkManager.getDrawingsForPage(pageNum);

        return [...highlights, ...notes, ...drawings];
    }

    /**
     * Filter annotations
     */
    filterAnnotations(filter: AnnotationFilter): Annotation[] {
        let annotations = this.getAllAnnotations();

        // Filter by type
        if (filter.type && filter.type.length > 0) {
            annotations = annotations.filter(annotation => {
                if ('selectedText' in annotation) return filter.type!.includes('highlight');
                if ('content' in annotation && 'coordinates' in annotation && !('strokes' in annotation)) {
                    return filter.type!.includes('note');
                }
                if ('strokes' in annotation) return filter.type!.includes('drawing');
                return false;
            });
        }

        // Filter by page
        if (filter.page !== undefined) {
            annotations = annotations.filter(annotation => annotation.page === filter.page);
        }

        // Filter by user
        if (filter.userId) {
            annotations = annotations.filter(annotation => annotation.userId === filter.userId);
        }

        // Filter by date range
        if (filter.dateRange) {
            const startDate = new Date(filter.dateRange.start);
            const endDate = new Date(filter.dateRange.end);

            annotations = annotations.filter(annotation => {
                const annotationDate = new Date(annotation.createdAt);
                return annotationDate >= startDate && annotationDate <= endDate;
            });
        }

        return annotations;
    }

    /**
     * Search annotations by content
     */
    searchAnnotations(query: string): Annotation[] {
        const lowercaseQuery = query.toLowerCase();
        const results: Annotation[] = [];

        // Search highlights
        const highlights = this.highlightManager.getAllHighlights();
        results.push(...highlights.filter(h => 
            h.selectedText.toLowerCase().includes(lowercaseQuery)
        ));

        // Search notes
        const notes = this.noteManager.searchNotes(query);
        results.push(...notes);

        return results;
    }

    /**
     * Delete annotation by ID
     */
    async deleteAnnotation(annotationId: string, type: string): Promise<void> {
        try {
            switch (type) {
                case 'highlight':
                    await this.highlightManager.deleteHighlight(annotationId);
                    break;
                case 'note':
                    await this.noteManager.deleteNote(annotationId);
                    break;
                case 'drawing':
                    await this.inkManager.deleteDrawing(annotationId);
                    break;
                default:
                    console.error('Unknown annotation type:', type);
            }
        } catch (error) {
            console.error('Failed to delete annotation:', error);
        }
    }

    /**
     * Clear all annotations
     */
    async clearAllAnnotations(): Promise<void> {
        // Clear from UI
        this.highlightManager.clearAllHighlights();
        this.noteManager.clearAllNotes();
        this.inkManager.clearAllDrawings();

        // Clear text layers
        this.textLayerManager.clearAllTextLayers();

        console.log('🗑️ All annotations cleared');
    }

    /**
     * Clear annotations for specific page
     */
    async clearPageAnnotations(pageNum: number): Promise<void> {
        const pageAnnotations = this.getAnnotationsForPage(pageNum);

        for (const annotation of pageAnnotations) {
            let type: string;
            if ('selectedText' in annotation) type = 'highlight';
            else if ('content' in annotation && !('strokes' in annotation)) type = 'note';
            else if ('strokes' in annotation) type = 'drawing';
            else continue;

            await this.deleteAnnotation(annotation.id, type);
        }

        console.log(`🗑️ Page ${pageNum} annotations cleared`);
    }

    /**
     * Export annotations
     */
    exportAnnotations(format: 'json' | 'csv' = 'json'): string {
        const annotations = this.getAllAnnotations();

        if (format === 'json') {
            return JSON.stringify(annotations, null, 2);
        } else if (format === 'csv') {
            return this.exportAnnotationsAsCSV(annotations);
        }

        return '';
    }

    /**
     * Export annotations as CSV
     */
    private exportAnnotationsAsCSV(annotations: Annotation[]): string {
        const csvRows = [];
        csvRows.push('Type,Page,Content,Created,Updated,User');

        annotations.forEach(annotation => {
            let type: string;
            let content: string;

            if ('selectedText' in annotation) {
                type = 'Highlight';
                content = annotation.selectedText;
            } else if ('content' in annotation && !('strokes' in annotation)) {
                type = 'Note';
                content = (annotation as Note).content;
            } else if ('strokes' in annotation) {
                type = 'Drawing';
                content = `${(annotation as Drawing).strokes.length} strokes`;
            } else {
                return;
            }

            const row = [
                type,
                annotation.page,
                `"${content.replace(/"/g, '""')}"`,
                annotation.createdAt,
                'updatedAt' in annotation ? annotation.updatedAt : '',
                annotation.userId || ''
            ];
            csvRows.push(row.join(','));
        });

        return csvRows.join('\n');
    }

    /**
     * Handle remote annotation updates
     */
    private handleRemoteAnnotationUpdate(updateData: any): void {
        const { type, action, annotation } = updateData;

        switch (action) {
            case 'added':
                this.handleRemoteAnnotationAdded(type, annotation);
                break;
            case 'updated':
                this.handleRemoteAnnotationUpdated(type, annotation);
                break;
            case 'deleted':
                this.handleRemoteAnnotationDeleted(type, annotation.id);
                break;
        }
    }

    /**
     * Handle remote annotation added
     */
    private handleRemoteAnnotationAdded(type: string, annotation: any): void {
        // For now, just reload all annotations to keep it simple
        // In a more sophisticated implementation, we would add the specific annotation
        this.loadAllAnnotations();
    }

    /**
     * Handle remote annotation updated
     */
    private handleRemoteAnnotationUpdated(type: string, annotation: any): void {
        // For now, just reload all annotations
        this.loadAllAnnotations();
    }

    /**
     * Handle remote annotation deleted
     */
    private handleRemoteAnnotationDeleted(type: string, annotationId: string): void {
        // Remove from appropriate manager
        switch (type) {
            case 'highlight':
                this.highlightManager.deleteHighlight(annotationId);
                break;
            case 'note':
                this.noteManager.deleteNote(annotationId);
                break;
            case 'drawing':
                this.inkManager.deleteDrawing(annotationId);
                break;
        }
    }

    /**
     * Handle annotation selection
     */
    private handleAnnotationSelection(type: string, annotation: any): void {
        // Dispatch unified selection event
        const event = new CustomEvent('annotationSelected', {
            detail: { type, annotation }
        });
        document.dispatchEvent(event);
    }

    /**
     * Get annotation statistics
     */
    getAnnotationStats(): {
        total: number;
        highlights: number;
        notes: number;
        drawings: number;
        byPage: Map<number, number>;
    } {
        const highlights = this.highlightManager.getAllHighlights();
        const notes = this.noteManager.getAllNotes();
        const drawings = this.inkManager.getAllDrawings();

        const byPage = new Map<number, number>();
        
        [...highlights, ...notes, ...drawings].forEach(annotation => {
            const count = byPage.get(annotation.page) || 0;
            byPage.set(annotation.page, count + 1);
        });

        return {
            total: highlights.length + notes.length + drawings.length,
            highlights: highlights.length,
            notes: notes.length,
            drawings: drawings.length,
            byPage
        };
    }

    /**
     * Set highlight color
     */
    setHighlightColor(color: string): void {
        this.highlightManager.setHighlightColor(color);
    }

    /**
     * Set ink color and thickness
     */
    setInkProperties(color: string, thickness: number): void {
        this.inkManager.setInkColor(color);
        this.inkManager.setInkThickness(thickness);
    }

    /**
     * Get current highlight color
     */
    getCurrentHighlightColor(): string {
        return this.highlightManager.getCurrentColor();
    }

    /**
     * Get current ink properties
     */
    getCurrentInkProperties(): { color: string; thickness: number } {
        return {
            color: this.inkManager.getCurrentColor(),
            thickness: this.inkManager.getCurrentThickness()
        };
    }

    /**
     * Get highlight manager instance
     */
    getHighlightManager(): HighlightManager {
        return this.highlightManager;
    }

    /**
     * Get note manager instance
     */
    getNoteManager(): NoteManager {
        return this.noteManager;
    }

    /**
     * Get ink manager instance
     */
    getInkManager(): InkManager {
        return this.inkManager;
    }

    /**
     * Get text layer manager instance
     */
    getTextLayerManager(): TextLayerManager {
        return this.textLayerManager;
    }
}
