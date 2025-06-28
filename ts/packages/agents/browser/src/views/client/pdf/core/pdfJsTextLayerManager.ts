// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

declare global {
    interface Window {
        pdfjsLib: any;
    }
}

/**
 * PDF.js Native Text Layer Manager
 * Uses PDF.js built-in text selection instead of custom implementation
 */
export class PdfJsTextLayerManager {
    private textLayers: Map<number, HTMLElement> = new Map();
    private pdfDoc: any = null;
    private selectionCallbacks: Set<(data: any) => void> = new Set();

    constructor() {
        this.setupGlobalSelectionHandlers();
    }

    /**
     * Set the PDF document
     */
    setPDFDocument(pdfDoc: any): void {
        this.pdfDoc = pdfDoc;
    }

    /**
     * Enable PDF.js native text layer with selection for a specific page
     */
    async enableTextLayer(
        pageNum: number, 
        pageElement: HTMLElement, 
        viewport: any
    ): Promise<void> {
        if (!this.pdfDoc) {
            console.warn(`⚠️ PDF document not loaded yet, skipping text layer for page ${pageNum}`);
            return;
        }

        try {
            // Get the page
            const page = await this.pdfDoc.getPage(pageNum);
            
            // Get text content
            const textContent = await page.getTextContent();

            // Create text layer container
            const textLayerDiv = document.createElement('div');
            textLayerDiv.className = 'textLayer';
            textLayerDiv.setAttribute('data-page-number', pageNum.toString());
            
            // Style the text layer for PDF.js native rendering
            textLayerDiv.style.cssText = `
                position: absolute;
                left: 0;
                top: 0;
                right: 0;
                bottom: 0;
                overflow: hidden;
                opacity: 0.0001;
                line-height: 1.0;
                pointer-events: auto;
                z-index: 2;
                user-select: text;
                -webkit-user-select: text;
                -moz-user-select: text;
                -ms-user-select: text;
            `;

            // Position relative to page
            pageElement.style.position = 'relative';
            pageElement.appendChild(textLayerDiv);

            // Use PDF.js TextLayer.render for native text selection
            if (window.pdfjsLib && window.pdfjsLib.TextLayer) {
                // Prepare text divs array for PDF.js
                const textDivs: HTMLElement[] = [];
                const textContentItemsStr: string[] = [];

                const textLayerRenderTask = window.pdfjsLib.TextLayer.render({
                    textContent: textContent,
                    container: textLayerDiv,
                    viewport: viewport,
                    textDivs: textDivs,
                    textContentItemsStr: textContentItemsStr,
                    timeout: 0,
                    enhanceTextSelection: true // Enable enhanced text selection
                });

                await textLayerRenderTask.promise;

                // Post-process text divs for better selection
                this.enhanceTextDivs(textDivs, pageNum);

                // Enable text selection on the text layer
                this.enableTextSelection(textLayerDiv, pageNum);

                console.log(`📝 PDF.js native text layer enabled for page ${pageNum} with ${textDivs.length} text elements`);
            } else {
                // Fallback to custom rendering if PDF.js TextLayer not available
                console.warn('PDF.js TextLayer not available, using fallback');
                await this.renderTextLayerFallback(textLayerDiv, textContent, viewport);
            }

            // Store reference
            this.textLayers.set(pageNum, textLayerDiv);

        } catch (error) {
            console.error(`Failed to enable text layer for page ${pageNum}:`, error);
            throw error;
        }
    }

    /**
     * Enhance text divs for better selection and highlighting integration
     */
    private enhanceTextDivs(textDivs: HTMLElement[], pageNum: number): void {
        textDivs.forEach((div, index) => {
            // Add data attributes for selection tracking
            div.setAttribute('data-text-index', index.toString());
            div.setAttribute('data-page-number', pageNum.toString());
            
            // Ensure text is selectable
            div.style.userSelect = 'text';
            div.style.webkitUserSelect = 'text';
            div.style.pointerEvents = 'auto';
            
            // Add selection class for CSS targeting
            div.classList.add('pdf-text-div');
        });
    }

