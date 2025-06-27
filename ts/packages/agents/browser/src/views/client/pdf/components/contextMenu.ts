// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Context menu item definition
 */
export interface ContextMenuItem {
    id: string;
    label: string;
    icon?: string;
    action?: () => void;
    submenu?: ContextMenuItem[];
    separator?: boolean;
    disabled?: boolean;
}

/**
 * Context menu events
 */
export interface ContextMenuEvents {
    'highlight-selected': { color: string; selection: Selection; pageElement: HTMLElement };
    'note-create': { position: { x: number; y: number }; pageElement: HTMLElement; selectedText?: string };
    'highlight-delete': { highlightId: string };
    'highlight-change-color': { highlightId: string; color: string };
    'highlight-add-note': { highlightId: string };
    'copy-text': { text: string };
    'draw-mode': {};
}

/**
 * Context Menu System for PDF Viewer
 * Provides different menus based on click context (selected text, highlights, empty areas)
 */
export class ContextMenu {
    private menu: HTMLElement | null = null;
    private isVisible = false;
    private eventListeners: Map<keyof ContextMenuEvents, ((event: any) => void)[]> = new Map();
    private highlightColors = [
        { name: 'Yellow', value: '#ffff00' },
        { name: 'Green', value: '#00ff00' },
        { name: 'Blue', value: '#0080ff' },
        { name: 'Pink', value: '#ff00ff' },
        { name: 'Orange', value: '#ff8000' }
    ];

    constructor() {
        console.log('🔍 ContextMenu: Initializing');
        this.setupEventHandlers();
        this.createMenuElement();
        console.log('🔍 ContextMenu: Initialized');
    }

    /**
     * Set up global event handlers
     */
    private setupEventHandlers(): void {
        // Handle right-click events
        document.addEventListener('contextmenu', (event) => this.handleRightClick(event));
        
        // Hide menu on outside click or escape
        document.addEventListener('click', (event) => {
            if (this.isVisible && !this.menu?.contains(event.target as Node)) {
                this.hide();
            }
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && this.isVisible) {
                this.hide();
            }
        });

