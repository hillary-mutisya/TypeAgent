// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type { PDFHighlight, PDFNote, PDFDrawing, PDFAnnotationListItem } from '../../shared/types';

/**
 * Annotation Sidebar Component for managing and viewing annotations
 */
export class AnnotationSidebar {
    private isVisible = false;
    private sidebarElement: HTMLElement | null = null;
    private annotationList: HTMLElement | null = null;
    private searchInput: HTMLInputElement | null = null;
    private filterButtons: NodeListOf<HTMLButtonElement> | null = null;
    private currentFilter = 'all';
    private currentSearchQuery = '';

    constructor() {
        this.createSidebar();
        this.setupEventHandlers();
    }

    /**
     * Create the sidebar DOM structure
     */
    private createSidebar(): void {
        // Create sidebar container
        this.sidebarElement = document.createElement('div');
        this.sidebarElement.id = 'annotationSidebar';
        this.sidebarElement.className = 'annotation-sidebar hidden';
        
        this.sidebarElement.innerHTML = `
            <div class="sidebar-header">
                <h3>Annotations</h3>
                <div class="sidebar-controls">
                    <button id="sidebarClose" class="close-button" title="Close sidebar">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
            
            <div class="sidebar-toolbar">
                <div class="search-container">
                    <input type="text" id="annotationSearch" placeholder="Search annotations..." class="search-input">
                    <i class="fas fa-search search-icon"></i>
                </div>
                
                <div class="filter-buttons">
                    <button class="filter-btn active" data-filter="all">All</button>
                    <button class="filter-btn" data-filter="highlight">Highlights</button>
                    <button class="filter-btn" data-filter="note">Notes</button>
                    <button class="filter-btn" data-filter="drawing">Drawings</button>
                </div>
            </div>
            
            <div class="annotation-list" id="annotationList">
                <div class="empty-state">
                    <i class="fas fa-sticky-note"></i>
                    <p>No annotations yet</p>
                    <small>Start highlighting, adding notes, or drawing to see them here</small>
                </div>
            </div>
            
            <div class="sidebar-footer">
                <div class="annotation-stats" id="annotationStats">
                    <span>0 annotations</span>
                </div>
                <div class="sidebar-actions">
                    <button id="exportAnnotations" class="action-button" title="Export annotations">
                        <i class="fas fa-download"></i>
                    </button>
                    <button id="clearAllAnnotations" class="action-button danger" title="Clear all annotations">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;

        // Add styles
        this.addStyles();

        // Append to body
        document.body.appendChild(this.sidebarElement);

        // Cache important elements
        this.annotationList = document.getElementById('annotationList');
        this.searchInput = document.getElementById('annotationSearch') as HTMLInputElement;
        this.filterButtons = document.querySelectorAll('.filter-btn');
    }    /**
     * Add CSS styles for the sidebar
     */
    private addStyles(): void {
        const style = document.createElement('style');
        style.textContent = `
            .annotation-sidebar {
                position: fixed;
                top: 0;
                right: 0;
                width: 300px;
                height: 100vh;
                background: #f8f9fa;
                border-left: 1px solid #dee2e6;
                box-shadow: -2px 0 8px rgba(0,0,0,0.1);
                z-index: 1000;
                display: flex;
                flex-direction: column;
                transform: translateX(100%);
                transition: transform 0.3s ease;
                font-family: system-ui, -apple-system, sans-serif;
            }

            .annotation-sidebar:not(.hidden) {
                transform: translateX(0);
            }

            .sidebar-header {
                padding: 16px;
                border-bottom: 1px solid #dee2e6;
                background: white;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            .sidebar-header h3 {
                margin: 0;
                font-size: 16px;
                font-weight: 600;
                color: #333;
            }

            .close-button {
                background: none;
                border: none;
                font-size: 16px;
                color: #666;
                cursor: pointer;
                padding: 4px;
                border-radius: 4px;
                transition: background-color 0.2s ease;
            }

            .close-button:hover {
                background: #f0f0f0;
            }

            .sidebar-toolbar {
                padding: 12px;
                border-bottom: 1px solid #dee2e6;
                background: white;
            }

            .search-container {
                position: relative;
                margin-bottom: 12px;
            }

            .search-input {
                width: 100%;
                padding: 8px 32px 8px 12px;
                border: 1px solid #ccc;
                border-radius: 4px;
                font-size: 14px;
                outline: none;
            }

            .search-input:focus {
                border-color: #007acc;
            }

            .search-icon {
                position: absolute;
                right: 10px;
                top: 50%;
                transform: translateY(-50%);
                color: #666;
                font-size: 14px;
            }

            .filter-buttons {
                display: flex;
                gap: 4px;
            }

            .filter-btn {
                flex: 1;
                padding: 6px 8px;
                border: 1px solid #ccc;
                background: white;
                color: #666;
                font-size: 12px;
                border-radius: 4px;
                cursor: pointer;
                transition: all 0.2s ease;
            }

            .filter-btn.active,
            .filter-btn:hover {
                background: #007acc;
                color: white;
                border-color: #007acc;
            }

            .annotation-list {
                flex: 1;
                overflow-y: auto;
                padding: 8px;
            }

            .empty-state {
                text-align: center;
                padding: 40px 20px;
                color: #666;
            }

            .empty-state i {
                font-size: 48px;
                color: #ccc;
                margin-bottom: 16px;
            }

            .empty-state p {
                font-size: 16px;
                margin: 0 0 8px 0;
            }

            .empty-state small {
                font-size: 14px;
                color: #999;
            }

            .annotation-item {
                background: white;
                border: 1px solid #e0e0e0;
                border-radius: 6px;
                padding: 12px;
                margin-bottom: 8px;
                cursor: pointer;
                transition: all 0.2s ease;
                position: relative;
            }

            .annotation-item:hover {
                border-color: #007acc;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }

            .annotation-item.selected {
                border-color: #007acc;
                background: #f0f8ff;
            }

            .annotation-type {
                display: inline-block;
                padding: 2px 6px;
                border-radius: 3px;
                font-size: 10px;
                font-weight: 600;
                text-transform: uppercase;
                margin-bottom: 6px;
            }

            .annotation-type.highlight {
                background: #fff3cd;
                color: #856404;
            }

            .annotation-type.note {
                background: #d4edda;
                color: #155724;
            }

            .annotation-type.drawing {
                background: #cce7ff;
                color: #0c4a6e;
            }

            .annotation-preview {
                font-size: 14px;
                line-height: 1.4;
                color: #333;
                margin-bottom: 6px;
                overflow: hidden;
                display: -webkit-box;
                -webkit-line-clamp: 3;
                -webkit-box-orient: vertical;
            }

            .annotation-meta {
                font-size: 12px;
                color: #666;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            .annotation-page {
                background: #f0f0f0;
                padding: 2px 6px;
                border-radius: 3px;
                font-weight: 500;
            }

            .sidebar-footer {
                padding: 12px;
                border-top: 1px solid #dee2e6;
                background: white;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            .annotation-stats {
                font-size: 12px;
                color: #666;
            }

            .sidebar-actions {
                display: flex;
                gap: 8px;
            }

            .action-button {
                background: none;
                border: 1px solid #ccc;
                padding: 6px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
                color: #666;
                transition: all 0.2s ease;
            }

            .action-button:hover {
                background: #f0f0f0;
                border-color: #999;
            }

            .action-button.danger:hover {
                background: #dc3545;
                border-color: #dc3545;
                color: white;
            }

            /* Responsive */
            @media (max-width: 768px) {
                .annotation-sidebar {
                    width: 100%;
                }
            }
        `;
        
        document.head.appendChild(style);
    }

    /**
     * Setup event handlers
     */
    private setupEventHandlers(): void {
        if (!this.sidebarElement) return;

        // Close button
        const closeBtn = this.sidebarElement.querySelector('#sidebarClose');
        closeBtn?.addEventListener('click', () => this.hide());

        // Search input
        if (this.searchInput) {
            this.searchInput.addEventListener('input', (e) => {
                this.currentSearchQuery = (e.target as HTMLInputElement).value;
                this.refreshList();
            });
        }

        // Filter buttons
        this.filterButtons?.forEach(btn => {
            btn.addEventListener('click', () => {
                this.filterButtons?.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentFilter = btn.getAttribute('data-filter') || 'all';
                this.refreshList();
            });
        });

        // Export annotations
        const exportBtn = this.sidebarElement.querySelector('#exportAnnotations');
        exportBtn?.addEventListener('click', () => this.exportAnnotations());

        // Clear all annotations
        const clearBtn = this.sidebarElement.querySelector('#clearAllAnnotations');
        clearBtn?.addEventListener('click', () => this.clearAllAnnotations());

        // Listen for annotation updates
        document.addEventListener('annotationAdded', () => this.refreshList());
        document.addEventListener('annotationDeleted', () => this.refreshList());
        document.addEventListener('annotationUpdated', () => this.refreshList());
    }

    /**
     * Show the sidebar
     */
    show(): void {
        if (this.sidebarElement) {
            this.sidebarElement.classList.remove('hidden');
            this.isVisible = true;
            this.refreshList();
        }
    }

    /**
     * Hide the sidebar
     */
    hide(): void {
        if (this.sidebarElement) {
            this.sidebarElement.classList.add('hidden');
            this.isVisible = false;
        }
    }

    /**
     * Toggle sidebar visibility
     */
    toggle(): void {
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }

    /**
     * Check if sidebar is visible
     */
    isShowing(): boolean {
        return this.isVisible;
    }

    /**
     * Refresh the annotation list
     */
    refreshList(): void {
        if (!this.annotationList) return;

        // Get annotations from annotation manager
        const event = new CustomEvent('getAnnotations', {
            detail: { 
                filter: this.currentFilter,
                search: this.currentSearchQuery
            }
        });
        document.dispatchEvent(event);
    }

    /**
     * Update the annotation list with new data
     */
    updateAnnotations(annotations: PDFAnnotationListItem[]): void {
        if (!this.annotationList) return;

        // Update stats
        this.updateStats(annotations);

        if (annotations.length === 0) {
            this.showEmptyState();
            return;
        }

        // Clear current list
        this.annotationList.innerHTML = '';

        // Add annotation items
        annotations.forEach(annotation => {
            const item = this.createAnnotationItem(annotation);
            this.annotationList!.appendChild(item);
        });
    }

    /**
     * Create annotation list item element
     */
    private createAnnotationItem(annotation: PDFAnnotationListItem): HTMLElement {
        const item = document.createElement('div');
        item.className = 'annotation-item';
        item.setAttribute('data-annotation-id', annotation.id);
        item.setAttribute('data-annotation-type', annotation.type);

        const typeClass = annotation.type;
        const createdDate = new Date(annotation.createdAt).toLocaleDateString();

        item.innerHTML = `
            <div class="annotation-type ${typeClass}">${annotation.type}</div>
            <div class="annotation-preview">${annotation.preview}</div>
            <div class="annotation-meta">
                <span class="annotation-page">Page ${annotation.page}</span>
                <span class="annotation-date">${createdDate}</span>
            </div>
        `;

        // Add click handler
        item.addEventListener('click', () => {
            this.selectAnnotation(annotation);
        });

        return item;
    }

    /**
     * Show empty state
     */
    private showEmptyState(): void {
        if (!this.annotationList) return;

        this.annotationList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-sticky-note"></i>
                <p>No annotations found</p>
                <small>Try adjusting your search or filter</small>
            </div>
        `;
    }

    /**
     * Update annotation statistics
     */
    private updateStats(annotations: PDFAnnotationListItem[]): void {
        const statsElement = this.sidebarElement?.querySelector('#annotationStats span');
        if (statsElement) {
            const count = annotations.length;
            statsElement.textContent = `${count} annotation${count !== 1 ? 's' : ''}`;
        }
    }

    /**
     * Select annotation and navigate to it
     */
    private selectAnnotation(annotation: PDFAnnotationListItem): void {
        // Remove previous selection
        this.annotationList?.querySelectorAll('.annotation-item').forEach(item => {
            item.classList.remove('selected');
        });

        // Select current item
        const item = this.annotationList?.querySelector(`[data-annotation-id="${annotation.id}"]`);
        item?.classList.add('selected');

        // Dispatch selection event
        const event = new CustomEvent('annotationItemSelected', {
            detail: annotation
        });
        document.dispatchEvent(event);
    }

    /**
     * Export annotations
     */
    private exportAnnotations(): void {
        const event = new CustomEvent('exportAnnotationsRequested');
        document.dispatchEvent(event);
    }

    /**
     * Clear all annotations
     */
    private clearAllAnnotations(): void {
        if (confirm('Are you sure you want to delete all annotations? This action cannot be undone.')) {
            const event = new CustomEvent('clearAllAnnotationsRequested');
            document.dispatchEvent(event);
        }
    }

    /**
     * Update search query
     */
    setSearchQuery(query: string): void {
        this.currentSearchQuery = query;
        if (this.searchInput) {
            this.searchInput.value = query;
        }
        this.refreshList();
    }

    /**
     * Set filter
     */
    setFilter(filter: string): void {
        this.currentFilter = filter;
        
        // Update filter buttons
        this.filterButtons?.forEach(btn => {
            btn.classList.remove('active');
            if (btn.getAttribute('data-filter') === filter) {
                btn.classList.add('active');
            }
        });

        this.refreshList();
    }

    /**
     * Destroy the sidebar
     */
    destroy(): void {
        if (this.sidebarElement) {
            this.sidebarElement.remove();
            this.sidebarElement = null;
        }
    }
}
