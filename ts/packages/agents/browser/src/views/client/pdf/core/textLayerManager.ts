// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Text Layer Manager for PDF text selection and extraction
 */
export class TextLayerManager {
    private textLayers: Map<number, HTMLElement> = new Map();
    private pdfDoc: any = null;

    constructor() {
        this.setupSelectionHandlers();
    }

    /**
     * Set the PDF document
     */
    setPDFDocument(pdfDoc: any): void {
        this.pdfDoc = pdfDoc;
    }

    /**
     * Enable text layer for a specific page
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
            textLayerDiv.style.cssText = `
                position: absolute;
                left: 0;
                top: 0;
                right: 0;
                bottom: 0;
                overflow: hidden;
                opacity: 0.2;
                line-height: 1.0;
                pointer-events: auto;
            `;

            // Position relative to page
            pageElement.style.position = 'relative';
            pageElement.appendChild(textLayerDiv);

            // Render text layer
            const textLayerRenderTask = this.renderTextLayer(
                textLayerDiv,
                textContent,
                viewport
            );

            await textLayerRenderTask;

            // Store reference
            this.textLayers.set(pageNum, textLayerDiv);

        } catch (error) {
            console.error(`Failed to enable text layer for page ${pageNum}:`, error);
            throw error;
        }
    }

    /**
     * Render text layer content
     */
    private renderTextLayer(
        textLayerDiv: HTMLElement,
        textContent: any,
        viewport: any
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                // Clear existing content
                textLayerDiv.innerHTML = '';

                // Render each text item
                textContent.items.forEach((textItem: any, index: number) => {
                    const textDiv = document.createElement('span');
                    
                    // Set text content
                    textDiv.textContent = textItem.str;
                    
                    // Apply transform and positioning
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
                    `;

                    textLayerDiv.appendChild(textDiv);
                });

                resolve();
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Calculate text transform for positioning
     */
    private getTextTransform(textItem: any, viewport: any): any {
        const transform = viewport.transform;
        const [a, b, c, d, e, f] = textItem.transform;
        
        // Apply viewport transform
        const matrix = `matrix(${a * transform[0]}, ${b * transform[1]}, ${c * transform[2]}, ${d * transform[3]}, ${e * transform[4] + transform[4]}, ${f * transform[5] + transform[5]})`;
        
        const left = textItem.transform[4] * transform[0] + transform[4];
        const top = textItem.transform[5] * transform[3] + transform[5];
        const fontSize = Math.abs(textItem.transform[3]) * transform[3];

        return {
            matrix,
            left,
            top,
            fontSize
        };
    }    /**
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
     * Setup selection handlers for copy-to-clipboard
     */
    private setupSelectionHandlers(): void {
        document.addEventListener('selectionchange', () => {
            this.handleSelectionChange();
        });

        // Add keyboard shortcuts
        document.addEventListener('keydown', (event) => {
            if (event.ctrlKey && event.key === 'c') {
                this.handleCopyShortcut(event);
            }
        });
    }

    /**
     * Handle selection changes
     */
    private handleSelectionChange(): void {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) {
            return;
        }

        const range = selection.getRangeAt(0);
        const selectedText = selection.toString().trim();

        if (selectedText.length > 0) {
            // Dispatch custom event for selection
            const selectionEvent = new CustomEvent('pdfTextSelected', {
                detail: {
                    text: selectedText,
                    range: range
                }
            });
            document.dispatchEvent(selectionEvent);
        }
    }

    /**
     * Handle copy keyboard shortcut
     */
    private handleCopyShortcut(event: KeyboardEvent): void {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) {
            return;
        }

        const selectedText = selection.toString().trim();
        if (selectedText.length === 0) {
            return;
        }

        // Check if selection is within text layer
        const range = selection.getRangeAt(0);
        const container = range.commonAncestorContainer;
        const textLayer = this.findTextLayerParent(container);

        if (textLayer) {
            // Copy to clipboard
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
                console.log('📋 Text copied to clipboard:', text.substring(0, 50) + '...');
                
                // Show temporary feedback
                this.showCopyFeedback();
            } else {
                // Fallback for older browsers
                this.fallbackCopyToClipboard(text);
            }
        } catch (error) {
            console.error('Failed to copy text to clipboard:', error);
            this.fallbackCopyToClipboard(text);
        }
    }

    /**
     * Fallback copy method for older browsers
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
     * Show temporary copy feedback
     */
    private showCopyFeedback(): void {
        // Remove existing feedback
        const existingFeedback = document.querySelector('.copy-feedback');
        if (existingFeedback) {
            existingFeedback.remove();
        }

        // Create feedback element
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

        // Remove after 2 seconds
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
     * Get selected text information
     */
    getSelectedText(): { text: string; range: Range | null } | null {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) {
            return null;
        }

        const range = selection.getRangeAt(0);
        const text = selection.toString().trim();

        if (text.length === 0) {
            return null;
        }

        // Verify selection is within text layer
        const textLayer = this.findTextLayerParent(range.commonAncestorContainer);
        if (!textLayer) {
            return null;
        }

        return { text, range };
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
}