        // Handle scroll to hide menu
        document.addEventListener('scroll', () => {
            if (this.isVisible) {
                this.hide();
            }
        });
    }

    /**
     * Create the menu DOM element
     */
    private createMenuElement(): void {
        this.menu = document.createElement('div');
        this.menu.className = 'context-menu';
        this.menu.style.cssText = `
            position: fixed;
            background: white;
            border: 1px solid #ccc;
            border-radius: 6px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            padding: 4px 0;
            min-width: 180px;
            z-index: 10000;
            display: none;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
            font-size: 13px;
            user-select: none;
        `;
        document.body.appendChild(this.menu);
    }

    /**
     * Handle right-click events and show appropriate context menu
     */
    private handleRightClick(event: MouseEvent): void {
        console.log('🔍 ContextMenu: Right click detected');
        
        // Only handle right-clicks in PDF viewer area
        const pdfContainer = document.querySelector('#viewerContainer');
        console.log('🔍 PDF Container found:', !!pdfContainer);
        console.log('🔍 Event target:', event.target);
        console.log('🔍 Container contains target:', pdfContainer?.contains(event.target as Node));
        
        if (!pdfContainer?.contains(event.target as Node)) {
            console.log('🔍 Click outside PDF container, ignoring');
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        const target = event.target;
        if (!(target instanceof Element)) {
            console.log('🔍 Target is not an Element, ignoring');
            return;
        }

        const hasSelection = window.getSelection()?.toString().trim().length > 0;
        const clickedHighlight = target.closest('[data-highlight-id]') as HTMLElement;
        const clickedNote = target.closest('[data-note-id]') as HTMLElement;
        const pageWrapper = target.closest('.page-wrapper') as HTMLElement;

        console.log('🔍 Has selection:', hasSelection);
        console.log('🔍 Clicked highlight:', !!clickedHighlight);
        console.log('🔍 Clicked note:', !!clickedNote);
        console.log('🔍 Page wrapper found:', !!pageWrapper);

        if (!pageWrapper) {
            console.log('🔍 No page wrapper found, ignoring');
            return;
        }

        if (clickedHighlight) {
            console.log('🔍 Showing highlight context menu');
            this.showHighlightContextMenu(event, clickedHighlight, pageWrapper);
        } else if (hasSelection) {
            console.log('🔍 Showing selection context menu');
            this.showSelectionContextMenu(event, pageWrapper);
        } else {
            console.log('🔍 Showing page context menu');
            this.showPageContextMenu(event, pageWrapper);
        }
    }

    /**
     * Show context menu for selected text
     */
    private showSelectionContextMenu(event: MouseEvent, pageWrapper: HTMLElement): void {
        const selection = window.getSelection();
        if (!selection || selection.toString().trim().length === 0) {
            return;
        }

        const items: ContextMenuItem[] = [
            {
                id: 'highlight-yellow',
                label: '🖍️ Highlight (Yellow)',
                action: () => this.emit('highlight-selected', { 
                    color: '#ffff00', 
                    selection: selection,
                    pageElement: pageWrapper 
                })
            },
            {
                id: 'highlight-options',
                label: '🎨 Highlight Options',
                submenu: this.highlightColors.map(color => ({
                    id: `highlight-${color.value}`,
                    label: `⬤ ${color.name}`,
                    action: () => this.emit('highlight-selected', { 
                        color: color.value, 
                        selection: selection,
                        pageElement: pageWrapper 
                    })
                }))
            },
            { id: 'separator-1', separator: true },
            {
                id: 'add-note',
                label: '📝 Add Note',
                action: () => {
                    const range = selection.getRangeAt(0);
                    const rect = range.getBoundingClientRect();
                    this.emit('note-create', { 
                        position: { x: rect.left, y: rect.top },
                        pageElement: pageWrapper,
                        selectedText: selection.toString()
                    });
                }
            },
            {
                id: 'copy-text',
                label: '📋 Copy Text',
                action: () => this.emit('copy-text', { text: selection.toString() })
            }
        ];

        this.showMenu(event, items);
    }

    /**
     * Show context menu for existing highlights
     */
    private showHighlightContextMenu(event: MouseEvent, highlightElement: HTMLElement, pageWrapper: HTMLElement): void {
        const highlightId = highlightElement.dataset.highlightId;
        if (!highlightId) {
            return;
        }

        const items: ContextMenuItem[] = [
            {
                id: 'change-color',
                label: '🎨 Change Color',
                submenu: this.highlightColors.map(color => ({
                    id: `change-color-${color.value}`,
                    label: `⬤ ${color.name}`,
                    action: () => this.emit('highlight-change-color', { 
                        highlightId: highlightId, 
                        color: color.value 
                    })
                }))
            },
            {
                id: 'add-note-to-highlight',
                label: '📝 Add Note to Highlight',
                action: () => this.emit('highlight-add-note', { highlightId: highlightId })
            },
            {
                id: 'copy-highlight-text',
                label: '📋 Copy Text',
                action: () => {
                    // Find the text content of the highlight
                    const highlightContainer = highlightElement.closest('[data-highlight-id]');
                    if (highlightContainer) {
                        const textContent = this.getHighlightText(highlightContainer as HTMLElement);
                        this.emit('copy-text', { text: textContent });
                    }
                }
            },
            { id: 'separator-1', separator: true },
            {
                id: 'delete-highlight',
                label: '🗑️ Delete Highlight',
                action: () => this.emit('highlight-delete', { highlightId: highlightId })
            }
        ];

        this.showMenu(event, items);
    }

    /**
     * Show context menu for empty page areas
     */
    private showPageContextMenu(event: MouseEvent, pageWrapper: HTMLElement): void {
        const rect = pageWrapper.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        const items: ContextMenuItem[] = [
            {
                id: 'add-note',
                label: '📝 Add Note',
                action: () => this.emit('note-create', { 
                    position: { x: event.clientX, y: event.clientY },
                    pageElement: pageWrapper
                })
            },
            {
                id: 'draw-ink',
                label: '🖊️ Draw/Ink',
                action: () => this.emit('draw-mode', {})
            },
            { id: 'separator-1', separator: true },
            {
                id: 'page-tools',
                label: '📑 Page Tools',
                submenu: [
                    {
                        id: 'zoom-to-fit',
                        label: 'Zoom to Fit',
                        action: () => {
                            // Emit event for parent to handle
                            document.dispatchEvent(new CustomEvent('pdf-zoom-to-fit'));
                        }
                    },
                    {
                        id: 'zoom-to-width',
                        label: 'Zoom to Width',
                        action: () => {
                            document.dispatchEvent(new CustomEvent('pdf-zoom-to-width'));
                        }
                    }
                ]
            }
        ];

        this.showMenu(event, items);
    }

    /**
     * Show menu at specified position with given items
     */
    private showMenu(event: MouseEvent, items: ContextMenuItem[]): void {
        if (!this.menu) {
            return;
        }

        this.menu.innerHTML = '';
        this.buildMenuItems(this.menu, items);

        // Position menu
        const x = event.clientX;
        const y = event.clientY;
        
        this.menu.style.left = `${x}px`;
        this.menu.style.top = `${y}px`;
        this.menu.style.display = 'block';
        
        // Adjust position if menu goes off-screen
        setTimeout(() => {
            this.adjustMenuPosition();
        }, 0);

        this.isVisible = true;
    }

    /**
     * Build menu items DOM
     */
    private buildMenuItems(container: HTMLElement, items: ContextMenuItem[]): void {
        items.forEach(item => {
            if (item.separator) {
                const separator = document.createElement('div');
                separator.className = 'context-menu-separator';
                separator.style.cssText = `
                    height: 1px;
                    background: #e0e0e0;
                    margin: 4px 0;
                `;
                container.appendChild(separator);
                return;
            }

            const menuItem = document.createElement('div');
            menuItem.className = 'context-menu-item';
            menuItem.style.cssText = `
                padding: 8px 16px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: space-between;
                color: ${item.disabled ? '#999' : '#333'};
                ${item.disabled ? 'pointer-events: none;' : ''}
            `;

            const label = document.createElement('span');
            label.textContent = item.label;
            menuItem.appendChild(label);

            if (item.submenu) {
                const arrow = document.createElement('span');
                arrow.textContent = '►';
                arrow.style.marginLeft = '8px';
                menuItem.appendChild(arrow);

                // Create submenu
                const submenu = document.createElement('div');
                submenu.className = 'context-submenu';
                submenu.style.cssText = `
                    position: absolute;
                    left: 100%;
                    top: 0;
                    background: white;
                    border: 1px solid #ccc;
                    border-radius: 6px;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                    padding: 4px 0;
                    min-width: 150px;
                    display: none;
                `;

                this.buildMenuItems(submenu, item.submenu);
                menuItem.appendChild(submenu);

                // Show/hide submenu on hover
                menuItem.addEventListener('mouseenter', () => {
                    submenu.style.display = 'block';
                });
                
                menuItem.addEventListener('mouseleave', () => {
                    submenu.style.display = 'none';
                });
            }

            // Hover effects
            menuItem.addEventListener('mouseenter', () => {
                if (!item.disabled) {
                    menuItem.style.backgroundColor = '#f0f0f0';
                }
            });

            menuItem.addEventListener('mouseleave', () => {
                menuItem.style.backgroundColor = '';
            });

            // Click handler
            if (item.action && !item.disabled) {
                menuItem.addEventListener('click', (e) => {
                    e.stopPropagation();
                    item.action!();
                    this.hide();
                });
            }

            container.appendChild(menuItem);
        });
    }

    /**
     * Adjust menu position to stay within viewport
     */
    private adjustMenuPosition(): void {
        if (!this.menu) {
            return;
        }

        const menuRect = this.menu.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        let { left, top } = menuRect;

        // Adjust horizontal position
        if (left + menuRect.width > viewportWidth) {
            this.menu.style.left = `${viewportWidth - menuRect.width - 10}px`;
        }

        // Adjust vertical position
        if (top + menuRect.height > viewportHeight) {
            this.menu.style.top = `${viewportHeight - menuRect.height - 10}px`;
        }
    }

    /**
     * Hide the context menu
     */
    hide(): void {
        if (this.menu) {
            this.menu.style.display = 'none';
        }
        this.isVisible = false;
    }

    /**
     * Get text content from highlight element
     */
    private getHighlightText(highlightElement: HTMLElement): string {
        // This would need to be implemented based on how highlights store their text
        // For now, return a placeholder
        return highlightElement.getAttribute('data-text') || '';
    }

    /**
     * Event emission system
     */
    on<K extends keyof ContextMenuEvents>(event: K, callback: (data: ContextMenuEvents[K]) => void): void {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event)!.push(callback);
    }

    private emit<K extends keyof ContextMenuEvents>(event: K, data: ContextMenuEvents[K]): void {
        const listeners = this.eventListeners.get(event);
        if (listeners) {
            listeners.forEach(callback => callback(data));
        }
    }

    /**
     * Clean up
     */
    destroy(): void {
        if (this.menu) {
            this.menu.remove();
            this.menu = null;
        }
        this.eventListeners.clear();
    }
}
