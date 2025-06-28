// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { PdfJsTextLayerManager } from './pdfJsTextLayerManager';
import { PdfJsAnnotationManager } from './pdfJsAnnotationManager';
import { ModernHighlightManager } from './modernHighlightManager';
import { NoteManager, Note } from './noteManager';
import { InkManager, Drawing } from './inkManager';
import { PDFApiService } from '../services/pdfApiService';

/**
 * Unified annotation data type (Note: highlights now handled by ModernHighlightManager)
 */
export type Annotation = Note | Drawing;

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
 * Updated to use ModernHighlightManager for PDF.js native highlighting
 */
export class AnnotationManager {
    private pdfJsTextLayerManager: PdfJsTextLayerManager;
    private pdfJsAnnotationManager: PdfJsAnnotationManager;
    private modernHighlightManager: ModernHighlightManager;
    private noteManager: NoteManager;
    private inkManager: InkManager;
    private pdfApiService: PDFApiService;
    private currentTool: AnnotationTool = 'select';
    private documentId: string | null = null;
    private _isInitialized: boolean = false;
    private _eventHandlersSetup: boolean = false;

    constructor(pdfApiService: PDFApiService) {
        this.pdfApiService = pdfApiService;
        this.pdfJsTextLayerManager = new PdfJsTextLayerManager();
        this.pdfJsAnnotationManager = new PdfJsAnnotationManager(pdfApiService);
        this.modernHighlightManager = new ModernHighlightManager(pdfApiService);
        this.noteManager = new NoteManager(pdfApiService);
        this.inkManager = new InkManager(pdfApiService);
    }

    /**
     * Initialize the annotation manager with PDF document and viewer
     */
    async initialize(documentId: string, pdfDoc: any, pdfjsApp: any, viewerContainer: HTMLElement): Promise<void> {
        if (this._isInitialized) {
            console.log('📝 Annotation Manager already initialized');
            return;
        }

        try {
            this.documentId = documentId;

            // Initialize text layer manager
            this.pdfJsTextLayerManager.setPDFDocument(pdfDoc);

            // Initialize PDF.js annotation manager
            this.pdfJsAnnotationManager.initialize(documentId, pdfDoc);

            // Initialize modern highlight manager
            await this.modernHighlightManager.initialize(pdfjsApp, viewerContainer);
            this.modernHighlightManager.setDocumentId(documentId);

            // Initialize other managers
            this.noteManager.setDocumentId(documentId);
            this.inkManager.setDocumentId(documentId);

            // Load existing highlights
            await this.modernHighlightManager.loadHighlights(documentId);

            // Setup event handlers
            this.setupEventHandlers();

            this._isInitialized = true;
            console.log('📝 Annotation Manager initialized successfully');
        } catch (error) {
            console.error('❌ Failed to initialize Annotation Manager:', error);
            throw error;
        }
    }

    /**
     * Setup event handlers for cross-component communication
     */
    private setupEventHandlers(): void {
        if (this._eventHandlersSetup) return;

        // Listen for highlight events from ModernHighlightManager
        document.addEventListener('highlightCreated', (event: any) => {
            console.log('📝 Highlight created:', event.detail.highlight);
            // Emit unified annotation event
            const unifiedEvent = new CustomEvent('annotationCreated', {
                detail: {
                    type: 'highlight',
                    annotation: event.detail.highlight
                }
            });
            document.dispatchEvent(unifiedEvent);
        });

        document.addEventListener('highlightDeleted', (event: any) => {
            console.log('📝 Highlight deleted:', event.detail.highlightId);
            // Emit unified annotation event
            const unifiedEvent = new CustomEvent('annotationDeleted', {
                detail: {
                    type: 'highlight',
                    annotationId: event.detail.highlightId
                }
            });
            document.dispatchEvent(unifiedEvent);
        });

        document.addEventListener('highlightClicked', (event: any) => {
            console.log('📝 Highlight clicked:', event.detail.highlight);
        });

        document.addEventListener('highlightNoteRequested', (event: any) => {
            console.log('📝 Note requested for highlight:', event.detail.highlight);
            // Could integrate with note manager here
        });

        this._eventHandlersSetup = true;
    }

    /**
     * Enable text layer for a specific page
     */
    async enableTextLayerForPage(pageNum: number, pageElement: HTMLElement, viewport: any): Promise<void> {
        await this.pdfJsTextLayerManager.enableTextLayer(pageNum, pageElement, viewport);
    }

    /**
     * Enable annotation layer for a specific page
     */
    async enableAnnotationLayerForPage(pageNum: number, pageElement: HTMLElement, viewport: any): Promise<void> {
        await this.pdfJsAnnotationManager.enableAnnotationLayer(pageNum, pageElement, viewport);
    }

