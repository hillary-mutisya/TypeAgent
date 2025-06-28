// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Text Selection Manager for PDF.js Integration
 * Handles text selection capture and processing for highlighting
 */

export interface TextSelectionData {
    text: string;
    position: HighlightPosition;
    pageNumber: number;
    selection: Selection;
    range: Range;
}

export interface HighlightPosition {
    startContainer: string;
    startOffset: number;
    endContainer: string;
    endOffset: number;
    rects: Array<{x: number, y: number, width: number, height: number}>;
    pageRect: {x: number, y: number, width: number, height: number};
}

export interface TextSelectionCallbacks {
    onTextSelected?: (data: TextSelectionData) => void;
    onHighlightRequested?: (data: TextSelectionData, color: string) => void;
    onHighlightWithNoteRequested?: (data: TextSelectionData, color: string) => void;
    onSelectionCleared?: () => void;
}

export class TextSelectionManager {
    private pdfjsApp: any = null;
    private viewerContainer: HTMLElement | null = null;
    private callbacks: TextSelectionCallbacks = {};
    private isEnabled = true;
    private currentSelection: TextSelectionData | null = null;
    
    // Selection timeout for showing highlight options
    private selectionTimer: number | null = null;
    private readonly SELECTION_DELAY = 300; // ms

    constructor() {
        // Bind methods to preserve context
        this.handleSelectionChange = this.handleSelectionChange.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);
    }

    /**
     * Initialize the text selection manager
     */
    initialize(
        pdfjsApp: any,
        viewerContainer: HTMLElement,
        callbacks: TextSelectionCallbacks = {}
    ): void {
        this.pdfjsApp = pdfjsApp;
        this.viewerContainer = viewerContainer;
        this.callbacks = callbacks;

        this.setupEventListeners();
        
        console.log('TextSelectionManager: Initialized');
    }

    /**
     * Set up event listeners for text selection
     */
    private setupEventListeners(): void {
        if (!this.viewerContainer) return;

        // Listen for selection changes
        document.addEventListener('selectionchange', this.handleSelectionChange);
        
        // Listen for mouse up to detect selection completion
        this.viewerContainer.addEventListener('mouseup', this.handleMouseUp);
        
        // Listen for keyboard shortcuts
        document.addEventListener('keydown', this.handleKeyDown);
        
        console.log('TextSelectionManager: Event listeners set up');
    }

    /**
     * Handle selection change events
     */
    private handleSelectionChange(): void {
        if (!this.isEnabled) return;

        // Clear any existing timer
        if (this.selectionTimer) {
            clearTimeout(this.selectionTimer);
            this.selectionTimer = null;
        }

        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) {
            this.clearCurrentSelection();
            return;
        }

        const range = selection.getRangeAt(0);
        if (range.collapsed) {
            this.clearCurrentSelection();
            return;
        }

        // Check if selection is within PDF content
        if (!this.isSelectionInPDF(selection)) {
            this.clearCurrentSelection();
            return;
        }

        // Delay processing to avoid excessive updates during selection
        this.selectionTimer = window.setTimeout(() => {
            this.processSelection(selection);
        }, this.SELECTION_DELAY);
    }

    /**
     * Handle mouse up events
     */
    private handleMouseUp(_event: MouseEvent): void {
        if (!this.isEnabled) return;

        // Small delay to allow selection to complete
        setTimeout(() => {
            const selection = window.getSelection();
            if (selection && !selection.isCollapsed && this.isSelectionInPDF(selection)) {
                this.processSelection(selection);
            }
        }, 50);
    }

    /**
     * Handle keyboard shortcuts for highlighting
     */
    private handleKeyDown(event: KeyboardEvent): void {
        if (!this.isEnabled || !this.currentSelection) return;

        // Check if we're in a text input (don't interfere with typing)
        const activeElement = document.activeElement;
        if (activeElement && (
            activeElement.tagName === 'INPUT' ||
            activeElement.tagName === 'TEXTAREA' ||
            activeElement.getAttribute('contenteditable') === 'true'
        )) {
            return;
        }

        // Keyboard shortcuts for highlighting
        if (event.ctrlKey || event.metaKey) {
            let color: string | null = null;
            
            switch (event.key) {
                case 'h': // Ctrl+H - Yellow highlight
                    color = '#ffff00';
                    break;
                case 'g': // Ctrl+G - Green highlight
                    color = '#00ff00';
                    break;
                case 'b': // Ctrl+B - Blue highlight
                    color = '#0080ff';
                    break;
                case 'r': // Ctrl+R - Red highlight
                    color = '#ff0000';
                    break;
                case 'p': // Ctrl+P - Pink highlight
                    color = '#ff00ff';
                    break;
            }

            if (color) {
                event.preventDefault();
                
                // Shift modifier adds a note
                if (event.shiftKey) {
                    this.callbacks.onHighlightWithNoteRequested?.(this.currentSelection, color);
                } else {
                    this.callbacks.onHighlightRequested?.(this.currentSelection, color);
                }
            }
        }
    }

    /**
     * Process a text selection
     */
    private processSelection(selection: Selection): void {
        try {
            const range = selection.getRangeAt(0);
            const text = selection.toString().trim();
            
            if (text.length === 0) {
                this.clearCurrentSelection();
                return;
            }

            // Get page number
            const pageNumber = this.getPageNumberFromSelection(range);
            if (pageNumber === null) {
                console.warn('TextSelectionManager: Could not determine page number');
                return;
            }

            // Create highlight position data
            const position = this.createHighlightPosition(range);
            if (!position) {
                console.warn('TextSelectionManager: Could not create highlight position');
                return;
            }

            const selectionData: TextSelectionData = {
                text,
                position,
                pageNumber,
                selection: selection,
                range: range
            };

            this.currentSelection = selectionData;
            this.callbacks.onTextSelected?.(selectionData);

            console.log('TextSelectionManager: Text selected:', {
                text: text.substring(0, 50) + (text.length > 50 ? '...' : ''),
                pageNumber,
                length: text.length
            });
        } catch (error) {
            console.error('TextSelectionManager: Error processing selection:', error);
        }
    }

    /**
     * Create highlight position data from a range
     */
    private createHighlightPosition(range: Range): HighlightPosition | null {
        try {
            // Get start and end containers
            const startContainer = this.getElementPath(range.startContainer);
            const endContainer = this.getElementPath(range.endContainer);
            
            if (!startContainer || !endContainer) {
                return null;
            }

            // Get bounding rectangles
            const rects = Array.from(range.getClientRects()).map(rect => ({
                x: rect.left,
                y: rect.top,
                width: rect.width,
                height: rect.height
            }));

            // Get page-relative coordinates
            const pageRect = this.getPageRelativeCoordinates(range);
            if (!pageRect) {
                return null;
            }

            return {
                startContainer,
                startOffset: range.startOffset,
                endContainer,
                endOffset: range.endOffset,
                rects,
                pageRect
            };
        } catch (error) {
            console.error('TextSelectionManager: Error creating highlight position:', error);
            return null;
        }
    }

    /**
     * Get CSS selector path for an element
     */
    private getElementPath(node: Node): string | null {
        try {
            // If it's a text node, get its parent element
            const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : node as Element;
            if (!element) return null;

            const path: string[] = [];
            let current = element;

            while (current && current !== this.viewerContainer) {
                let selector = current.tagName.toLowerCase();
                
                // Add class names for more specific selection
                if (current.className) {
                    const classes = current.className.split(' ').filter(c => c.trim());
                    if (classes.length > 0) {
                        selector += '.' + classes.join('.');
                    }
                }
                
                // Add data attributes that might help
                if (current.hasAttribute('data-page-number')) {
                    selector += `[data-page-number="${current.getAttribute('data-page-number')}"]`;
                }

                // Add position among siblings if needed for uniqueness
                const siblings = Array.from(current.parentElement?.children || []);
                const sameTagSiblings = siblings.filter(sibling => 
                    sibling.tagName === current.tagName
                );
                
                if (sameTagSiblings.length > 1) {
                    const index = sameTagSiblings.indexOf(current);
                    selector += `:nth-of-type(${index + 1})`;
                }

                path.unshift(selector);
                current = current.parentElement as Element;
            }

            return path.join(' > ');
        } catch (error) {
            console.error('TextSelectionManager: Error getting element path:', error);
            return null;
        }
    }

    /**
     * Get page-relative coordinates for the selection
     */
    private getPageRelativeCoordinates(range: Range): HighlightPosition['pageRect'] | null {
        try {
            const rangeRect = range.getBoundingClientRect();
            
            // Find the page element
            const startElement = range.startContainer.nodeType === Node.TEXT_NODE ? 
                range.startContainer.parentElement : 
                range.startContainer as Element;
            
            const pageElement = startElement?.closest('.page[data-page-number]') as HTMLElement;
            if (!pageElement) {
                return null;
            }

            const pageRect = pageElement.getBoundingClientRect();
            
            // Calculate normalized coordinates (0-1 range)
            const x = (rangeRect.left - pageRect.left) / pageRect.width;
            const y = (rangeRect.top - pageRect.top) / pageRect.height;
            const width = rangeRect.width / pageRect.width;
            const height = rangeRect.height / pageRect.height;

            return {
                x: Math.max(0, Math.min(1, x)),
                y: Math.max(0, Math.min(1, y)),
                width: Math.max(0, Math.min(1 - x, width)),
                height: Math.max(0, Math.min(1 - y, height))
            };
        } catch (error) {
            console.error('TextSelectionManager: Error getting page coordinates:', error);
            return null;
        }
    }

    /**
     * Check if selection is within PDF content
     */
    private isSelectionInPDF(selection: Selection): boolean {
        if (!selection.rangeCount) return false;
        
        const range = selection.getRangeAt(0);
        const startElement = range.startContainer.nodeType === Node.TEXT_NODE ? 
            range.startContainer.parentElement : 
            range.startContainer as Element;
        
        // Check if the selection is within a PDF page
        return startElement?.closest('.page[data-page-number]') !== null;
    }

    /**
     * Get page number from selection range
     */
    private getPageNumberFromSelection(range: Range): number | null {
        const startElement = range.startContainer.nodeType === Node.TEXT_NODE ? 
            range.startContainer.parentElement : 
            range.startContainer as Element;
        
        const pageElement = startElement?.closest('.page[data-page-number]');
        if (!pageElement) return null;
        
        const pageNumber = parseInt(pageElement.getAttribute('data-page-number') || '0', 10);
        return pageNumber > 0 ? pageNumber : null;
    }

    /**
     * Clear current selection
     */
    private clearCurrentSelection(): void {
        this.currentSelection = null;
        this.callbacks.onSelectionCleared?.();
    }

    /**
     * Get current selection data
     */
    getCurrentSelection(): TextSelectionData | null {
        return this.currentSelection;
    }

    /**
     * Clear browser text selection
     */
    clearBrowserSelection(): void {
        const selection = window.getSelection();
        if (selection) {
            selection.removeAllRanges();
        }
    }

    /**
     * Enable or disable text selection handling
     */
    setEnabled(enabled: boolean): void {
        this.isEnabled = enabled;
        
        if (!enabled) {
            this.clearCurrentSelection();
            this.clearBrowserSelection();
        }
    }

    /**
     * Update callbacks
     */
    updateCallbacks(callbacks: TextSelectionCallbacks): void {
        this.callbacks = { ...this.callbacks, ...callbacks };
    }

    /**
     * Clean up event listeners and resources
     */
    cleanup(): void {
        console.log('TextSelectionManager: Cleaning up...');

        // Remove event listeners
        document.removeEventListener('selectionchange', this.handleSelectionChange);
        
        if (this.viewerContainer) {
            this.viewerContainer.removeEventListener('mouseup', this.handleMouseUp);
        }
        
        document.removeEventListener('keydown', this.handleKeyDown);

        // Clear timers
        if (this.selectionTimer) {
            clearTimeout(this.selectionTimer);
            this.selectionTimer = null;
        }

        // Clear state
        this.clearCurrentSelection();
        this.clearBrowserSelection();

        // Clear references
        this.pdfjsApp = null;
        this.viewerContainer = null;
        this.callbacks = {};

        console.log('TextSelectionManager: Cleanup complete');
    }
}
