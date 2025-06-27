// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { PDFApiService } from '../services/pdfApiService';

/**
 * Highlight data structure
 */
export interface Highlight {
    id: string;
    documentId: string;
    page: number;
    color: string;
    selectedText: string;
    coordinates: {
        x: number;
        y: number;
        width: number;
        height: number;
    }[]; // Array of rectangles for multi-line selections
    textRange?: {
        startOffset: number;
        endOffset: number;
        startContainer: string;
        endContainer: string;
    };
    createdAt: string;
    userId?: string;
}

/**
 * Highlight Manager for creating and managing PDF highlights
 */
export class HighlightManager {
    private highlights: Map<string, Highlight> = new Map();
    private isHighlightMode = false;
    private currentColor = '#ffff00'; // Default yellow
    private documentId: string | null = null;
    private pdfApiService: PDFApiService;

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

        // Dispatch mode change event
        const event = new CustomEvent('highlightModeChanged', {
            detail: { isActive: this.isHighlightMode }
        });
        document.dispatchEvent(event);
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
     * Setup event handlers for highlighting
     */
    private setupEventHandlers(): void {
        // Listen for text selection events
        document.addEventListener('pdfTextSelected', (event: any) => {
            if (this.isHighlightMode && event.detail) {
                this.createHighlightFromSelection(event.detail.text, event.detail.range);
            }
        });

        // Handle mouseup for highlight creation
        document.addEventListener('mouseup', (event) => {
            if (this.isHighlightMode) {
                setTimeout(() => this.handleMouseUp(event), 10);
            }
        });

        // Prevent default selection behavior in highlight mode
        document.addEventListener('selectstart', (event) => {
            if (this.isHighlightMode) {
                const target = event.target as HTMLElement;
                if (target.closest('.textLayer')) {
                    // Allow text selection in text layer
                    return;
                }
            }
        });
    }

    /**
     * Handle mouse up event for highlighting
     */
    private handleMouseUp(event: MouseEvent): void {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) {
            return;
        }

        const selectedText = selection.toString().trim();
        if (selectedText.length === 0) {
            return;
        }

        const range = selection.getRangeAt(0);
        
