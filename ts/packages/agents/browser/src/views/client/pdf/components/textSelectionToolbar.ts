// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Text Selection Toolbar Events
 */
export interface TextSelectionToolbarEvents {
    'highlight-created': { color: string; selection: Selection; pageElement: HTMLElement };
    'note-created': { selection: Selection; pageElement: HTMLElement };
    'text-copied': { text: string };
}

/**
 * Color option for highlighting
 */
export interface HighlightColor {
    name: string;
    value: string;
    icon: string;
}

/**
 * Floating Text Selection Toolbar
 * Appears automatically when text is selected, provides quick actions for highlighting and note creation
 */
export class TextSelectionToolbar {
    private toolbar: HTMLElement | null = null;
    private isVisible = false;
    private currentSelection: Selection | null = null;
    private currentPageElement: HTMLElement | null = null;
    private eventListeners: Map<keyof TextSelectionToolbarEvents, ((event: any) => void)[]> = new Map();
    private hideTimeout: number | null = null;

    private highlightColors: HighlightColor[] = [
        { name: 'Yellow', value: '#ffff00', icon: '🟡' },
        { name: 'Green', value: '#00ff00', icon: '🟢' },
        { name: 'Blue', value: '#0080ff', icon: '🔵' },
        { name: 'Purple', value: '#ff00ff', icon: '🟣' },
        { name: 'Orange', value: '#ff8000', icon: '🟠' }
    ];

    constructor() {
        console.log('🔍 TextSelectionToolbar: Initializing');
        this.createToolbar();
        this.setupEventHandlers();
        console.log('🔍 TextSelectionToolbar: Initialized');
    }

    /**
     * Create the toolbar DOM element
     */
    private createToolbar(): void {
        this.toolbar = document.createElement('div');
        this.toolbar.className = 'text-selection-toolbar';
        this.toolbar.style.cssText = `
            position: fixed;
            background: white;
            border: 1px solid #ccc;
            border-radius: 8px;
            box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
            padding: 8px;
            z-index: 10001;
            display: none;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
            font-size: 14px;
            user-select: none;
            pointer-events: auto;
            backdrop-filter: blur(10px);
            background: rgba(255, 255, 255, 0.95);
        `;

        this.buildToolbarContent();
        document.body.appendChild(this.toolbar);
    }

    /**
     * Build the toolbar content
     */
    private buildToolbarContent(): void {
        if (!this.toolbar) return;

        const container = document.createElement('div');
        container.style.cssText = `
            display: flex;
            align-items: center;
            gap: 4px;
        `;

        // Default highlight button
        const defaultHighlightBtn = this.createToolbarButton('🖍️', 'Highlight (Yellow)', () => {
            this.handleHighlight('#ffff00');
        });
        container.appendChild(defaultHighlightBtn);

        // Color picker section
        const colorSeparator = document.createElement('div');
        colorSeparator.style.cssText = `
            width: 1px;
            height: 24px;
            background: #e0e0e0;
            margin: 0 4px;
        `;
        container.appendChild(colorSeparator);

        // Color swatches
        this.highlightColors.forEach(color => {
            const colorBtn = this.createColorButton(color);
            container.appendChild(colorBtn);
        });

        // Action separator
        const actionSeparator = document.createElement('div');
        actionSeparator.style.cssText = `
            width: 1px;
            height: 24px;
            background: #e0e0e0;
            margin: 0 8px;
        `;
        container.appendChild(actionSeparator);

        // Note button
        const noteBtn = this.createToolbarButton('📝', 'Add Note', () => {
            this.handleAddNote();
        });
        container.appendChild(noteBtn);

        // Copy button
        const copyBtn = this.createToolbarButton('📋', 'Copy', () => {
            this.handleCopy();
        });
        container.appendChild(copyBtn);

        this.toolbar.appendChild(container);
    }