    /**
     * Set active annotation tool
     */
    setActiveTool(tool: AnnotationTool): void {
        if (this.currentTool === tool) return;

        // Deactivate current tool
        this.deactivateCurrentTool();

        this.currentTool = tool;

        // Activate new tool
        this.activateCurrentTool();

        // Emit event
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
                this.modernHighlightManager.setEnabled(false);
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
                this.modernHighlightManager.setEnabled(true);
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
     * Get all annotations (Note: highlights now managed by ModernHighlightManager)
     */
    getAllAnnotations(): Annotation[] {
        // ModernHighlightManager highlights are accessed separately
        const notes = this.noteManager.getAllNotes();
        const drawings = this.inkManager.getAllDrawings();

        return [...notes, ...drawings];
    }

    /**
     * Get annotations for specific page
     */
    getAnnotationsForPage(pageNum: number): Annotation[] {
        const notes = this.noteManager.getNotesForPage(pageNum);
        const drawings = this.inkManager.getDrawingsForPage(pageNum);

        return [...notes, ...drawings];
    }

    /**
     * Filter annotations
     */
    filterAnnotations(filter: AnnotationFilter): Annotation[] {
        let annotations = this.getAllAnnotations();

        // Filter by type
        if (filter.type && filter.type.length > 0) {
            annotations = annotations.filter(annotation => {
                if ('content' in annotation && 'coordinates' in annotation && !('strokes' in annotation)) {
                    return filter.type!.includes('note');
                }
                if ('strokes' in annotation) return filter.type!.includes('drawing');
                return false;
            });
        }

        // Filter by page
        if (filter.page !== undefined) {
            annotations = annotations.filter(annotation => {
                if ('pageNumber' in annotation) return annotation.pageNumber === filter.page;
                if ('page' in annotation) return annotation.page === filter.page;
                return false;
            });
        }

        // Filter by user ID
        if (filter.userId) {
            annotations = annotations.filter(annotation => {
                return 'userId' in annotation && annotation.userId === filter.userId;
            });
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
     * Search annotations by text content
     */
    searchAnnotations(query: string): Annotation[] {
        if (!query.trim()) return [];

        const searchTerm = query.toLowerCase();
        const allAnnotations = this.getAllAnnotations();

        return allAnnotations.filter(annotation => {
            if ('content' in annotation) {
                return annotation.content.toLowerCase().includes(searchTerm);
            }
            return false;
        });
    }

    /**
     * Delete annotation by ID and type
     */
    async deleteAnnotation(annotationId: string, type: string): Promise<void> {
        try {
            switch (type) {
                case 'highlight':
                    await this.modernHighlightManager.deleteHighlight(annotationId);
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
        // Clear highlights
        this.modernHighlightManager.clearAllHighlights();
        
        // Clear other annotations
        this.pdfJsAnnotationManager.clearAllAnnotations();
        this.noteManager.clearAllNotes();
        this.inkManager.clearAllDrawings();

        // Clear text layers
        this.pdfJsTextLayerManager.clearAllTextLayers();

        console.log('🗑️ All annotations cleared');
    }

    /**
     * Clear annotations for specific page
     */
    async clearPageAnnotations(pageNum: number): Promise<void> {
        const pageAnnotations = this.getAnnotationsForPage(pageNum);

        for (const annotation of pageAnnotations) {
            let type: string;
            if ('content' in annotation && !('strokes' in annotation)) type = 'note';
            else if ('strokes' in annotation) type = 'drawing';
            else continue;

            await this.deleteAnnotation(annotation.id, type);
        }

        // Also clear highlights for this page
        const highlights = this.modernHighlightManager.getHighlightsForPage(pageNum);
        for (const highlight of highlights) {
            await this.modernHighlightManager.deleteHighlight(highlight.id);
        }

        console.log(`🗑️ Page ${pageNum} annotations cleared`);
    }

    /**
     * Export all annotations including highlights
     */
    exportAnnotations(): any {
        const highlights = this.modernHighlightManager.getAllHighlights();
        const notes = this.noteManager.getAllNotes();
        const drawings = this.inkManager.getAllDrawings();

        return {
            highlights,
            notes,
            drawings,
            exportedAt: new Date().toISOString(),
            documentId: this.documentId
        };
    }

    /**
     * Import annotations including highlights
     */
    async importAnnotations(data: any): Promise<void> {
        try {
            if (data.highlights) {
                await this.modernHighlightManager.importHighlights(JSON.stringify(data.highlights));
            }

            if (data.notes) {
                for (const note of data.notes) {
                    await this.noteManager.addNote(note);
                }
            }

            if (data.drawings) {
                for (const drawing of data.drawings) {
                    await this.inkManager.addDrawing(drawing);
                }
            }

            console.log('📥 Annotations imported successfully');
        } catch (error) {
            console.error('❌ Failed to import annotations:', error);
        }
    }

    /**
     * Get manager instances for direct access
     */
    getPdfJsTextLayerManager(): PdfJsTextLayerManager {
        return this.pdfJsTextLayerManager;
    }

    getPdfJsAnnotationManager(): PdfJsAnnotationManager {
        return this.pdfJsAnnotationManager;
    }

    getModernHighlightManager(): ModernHighlightManager {
        return this.modernHighlightManager;
    }

    getNoteManager(): NoteManager {
        return this.noteManager;
    }

    getInkManager(): InkManager {
        return this.inkManager;
    }

    /**
     * Legacy compatibility method - redirects to ModernHighlightManager
     */
    getHighlightManager(): ModernHighlightManager {
        return this.modernHighlightManager;
    }

    /**
     * Check if manager is initialized
     */
    isInitialized(): boolean {
        return this._isInitialized;
    }

    /**
     * Clean up resources
     */
    cleanup(): void {
        console.log('📝 Cleaning up Annotation Manager...');

        this.modernHighlightManager.cleanup();
        this.pdfJsTextLayerManager.clearAllTextLayers();
        this.noteManager.clearAllNotes();
        this.inkManager.clearAllDrawings();

        this.documentId = null;
        this._isInitialized = false;
        this._eventHandlersSetup = false;

        console.log('📝 Annotation Manager cleanup complete');
    }
}
