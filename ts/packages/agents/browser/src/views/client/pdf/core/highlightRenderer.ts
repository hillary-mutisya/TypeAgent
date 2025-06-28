// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { HighlightPosition } from './textSelectionManager';

/**
 * Highlight data interface for rendering
 */
export interface HighlightData {
    id: string;
    documentId: string;
    page: number;
    color: string;
    selectedText: string;
    position: HighlightPosition;
    createdAt: string;
    updatedAt?: string;
}

export interface HighlightRendererCallbacks {
    onHighlightClicked?: (highlightId: string, event: MouseEvent) => void;
    onHighlightDoubleClicked?: (highlightId: string, event: MouseEvent) => void;
    onHighlightContextMenu?: (highlightId: string, event: MouseEvent) => void;
    onHighlightHover?: (highlightId: string, isHovering: boolean, elements: HTMLElement[]) => void;
}

/**
 * Highlight Renderer for PDF.js Integration
 * Renders highlights aligned with PDF.js text layers
 */
export class HighlightRenderer {
    private viewerContainer: HTMLElement | null = null;
    private callbacks: HighlightRendererCallbacks = {};
    private renderedHighlights: Map<string, HTMLElement[]> = new Map();
    private isEnabled = true;
    private hoverTimeouts: Map<string, number> = new Map();

    constructor() {
        this.setupEventListeners();
    }

    /**
     * Initialize the highlight renderer
     */
    initialize(
        viewerContainer: HTMLElement,
        callbacks: HighlightRendererCallbacks = {}
    ): void {
        this.viewerContainer = viewerContainer;
        this.callbacks = callbacks;

        console.log('HighlightRenderer: Initialized');
    }

    /**
     * Set up global event listeners
     */
    private setupEventListeners(): void {
        // Listen for PDF scale/zoom changes
        document.addEventListener('pdfZoomChanged', () => {
            this.handleScaleChange();
        });

        document.addEventListener('pdfScaleChanged', () => {
            this.handleScaleChange();
        });

        document.addEventListener('pdfPageRerendered', () => {
            this.handlePageRerendered();
        });
    }

    /**
     * Handle scale/zoom changes
     */
    private handleScaleChange(): void {
        console.log('HighlightRenderer: Scale changed, updating highlights...');
        setTimeout(() => {
            this.updateAllHighlightPositions();
        }, 100);
    }

    /**
     * Handle page re-rendering
     */
    private handlePageRerendered(): void {
        console.log('HighlightRenderer: Page re-rendered, updating highlights...');
        setTimeout(() => {
            this.updateAllHighlightPositions();
        }, 150);
    }

    /**
     * Render a highlight on the page
     */
    async renderHighlight(highlight: HighlightData): Promise<void> {
        if (!this.isEnabled) return;

        try {
            // Remove existing highlight if it exists
            this.removeHighlight(highlight.id);

            // Find the page element
            const pageElement = this.getPageElement(highlight.page);
            if (!pageElement) {
                console.warn(`HighlightRenderer: Page element not found for page ${highlight.page}`);
                return;
            }

            // Find the text layer within the page
            const textLayer = pageElement.querySelector('.textLayer') as HTMLElement;
            if (!textLayer) {
                console.warn(`HighlightRenderer: Text layer not found for page ${highlight.page}`);
                return;
            }

            // Create highlight elements
            const highlightElements = this.createHighlightElements(highlight, textLayer, pageElement);
            
            if (highlightElements.length === 0) {
                console.warn(`HighlightRenderer: No highlight elements created for ${highlight.id}`);
                return;
            }

            // Store rendered elements
            this.renderedHighlights.set(highlight.id, highlightElements);

            console.log(`HighlightRenderer: Rendered highlight ${highlight.id} with ${highlightElements.length} elements`);

        } catch (error) {
            console.error('HighlightRenderer: Error rendering highlight:', error);
        }
    }

