// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { PDFApiService } from '../services/pdfApiService';
import { TextSelectionManager, TextSelectionData, TextSelectionCallbacks } from './textSelectionManager';
import { HighlightRenderer, HighlightData, HighlightRendererCallbacks } from './highlightRenderer';

/**
 * Modernized Highlight Manager for PDF.js Integration
 * Coordinates text highlighting functionality using PDF.js native components
 */
export class ModernHighlightManager {
    private textSelectionManager: TextSelectionManager;
    private highlightRenderer: HighlightRenderer;
    private pdfApiService: PDFApiService;
    
    private highlights: Map<string, HighlightData> = new Map();
    private isHighlightMode = false;
    private currentColor = '#ffff00'; // Default yellow
    private documentId: string | null = null;
    private isInitialized = false;

    // Configuration
    private config = {
        enabled: true,
        autoSave: true,
        maxHighlightsPerPage: 50,
        defaultColors: {
            yellow: '#ffff00',
            green: '#00ff00',
            blue: '#0080ff',
            red: '#ff0000',
            pink: '#ff00ff',
            orange: '#ffa500'
        }
    };

    constructor(pdfApiService: PDFApiService) {
        this.pdfApiService = pdfApiService;
        this.textSelectionManager = new TextSelectionManager();
        this.highlightRenderer = new HighlightRenderer();
        
        this.setupZoomEventHandlers();
    }

    /**
     * Initialize the highlight manager
     */
    async initialize(
        pdfjsApp: any,
        viewerContainer: HTMLElement
    ): Promise<void> {
        try {
            // Initialize text selection manager
            const selectionCallbacks: TextSelectionCallbacks = {
                onTextSelected: this.handleTextSelected.bind(this),
                onHighlightRequested: this.handleHighlightRequested.bind(this),
                onHighlightWithNoteRequested: this.handleHighlightWithNoteRequested.bind(this),
                onSelectionCleared: this.handleSelectionCleared.bind(this)
            };
            
            this.textSelectionManager.initialize(pdfjsApp, viewerContainer, selectionCallbacks);

            // Initialize highlight renderer
            const rendererCallbacks: HighlightRendererCallbacks = {
                onHighlightClicked: this.handleHighlightClicked.bind(this),
                onHighlightDoubleClicked: this.handleHighlightDoubleClicked.bind(this),
                onHighlightContextMenu: this.handleHighlightContextMenu.bind(this),
                onHighlightHover: this.handleHighlightHover.bind(this)
            };
            
            this.highlightRenderer.initialize(viewerContainer, rendererCallbacks);

            // Set up additional event handlers
            this.setupEventHandlers();

            this.isInitialized = true;
            console.log('ModernHighlightManager: Initialization complete');
        } catch (error) {
            console.error('ModernHighlightManager: Initialization failed:', error);
            throw error;
        }
    }

    /**
     * Set document ID
     */
    setDocumentId(documentId: string): void {
        this.documentId = documentId;
    }

    /**
     * Setup additional event handlers
     */
    private setupEventHandlers(): void {
        // Listen for custom highlight mode changes
        document.addEventListener('highlightModeChanged', (event: any) => {
            this.isHighlightMode = event.detail?.isActive || false;
        });

        // Setup keyboard shortcuts for highlight mode
        document.addEventListener('keydown', (event) => {
            if (event.ctrlKey && event.key === 'h' && !event.shiftKey) {
                // Ctrl+H toggles highlight mode
                event.preventDefault();
                this.toggleHighlightMode();
            }
        });
    }

    /**
     * Toggle highlight mode
     */
    toggleHighlightMode(): void {
        this.isHighlightMode = !this.isHighlightMode;
        
        // Update cursor style
        const viewer = document.getElementById('viewerContainer');
        if (viewer) {
            if (this.isHighlightMode) {
                viewer.style.cursor = 'crosshair';
                viewer.classList.add('highlight-mode');
            } else {
                viewer.style.cursor = 'default';
                viewer.classList.remove('highlight-mode');
            }
        }

        // Update text selection manager
        this.textSelectionManager.setEnabled(this.isHighlightMode || this.config.enabled);

        // Dispatch mode change event
        const event = new CustomEvent('highlightModeChanged', {
            detail: { isActive: this.isHighlightMode }
        });
        document.dispatchEvent(event);

        console.log(`ModernHighlightManager: Highlight mode ${this.isHighlightMode ? 'enabled' : 'disabled'}`);
    }

