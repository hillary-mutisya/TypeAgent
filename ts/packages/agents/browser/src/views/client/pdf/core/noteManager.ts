// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { PDFApiService } from '../services/pdfApiService';

/**
 * Note data structure
 */
export interface Note {
    id: string;
    documentId: string;
    page: number;
    content: string;
    contentType: 'markdown' | 'plain';
    coordinates: {
        x: number;
        y: number;
    };
    createdAt: string;
    updatedAt: string;
    userId?: string;
    selectedText?: string;
}

/**
 * Note Manager for creating and managing PDF annotations
 */
export class NoteManager {
    private notes: Map<string, Note> = new Map();
    private isNoteMode = false;
    private documentId: string | null = null;
    private pdfApiService: PDFApiService;
    private activePopup: HTMLElement | null = null;

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
     * Toggle note mode
     */
    toggleNoteMode(): void {
        this.isNoteMode = !this.isNoteMode;
        
        // Update cursor style
        const viewer = document.getElementById('viewerContainer');
        if (viewer) {
            if (this.isNoteMode) {
                viewer.style.cursor = 'crosshair';
                viewer.classList.add('note-mode');
            } else {
                viewer.style.cursor = 'default';
                viewer.classList.remove('note-mode');
            }
        }

        // Close any open popup
        this.closeNotePopup();

        // Dispatch mode change event
        const event = new CustomEvent('noteModeChanged', {
            detail: { isActive: this.isNoteMode }
        });
        document.dispatchEvent(event);
    }

    /**
     * Check if note mode is active
     */
    isNoteModeActive(): boolean {
        return this.isNoteMode;
    }