    /**
     * Enable text selection on a text layer using PDF.js selection
     */
    private enableTextSelection(textLayerDiv: HTMLElement, pageNum: number): void {
        // Make text selectable
        textLayerDiv.style.userSelect = 'text';
        textLayerDiv.style.webkitUserSelect = 'text';

        // Listen for selection changes on this text layer
        const handleSelection = () => {
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0) return;

            const range = selection.getRangeAt(0);
            const selectedText = selection.toString().trim();

            if (selectedText.length === 0) return;

            // Check if selection is within this text layer
            if (!textLayerDiv.contains(range.commonAncestorContainer) && 
                range.commonAncestorContainer !== textLayerDiv) {
                return;
            }

            // Get PDF.js selection coordinates
            const selectionData = this.getPdfJsSelectionData(range, textLayerDiv, pageNum);

            if (selectionData) {
                // Emit PDF.js native selection event
                this.emitSelectionEvent(selectionData);
            }
        };

        // Listen for selection changes
        document.addEventListener('selectionchange', handleSelection);

        // Listen for mouseup to capture final selection
        textLayerDiv.addEventListener('mouseup', () => {
            // Small delay to ensure selection is finalized
            setTimeout(handleSelection, 10);
        });
    }

    /**
     * Get PDF.js selection data from a range
     */
    private getPdfJsSelectionData(range: Range, textLayerDiv: HTMLElement, pageNum: number): any {
        try {
            const selectedText = range.toString().trim();
            if (selectedText.length === 0) return null;

            // Get all text divs in the text layer (created by PDF.js)
            const textDivs = Array.from(textLayerDiv.querySelectorAll('.pdf-text-div'));
            
            // Find which text divs are involved in the selection
            const selectedDivs = this.getSelectedTextDivs(range, textDivs);
            
            if (selectedDivs.length === 0) return null;

            // Calculate PDF coordinates from selected divs
            const pdfCoordinates = this.calculatePdfCoordinates(selectedDivs, textLayerDiv);

            // Get normalized coordinates for highlight storage
            const normalizedCoords = this.getNormalizedCoordinates(range, textLayerDiv);

            return {
                selectedText,
                pageNumber: pageNum,
                textLayerDiv,
                pageElement: textLayerDiv.closest('.page'),
                selection: window.getSelection(),
                range,
                pdfCoordinates,
                selectedDivs,
                normalizedCoords
            };

        } catch (error) {
            console.error('Error getting PDF.js selection data:', error);
            return null;
        }
    }

    /**
     * Get normalized coordinates relative to page for highlight storage
     */
    private getNormalizedCoordinates(range: Range, textLayerDiv: HTMLElement): any[] {
        try {
            const textLayerRect = textLayerDiv.getBoundingClientRect();
            const rects = Array.from(range.getClientRects());
            
            return rects.map(rect => ({
                x: rect.left - textLayerRect.left,
                y: rect.top - textLayerRect.top,
                width: rect.width,
                height: rect.height
            }));
        } catch (error) {
            console.error('Error getting normalized coordinates:', error);
            return [];
        }
    }

    /**
     * Get text divs that are part of the selection
     */
    private getSelectedTextDivs(range: Range, textDivs: Element[]): HTMLElement[] {
        const selectedDivs: HTMLElement[] = [];

        for (const div of textDivs) {
            const divRange = document.createRange();
            divRange.selectNodeContents(div);

            // Check if this div intersects with the selection range
            if (range.compareBoundaryPoints(Range.END_TO_START, divRange) <= 0 &&
                range.compareBoundaryPoints(Range.START_TO_END, divRange) >= 0) {
                selectedDivs.push(div as HTMLElement);
            }
        }

        return selectedDivs;
    }

    /**
     * Calculate PDF coordinates from selected text divs
     */
    private calculatePdfCoordinates(selectedDivs: HTMLElement[], textLayerDiv: HTMLElement): any[] {
        const coordinates: any[] = [];

        selectedDivs.forEach(div => {
            // Get the transform matrix from the div (set by PDF.js)
            const transform = div.style.transform;
            const left = parseFloat(div.style.left) || 0;
            const top = parseFloat(div.style.top) || 0;
            const width = div.offsetWidth;
            const height = div.offsetHeight;

            // PDF.js text divs already have PDF coordinates in their positioning
            coordinates.push({
                x: left,
                y: top,
                width: width,
                height: height,
                transform: transform,
                textContent: div.textContent,
                dataIndex: div.getAttribute('data-text-index')
            });
        });

        return coordinates;
    }

    /**
     * Emit PDF.js selection event
     */
    private emitSelectionEvent(selectionData: any): void {
        // Emit our custom event
        const event = new CustomEvent('pdfjs-native-text-selected', {
            detail: selectionData
        });
        document.dispatchEvent(event);

        // Call registered callbacks
        this.selectionCallbacks.forEach(callback => {
            try {
                callback(selectionData);
            } catch (error) {
                console.error('Error in selection callback:', error);
            }
        });
    }

    /**
     * Register a selection callback
     */
    onTextSelected(callback: (data: any) => void): void {
        this.selectionCallbacks.add(callback);
    }

    /**
     * Unregister a selection callback
     */
    offTextSelected(callback: (data: any) => void): void {
        this.selectionCallbacks.delete(callback);
    }

    /**
     * Setup global selection handlers
     */
    private setupGlobalSelectionHandlers(): void {
        // Global selection change handler for copy functionality
        document.addEventListener('selectionchange', () => {
            this.handleGlobalSelectionChange();
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (event) => {
            if (event.ctrlKey && event.key === 'c') {
                this.handleCopyShortcut(event);
            }
        });
    }

    /**
     * Handle global selection changes
     */
    private handleGlobalSelectionChange(): void {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;

        const selectedText = selection.toString().trim();
        if (selectedText.length === 0) return;

        // Check if selection is within any text layer
        const range = selection.getRangeAt(0);
        const textLayer = this.findTextLayerParent(range.commonAncestorContainer);

        if (textLayer) {
            // Emit global text selection event for other components
            const event = new CustomEvent('pdfTextSelected', {
                detail: {
                    text: selectedText,
                    range: range,
                    textLayer: textLayer
                }
            });
            document.dispatchEvent(event);
        }
    }

    /**
     * Handle copy keyboard shortcut
     */
    private handleCopyShortcut(event: KeyboardEvent): void {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;

        const selectedText = selection.toString().trim();
        if (selectedText.length === 0) return;

        const range = selection.getRangeAt(0);
        const textLayer = this.findTextLayerParent(range.commonAncestorContainer);

        if (textLayer) {
            this.copyToClipboard(selectedText);
            event.preventDefault();
        }
    }

    /**
     * Find text layer parent element
     */
    private findTextLayerParent(element: Node): HTMLElement | null {
        let current = element as HTMLElement;
        
        while (current && current.nodeType === Node.ELEMENT_NODE) {
            if (current.classList && current.classList.contains('textLayer')) {
                return current;
            }
            current = current.parentElement as HTMLElement;
        }
        
        return null;
    }

    /**
     * Copy text to clipboard
     */
    private async copyToClipboard(text: string): Promise<void> {
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
                console.log('📋 Text copied to clipboard via PDF.js selection');
                this.showCopyFeedback();
            } else {
                this.fallbackCopyToClipboard(text);
            }
        } catch (error) {
            console.error('Failed to copy text to clipboard:', error);
            this.fallbackCopyToClipboard(text);
        }
    }

    /**
     * Fallback copy method
     */
    private fallbackCopyToClipboard(text: string): void {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        try {
            const successful = document.execCommand('copy');
            if (successful) {
                console.log('📋 Text copied to clipboard (fallback)');
                this.showCopyFeedback();
            }
        } catch (error) {
            console.error('Fallback copy failed:', error);
        } finally {
            document.body.removeChild(textArea);
        }
    }

    /**
     * Show copy feedback
     */
    private showCopyFeedback(): void {
        const existingFeedback = document.querySelector('.copy-feedback');
        if (existingFeedback) {
            existingFeedback.remove();
        }

        const feedback = document.createElement('div');
        feedback.className = 'copy-feedback';
        feedback.textContent = 'Copied to clipboard!';
        feedback.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #4caf50;
            color: white;
            padding: 8px 16px;
            border-radius: 4px;
            font-size: 14px;
            z-index: 10000;
            pointer-events: none;
            opacity: 1;
            transition: opacity 0.3s ease;
        `;

        document.body.appendChild(feedback);

        setTimeout(() => {
            feedback.style.opacity = '0';
            setTimeout(() => {
                if (feedback.parentNode) {
                    feedback.parentNode.removeChild(feedback);
                }
            }, 300);
        }, 2000);
    }

    /**
     * Fallback text layer rendering (if PDF.js TextLayer not available)
     */
    private async renderTextLayerFallback(
        textLayerDiv: HTMLElement,
        textContent: any,
        viewport: any
    ): Promise<void> {
        try {
            textLayerDiv.innerHTML = '';

            textContent.items.forEach((textItem: any, index: number) => {
                const textDiv = document.createElement('span');
                textDiv.textContent = textItem.str;
                textDiv.setAttribute('data-text-index', index.toString());
                textDiv.classList.add('pdf-text-div');
                
                const transform = this.getTextTransform(textItem, viewport);
                textDiv.style.cssText = `
                    position: absolute;
                    color: transparent;
                    white-space: pre;
                    cursor: text;
                    transform-origin: 0% 0%;
                    transform: ${transform.matrix};
                    left: ${transform.left}px;
                    top: ${transform.top}px;
                    font-size: ${transform.fontSize}px;
                    font-family: ${textItem.fontName || 'sans-serif'};
                    user-select: text;
                `;

                textLayerDiv.appendChild(textDiv);
            });

        } catch (error) {
            console.error('Fallback text layer rendering failed:', error);
        }
    }

    /**
     * Calculate text transform for positioning (fallback)
     */
    private getTextTransform(textItem: any, viewport: any): any {
        const transform = viewport.transform;
        const [a, b, c, d, e, f] = textItem.transform;
        
        const matrix = `matrix(${a * transform[0]}, ${b * transform[1]}, ${c * transform[2]}, ${d * transform[3]}, ${e * transform[4] + transform[4]}, ${f * transform[5] + transform[5]})`;
        
        const left = textItem.transform[4] * transform[0] + transform[4];
        const top = textItem.transform[5] * transform[3] + transform[5];
        const fontSize = Math.abs(textItem.transform[3]) * transform[3];

        return { matrix, left, top, fontSize };
    }

    /**
     * Remove text layer for a page
     */
    removeTextLayer(pageNum: number): void {
        const textLayer = this.textLayers.get(pageNum);
        if (textLayer && textLayer.parentNode) {
            textLayer.parentNode.removeChild(textLayer);
            this.textLayers.delete(pageNum);
        }
    }

    /**
     * Clear all text layers
     */
    clearAllTextLayers(): void {
        this.textLayers.forEach((textLayer, pageNum) => {
            this.removeTextLayer(pageNum);
        });
    }

    /**
     * Get selected text information
     */
    getSelectedText(): { text: string; range: Range | null; pageNum: number | null } | null {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return null;

        const range = selection.getRangeAt(0);
        const text = selection.toString().trim();

        if (text.length === 0) return null;

        const textLayer = this.findTextLayerParent(range.commonAncestorContainer);
        if (!textLayer) return null;

        const pageNum = parseInt(textLayer.getAttribute('data-page-number') || '0', 10);

        return { text, range, pageNum };
    }

    /**
     * Clear current selection
     */
    clearSelection(): void {
        const selection = window.getSelection();
        if (selection) {
            selection.removeAllRanges();
        }
    }

    /**
     * Create highlight from current selection
     */
    createHighlightFromSelection(color: string = '#ffff00'): any | null {
        const selectionInfo = this.getSelectedText();
        if (!selectionInfo) return null;

        const { text, range, pageNum } = selectionInfo;
        const textLayer = this.findTextLayerParent(range.commonAncestorContainer);
        
        if (!textLayer) return null;

        const selectionData = this.getPdfJsSelectionData(range, textLayer, pageNum!);
        if (!selectionData) return null;

        // Clear selection after capturing data
        this.clearSelection();

        return {
            ...selectionData,
            color,
            id: `highlight-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            createdAt: new Date().toISOString()
        };
    }

    /**
     * Get text layer for page
     */
    getTextLayerForPage(pageNum: number): HTMLElement | null {
        return this.textLayers.get(pageNum) || null;
    }

    /**
     * Check if text layer exists for page
     */
    hasTextLayer(pageNum: number): boolean {
        return this.textLayers.has(pageNum);
    }

    /**
     * Get all active text layers
     */
    getAllTextLayers(): Map<number, HTMLElement> {
        return new Map(this.textLayers);
    }
}