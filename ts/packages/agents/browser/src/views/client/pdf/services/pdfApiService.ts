// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * PDF API Service for communicating with the TypeAgent PDF server
 */
export class PDFApiService {
    private baseUrl = "/api/pdf";

    /**
     * Get document metadata
     */
    async getDocument(documentId: string): Promise<any> {
        const response = await fetch(`${this.baseUrl}/${documentId}`);

        if (!response.ok) {
            throw new Error(`Failed to get document: ${response.statusText}`);
        }

        return response.json();
    }

    /**
     * Get all documents
     */
    async getDocuments(): Promise<any[]> {
        const response = await fetch(`${this.baseUrl}/documents`);

        if (!response.ok) {
            throw new Error(`Failed to get documents: ${response.statusText}`);
        }

        return response.json();
    }

    /**
     * Get annotations for a document
     */
    async getAnnotations(documentId: string): Promise<any[]> {
        const response = await fetch(
            `${this.baseUrl}/${documentId}/annotations`,
        );

        if (!response.ok) {
            throw new Error(
                `Failed to get annotations: ${response.statusText}`,
            );
        }

        return response.json();
    }

    /**
     * Add annotation to a document
     */
    async addAnnotation(documentId: string, annotation: any): Promise<any> {
        const response = await fetch(
            `${this.baseUrl}/${documentId}/annotations`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(annotation),
            },
        );

        if (!response.ok) {
            throw new Error(`Failed to add annotation: ${response.statusText}`);
        }