    /**
     * Create highlight elements for a highlight
     */
    private createHighlightElements(
        highlight: HighlightData, 
        textLayer: HTMLElement, 
        pageElement: HTMLElement
    ): HTMLElement[] {
        const elements: HTMLElement[] = [];

        try {
            // Use the position rects to create highlight overlays
            const rects = highlight.position.rects;
            
            if (!rects || rects.length === 0) {
                console.warn('HighlightRenderer: No rects found in highlight position');
                return elements;
            }

            // Get text layer and page dimensions for coordinate conversion
            const textLayerRect = textLayer.getBoundingClientRect();
            const pageRect = pageElement.getBoundingClientRect();

            rects.forEach((rect, index) => {
                // Convert screen coordinates to text layer relative coordinates
                const relativeCoords = this.convertToTextLayerCoordinates(
                    rect, 
                    textLayerRect, 
                    pageRect
                );

                if (!relativeCoords) return;

                // Create highlight element
                const highlightElement = document.createElement('div');
                highlightElement.className = 'pdf-highlight-overlay';
                highlightElement.setAttribute('data-highlight-id', highlight.id);
                highlightElement.setAttribute('data-highlight-rect', index.toString());
                highlightElement.setAttribute('data-page-number', highlight.page.toString());
                
                // Style the highlight element
                highlightElement.style.cssText = `
                    position: absolute;
                    left: ${relativeCoords.x}px;
                    top: ${relativeCoords.y}px;
                    width: ${relativeCoords.width}px;
                    height: ${relativeCoords.height}px;
                    background-color: ${highlight.color};
                    opacity: 0.3;
                    pointer-events: auto;
                    cursor: pointer;
                    z-index: 1;
                    border-radius: 2px;
                    transition: opacity 0.2s ease;
                `;

                // Add interaction handlers
                this.addHighlightInteraction(highlightElement, highlight);

                // Append to text layer
                textLayer.appendChild(highlightElement);
                elements.push(highlightElement);
            });

        } catch (error) {
            console.error('HighlightRenderer: Error creating highlight elements:', error);
        }

        return elements;
    }

    /**
     * Convert coordinates to text layer relative positioning
     */
    private convertToTextLayerCoordinates(
        rect: {x: number, y: number, width: number, height: number},
        textLayerRect: DOMRect,
        pageRect: DOMRect
    ): {x: number, y: number, width: number, height: number} | null {
        try {
            // The rect coordinates are already relative to the text layer from selection
            // Just ensure they're within bounds
            return {
                x: Math.max(0, rect.x),
                y: Math.max(0, rect.y),
                width: Math.max(1, rect.width),
                height: Math.max(1, rect.height)
            };
        } catch (error) {
            console.error('HighlightRenderer: Error converting coordinates:', error);
            return null;
        }
    }