    /**
     * Check if highlight mode is active
     */
    isHighlightModeActive(): boolean {
        return this.isHighlightMode;
    }

    /**
     * Set highlight color
     */
    setHighlightColor(color: string): void {
        this.currentColor = color;
    }

    /**
     * Get current highlight color
     */
    getCurrentColor(): string {
        return this.currentColor;
    }

    /**
     * Create highlight from selection object (public API for integration)
     */
    createHighlightFromSelection(selection: Selection, color: string, pageElement: HTMLElement): void {
        if (!selection || selection.rangeCount === 0) {
            console.error('Invalid selection provided');
            return;
        }

        const selectedText = selection.toString().trim();
        if (selectedText.length === 0) {
            console.error('Empty selection provided');
            return;
        }

        // Create a TextSelectionData object from the selection
        const range = selection.getRangeAt(0);
        const pageNumber = this.getPageNumberFromElement(pageElement);
        
        if (!pageNumber) {
            console.error('Could not determine page number');
            return;
        }

        // Create position data
        const position = this.createPositionFromRange(range, pageElement);
        if (!position) {
            console.error('Could not create position data');
            return;
        }

        const selectionData: TextSelectionData = {
            text: selectedText,
            position: position,
            pageNumber: pageNumber,
            selection: selection,
            range: range
        };

        // Create highlight
        this.handleHighlightRequested(selectionData, color);
    }

    /**
     * Handle text selection
     */
    private handleTextSelected(data: TextSelectionData): void {
        console.log('ModernHighlightManager: Text selected:', data.text.substring(0, 50));
        
        // If in highlight mode, auto-create highlight
        if (this.isHighlightMode) {
            this.handleHighlightRequested(data, this.currentColor);
        }
        
        // Emit event for other components
        const event = new CustomEvent('pdfTextSelected', {
            detail: data
        });
        document.dispatchEvent(event);
    }

    /**
     * Handle highlight request (without note)
     */
    private async handleHighlightRequested(
        data: TextSelectionData,
        color: string
    ): Promise<void> {
        try {
            await this.createHighlight(data, color);
            this.textSelectionManager.clearBrowserSelection();
        } catch (error) {
            console.error('ModernHighlightManager: Failed to create highlight:', error);
        }
    }

    /**
     * Handle highlight with note request
     */
    private async handleHighlightWithNoteRequested(
        data: TextSelectionData,
        color: string
    ): Promise<void> {
        try {
            const highlight = await this.createHighlight(data, color);
            this.textSelectionManager.clearBrowserSelection();
            
            if (highlight) {
                // Emit event for note creation
                const event = new CustomEvent('highlightNoteRequested', {
                    detail: { highlight }
                });
                document.dispatchEvent(event);
            }
        } catch (error) {
            console.error('ModernHighlightManager: Failed to create highlight with note:', error);
        }
    }

    /**
     * Handle selection cleared
     */
    private handleSelectionCleared(): void {
        // Emit event for other components
        const event = new CustomEvent('pdfSelectionCleared');
        document.dispatchEvent(event);
    }