    /**
     * Create a toolbar button
     */
    private createToolbarButton(icon: string, tooltip: string, onClick: () => void): HTMLElement {
        const button = document.createElement('button');
        button.textContent = icon;
        button.title = tooltip;
        button.style.cssText = `
            background: transparent;
            border: none;
            border-radius: 4px;
            padding: 6px 8px;
            cursor: pointer;
            font-size: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background-color 0.2s;
            min-width: 32px;
            height: 32px;
        `;

        button.addEventListener('mouseenter', () => {
            button.style.backgroundColor = '#f0f0f0';
        });

        button.addEventListener('mouseleave', () => {
            button.style.backgroundColor = 'transparent';
        });

        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            onClick();
        });

        return button;
    }

    /**
     * Create a color button
     */
    private createColorButton(color: HighlightColor): HTMLElement {
        const button = document.createElement('button');
        button.title = `Highlight with ${color.name}`;
        button.style.cssText = `
            background: ${color.value};
            border: 2px solid white;
            border-radius: 50%;
            width: 24px;
            height: 24px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: transform 0.2s, box-shadow 0.2s;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
        `;

        button.addEventListener('mouseenter', () => {
            button.style.transform = 'scale(1.1)';
            button.style.boxShadow = '0 2px 6px rgba(0, 0, 0, 0.3)';
        });

        button.addEventListener('mouseleave', () => {
            button.style.transform = 'scale(1)';
            button.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.2)';
        });

        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.handleHighlight(color.value);
        });

        return button;
    }

    /**
     * Set up event handlers
     */
    private setupEventHandlers(): void {
        // Listen for selection changes
        document.addEventListener('selectionchange', () => {
            this.handleSelectionChange();
        });

        // Hide toolbar when clicking outside
        document.addEventListener('mousedown', (event) => {
            if (this.isVisible && !this.toolbar?.contains(event.target as Node)) {
                // Check if click is in text selection area
                const selection = window.getSelection();
                if (selection && selection.rangeCount > 0) {
                    const range = selection.getRangeAt(0);
                    const rect = range.getBoundingClientRect();
                    const clickX = event.clientX;
                    const clickY = event.clientY;
                    
                    // If click is not near the selection, hide toolbar
                    if (clickX < rect.left - 20 || clickX > rect.right + 20 || 
                        clickY < rect.top - 20 || clickY > rect.bottom + 20) {
                        this.hideToolbar();
                    }
                } else {
                    this.hideToolbar();
                }
            }
        });

        // Hide on escape key
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && this.isVisible) {
                this.hideToolbar();
            }
        });

        // Hide on scroll
        document.addEventListener('scroll', () => {
            if (this.isVisible) {
                this.updatePosition();
            }
        });

        // Handle window resize
        window.addEventListener('resize', () => {
            if (this.isVisible) {
                this.updatePosition();
            }
        });
    }

    /**
     * Handle selection changes
     */
    private handleSelectionChange(): void {
        console.log('🔍 TextSelectionToolbar: Selection changed');
        
        // Clear any existing hide timeout
        if (this.hideTimeout) {
            clearTimeout(this.hideTimeout);
            this.hideTimeout = null;
        }

        const selection = window.getSelection();
        console.log('🔍 Selection:', selection?.toString());
        
        if (selection && selection.toString().trim().length > 0) {
            // Check if selection is within PDF viewer
            const pdfContainer = document.querySelector('#viewerContainer');
            console.log('🔍 PDF Container found:', !!pdfContainer);
            console.log('🔍 Selection anchor node:', selection.anchorNode);
            console.log('🔍 Container contains selection:', pdfContainer?.contains(selection.anchorNode));
            
            if (pdfContainer?.contains(selection.anchorNode)) {
                const pageWrapper = this.findPageWrapper(selection.anchorNode);
                console.log('🔍 Page wrapper found:', !!pageWrapper);
                
                if (pageWrapper) {
                    this.currentSelection = selection;
                    this.currentPageElement = pageWrapper;
                    console.log('🔍 Showing toolbar');
                    this.showToolbar(selection.getRangeAt(0));
                    return;
                }
            }
        }

        // No valid selection, hide toolbar with delay
        console.log('🔍 No valid selection, hiding toolbar');
        this.hideTimeout = window.setTimeout(() => {
            this.hideToolbar();
        }, 300);
    }

    /**
     * Find the page wrapper element for a given node
     */
    private findPageWrapper(node: Node | null): HTMLElement | null {
        console.log('🔍 Finding page wrapper for node:', node);
        let current = node;
        while (current && current !== document) {
            console.log('🔍 Checking node:', current, 'is Element:', current instanceof HTMLElement);
            if (current instanceof HTMLElement) {
                console.log('🔍 Element classes:', current.className);
                if (current.classList.contains('page-wrapper')) {
                    console.log('🔍 Found page wrapper:', current);
                    return current;
                }
            }
            current = current.parentNode;
        }
        console.log('🔍 No page wrapper found');
        return null;
    }

    /**
     * Show the toolbar near the selection
     */
    private showToolbar(range: Range): void {
        if (!this.toolbar) return;

        const rect = range.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) {
            return; // Invalid selection
        }

        this.toolbar.style.display = 'block';
        this.positionToolbar(rect);
        this.isVisible = true;
    }

    /**
     * Position the toolbar relative to the selection rectangle
     */
    private positionToolbar(selectionRect: DOMRect): void {
        if (!this.toolbar) return;

        // Get toolbar dimensions
        const toolbarRect = this.toolbar.getBoundingClientRect();
        
        // Calculate preferred position (above selection, centered)
        let left = selectionRect.left + (selectionRect.width / 2) - (toolbarRect.width / 2);
        let top = selectionRect.top - toolbarRect.height - 10;

        // Adjust horizontal position to stay within viewport
        const viewportWidth = window.innerWidth;
        if (left < 10) {
            left = 10;
        } else if (left + toolbarRect.width > viewportWidth - 10) {
            left = viewportWidth - toolbarRect.width - 10;
        }

        // Adjust vertical position if toolbar would be above viewport
        if (top < 10) {
            // Position below selection instead
            top = selectionRect.bottom + 10;
        }

        // Final viewport boundary check
        const viewportHeight = window.innerHeight;
        if (top + toolbarRect.height > viewportHeight - 10) {
            top = viewportHeight - toolbarRect.height - 10;
        }

        this.toolbar.style.left = `${left}px`;
        this.toolbar.style.top = `${top}px`;
    }

    /**
     * Update toolbar position (for scroll events)
     */
    private updatePosition(): void {
        if (!this.isVisible || !this.currentSelection) {
            return;
        }

        try {
            const range = this.currentSelection.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            
            // Hide if selection is no longer visible
            if (rect.width === 0 && rect.height === 0) {
                this.hideToolbar();
                return;
            }

            this.positionToolbar(rect);
        } catch (e) {
            // Selection might be invalid, hide toolbar
            this.hideToolbar();
        }
    }

    /**
     * Hide the toolbar
     */
    private hideToolbar(): void {
        if (this.toolbar) {
            this.toolbar.style.display = 'none';
        }
        this.isVisible = false;
        this.currentSelection = null;
        this.currentPageElement = null;
    }

    /**
     * Handle highlighting with specified color
     */
    private handleHighlight(color: string): void {
        if (!this.currentSelection || !this.currentPageElement) {
            return;
        }

        this.emit('highlight-created', {
            color: color,
            selection: this.currentSelection,
            pageElement: this.currentPageElement
        });

        this.hideToolbar();
    }

    /**
     * Handle adding a note
     */
    private handleAddNote(): void {
        if (!this.currentSelection || !this.currentPageElement) {
            return;
        }

        this.emit('note-created', {
            selection: this.currentSelection,
            pageElement: this.currentPageElement
        });

        this.hideToolbar();
    }

    /**
     * Handle copying text
     */
    private handleCopy(): void {
        if (!this.currentSelection) {
            return;
        }

        const text = this.currentSelection.toString();
        
        // Use modern clipboard API if available
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => {
                this.showCopyFeedback();
            }).catch(() => {
                this.fallbackCopy(text);
            });
        } else {
            this.fallbackCopy(text);
        }

        this.emit('text-copied', { text: text });
        this.hideToolbar();
    }

    /**
     * Fallback copy method using execCommand
     */
    private fallbackCopy(text: string): void {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.cssText = `
            position: fixed;
            top: -9999px;
            left: -9999px;
            opacity: 0;
        `;
        
        document.body.appendChild(textArea);
        textArea.select();
        
        try {
            document.execCommand('copy');
            this.showCopyFeedback();
        } catch (err) {
            console.error('Copy failed:', err);
        }
        
        document.body.removeChild(textArea);
    }

    /**
     * Show visual feedback for copy action
     */
    private showCopyFeedback(): void {
        // Create temporary feedback element
        const feedback = document.createElement('div');
        feedback.textContent = 'Copied!';
        feedback.style.cssText = `
            position: fixed;
            background: #333;
            color: white;
            padding: 8px 16px;
            border-radius: 4px;
            font-size: 14px;
            z-index: 10002;
            pointer-events: none;
            animation: fadeInOut 2s ease-in-out;
        `;

        // Position near toolbar or cursor
        if (this.toolbar && this.isVisible) {
            const toolbarRect = this.toolbar.getBoundingClientRect();
            feedback.style.left = `${toolbarRect.left}px`;
            feedback.style.top = `${toolbarRect.bottom + 10}px`;
        } else {
            feedback.style.left = '50%';
            feedback.style.top = '50%';
            feedback.style.transform = 'translate(-50%, -50%)';
        }

        // Add fade animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes fadeInOut {
                0% { opacity: 0; transform: translateY(10px); }
                20% { opacity: 1; transform: translateY(0); }
                80% { opacity: 1; transform: translateY(0); }
                100% { opacity: 0; transform: translateY(-10px); }
            }
        `;
        document.head.appendChild(style);

        document.body.appendChild(feedback);

        // Remove after animation
        setTimeout(() => {
            if (feedback.parentNode) {
                feedback.parentNode.removeChild(feedback);
            }
            if (style.parentNode) {
                style.parentNode.removeChild(style);
            }
        }, 2000);
    }

    /**
     * Event emission system
     */
    on<K extends keyof TextSelectionToolbarEvents>(event: K, callback: (data: TextSelectionToolbarEvents[K]) => void): void {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event)!.push(callback);
    }

    private emit<K extends keyof TextSelectionToolbarEvents>(event: K, data: TextSelectionToolbarEvents[K]): void {
        const listeners = this.eventListeners.get(event);
        if (listeners) {
            listeners.forEach(callback => callback(data));
        }
    }

    /**
     * Manually show toolbar for specific selection (useful for programmatic access)
     */
    public showForSelection(selection: Selection, pageElement: HTMLElement): void {
        if (selection.rangeCount > 0) {
            this.currentSelection = selection;
            this.currentPageElement = pageElement;
            this.showToolbar(selection.getRangeAt(0));
        }
    }

    /**
     * Manually hide toolbar
     */
    public hide(): void {
        this.hideToolbar();
    }

    /**
     * Get current selection state
     */
    public isCurrentlyVisible(): boolean {
        return this.isVisible;
    }

    /**
     * Clean up
     */
    destroy(): void {
        if (this.hideTimeout) {
            clearTimeout(this.hideTimeout);
        }
        
        if (this.toolbar) {
            this.toolbar.remove();
            this.toolbar = null;
        }
        
        this.eventListeners.clear();
        this.currentSelection = null;
        this.currentPageElement = null;
    }
}