    /**
     * Setup event handlers
     */
    private setupEventHandlers(): void {
        // Handle clicks in note mode
        document.addEventListener('click', (event) => {
            if (this.isNoteMode) {
                this.handleNoteClick(event);
            }
        });

        // Close popup on outside click
        document.addEventListener('click', (event) => {
            if (this.activePopup && !this.activePopup.contains(event.target as Node)) {
                const target = event.target;
                if (target instanceof Element && !target.closest('.note-icon') && !target.closest('.note-popup')) {
                    this.closeNotePopup();
                }
            }
        });

        // Handle escape key
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                if (this.activePopup) {
                    this.closeNotePopup();
                } else if (this.isNoteMode) {
                    this.toggleNoteMode();
                }
            }
        });
    }    /**
     * Handle click in note mode
     */
    private handleNoteClick(event: MouseEvent): void {
        event.preventDefault();
        event.stopPropagation();

        const target = event.target;
        if (!(target instanceof Element)) {
            return;
        }
        
        // Don't create note if clicking on existing note or popup
        if (target.closest('.note-icon') || target.closest('.note-popup')) {
            return;
        }

        // Find page element
        const pageElement = target.closest('.page') as HTMLElement;
        if (!pageElement) {
            return;
        }

        const pageNum = this.getPageNumber(pageElement);
        if (!pageNum) {
            return;
        }

        // Get click coordinates relative to page
        const pageRect = pageElement.getBoundingClientRect();
        const coordinates = {
            x: event.clientX - pageRect.left,
            y: event.clientY - pageRect.top
        };

        // Create note
        this.createNote(pageNum, coordinates, event.clientX, event.clientY);
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
     * Create new note
     */
    private async createNote(
        pageNum: number, 
        coordinates: { x: number; y: number },
        screenX: number,
        screenY: number
    ): Promise<void> {
        if (!this.documentId) {
            console.error('No document ID set for note creation');
            return;
        }

        // Show note creation popup
        this.showNoteCreationPopup(pageNum, coordinates, screenX, screenY);
    }

    /**
     * Show note creation popup
     */
    private showNoteCreationPopup(
        pageNum: number,
        coordinates: { x: number; y: number },
        screenX: number,
        screenY: number,
        selectedText?: string
    ): void {
        // Close any existing popup
        this.closeNotePopup();

        // Create popup
        const popup = document.createElement('div');
        popup.className = 'note-popup note-creation-popup';
        popup.style.cssText = `
            position: fixed;
            left: ${Math.min(screenX, window.innerWidth - 300)}px;
            top: ${Math.min(screenY, window.innerHeight - 200)}px;
            background: white;
            border: 1px solid #ccc;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 10000;
            width: 280px;
            max-height: 300px;
            padding: 0;
            font-family: system-ui, -apple-system, sans-serif;
        `;

        // Create popup content
        const placeholder = selectedText 
            ? `Add a note about: "${selectedText.substring(0, 50)}${selectedText.length > 50 ? '...' : ''}"`
            : 'Enter your note...';

        popup.innerHTML = `
            <div style="padding: 16px; border-bottom: 1px solid #eee;">
                <h4 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600;">Add Note</h4>
                ${selectedText ? `<div style="background: #f8f9fa; border-left: 3px solid #007bff; padding: 8px; margin-bottom: 8px; font-size: 12px; color: #666;">Selected: "${selectedText.substring(0, 100)}${selectedText.length > 100 ? '...' : ''}"</div>` : ''}
                <textarea id="noteContent" placeholder="${placeholder}" style="
                    width: 100%;
                    height: 80px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    padding: 8px;
                    font-size: 13px;
                    resize: vertical;
                    outline: none;
                    font-family: inherit;
                "></textarea>
            </div>
            <div style="padding: 12px 16px; display: flex; justify-content: space-between; align-items: center;">
                <label style="font-size: 12px; color: #666;">
                    <input type="checkbox" id="useMarkdown" ${selectedText ? 'checked' : ''}> Use Markdown
                </label>
                <div style="display: flex; gap: 8px;">
                    <button id="cancelNote" style="
                        background: none;
                        border: 1px solid #ddd;
                        padding: 6px 12px;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 13px;
                    ">Cancel</button>
                    <button id="saveNote" style="
                        background: #007acc;
                        color: white;
                        border: none;
                        padding: 6px 12px;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 13px;
                    ">Save</button>
                </div>
            </div>
        `;

        document.body.appendChild(popup);
        this.activePopup = popup;

        // Focus textarea
        const textarea = popup.querySelector('#noteContent') as HTMLTextAreaElement;
        textarea.focus();

        // Setup event handlers
        const saveBtn = popup.querySelector('#saveNote') as HTMLButtonElement;
        const cancelBtn = popup.querySelector('#cancelNote') as HTMLButtonElement;
        const useMarkdownCheckbox = popup.querySelector('#useMarkdown') as HTMLInputElement;

        saveBtn.addEventListener('click', async () => {
            const content = textarea.value.trim();
            if (content) {
                const contentType = useMarkdownCheckbox.checked ? 'markdown' : 'plain';
                await this.saveNote(pageNum, coordinates, content, contentType, selectedText);
            }
            this.closeNotePopup();
        });

        cancelBtn.addEventListener('click', () => {
            this.closeNotePopup();
        });

        // Save on Enter with Ctrl
        textarea.addEventListener('keydown', async (event) => {
            if (event.key === 'Enter' && event.ctrlKey) {
                const content = textarea.value.trim();
                if (content) {
                    const contentType = useMarkdownCheckbox.checked ? 'markdown' : 'plain';
                    await this.saveNote(pageNum, coordinates, content, contentType, selectedText);
                }
                this.closeNotePopup();
            }
        });
    }

    /**
     * Save note to server and render
     */
    private async saveNote(
        pageNum: number,
        coordinates: { x: number; y: number },
        content: string,
        contentType: 'markdown' | 'plain' = 'plain',
        selectedText?: string
    ): Promise<void> {
        if (!this.documentId) {
            return;
        }

        try {
            // Create note data
            const noteData: Omit<Note, 'id' | 'createdAt' | 'updatedAt'> = {
                documentId: this.documentId,
                page: pageNum,
                content: content,
                contentType: contentType,
                coordinates: coordinates,
                selectedText: selectedText
            };

            // Save via API
            const savedNote = await this.pdfApiService.addNote(this.documentId, noteData);

            // Store locally
            this.notes.set(savedNote.id, savedNote);

            // Render note icon
            this.renderNoteIcon(savedNote);

            console.log('📝 Note created:', savedNote);

        } catch (error) {
            console.error('Failed to save note:', error);
        }
    }

    /**
     * Render note icon on page
     */
    private renderNoteIcon(note: Note): void {
        const pageElement = this.getPageElement(note.page);
        if (!pageElement) {
            console.error(`Page element not found for page ${note.page}`);
            return;
        }

        // Create note icon
        const noteIcon = document.createElement('div');
        noteIcon.className = 'note-icon';
        noteIcon.setAttribute('data-note-id', note.id);
        
        noteIcon.style.cssText = `
            position: absolute;
            left: ${note.coordinates.x - 12}px;
            top: ${note.coordinates.y - 12}px;
            width: 24px;
            height: 24px;
            background: #ffd700;
            border: 2px solid #e6c200;
            border-radius: 4px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
            z-index: 2;
            transition: transform 0.2s ease;
        `;

        // Add icon
        noteIcon.innerHTML = '📝';

        // Add to page
        pageElement.appendChild(noteIcon);

        // Add interaction handlers
        this.addNoteIconInteraction(noteIcon, note);
    }

    /**
     * Add interaction handlers to note icon
     */
    private addNoteIconInteraction(iconElement: HTMLElement, note: Note): void {
        // Click to view/edit note
        iconElement.addEventListener('click', (event) => {
            event.stopPropagation();
            this.showNoteViewPopup(note, event.clientX, event.clientY);
        });

        // Right-click context menu
        iconElement.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.showNoteContextMenu(event, note);
        });

        // Hover effects
        iconElement.addEventListener('mouseenter', () => {
            iconElement.style.transform = 'scale(1.1)';
        });

        iconElement.addEventListener('mouseleave', () => {
            iconElement.style.transform = 'scale(1)';
        });
    }

    /**
     * Show note view/edit popup
     */
    private showNoteViewPopup(note: Note, screenX: number, screenY: number): void {
        // Close any existing popup
        this.closeNotePopup();

        // Create popup
        const popup = document.createElement('div');
        popup.className = 'note-popup note-view-popup';
        popup.style.cssText = `
            position: fixed;
            left: ${Math.min(screenX, window.innerWidth - 300)}px;
            top: ${Math.min(screenY, window.innerHeight - 250)}px;
            background: white;
            border: 1px solid #ccc;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 10000;
            width: 280px;
            max-height: 300px;
            padding: 0;
            font-family: system-ui, -apple-system, sans-serif;
        `;

        // Format dates
        const createdDate = new Date(note.createdAt).toLocaleDateString();
        const updatedDate = new Date(note.updatedAt).toLocaleDateString();

        // Create popup content
        popup.innerHTML = `
            <div style="padding: 16px; border-bottom: 1px solid #eee;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                    <h4 style="margin: 0; font-size: 14px; font-weight: 600;">Note</h4>
                    <div style="display: flex; gap: 4px;">
                        <button id="editNote" style="
                            background: none;
                            border: none;
                            cursor: pointer;
                            padding: 4px;
                            border-radius: 4px;
                            font-size: 14px;
                        " title="Edit note">✏️</button>
                        <button id="deleteNote" style="
                            background: none;
                            border: none;
                            cursor: pointer;
                            padding: 4px;
                            border-radius: 4px;
                            font-size: 14px;
                            color: #dc3545;
                        " title="Delete note">🗑️</button>
                    </div>
                </div>
                <div id="noteDisplay" style="
                    background: #f8f9fa;
                    border: 1px solid #e9ecef;
                    border-radius: 4px;
                    padding: 8px;
                    font-size: 13px;
                    line-height: 1.4;
                    white-space: pre-wrap;
                    max-height: 120px;
                    overflow-y: auto;
                ">${note.content}</div>
                <textarea id="noteEditor" style="
                    width: 100%;
                    height: 120px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    padding: 8px;
                    font-size: 13px;
                    resize: vertical;
                    outline: none;
                    font-family: inherit;
                    display: none;
                ">${note.content}</textarea>
            </div>
            <div style="padding: 8px 16px; font-size: 11px; color: #666; border-bottom: 1px solid #eee;">
                Created: ${createdDate}${createdDate !== updatedDate ? ` • Updated: ${updatedDate}` : ''}
            </div>
            <div id="noteActions" style="padding: 12px 16px; display: flex; justify-content: flex-end; gap: 8px;">
                <button id="closeNote" style="
                    background: none;
                    border: 1px solid #ddd;
                    padding: 6px 12px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 13px;
                ">Close</button>
            </div>
            <div id="editActions" style="padding: 12px 16px; display: none; justify-content: flex-end; gap: 8px;">
                <button id="cancelEdit" style="
                    background: none;
                    border: 1px solid #ddd;
                    padding: 6px 12px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 13px;
                ">Cancel</button>
                <button id="saveEdit" style="
                    background: #007acc;
                    color: white;
                    border: none;
                    padding: 6px 12px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 13px;
                ">Save</button>
            </div>
        `;

        document.body.appendChild(popup);
        this.activePopup = popup;

        // Setup event handlers
        this.setupNoteViewHandlers(popup, note);
    }    /**
     * Show note context menu
     */
    private showNoteContextMenu(event: MouseEvent, note: Note): void {
        // Create context menu
        const menu = document.createElement('div');
        menu.className = 'note-context-menu';
        menu.style.cssText = `
            position: fixed;
            left: ${event.clientX}px;
            top: ${event.clientY}px;
            background: white;
            border: 1px solid #ccc;
            border-radius: 4px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
            z-index: 10000;
            min-width: 120px;
        `;

        // Add menu items
        const editItem = document.createElement('div');
        editItem.textContent = 'Edit Note';
        editItem.style.cssText = `
            padding: 8px 12px;
            cursor: pointer;
            border-bottom: 1px solid #eee;
        `;
        editItem.addEventListener('click', () => {
            this.showNoteViewPopup(note, event.clientX, event.clientY);
            menu.remove();
        });

        const deleteItem = document.createElement('div');
        deleteItem.textContent = 'Delete Note';
        deleteItem.style.cssText = `
            padding: 8px 12px;
            cursor: pointer;
            color: #dc3545;
        `;
        deleteItem.addEventListener('click', () => {
            if (confirm('Are you sure you want to delete this note?')) {
                this.deleteNote(note.id);
            }
            menu.remove();
        });

        menu.appendChild(editItem);
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
     * Update note content
     */
    async updateNote(noteId: string, content: string): Promise<void> {
        const note = this.notes.get(noteId);
        if (!note || !this.documentId) {
            return;
        }

        try {
            // Update on server
            const updatedNote = await this.pdfApiService.updateNote(
                this.documentId,
                noteId,
                { ...note, content, updatedAt: new Date().toISOString() }
            );

            // Update local storage
            this.notes.set(noteId, updatedNote);

            console.log('📝 Note updated:', noteId);

        } catch (error) {
            console.error('Failed to update note:', error);
        }
    }

    /**
     * Delete note
     */
    async deleteNote(noteId: string): Promise<void> {
        if (!this.documentId) {
            return;
        }

        try {
            // Delete from server
            await this.pdfApiService.deleteNote(this.documentId, noteId);

            // Remove from local storage
            this.notes.delete(noteId);

            // Remove from DOM
            const noteIcon = document.querySelector(`[data-note-id="${noteId}"]`);
            if (noteIcon) {
                noteIcon.remove();
            }

            console.log('🗑️ Note deleted:', noteId);

        } catch (error) {
            console.error('Failed to delete note:', error);
        }
    }

    /**
     * Close note popup
     */
    private closeNotePopup(): void {
        if (this.activePopup) {
            this.activePopup.remove();
            this.activePopup = null;
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
     * Load notes for document
     */
    async loadNotes(documentId: string): Promise<void> {
        try {
            const notes = await this.pdfApiService.getNotes(documentId);
            
            // Clear existing notes
            this.clearAllNotes();

            // Store and render notes
            notes.forEach((note: Note) => {
                this.notes.set(note.id, note);
                this.renderNoteIcon(note);
            });

            console.log(`📝 Loaded ${notes.length} notes`);

        } catch (error) {
            // Gracefully handle missing API endpoints during development
            if (error instanceof Error && error.message.includes('404')) {
                console.log('📝 No server-side note storage available yet');
                return;
            }
            console.error('Failed to load notes:', error);
        }
    }

    /**
     * Clear all notes
     */
    clearAllNotes(): void {
        // Remove from DOM
        document.querySelectorAll('.note-icon').forEach(el => el.remove());
        
        // Clear local storage
        this.notes.clear();
    }

    /**
     * Get all notes
     */
    getAllNotes(): Note[] {
        return Array.from(this.notes.values());
    }

    /**
     * Get notes for specific page
     */
    getNotesForPage(pageNum: number): Note[] {
        return this.getAllNotes().filter(n => n.page === pageNum);
    }

    /**
     * Create note from text selection (for integration with context menu and toolbar)
     */
    async createNoteFromSelection(
        selectedText: string, 
        pageWrapper: HTMLElement, 
        useMarkdownEditor = true
    ): Promise<void> {
        const pageNum = this.getPageNumberFromWrapper(pageWrapper);
        if (!pageNum) {
            console.error('Could not determine page number');
            return;
        }

        if (!this.documentId) {
            console.error('No document ID set for note creation');
            return;
        }

        if (useMarkdownEditor) {
            // Get selection position for note placement
            const selection = window.getSelection();
            let coordinates = { x: 100, y: 100 }; // Default position
            
            if (selection && selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                const rect = range.getBoundingClientRect();
                const pageRect = pageWrapper.getBoundingClientRect();
                coordinates = {
                    x: rect.left - pageRect.left,
                    y: rect.top - pageRect.top
                };
            }

            // Let the markdown editor handle the blockquote formatting
            // Pass selectedText for the editor to format, don't pre-format it
            const event = new CustomEvent('show-markdown-editor', {
                detail: {
                    pageNumber: pageNum,
                    position: coordinates,
                    initialContent: '', // Empty initial content
                    selectedText: selectedText // Let editor format this as blockquote
                }
            });
            document.dispatchEvent(event);
        } else {
            // Use simple popup editor
            this.showNoteCreationPopup(pageNum, { x: 100, y: 100 }, 200, 200, selectedText);
        }
    }

    /**
     * Create note with markdown content (for integration with markdown editor)
     */
    async createNoteWithContent(
        pageNum: number,
        coordinates: { x: number; y: number },
        content: string,
        contentType: 'markdown' | 'plain' = 'markdown',
        selectedText?: string
    ): Promise<void> {
        if (!this.documentId) {
            console.error('No document ID set for note creation');
            return;
        }

        try {
            // Create note data
            const noteData: Omit<Note, 'id' | 'createdAt' | 'updatedAt'> = {
                documentId: this.documentId,
                page: pageNum,
                content: content,
                contentType: contentType,
                coordinates: coordinates,
                selectedText: selectedText
            };

            // Save via API
            const savedNote = await this.pdfApiService.addNote(this.documentId, noteData);

            // Store locally
            this.notes.set(savedNote.id, savedNote);

            // Render note icon
            this.renderNoteIcon(savedNote);

            console.log('📝 Note created:', savedNote);

            // Emit success event
            const event = new CustomEvent('note-created', {
                detail: { note: savedNote }
            });
            document.dispatchEvent(event);

        } catch (error) {
            console.error('Failed to save note:', error);
        }
    }

    /**
     * Get page number from page wrapper element
     */
    private getPageNumberFromWrapper(pageWrapper: HTMLElement): number | null {
        // First try data attribute
        const pageAttr = pageWrapper.getAttribute('data-page-number');
        if (pageAttr) {
            return parseInt(pageAttr, 10);
        }

        // Look for child page element with data attribute
        const pageElement = pageWrapper.querySelector('.page[data-page-number]') as HTMLElement;
        if (pageElement) {
            const pageNum = pageElement.getAttribute('data-page-number');
            if (pageNum) {
                return parseInt(pageNum, 10);
            }
        }

        // Fallback: find by position in container
        const container = document.getElementById('viewerContainer') || document.getElementById('pdfContainer');
        if (container) {
            const pageWrappers = container.querySelectorAll('.page-wrapper');
            for (let i = 0; i < pageWrappers.length; i++) {
                if (pageWrappers[i] === pageWrapper) {
                    return i + 1;
                }
            }
        }

        return null;
    }

    /**
     * Search notes by content
     */
    searchNotes(query: string): Note[] {
        const lowercaseQuery = query.toLowerCase();
        return this.getAllNotes().filter(note =>
            note.content.toLowerCase().includes(lowercaseQuery)
        );
    }
}