    /**
     * Add interaction handlers to highlight element
     */
    private addHighlightInteraction(element: HTMLElement, highlight: HighlightData): void {
        // Click handler
        element.addEventListener('click', (event) => {
            event.stopPropagation();
            this.callbacks.onHighlightClicked?.(highlight.id, event);
        });

        // Double click handler
        element.addEventListener('dblclick', (event) => {
            event.stopPropagation();
            this.callbacks.onHighlightDoubleClicked?.(highlight.id, event);
        });

        // Context menu handler
        element.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.callbacks.onHighlightContextMenu?.(highlight.id, event);
        });

        // Hover handlers
        element.addEventListener('mouseenter', () => {
            this.handleHighlightHover(highlight.id, true);
            element.style.opacity = '0.5';
        });

        element.addEventListener('mouseleave', () => {
            this.handleHighlightHover(highlight.id, false);
            element.style.opacity = '0.3';
        });
    }

    /**
     * Handle highlight hover events
     */
    private handleHighlightHover(highlightId: string, isHovering: boolean): void {
        // Clear existing timeout
        const existingTimeout = this.hoverTimeouts.get(highlightId);
        if (existingTimeout) {
            clearTimeout(existingTimeout);
            this.hoverTimeouts.delete(highlightId);
        }

        if (isHovering) {
            // Immediate hover in
            const elements = this.renderedHighlights.get(highlightId) || [];
            this.callbacks.onHighlightHover?.(highlightId, true, elements);
        } else {
            // Delayed hover out
            const timeout = window.setTimeout(() => {
                const elements = this.renderedHighlights.get(highlightId) || [];
                this.callbacks.onHighlightHover?.(highlightId, false, elements);
                this.hoverTimeouts.delete(highlightId);
            }, 300);
            
            this.hoverTimeouts.set(highlightId, timeout);
        }
    }

    /**
     * Remove a highlight from the page
     */
    removeHighlight(highlightId: string): void {
        const elements = this.renderedHighlights.get(highlightId);
        if (elements) {
            elements.forEach(element => {
                if (element.parentNode) {
                    element.parentNode.removeChild(element);
                }
            });
            this.renderedHighlights.delete(highlightId);
        }

        // Clear any hover timeouts
        const timeout = this.hoverTimeouts.get(highlightId);
        if (timeout) {
            clearTimeout(timeout);
            this.hoverTimeouts.delete(highlightId);
        }
    }

    /**
     * Clear all highlights
     */
    clearAllHighlights(): void {
        // Remove all highlight elements
        this.renderedHighlights.forEach((elements, highlightId) => {
            this.removeHighlight(highlightId);
        });
        
        this.renderedHighlights.clear();
        this.hoverTimeouts.clear();
    }

    /**
     * Update all highlight positions (e.g., after zoom)
     */
    updateAllHighlightPositions(): void {
        const highlightIds = Array.from(this.renderedHighlights.keys());
        
        // For now, we'll need the actual highlight data to re-render
        // This would need to be provided by the calling code
        console.log(`HighlightRenderer: Would update positions for ${highlightIds.length} highlights`);
        
        // Note: This would be called by the HighlightManager with actual highlight data
    }

    /**
     * Re-render highlights for a specific page
     */
    async rerenderHighlightsForPage(pageNumber: number, highlights: HighlightData[]): Promise<void> {
        const pageHighlights = highlights.filter(h => h.page === pageNumber);
        
        // Remove existing highlights for this page
        for (const [highlightId, elements] of this.renderedHighlights) {
            const firstElement = elements[0];
            if (firstElement && firstElement.getAttribute('data-page-number') === pageNumber.toString()) {
                this.removeHighlight(highlightId);
            }
        }

        // Re-render highlights for this page
        for (const highlight of pageHighlights) {
            await this.renderHighlight(highlight);
        }
    }

    /**
     * Get page element by page number
     */
    private getPageElement(pageNum: number): HTMLElement | null {
        if (!this.viewerContainer) return null;

        // Look for page with data attribute
        let pageElement = this.viewerContainer.querySelector(`[data-page-number="${pageNum}"]`) as HTMLElement;
        
        if (!pageElement) {
            // Look for page wrapper that contains the page
            const pageWrappers = this.viewerContainer.querySelectorAll('.page-wrapper');
            if (pageWrappers[pageNum - 1]) {
                pageElement = pageWrappers[pageNum - 1] as HTMLElement;
            }
        }

        // Final fallback: look for .page elements
        if (!pageElement) {
            const pages = this.viewerContainer.querySelectorAll('.page');
            pageElement = pages[pageNum - 1] as HTMLElement;
        }

        return pageElement;
    }

    /**
     * Get highlight elements by ID
     */
    getHighlightElements(highlightId: string): HTMLElement[] {
        return this.renderedHighlights.get(highlightId) || [];
    }

    /**
     * Check if highlight is rendered
     */
    isHighlightRendered(highlightId: string): boolean {
        return this.renderedHighlights.has(highlightId);
    }

    /**
     * Get all rendered highlight IDs
     */
    getRenderedHighlightIds(): string[] {
        return Array.from(this.renderedHighlights.keys());
    }

    /**
     * Set enabled state
     */
    setEnabled(enabled: boolean): void {
        this.isEnabled = enabled;
        
        // Hide/show all highlights
        this.renderedHighlights.forEach(elements => {
            elements.forEach(element => {
                element.style.display = enabled ? 'block' : 'none';
            });
        });
    }

    /**
     * Update highlight color
     */
    updateHighlightColor(highlightId: string, newColor: string): void {
        const elements = this.renderedHighlights.get(highlightId);
        if (elements) {
            elements.forEach(element => {
                element.style.backgroundColor = newColor;
            });
        }
    }

    /**
     * Update callbacks
     */
    updateCallbacks(callbacks: HighlightRendererCallbacks): void {
        this.callbacks = { ...this.callbacks, ...callbacks };
    }

    /**
     * Clean up resources
     */
    cleanup(): void {
        console.log('HighlightRenderer: Cleaning up...');

        // Clear all highlights
        this.clearAllHighlights();

        // Clear references
        this.viewerContainer = null;
        this.callbacks = {};

        console.log('HighlightRenderer: Cleanup complete');
    }
}