        // Check if selection is in text layer
        const textLayer = this.findTextLayerParent(range.commonAncestorContainer);
        if (textLayer) {
            this.createHighlightFromSelection(selectedText, range);
        }
    }

    /**
     * Find text layer parent element
     */
    private findTextLayerParent(node: Node): HTMLElement | null {
        let element = node.nodeType === Node.ELEMENT_NODE ? node as HTMLElement : node.parentElement;
        
        while (element) {
            if (element.classList.contains('textLayer')) {
                return element;
            }
            element = element.parentElement;
        }
        
        return null;
    }

    /**
     * Create highlight from text selection
     */
    private async createHighlightFromSelection(selectedText: string, range: Range): Promise<void> {
        if (!this.documentId) {
            console.error('No document ID set for highlight creation');
            return;
        }

        // Get page information
        const textLayer = this.findTextLayerParent(range.commonAncestorContainer);
        if (!textLayer) {
            return;
        }

        const pageElement = textLayer.closest('.page') as HTMLElement;
        if (!pageElement) {
            return;
        }

        const pageNum = this.getPageNumber(pageElement);
        if (!pageNum) {
            return;
        }

        // Get selection coordinates
        const coordinates = this.getSelectionCoordinates(range, pageElement);
        if (!coordinates) {
            return;
        }

        try {
            // Create highlight data
            const highlightData: Omit<Highlight, 'id' | 'createdAt'> = {
                documentId: this.documentId,
                page: pageNum,
                color: this.currentColor,
                selectedText: selectedText,
                coordinates: coordinates,
                textRange: this.getTextRange(range)
            };

            // Save via API
            const savedHighlight = await this.pdfApiService.addHighlight(this.documentId, highlightData);

            // Store locally
            this.highlights.set(savedHighlight.id, savedHighlight);

            // Render highlight
            this.renderHighlight(savedHighlight);

            // Clear selection
            window.getSelection()?.removeAllRanges();

            console.log('🖍️ Highlight created:', savedHighlight);

        } catch (error) {
            console.error('Failed to save highlight:', error);
        }
    }

    /**
     * Get page number from page element
     */
    private getPageNumber(pageElement: HTMLElement): number | null {
        const pageAttr = pageElement.getAttribute('data-page-number');
        if (pageAttr) {
            return parseInt(pageAttr, 10);
        }

        // Fallback: find by position
        const container = document.getElementById('viewerContainer');
        if (container) {
            const pages = container.querySelectorAll('.page');
            for (let i = 0; i < pages.length; i++) {
                if (pages[i] === pageElement) {
                    return i + 1;
                }
            }
        }

        return null;
    }

    /**
     * Get selection coordinates relative to page
     */
    private getSelectionCoordinates(range: Range, pageElement: HTMLElement): { x: number; y: number; width: number; height: number }[] | null {
        try {
            const rects = range.getClientRects();
            if (rects.length === 0) {
                return null;
            }

            const pageRect = pageElement.getBoundingClientRect();
            const coordinates = [];

            // Process each rectangle in the selection
            for (let i = 0; i < rects.length; i++) {
                const rect = rects[i];
                
                // Skip very small or invalid rectangles
                if (rect.width < 1 || rect.height < 1) {
                    continue;
                }

                coordinates.push({
                    x: rect.left - pageRect.left,
                    y: rect.top - pageRect.top,
                    width: rect.width,
                    height: rect.height
                });
            }

            return coordinates.length > 0 ? coordinates : null;
        } catch (error) {
            console.error('Failed to get selection coordinates:', error);
            return null;
        }
    }

    /**
     * Get text range information
     */
    private getTextRange(range: Range): Highlight['textRange'] | undefined {
        try {
            return {
                startOffset: range.startOffset,
                endOffset: range.endOffset,
                startContainer: this.getElementPath(range.startContainer),
                endContainer: this.getElementPath(range.endContainer)
            };
        } catch (error) {
            console.error('Failed to get text range:', error);
            return undefined;
        }
    }

    /**
     * Get CSS path for element
     */
    private getElementPath(node: Node): string {
        const element = node.nodeType === Node.ELEMENT_NODE ? node as HTMLElement : node.parentElement;
        if (!element) {
            return '';
        }

        const path: string[] = [];
        let current: HTMLElement | null = element;

        while (current && current !== document.body) {
            let selector = current.tagName.toLowerCase();
            
            if (current.id) {
                selector += `#${current.id}`;
            } else if (current.className) {
                selector += `.${current.className.split(' ').join('.')}`;
            }

            // Add position if needed for uniqueness
            if (current.parentElement) {
                const siblings = Array.from(current.parentElement.children);
                const sameTagSiblings = siblings.filter(s => s.tagName === current!.tagName);
                if (sameTagSiblings.length > 1) {
                    const index = sameTagSiblings.indexOf(current) + 1;
                    selector += `:nth-of-type(${index})`;
                }
            }

            path.unshift(selector);
            current = current.parentElement;
        }

        return path.join(' > ');
    }

    /**
     * Render highlight on page
     */
    private renderHighlight(highlight: Highlight): void {
        const pageElement = this.getPageElement(highlight.page);
        if (!pageElement) {
            console.error(`Page element not found for page ${highlight.page}`);
            return;
        }

        // Create a container for all highlight rectangles
        const highlightContainer = document.createElement('div');
        highlightContainer.className = 'highlight-container';
        highlightContainer.setAttribute('data-highlight-id', highlight.id);
        highlightContainer.style.cssText = `
            position: absolute;
            pointer-events: auto;
            z-index: 1;
        `;

        // Create highlight rectangle for each coordinate
        highlight.coordinates.forEach((coord, index) => {
            const highlightElement = document.createElement('div');
            highlightElement.className = 'highlight-overlay';
            
            highlightElement.style.cssText = `
                position: absolute;
                left: ${coord.x}px;
                top: ${coord.y}px;
                width: ${coord.width}px;
                height: ${coord.height}px;
                background-color: ${highlight.color};
                opacity: 0.3;
                pointer-events: auto;
                z-index: 1;
                border-radius: 2px;
                cursor: pointer;
            `;

            highlightContainer.appendChild(highlightElement);
        });

        // Add to page
        pageElement.appendChild(highlightContainer);

        // Add interaction handlers to the container
        this.addHighlightInteraction(highlightContainer, highlight);
    }

    /**
     * Add interaction handlers to highlight
     */
    private addHighlightInteraction(element: HTMLElement, highlight: Highlight): void {
        // Right-click context menu
        element.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.showHighlightContextMenu(event, highlight);
        });

        // Click to show details
        element.addEventListener('click', (event) => {
            event.stopPropagation();
            this.showHighlightTooltip(highlight, event.clientX, event.clientY);
        });

        // Hover effects
        element.addEventListener('mouseenter', () => {
            element.style.opacity = '0.5';
        });

        element.addEventListener('mouseleave', () => {
            element.style.opacity = '0.3';
        });
    }

    /**
     * Show highlight context menu
     */
    private showHighlightContextMenu(event: MouseEvent, highlight: Highlight): void {
        // Create context menu
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

        // Add menu items
        const copyItem = document.createElement('div');
        copyItem.textContent = 'Copy Text';
        copyItem.style.cssText = `
            padding: 8px 12px;
            cursor: pointer;
            border-bottom: 1px solid #eee;
        `;
        copyItem.addEventListener('click', () => {
            navigator.clipboard.writeText(highlight.selectedText);
            menu.remove();
        });

        const changeColorItem = document.createElement('div');
        changeColorItem.textContent = 'Change Color';
        changeColorItem.style.cssText = `
            padding: 8px 12px;
            cursor: pointer;
            border-bottom: 1px solid #eee;
        `;
        changeColorItem.addEventListener('click', () => {
            this.showColorPicker(highlight, event.clientX, event.clientY);
            menu.remove();
        });

        const deleteItem = document.createElement('div');
        deleteItem.textContent = 'Delete Highlight';
        deleteItem.style.cssText = `
            padding: 8px 12px;
            cursor: pointer;
            color: #dc3545;
        `;
        deleteItem.addEventListener('click', () => {
            this.deleteHighlight(highlight.id);
            menu.remove();
        });

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
     * Show highlight tooltip
     */
    private showHighlightTooltip(highlight: Highlight, screenX: number, screenY: number): void {
        // Remove any existing tooltip
        document.querySelectorAll('.highlight-tooltip').forEach(el => el.remove());

        const tooltip = document.createElement('div');
        tooltip.className = 'highlight-tooltip';
        tooltip.style.cssText = `
            position: fixed;
            left: ${Math.min(screenX, window.innerWidth - 250)}px;
            top: ${Math.max(screenY - 80, 10)}px;
            background: #333;
            color: white;
            padding: 8px 12px;
            border-radius: 4px;
            font-size: 12px;
            z-index: 10000;
            max-width: 200px;
            word-wrap: break-word;
        `;

        tooltip.textContent = highlight.selectedText;
        document.body.appendChild(tooltip);

        // Auto-remove after 3 seconds
        setTimeout(() => {
            tooltip.remove();
        }, 3000);
    }

    /**
     * Show color picker for highlight
     */
    private showColorPicker(highlight: Highlight, screenX: number, screenY: number): void {
        const colors = [
            '#ffff00', // Yellow
            '#00ff00', // Green
            '#ff00ff', // Magenta
            '#ff0000', // Red
            '#00ffff', // Cyan
            '#ffa500'  // Orange
        ];

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

        colors.forEach(color => {
            const colorOption = document.createElement('div');
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
            const updatedHighlight = { ...highlight, color: newColor };

            // Update on server
            await this.pdfApiService.updateHighlight(this.documentId, highlightId, updatedHighlight);

            // Update local storage
            this.highlights.set(highlightId, updatedHighlight);

            // Update DOM element - find all highlight overlays in the container
            const container = document.querySelector(`[data-highlight-id="${highlightId}"]`) as HTMLElement;
            if (container) {
                const overlays = container.querySelectorAll('.highlight-overlay');
                overlays.forEach((overlay: HTMLElement) => {
                    overlay.style.backgroundColor = newColor;
                });
            }

            console.log('🎨 Highlight color changed:', highlightId);

        } catch (error) {
            console.error('Failed to change highlight color:', error);
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
            await this.pdfApiService.deleteHighlight(this.documentId, highlightId);

            // Remove from local storage
            this.highlights.delete(highlightId);

            // Remove from DOM
            const element = document.querySelector(`[data-highlight-id="${highlightId}"]`);
            if (element) {
                element.remove();
            }

            console.log('🗑️ Highlight deleted:', highlightId);

        } catch (error) {
            console.error('Failed to delete highlight:', error);
        }
    }

    /**
     * Get page element by page number
     */
    private getPageElement(pageNum: number): HTMLElement | null {
        const container = document.getElementById('viewerContainer');
        if (!container) {
            return null;
        }

        // Look for page with data attribute
        let pageElement = container.querySelector(`[data-page-number="${pageNum}"]`) as HTMLElement;
        
        if (!pageElement) {
            // Fallback: get by position
            const pages = container.querySelectorAll('.page');
            pageElement = pages[pageNum - 1] as HTMLElement;
        }

        return pageElement;
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
            highlights.forEach((highlight: Highlight) => {
                this.highlights.set(highlight.id, highlight);
                this.renderHighlight(highlight);
            });

            console.log(`🖍️ Loaded ${highlights.length} highlights`);

        } catch (error) {
            // Gracefully handle missing API endpoints during development
            if (error instanceof Error && error.message.includes('404')) {
                console.log('🖍️ No server-side highlight storage available yet');
                return;
            }
            console.error('Failed to load highlights:', error);
        }
    }

    /**
     * Clear all highlights
     */
    clearAllHighlights(): void {
        // Remove from DOM - remove containers instead of individual overlays
        document.querySelectorAll('.highlight-container').forEach(el => el.remove());
        
        // Clear local storage
        this.highlights.clear();
    }

    /**
     * Get all highlights
     */
    getAllHighlights(): Highlight[] {
        return Array.from(this.highlights.values());
    }

    /**
     * Get highlights for specific page
     */
    getHighlightsForPage(pageNum: number): Highlight[] {
        return this.getAllHighlights().filter(h => h.page === pageNum);
    }

    /**
     * Search highlights by text
     */
    searchHighlights(query: string): Highlight[] {
        const lowercaseQuery = query.toLowerCase();
        return this.getAllHighlights().filter(highlight =>
            highlight.selectedText.toLowerCase().includes(lowercaseQuery)
        );
    }

    /**
     * Export highlights as JSON
     */
    exportHighlights(): string {
        return JSON.stringify(this.getAllHighlights(), null, 2);
    }

    /**
     * Import highlights from JSON
     */
    async importHighlights(jsonData: string): Promise<void> {
        try {
            const highlights: Highlight[] = JSON.parse(jsonData);
            
            for (const highlight of highlights) {
                if (this.documentId && highlight.documentId === this.documentId) {
                    // Save to server
                    const savedHighlight = await this.pdfApiService.addHighlight(this.documentId, highlight);
                    
                    // Store locally and render
                    this.highlights.set(savedHighlight.id, savedHighlight);
                    this.renderHighlight(savedHighlight);
                }
            }

            console.log(`📥 Imported ${highlights.length} highlights`);

        } catch (error) {
            console.error('Failed to import highlights:', error);
        }
    }
}