    /**
     * Create a new highlight
     */
    private async createHighlight(
        data: TextSelectionData,
        color: string
    ): Promise<HighlightData | null> {
        if (!this.documentId) {
            console.warn('ModernHighlightManager: No document ID set');
            return null;
        }

        try {
            // Check highlight limit
            const pageHighlights = Array.from(this.highlights.values()).filter(
                h => h.page === data.pageNumber
            );
            
            if (pageHighlights.length >= this.config.maxHighlightsPerPage) {
                throw new Error(`Maximum highlights per page (${this.config.maxHighlightsPerPage}) reached`);
            }

            // Create highlight object
            const highlight: HighlightData = {
                id: `highlight-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                documentId: this.documentId,
                page: data.pageNumber,
                color: color,
                selectedText: data.text,
                position: data.position,
                createdAt: new Date().toISOString()
            };

            // Store in memory
            this.highlights.set(highlight.id, highlight);

            // Save to storage if auto-save is enabled
            if (this.config.autoSave) {
                try {
                    const savedHighlight = await this.pdfApiService.addHighlight(
                        this.documentId, 
                        highlight
                    );
                    // Update with server-provided data
                    this.highlights.set(highlight.id, savedHighlight);
                } catch (error) {
                    console.warn('ModernHighlightManager: Failed to save to server, keeping local copy:', error);
                }
            }

            // Render highlight
            await this.highlightRenderer.renderHighlight(highlight);

            // Emit event
            const event = new CustomEvent('highlightCreated', {
                detail: { highlight }
            });
            document.dispatchEvent(event);

            console.log('ModernHighlightManager: Created highlight:', highlight.id);
            
            return highlight;
        } catch (error) {
            console.error('ModernHighlightManager: Error creating highlight:', error);
            return null;
        }
    }

    /**
     * Handle highlight clicked
     */
    private handleHighlightClicked(highlightId: string, event: MouseEvent): void {
        const highlight = this.highlights.get(highlightId);
        if (highlight) {
            console.log('ModernHighlightManager: Highlight clicked:', highlightId);
            
            // Emit event
            const customEvent = new CustomEvent('highlightClicked', {
                detail: { highlight, event }
            });
            document.dispatchEvent(customEvent);
        }
    }

    /**
     * Handle highlight double clicked
     */
    private handleHighlightDoubleClicked(highlightId: string, event: MouseEvent): void {
        const highlight = this.highlights.get(highlightId);
        if (highlight) {
            console.log('ModernHighlightManager: Highlight double-clicked:', highlightId);
            
            // Emit event for note editing
            const customEvent = new CustomEvent('highlightNoteRequested', {
                detail: { highlight, event }
            });
            document.dispatchEvent(customEvent);
        }
    }

    /**
     * Handle highlight context menu
     */
    private handleHighlightContextMenu(highlightId: string, event: MouseEvent): void {
        const highlight = this.highlights.get(highlightId);
        if (highlight) {
            console.log('ModernHighlightManager: Highlight context menu:', highlightId);
            
            // Show context menu
            this.showHighlightContextMenu(highlight, event);
        }
    }

    /**
     * Handle highlight hover
     */
    private handleHighlightHover(highlightId: string, isHovering: boolean, elements: HTMLElement[]): void {
        if (isHovering) {
            console.log('ModernHighlightManager: Highlight hover in:', highlightId);
        } else {
            console.log('ModernHighlightManager: Highlight hover out:', highlightId);
        }
    }

    /**
     * Show highlight context menu
     */
    private showHighlightContextMenu(highlight: HighlightData, event: MouseEvent): void {
        // Remove any existing context menu
        document.querySelectorAll('.highlight-context-menu').forEach(el => el.remove());

        const menu = document.createElement('div');
        menu.className = 'highlight-context-menu';
        menu.style.cssText = `
            position: fixed;
            left: ${event.clientX}px;
            top: ${event.clientY}px;
            background: white;
            border: 1px solid #ccc;
            border-radius: 4px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
            z-index: 10000;
            min-width: 140px;
        `;

        // Copy text option
        const copyItem = this.createMenuItem('Copy Text', () => {
            navigator.clipboard.writeText(highlight.selectedText);
            menu.remove();
        });

        // Change color option
        const changeColorItem = this.createMenuItem('Change Color', () => {
            this.showColorPicker(highlight, event.clientX, event.clientY);
            menu.remove();
        });

        // Delete option
        const deleteItem = this.createMenuItem('Delete Highlight', () => {
            this.deleteHighlight(highlight.id);
            menu.remove();
        }, '#dc3545');

        menu.appendChild(copyItem);
        menu.appendChild(changeColorItem);
        menu.appendChild(deleteItem);
        document.body.appendChild(menu);

        // Remove menu on outside click
        const removeMenu = (e: MouseEvent) => {
            if (!menu.contains(e.target as Node)) {
                menu.remove();
                document.removeEventListener('click', removeMenu);
            }
        };
        
        setTimeout(() => {
            document.addEventListener('click', removeMenu);
        }, 10);
    }

    /**
     * Create menu item
     */
    private createMenuItem(text: string, onClick: () => void, color?: string): HTMLElement {
        const item = document.createElement('div');
        item.textContent = text;
        item.style.cssText = `
            padding: 8px 12px;
            cursor: pointer;
            border-bottom: 1px solid #eee;
            ${color ? `color: ${color};` : ''}
        `;
        
        item.addEventListener('click', onClick);
        
        item.addEventListener('mouseenter', () => {
            item.style.backgroundColor = '#f5f5f5';
        });
        
        item.addEventListener('mouseleave', () => {
            item.style.backgroundColor = 'transparent';
        });

        return item;
    }

    /**
     * Show color picker for highlight
     */
    private showColorPicker(highlight: HighlightData, screenX: number, screenY: number): void {
        const colors = Object.entries(this.config.defaultColors);

        const picker = document.createElement('div');
        picker.className = 'highlight-color-picker';
        picker.style.cssText = `
            position: fixed;
            left: ${screenX}px;
            top: ${screenY}px;
            background: white;
            border: 1px solid #ccc;
            border-radius: 4px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
            z-index: 10000;
            padding: 8px;
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 4px;
        `;

        colors.forEach(([name, color]) => {
            const colorOption = document.createElement('div');
            colorOption.title = name;
            colorOption.style.cssText = `
                width: 24px;
                height: 24px;
                background-color: ${color};
                border: 2px solid ${color === highlight.color ? '#333' : 'transparent'};
                border-radius: 4px;
                cursor: pointer;
            `;

            colorOption.addEventListener('click', () => {
                this.changeHighlightColor(highlight.id, color);
                picker.remove();
            });

            picker.appendChild(colorOption);
        });

        document.body.appendChild(picker);

        // Remove picker on outside click
        const removePicker = (e: MouseEvent) => {
            if (!picker.contains(e.target as Node)) {
                picker.remove();
                document.removeEventListener('click', removePicker);
            }
        };
        
        setTimeout(() => {
            document.addEventListener('click', removePicker);
        }, 10);
    }

    /**
     * Change highlight color
     */
    async changeHighlightColor(highlightId: string, newColor: string): Promise<void> {
        const highlight = this.highlights.get(highlightId);
        if (!highlight || !this.documentId) {
            return;
        }

        try {
            // Update highlight data
            const updatedHighlight = { ...highlight, color: newColor, updatedAt: new Date().toISOString() };

            // Update on server
            if (this.config.autoSave) {
                try {
                    await this.pdfApiService.updateHighlight(this.documentId, highlightId, updatedHighlight);
                } catch (error) {
                    console.warn('ModernHighlightManager: Failed to update on server:', error);
                }
            }

            // Update local storage
            this.highlights.set(highlightId, updatedHighlight);

            // Update renderer
            this.highlightRenderer.updateHighlightColor(highlightId, newColor);

            console.log('ModernHighlightManager: Highlight color changed:', highlightId, 'to', newColor);

        } catch (error) {
            console.error('ModernHighlightManager: Failed to change highlight color:', error);
        }
    }

    /**
     * Delete highlight
     */
    async deleteHighlight(highlightId: string): Promise<void> {
        if (!this.documentId) {
            return;
        }

        try {
            // Delete from server
            if (this.config.autoSave) {
                try {
                    await this.pdfApiService.deleteHighlight(this.documentId, highlightId);
                } catch (error) {
                    console.warn('ModernHighlightManager: Failed to delete from server:', error);
                }
            }

            // Remove from local storage
            this.highlights.delete(highlightId);

            // Remove from renderer
            this.highlightRenderer.removeHighlight(highlightId);

            // Emit event
            const event = new CustomEvent('highlightDeleted', {
                detail: { highlightId }
            });
            document.dispatchEvent(event);

            console.log('ModernHighlightManager: Highlight deleted:', highlightId);

        } catch (error) {
            console.error('ModernHighlightManager: Failed to delete highlight:', error);
        }
    }

    /**
     * Setup zoom/scale event handlers
     */
    private setupZoomEventHandlers(): void {
        // Listen for custom zoom events from the PDF app
        document.addEventListener('pdfZoomChanged', () => {
            console.log('ModernHighlightManager: Zoom changed, refreshing highlights...');
            this.refreshAllHighlights();
        });

        document.addEventListener('pdfScaleChanged', () => {
            console.log('ModernHighlightManager: Scale changed, refreshing highlights...');
            this.refreshAllHighlights();
        });

        document.addEventListener('pdfPageRerendered', () => {
            console.log('ModernHighlightManager: Page re-rendered, refreshing highlights...');
            setTimeout(() => {
                this.refreshAllHighlights();
            }, 100);
        });
    }

    /**
     * Load highlights for document
     */
    async loadHighlights(documentId: string): Promise<void> {
        try {
            const highlights = await this.pdfApiService.getHighlights(documentId);
            
            // Clear existing highlights
            this.clearAllHighlights();

            // Store and render highlights
            for (const highlight of highlights) {
                this.highlights.set(highlight.id, highlight);
                await this.highlightRenderer.renderHighlight(highlight);
            }

            console.log(`ModernHighlightManager: Loaded ${highlights.length} highlights`);

        } catch (error) {
            if (error instanceof Error && error.message.includes('404')) {
                console.log('ModernHighlightManager: No server-side highlight storage available yet');
                return;
            }
            console.error('ModernHighlightManager: Failed to load highlights:', error);
        }
    }

    /**
     * Clear all highlights
     */
    clearAllHighlights(): void {
        this.highlightRenderer.clearAllHighlights();
        this.highlights.clear();
    }

    /**
     * Refresh all highlights (re-render them with current scale/positioning)
     */
    private refreshAllHighlights(): void {
        const highlights = Array.from(this.highlights.values());
        
        // Re-render all highlights
        setTimeout(async () => {
            for (const highlight of highlights) {
                await this.highlightRenderer.renderHighlight(highlight);
            }
        }, 150);
        
        console.log(`ModernHighlightManager: Refreshed ${highlights.length} highlights`);
    }

    /**
     * Helper methods
     */
    private getPageNumberFromElement(pageElement: HTMLElement): number | null {
        const pageAttr = pageElement.getAttribute('data-page-number');
        if (pageAttr) {
            return parseInt(pageAttr, 10);
        }

        const pageChild = pageElement.querySelector('[data-page-number]') as HTMLElement;
        if (pageChild) {
            const childPageAttr = pageChild.getAttribute('data-page-number');
            if (childPageAttr) {
                return parseInt(childPageAttr, 10);
            }
        }

        const container = document.getElementById('viewerContainer');
        if (container) {
            const pageWrappers = container.querySelectorAll('.page-wrapper');
            for (let i = 0; i < pageWrappers.length; i++) {
                if (pageWrappers[i] === pageElement) {
                    return i + 1;
                }
            }
        }

        return null;
    }

    private createPositionFromRange(range: Range, pageElement: HTMLElement): any {
        // Basic position data structure for compatibility
        return {
            startContainer: '',
            startOffset: range.startOffset,
            endContainer: '',
            endOffset: range.endOffset,
            rects: Array.from(range.getClientRects()).map(rect => ({
                x: rect.left,
                y: rect.top,
                width: rect.width,
                height: rect.height
            })),
            pageRect: {
                x: 0,
                y: 0,
                width: 1,
                height: 1
            }
        };
    }

    /**
     * Public API methods
     */
    getAllHighlights(): HighlightData[] {
        return Array.from(this.highlights.values());
    }

    getHighlightsForPage(pageNumber: number): HighlightData[] {
        return Array.from(this.highlights.values()).filter(
            h => h.page === pageNumber
        );
    }

    getHighlight(highlightId: string): HighlightData | undefined {
        return this.highlights.get(highlightId);
    }

    searchHighlights(query: string): HighlightData[] {
        if (!query.trim()) return [];

        const searchTerm = query.toLowerCase();
        return Array.from(this.highlights.values()).filter(highlight =>
            highlight.selectedText.toLowerCase().includes(searchTerm)
        );
    }

    setEnabled(enabled: boolean): void {
        this.config.enabled = enabled;
        this.textSelectionManager.setEnabled(enabled);
        this.highlightRenderer.setEnabled(enabled);
    }

    exportHighlights(): string {
        return JSON.stringify(this.getAllHighlights(), null, 2);
    }

    async importHighlights(jsonData: string): Promise<void> {
        try {
            const highlights: HighlightData[] = JSON.parse(jsonData);
            
            for (const highlight of highlights) {
                if (this.documentId && highlight.documentId === this.documentId) {
                    if (this.config.autoSave) {
                        try {
                            const savedHighlight = await this.pdfApiService.addHighlight(this.documentId, highlight);
                            this.highlights.set(savedHighlight.id, savedHighlight);
                            await this.highlightRenderer.renderHighlight(savedHighlight);
                        } catch (error) {
                            console.warn('ModernHighlightManager: Failed to save imported highlight:', error);
                        }
                    } else {
                        this.highlights.set(highlight.id, highlight);
                        await this.highlightRenderer.renderHighlight(highlight);
                    }
                }
            }

            console.log(`ModernHighlightManager: Imported ${highlights.length} highlights`);

        } catch (error) {
            console.error('ModernHighlightManager: Failed to import highlights:', error);
        }
    }

    cleanup(): void {
        console.log('ModernHighlightManager: Cleaning up...');

        this.textSelectionManager.cleanup();
        this.highlightRenderer.cleanup();
        this.clearAllHighlights();

        this.documentId = null;
        this.isInitialized = false;

        console.log('ModernHighlightManager: Cleanup complete');
    }
}
