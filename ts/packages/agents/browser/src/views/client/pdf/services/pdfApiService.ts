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
     * Register a PDF document from URL and get document ID
     */
    async registerUrlDocument(url: string): Promise<any> {
        const response = await fetch(`${this.baseUrl}/register-url`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url }),
        });

        if (!response.ok) {
            throw new Error(`Failed to register URL document: ${response.statusText}`);
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
        const response = await fetch(`${this.baseUrl}/${documentId}/annotations`);

        if (!response.ok) {
            throw new Error(`Failed to get highlights: ${response.statusText}`);
        }

        const annotations = await response.json();
        // Filter to only highlight annotations and transform back to frontend format
        return annotations
            .filter((annotation: any) => annotation.type === 'highlight')
            .map((annotation: any) => {
                // Transform server annotation format back to frontend highlight format
                const highlight = {
                    id: annotation.id,
                    page: annotation.page,
                    color: annotation.color,
                    selectedText: annotation.content,
                    createdAt: annotation.createdAt,
                    updatedAt: annotation.updatedAt
                };

                // Restore coordinates array from highlightData if available, otherwise create array from single coordinate
                if (annotation.highlightData && annotation.highlightData.coordinates) {
                    highlight.coordinates = annotation.highlightData.coordinates;
                    highlight.textRange = annotation.highlightData.textRange;
                } else {
                    // Fallback: convert single coordinate to array format
                    highlight.coordinates = [annotation.coordinates];
                }

                return highlight;
            });
    }

    async addHighlight(documentId: string, highlight: any): Promise<any> {
        // Convert highlight to server annotation format
        const annotation = {
            type: 'highlight',
            page: highlight.page,
            content: highlight.selectedText, // Store selected text in content field
            color: highlight.color,
            // Convert array of coordinates to single coordinate (use first rectangle)
            coordinates: highlight.coordinates && highlight.coordinates.length > 0 
                ? highlight.coordinates[0] 
                : { x: 0, y: 0, width: 0, height: 0 },
            // Store additional highlight-specific data in a custom field
            highlightData: {
                selectedText: highlight.selectedText,
                coordinates: highlight.coordinates, // Store full array here
                textRange: highlight.textRange
            }
        };

        console.log(`🔧 API: Sending highlight with ${highlight.coordinates?.length || 0} coordinates to server`);

        const response = await fetch(`${this.baseUrl}/${documentId}/annotations`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(annotation),
        });

        if (!response.ok) {
            throw new Error(`Failed to add highlight: ${response.statusText}`);
        }

        const serverResponse = await response.json();
        console.log(`🔧 API: Received server response:`, serverResponse);

        // Transform server response back to frontend highlight format
        // Ensure we preserve the full coordinates array
        const transformedHighlight = {
            id: serverResponse.id,
            documentId: documentId,
            page: serverResponse.page || highlight.page,
            color: serverResponse.color || highlight.color,
            selectedText: serverResponse.content || highlight.selectedText,
            coordinates: highlight.coordinates, // Use original coordinates array
            textRange: highlight.textRange,
            createdAt: serverResponse.createdAt || new Date().toISOString(),
            userId: serverResponse.userId
        };

        console.log(`🔧 API: Returning transformed highlight with ${transformedHighlight.coordinates?.length || 0} coordinates`);

        return transformedHighlight;
    }

    async updateHighlight(documentId: string, highlightId: string, highlight: any): Promise<any> {
        // Convert highlight to generic annotation format
        const annotation = {
            ...highlight,
            type: 'highlight'
        };

        const response = await fetch(`${this.baseUrl}/${documentId}/annotations/${highlightId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(annotation),
        });

        if (!response.ok) {
            throw new Error(`Failed to update highlight: ${response.statusText}`);
        }

        return response.json();
    }

    async deleteHighlight(documentId: string, highlightId: string): Promise<void> {
        const response = await fetch(`${this.baseUrl}/${documentId}/annotations/${highlightId}`, {
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
        const response = await fetch(`${this.baseUrl}/${documentId}/annotations`);

        if (!response.ok) {
            throw new Error(`Failed to get notes: ${response.statusText}`);
        }

        const annotations = await response.json();
        // Filter to only note annotations
        return annotations.filter((annotation: any) => annotation.type === 'note');
    }

    async addNote(documentId: string, note: any): Promise<any> {
        // Convert note to server annotation format
        const annotation = {
            type: 'note',
            page: note.page,
            content: note.content,
            // Convert note coordinates to single coordinate object
            coordinates: {
                x: note.coordinates.x,
                y: note.coordinates.y,
                width: 20, // Default width for note icon
                height: 20  // Default height for note icon
            },
            // Store additional note-specific data
            noteData: {
                contentType: note.contentType || 'plain',
                selectedText: note.selectedText,
                originalCoordinates: note.coordinates
            }
        };

        const response = await fetch(`${this.baseUrl}/${documentId}/annotations`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(annotation),
        });

        if (!response.ok) {
            throw new Error(`Failed to add note: ${response.statusText}`);
        }

        return response.json();
    }

    async updateNote(documentId: string, noteId: string, note: any): Promise<any> {
        // Convert note to generic annotation format
        const annotation = {
            ...note,
            type: 'note'
        };

        const response = await fetch(`${this.baseUrl}/${documentId}/annotations/${noteId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(annotation),
        });

        if (!response.ok) {
            throw new Error(`Failed to update note: ${response.statusText}`);
        }

        return response.json();
    }

    async deleteNote(documentId: string, noteId: string): Promise<void> {
        const response = await fetch(`${this.baseUrl}/${documentId}/annotations/${noteId}`, {
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
        // Use unified annotations API and filter for drawing type
        const annotations = await this.getAnnotations(documentId);
        return annotations.filter((annotation: any) => 
            annotation.type === 'drawing' || 
            'strokes' in annotation
        );
    }

    async addDrawing(documentId: string, drawing: any): Promise<any> {
        // Convert drawing to annotation format
        const annotation = {
            type: 'drawing',
            page: drawing.page,
            coordinates: drawing.coordinates || { x: 0, y: 0, width: 0, height: 0 },
            strokes: drawing.strokes,
            color: drawing.color || '#000000',
            createdAt: drawing.createdAt || new Date().toISOString()
        };

        return this.addAnnotation(documentId, annotation);
    }

    async updateDrawing(documentId: string, drawingId: string, drawing: any): Promise<any> {
        // Convert drawing to annotation format and use existing updateAnnotation method
        const annotation = {
            type: 'drawing',
            page: drawing.page,
            coordinates: drawing.coordinates || { x: 0, y: 0, width: 0, height: 0 },
            strokes: drawing.strokes,
            color: drawing.color || '#000000',
            updatedAt: new Date().toISOString()
        };

        return this.updateAnnotation(documentId, drawingId, annotation);
    }

    async deleteDrawing(documentId: string, drawingId: string): Promise<void> {
        // Use existing deleteAnnotation method
        return this.deleteAnnotation(documentId, drawingId);
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