        return response.json();
    }

    /**
     * Update annotation
     */
    async updateAnnotation(
        documentId: string,
        annotationId: string,
        annotation: any,
    ): Promise<any> {
        const response = await fetch(
            `${this.baseUrl}/${documentId}/annotations/${annotationId}`,
            {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(annotation),
            },
        );

        if (!response.ok) {
            throw new Error(
                `Failed to update annotation: ${response.statusText}`,
            );
        }

        return response.json();
    }

    /**
     * Delete annotation
     */
    async deleteAnnotation(
        documentId: string,
        annotationId: string,
    ): Promise<void> {
        const response = await fetch(
            `${this.baseUrl}/${documentId}/annotations/${annotationId}`,
            {
                method: "DELETE",
            },
        );

        if (!response.ok) {
            throw new Error(
                `Failed to delete annotation: ${response.statusText}`,
            );
        }
    }

    /**
     * Get bookmarks for a document
     */
    async getBookmarks(documentId: string): Promise<any[]> {
        const response = await fetch(`${this.baseUrl}/${documentId}/bookmarks`);

        if (!response.ok) {
            throw new Error(`Failed to get bookmarks: ${response.statusText}`);
        }

        return response.json();
    }

    /**
     * Add bookmark to a document
     */
    async addBookmark(documentId: string, bookmark: any): Promise<any> {
        const response = await fetch(
            `${this.baseUrl}/${documentId}/bookmarks`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(bookmark),
            },
        );

        if (!response.ok) {
            throw new Error(`Failed to add bookmark: ${response.statusText}`);
        }

        return response.json();
    }

    /**
     * Delete bookmark
     */
    async deleteBookmark(
        documentId: string,
        bookmarkId: string,
    ): Promise<void> {
        const response = await fetch(
            `${this.baseUrl}/${documentId}/bookmarks/${bookmarkId}`,
            {
                method: "DELETE",
            },
        );

        if (!response.ok) {
            throw new Error(
                `Failed to delete bookmark: ${response.statusText}`,
            );
        }
    }

    /**
     * Update user presence
     */
    async updatePresence(documentId: string, presence: any): Promise<any> {
        const response = await fetch(`${this.baseUrl}/${documentId}/presence`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(presence),
        });

        if (!response.ok) {
            throw new Error(
                `Failed to update presence: ${response.statusText}`,
            );
        }

        return response.json();
    }

    /**
     * Get user presence for a document
     */
    async getPresence(documentId: string): Promise<any[]> {
        const response = await fetch(`${this.baseUrl}/${documentId}/presence`);

        if (!response.ok) {
            throw new Error(`Failed to get presence: ${response.statusText}`);
        }

        return response.json();
    }

    /**
     * Highlight-specific API methods
     */
    async getHighlights(documentId: string): Promise<any[]> {
        const response = await fetch(`${this.baseUrl}/${documentId}/highlights`);

        if (!response.ok) {
            throw new Error(`Failed to get highlights: ${response.statusText}`);
        }

        return response.json();
    }

    async addHighlight(documentId: string, highlight: any): Promise<any> {
        const response = await fetch(`${this.baseUrl}/${documentId}/highlights`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(highlight),
        });

        if (!response.ok) {
            throw new Error(`Failed to add highlight: ${response.statusText}`);
        }

        return response.json();
    }

    async updateHighlight(documentId: string, highlightId: string, highlight: any): Promise<any> {
        const response = await fetch(`${this.baseUrl}/${documentId}/highlights/${highlightId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(highlight),
        });

        if (!response.ok) {
            throw new Error(`Failed to update highlight: ${response.statusText}`);
        }

        return response.json();
    }

    async deleteHighlight(documentId: string, highlightId: string): Promise<void> {
        const response = await fetch(`${this.baseUrl}/${documentId}/highlights/${highlightId}`, {
            method: 'DELETE',
        });

        if (!response.ok) {
            throw new Error(`Failed to delete highlight: ${response.statusText}`);
        }
    }

    /**
     * Note-specific API methods
     */
    async getNotes(documentId: string): Promise<any[]> {
        const response = await fetch(`${this.baseUrl}/${documentId}/notes`);

        if (!response.ok) {
            throw new Error(`Failed to get notes: ${response.statusText}`);
        }

        return response.json();
    }

    async addNote(documentId: string, note: any): Promise<any> {
        const response = await fetch(`${this.baseUrl}/${documentId}/notes`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(note),
        });

        if (!response.ok) {
            throw new Error(`Failed to add note: ${response.statusText}`);
        }

        return response.json();
    }

    async updateNote(documentId: string, noteId: string, note: any): Promise<any> {
        const response = await fetch(`${this.baseUrl}/${documentId}/notes/${noteId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(note),
        });

        if (!response.ok) {
            throw new Error(`Failed to update note: ${response.statusText}`);
        }

        return response.json();
    }

    async deleteNote(documentId: string, noteId: string): Promise<void> {
        const response = await fetch(`${this.baseUrl}/${documentId}/notes/${noteId}`, {
            method: 'DELETE',
        });

        if (!response.ok) {
            throw new Error(`Failed to delete note: ${response.statusText}`);
        }
    }

    /**
     * Drawing-specific API methods
     */
    async getDrawings(documentId: string): Promise<any[]> {
        const response = await fetch(`${this.baseUrl}/${documentId}/drawings`);

        if (!response.ok) {
            throw new Error(`Failed to get drawings: ${response.statusText}`);
        }

        return response.json();
    }

    async addDrawing(documentId: string, drawing: any): Promise<any> {
        const response = await fetch(`${this.baseUrl}/${documentId}/drawings`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(drawing),
        });

        if (!response.ok) {
            throw new Error(`Failed to add drawing: ${response.statusText}`);
        }

        return response.json();
    }

    async updateDrawing(documentId: string, drawingId: string, drawing: any): Promise<any> {
        const response = await fetch(`${this.baseUrl}/${documentId}/drawings/${drawingId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(drawing),
        });

        if (!response.ok) {
            throw new Error(`Failed to update drawing: ${response.statusText}`);
        }

        return response.json();
    }

    async deleteDrawing(documentId: string, drawingId: string): Promise<void> {
        const response = await fetch(`${this.baseUrl}/${documentId}/drawings/${drawingId}`, {
            method: 'DELETE',
        });

        if (!response.ok) {
            throw new Error(`Failed to delete drawing: ${response.statusText}`);
        }
    }

    /**
     * Text extraction for search and selection
     */
    async extractText(documentId: string, pageNum?: number): Promise<any> {
        const url = pageNum 
            ? `${this.baseUrl}/${documentId}/text?page=${pageNum}`
            : `${this.baseUrl}/${documentId}/text`;
            
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Failed to extract text: ${response.statusText}`);
        }

        return response.json();
    }

    /**
     * Search within document
     */
    async searchDocument(documentId: string, query: string): Promise<any[]> {
        const response = await fetch(`${this.baseUrl}/${documentId}/search?q=${encodeURIComponent(query)}`);

        if (!response.ok) {
            throw new Error(`Failed to search document: ${response.statusText}`);
        }

        return response.json();
    }
}
