// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Markdown Note Editor Events
 */
export interface MarkdownNoteEditorEvents {
    'note-saved': { 
        content: string; 
        contentType: 'markdown' | 'plain';
        position: { x: number; y: number };
        pageNumber: number;
        selectedText?: string;
    };
    'note-cancelled': {};
}

/**
 * Markdown Note Editor
 * Rich markdown editor with live preview, blockquote integration, and split-pane interface
 */
export class MarkdownNoteEditor {
    private modal: HTMLElement | null = null;
    private editor: HTMLTextAreaElement | null = null;
    private preview: HTMLElement | null = null;
    private isVisible = false;
    private eventListeners: Map<keyof MarkdownNoteEditorEvents, ((event: any) => void)[]> = new Map();
    private currentPosition: { x: number; y: number } = { x: 0, y: 0 };
    private currentPageNumber = 1;
    private initialSelectedText = '';

    constructor() {
        this.createModal();
        this.setupEventHandlers();
    }

    /**
     * Create the modal editor
     */
    private createModal(): void {
        // Create modal backdrop
        this.modal = document.createElement('div');
        this.modal.className = 'markdown-note-editor-modal';
        this.modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            z-index: 10003;
            display: none;
            align-items: center;
            justify-content: center;
            backdrop-filter: blur(4px);
        `;

        // Create editor container
        const editorContainer = document.createElement('div');
        editorContainer.className = 'markdown-editor-container';
        editorContainer.style.cssText = `
            background: white;
            border-radius: 12px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
            width: 90%;
            max-width: 1000px;
            height: 80%;
            max-height: 700px;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        `;

        // Create content areas
        const header = this.createHeader();
        const content = this.createContent();
        const footer = this.createFooter();

        editorContainer.appendChild(header);
        editorContainer.appendChild(content);
        editorContainer.appendChild(footer);

        this.modal.appendChild(editorContainer);
        document.body.appendChild(this.modal);
    }

    private createHeader(): HTMLElement {
        const header = document.createElement('div');
        header.style.cssText = `
            padding: 16px 20px;
            border-bottom: 1px solid #e0e0e0;
            display: flex;
            align-items: center;
            justify-content: space-between;
            background: #f8f9fa;
            border-radius: 12px 12px 0 0;
        `;

        const title = document.createElement('h3');
        title.textContent = 'Add Note';
        title.style.margin = '0';

        const closeButton = document.createElement('button');
        closeButton.innerHTML = '✕';
        closeButton.style.cssText = `
            background: none;
            border: none;
            font-size: 20px;
            cursor: pointer;
        `;
        closeButton.addEventListener('click', () => this.cancel());

        header.appendChild(title);
        header.appendChild(closeButton);
        return header;
    }

    private createContent(): HTMLElement {
        const content = document.createElement('div');
        content.style.cssText = `
            flex: 1;
            display: flex;
            min-height: 0;
        `;

        // Editor pane
        const editorPane = document.createElement('div');
        editorPane.style.cssText = `
            flex: 1;
            display: flex;
            flex-direction: column;
        `;

        this.editor = document.createElement('textarea');
        this.editor.placeholder = 'Write your note in Markdown...';
        this.editor.style.cssText = `
            flex: 1;
            border: none;
            padding: 16px;
            font-family: monospace;
            font-size: 14px;
            resize: none;
            outline: none;
        `;
        this.editor.addEventListener('input', () => this.updatePreview());

        // Preview pane
        const previewPane = document.createElement('div');
        previewPane.style.cssText = `
            flex: 1;
            border-left: 1px solid #e0e0e0;
            display: flex;
            flex-direction: column;
        `;

        const previewHeader = document.createElement('div');
        previewHeader.textContent = 'Preview';
        previewHeader.style.cssText = `
            padding: 8px 16px;
            border-bottom: 1px solid #e0e0e0;
            font-weight: 600;
            background: white;
        `;

        this.preview = document.createElement('div');
        this.preview.style.cssText = `
            flex: 1;
            padding: 16px;
            overflow-y: auto;
            background: white;
        `;

        editorPane.appendChild(this.editor);
        previewPane.appendChild(previewHeader);
        previewPane.appendChild(this.preview);
        content.appendChild(editorPane);
        content.appendChild(previewPane);

        return content;
    }

    private createFooter(): HTMLElement {
        const footer = document.createElement('div');
        footer.style.cssText = `
            padding: 16px 20px;
            border-top: 1px solid #e0e0e0;
            display: flex;
            justify-content: flex-end;
            gap: 12px;
            background: #f8f9fa;
        `;

        const cancelButton = document.createElement('button');
        cancelButton.textContent = 'Cancel';
        cancelButton.style.cssText = `
            padding: 8px 16px;
            border: 1px solid #ddd;
            background: white;
            cursor: pointer;
        `;
        cancelButton.addEventListener('click', () => this.cancel());

        const saveButton = document.createElement('button');
        saveButton.textContent = 'Save Note';
        saveButton.style.cssText = `
            padding: 8px 16px;
            border: none;
            background: #007bff;
            color: white;
            cursor: pointer;
        `;
        saveButton.addEventListener('click', () => this.save());

        footer.appendChild(cancelButton);
        footer.appendChild(saveButton);
        return footer;
    }

    private setupEventHandlers(): void {
        document.addEventListener('keydown', (e) => {
            if (!this.isVisible) return;
            if (e.key === 'Escape') this.cancel();
            if (e.ctrlKey && e.key === 'Enter') this.save();
        });
    }

    private updatePreview(): void {
        if (!this.preview || !this.editor) return;
        const markdown = this.editor.value;
        const html = this.markdownToHtml(markdown);
        this.preview.innerHTML = html;
    }

    private markdownToHtml(markdown: string): string {
        let html = markdown;
        html = html.replace(/^# (.*$)/gm, '<h1>$1</h1>');
        html = html.replace(/^## (.*$)/gm, '<h2>$1</h2>');
        html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
        html = html.replace(/^> (.*)$/gm, '<blockquote>$1</blockquote>');
        html = html.replace(/\n/g, '<br>');
        return html;
    }

    show(pageNumber: number, position: { x: number; y: number }, initialContent = '', selectedText = ''): void {
        if (!this.modal || !this.editor) return;

        this.currentPageNumber = pageNumber;
        this.currentPosition = position;
        this.initialSelectedText = selectedText;

        if (selectedText) {
            const blockquote = selectedText.split('\n').map(line => `> ${line}`).join('\n');
            this.editor.value = `${blockquote}\n\n${initialContent}`;
        } else {
            this.editor.value = initialContent;
        }

        this.updatePreview();
        this.modal.style.display = 'flex';
        this.isVisible = true;
        setTimeout(() => this.editor?.focus(), 100);
    }

    private save(): void {
        if (!this.editor) return;
        const content = this.editor.value.trim();
        if (!content) {
            this.cancel();
            return;
        }

        this.emit('note-saved', {
            content: content,
            contentType: 'markdown' as const,
            position: this.currentPosition,
            pageNumber: this.currentPageNumber,
            selectedText: this.initialSelectedText || undefined
        });

        this.hide();
    }

    private cancel(): void {
        this.emit('note-cancelled', {});
        this.hide();
    }

    private hide(): void {
        if (this.modal) {
            this.modal.style.display = 'none';
        }
        this.isVisible = false;
        if (this.editor) {
            this.editor.value = '';
        }
        if (this.preview) {
            this.preview.innerHTML = '';
        }
    }

    on<K extends keyof MarkdownNoteEditorEvents>(event: K, callback: (data: MarkdownNoteEditorEvents[K]) => void): void {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event)!.push(callback);
    }

    private emit<K extends keyof MarkdownNoteEditorEvents>(event: K, data: MarkdownNoteEditorEvents[K]): void {
        const listeners = this.eventListeners.get(event);
        if (listeners) {
            listeners.forEach(callback => callback(data));
        }
    }

    public isCurrentlyVisible(): boolean {
        return this.isVisible;
    }

    destroy(): void {
        if (this.modal) {
            this.modal.remove();
            this.modal = null;
        }
        this.editor = null;
        this.preview = null;
        this.eventListeners.clear();
    }
}
