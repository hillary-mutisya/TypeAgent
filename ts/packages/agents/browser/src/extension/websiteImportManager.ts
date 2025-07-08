// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import {
    ImportOptions,
    FileImportOptions,
    ImportResult,
    ImportProgress,
    ImportError,
    ImportSummary,
    ValidationResult,
    BrowserBookmark,
    BrowserHistoryItem,
    ProcessedData,
    ProcessedFileData,
    ParsedHtmlData,
    ExtractedContent,
    ProgressCallback,
    SUPPORTED_FILE_TYPES,
    DEFAULT_MAX_FILE_SIZE,
    DEFAULT_MAX_CONCURRENT,
    DEFAULT_CONTENT_TIMEOUT
} from './interfaces/websiteImport.types';

/**
 * Core import logic and data processing manager
 * Handles both web activity (browser data) and file import operations
 */
export class WebsiteImportManager {
    private progressCallbacks: Map<string, ProgressCallback> = new Map();
    private activeImports: Map<string, boolean> = new Map();

    /**
     * Start web activity import (browser bookmarks/history)
     */
    async startWebActivityImport(options: ImportOptions): Promise<ImportResult> {
        const importId = this.generateImportId();
        const startTime = Date.now();

        try {
            // Validate options
            const validation = this.validateImportOptions(options);
            if (!validation.isValid) {
                throw new Error(`Invalid import options: ${validation.errors.join(', ')}`);
            }

            this.activeImports.set(importId, true);
            
            // Initialize progress tracking
            this.updateProgress(importId, {
                importId,
                phase: 'initializing',
                totalItems: 0,
                processedItems: 0,
                errors: []
            });

            // Get browser data with options applied
            this.updateProgress(importId, {
                importId,
                phase: 'fetching',
                totalItems: 0,
                processedItems: 0,
                errors: []
            });

            const browserData = await this.getBrowserDataWithOptions(options);
            
            this.updateProgress(importId, {
                importId,
                phase: 'processing',
                totalItems: browserData.length,
                processedItems: 0,
                errors: []
            });

            // Preprocess browser data
            const processedData = this.preprocessBrowserData(browserData, options);

            // Send to service worker for further processing
            const result = await this.sendToServiceWorker({
                type: "importWebsiteDataWithProgress",
                parameters: options,
                importId
            });

            const duration = Date.now() - startTime;

            return {
                success: true,
                importId,
                itemCount: processedData.length,
                duration,
                errors: [],
                summary: {
                    totalProcessed: processedData.length,
                    successfullyImported: processedData.length,
                    knowledgeExtracted: 0, // Will be updated by service worker
                    entitiesFound: 0,
                    topicsIdentified: 0,
                    actionsDetected: 0
                }
            };

        } catch (error) {
            const duration = Date.now() - startTime;
            const importError: ImportError = {
                type: 'processing',
                message: error instanceof Error ? error.message : 'Unknown error',
                timestamp: Date.now()
            };

            return {
                success: false,
                importId,
                itemCount: 0,
                duration,
                errors: [importError],
                summary: {
                    totalProcessed: 0,
                    successfullyImported: 0,
                    knowledgeExtracted: 0,
                    entitiesFound: 0,
                    topicsIdentified: 0,
                    actionsDetected: 0
                }
            };
        } finally {
            this.activeImports.delete(importId);
        }
    }

    /**
     * Start file import (HTML files)
     */
    async startFileImport(options: FileImportOptions): Promise<ImportResult> {
        const importId = this.generateImportId();
        const startTime = Date.now();

        try {
            // Validate options
            const validation = this.validateFileImportOptions(options);
            if (!validation.isValid) {
                throw new Error(`Invalid file import options: ${validation.errors.join(', ')}`);
            }

            this.activeImports.set(importId, true);

            // Initialize progress tracking
            this.updateProgress(importId, {
                importId,
                phase: 'initializing',
                totalItems: options.files.length,
                processedItems: 0,
                errors: []
            });

            // Process HTML files
            const processedFiles = await this.processHtmlFiles(options.files);

            // Send to service worker for further processing
            const result = await this.sendToServiceWorker({
                type: "importHtmlFiles",
                parameters: {
                    files: processedFiles,
                    options,
                    importId
                }
            });

            const duration = Date.now() - startTime;

            return {
                success: true,
                importId,
                itemCount: processedFiles.length,
                duration,
                errors: [],
                summary: {
                    totalProcessed: processedFiles.length,
                    successfullyImported: processedFiles.length,
                    knowledgeExtracted: 0, // Will be updated by service worker
                    entitiesFound: 0,
                    topicsIdentified: 0,
                    actionsDetected: 0
                }
            };

        } catch (error) {
            const duration = Date.now() - startTime;
            const importError: ImportError = {
                type: 'processing',
                message: error instanceof Error ? error.message : 'Unknown error',
                timestamp: Date.now()
            };

            return {
                success: false,
                importId,
                itemCount: 0,
                duration,
                errors: [importError],
                summary: {
                    totalProcessed: 0,
                    successfullyImported: 0,
                    knowledgeExtracted: 0,
                    entitiesFound: 0,
                    topicsIdentified: 0,
                    actionsDetected: 0
                }
            };
        } finally {
            this.activeImports.delete(importId);
        }
    }

    /**
     * Cancel an active import operation
     */
    async cancelImport(importId: string): Promise<void> {
        if (this.activeImports.has(importId)) {
            this.activeImports.set(importId, false);
            
            // Send cancellation to service worker
            try {
                await chrome.runtime.sendMessage({
                    type: "cancelImport",
                    importId
                });
            } catch (error) {
                console.error(`Failed to cancel import ${importId}:`, error);
            }
        }
    }

    /**
     * Get progress for an active import
     */
    async getImportProgress(importId: string): Promise<ImportProgress | null> {
        // Progress is tracked via callbacks in this implementation
        // This method could be extended to query service worker for progress
        return null;
    }

    /**
     * Register progress update callback
     */
    onProgressUpdate(callback: ProgressCallback): void {
        // Store callback for progress updates
        // In a full implementation, this would be tied to specific import operations
        this.progressCallbacks.set('global', callback);
    }

    /**
     * Get browser data (Chrome/Edge bookmarks or history)
     */
    async getBrowserData(source: 'chrome' | 'edge', type: 'bookmarks' | 'history'): Promise<any[]> {
        try {
            if (type === 'bookmarks') {
                return await this.getBrowserBookmarks(source);
            } else {
                return await this.getBrowserHistory(source);
            }
        } catch (error) {
            console.error(`Failed to get ${source} ${type}:`, error);
            throw new Error(`Unable to access ${source} ${type}. Please check permissions.`);
        }
    }

    /**
     * Get browser data with import options applied
     */
    async getBrowserDataWithOptions(options: ImportOptions): Promise<any[]> {
        try {
            let data: any[];
            
            if (options.type === 'bookmarks') {
                const bookmarks = await this.getBrowserBookmarksWithOptions(options);
                data = bookmarks;
            } else {
                const history = await this.getBrowserHistoryWithOptions(options);
                data = history;
            }
            
            // Apply limit if specified
            if (options.limit && options.limit > 0) {
                data = data.slice(0, options.limit);
            }
            
            return data;
        } catch (error) {
            console.error(`Failed to get ${options.source} ${options.type} with options:`, error);
            throw error;
        }
    }

    /**
     * Get bookmarks with filtering options
     */
    private async getBrowserBookmarksWithOptions(options: ImportOptions): Promise<BrowserBookmark[]> {
        try {
            if (typeof chrome !== 'undefined' && chrome.bookmarks) {
                const bookmarks = await chrome.bookmarks.getTree();
                const flattened = this.flattenBookmarks(bookmarks, options.folder);
                return flattened;
            }
        } catch (error) {
            console.error('Failed to get bookmarks:', error);
            if (error instanceof Error) {
                if (error.message.includes('permissions')) {
                    throw new Error('Permission denied. Please enable bookmark access in extension settings.');
                }
                throw new Error(`Failed to access ${options.source} bookmarks: ${error.message}`);
            }
        }
        throw new Error(`${options.source} bookmarks not available or permission denied.`);
    }

    /**
     * Get history with date filtering options
     */
    private async getBrowserHistoryWithOptions(options: ImportOptions): Promise<BrowserHistoryItem[]> {
        try {
            if (typeof chrome !== 'undefined' && chrome.history) {
                const daysBack = options.days || 30;
                const startTime = Date.now() - (daysBack * 24 * 60 * 60 * 1000);
                const maxResults = options.limit || 10000;
                
                const historyItems = await chrome.history.search({
                    text: '',
                    startTime: startTime,
                    maxResults: Math.min(maxResults, 100000) // Chrome API limit
                });
                
                return historyItems.map(item => ({
                    id: item.id || '',
                    url: item.url || '',
                    title: item.title,
                    visitCount: item.visitCount,
                    typedCount: item.typedCount,
                    lastVisitTime: item.lastVisitTime
                }));
            }
        } catch (error) {
            console.error('Failed to get history:', error);
            if (error instanceof Error) {
                if (error.message.includes('permissions')) {
                    throw new Error('Permission denied. Please enable history access in extension settings.');
                }
                throw new Error(`Failed to access ${options.source} history: ${error.message}`);
            }
        }
        throw new Error(`${options.source} history not available or permission denied.`);
    }

    /**
     * Process HTML files for import
     */
    async processHtmlFiles(files: File[]): Promise<ProcessedFileData[]> {
        const results: ProcessedFileData[] = [];
        
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            
            try {
                const parsedData = await this.parseHtmlFile(file);
                const extractedContent = await this.extractContentFromHtml(parsedData.content);
                
                const processedFile: ProcessedFileData = {
                    name: file.name,
                    content: parsedData.content,
                    metadata: {
                        title: parsedData.title,
                        lastModified: file.lastModified,
                        size: file.size
                    },
                    extractedData: {
                        text: extractedContent.text,
                        links: parsedData.links,
                        images: parsedData.images,
                        metadata: parsedData.metadata
                    }
                };
                
                results.push(processedFile);
                
            } catch (error) {
                console.error(`Failed to process file ${file.name}:`, error);
                // Continue with other files
            }
        }
        
        return results;
    }

    /**
     * Parse HTML file content
     */
    async parseHtmlFile(file: File): Promise<ParsedHtmlData> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = () => {
                try {
                    const content = reader.result as string;
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(content, 'text/html');
                    
                    // Extract title
                    const title = doc.querySelector('title')?.textContent || file.name;
                    
                    // Extract links
                    const links = Array.from(doc.querySelectorAll('a[href]'))
                        .map(a => a.getAttribute('href'))
                        .filter((href): href is string => href !== null);
                    
                    // Extract images
                    const images = Array.from(doc.querySelectorAll('img[src]'))
                        .map(img => img.getAttribute('src'))
                        .filter((src): src is string => src !== null);
                    
                    // Extract metadata
                    const metadata: Record<string, any> = {};
                    const metaTags = doc.querySelectorAll('meta');
                    metaTags.forEach(meta => {
                        const name = meta.getAttribute('name') || meta.getAttribute('property');
                        const content = meta.getAttribute('content');
                        if (name && content) {
                            metadata[name] = content;
                        }
                    });
                    
                    resolve({
                        title,
                        content,
                        links,
                        images,
                        metadata
                    });
                    
                } catch (error) {
                    reject(new Error(`Failed to parse HTML: ${error}`));
                }
            };
            
            reader.onerror = () => {
                reject(new Error(`Failed to read file: ${file.name}`));
            };
            
            reader.readAsText(file);
        });
    }

    /**
     * Extract text content from HTML
     */
    async extractContentFromHtml(html: string): Promise<ExtractedContent> {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        // Remove script and style elements
        const scripts = doc.querySelectorAll('script, style');
        scripts.forEach(el => el.remove());
        
        // Get text content
        const text = doc.body?.textContent || doc.textContent || '';
        
        // Clean up whitespace
        const cleanText = text.replace(/\s+/g, ' ').trim();
        
        // Extract basic metadata - Fixed for TypeScript strict mode
        const title = doc.querySelector('title')?.textContent || undefined;
        const description = doc.querySelector('meta[name="description"]')?.getAttribute('content') || undefined;
        const keywordsContent = doc.querySelector('meta[name="keywords"]')?.getAttribute('content');
        const keywords = keywordsContent ? keywordsContent.split(',') : undefined;
        const language = doc.documentElement.getAttribute('lang') || undefined;
        
        return {
            text: cleanText,
            title,
            description,
            keywords,
            language
        };
    }

    /**
     * Validate import options
     */
    validateImportOptions(options: ImportOptions): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Validate required fields
        if (!options.source) {
            errors.push('Source browser is required');
        } else if (!['chrome', 'edge'].includes(options.source)) {
            errors.push('Source must be either "chrome" or "edge"');
        }

        if (!options.type) {
            errors.push('Import type is required');
        } else if (!['bookmarks', 'history'].includes(options.type)) {
            errors.push('Type must be either "bookmarks" or "history"');
        }

        // Validate optional fields
        if (options.limit && (options.limit < 1 || options.limit > 50000)) {
            warnings.push('Limit should be between 1 and 50,000');
        }

        if (options.days && (options.days < 1 || options.days > 365)) {
            warnings.push('Days should be between 1 and 365');
        }

        if (options.maxConcurrent && (options.maxConcurrent < 1 || options.maxConcurrent > 20)) {
            warnings.push('Max concurrent should be between 1 and 20');
        }

        if (options.contentTimeout && (options.contentTimeout < 5000 || options.contentTimeout > 120000)) {
            warnings.push('Content timeout should be between 5 and 120 seconds');
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Validate file import options
     */
    validateFileImportOptions(options: FileImportOptions): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Validate files
        if (!options.files || options.files.length === 0) {
            errors.push('At least one file is required');
        } else {
            // Check file types
            const invalidFiles = options.files.filter(file => {
                const extension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
                return !SUPPORTED_FILE_TYPES.includes(extension as any);
            });

            if (invalidFiles.length > 0) {
                errors.push(`Unsupported file types: ${invalidFiles.map(f => f.name).join(', ')}`);
            }

            // Check file sizes
            const maxSize = options.maxFileSize || DEFAULT_MAX_FILE_SIZE;
            const oversizedFiles = options.files.filter(file => file.size > maxSize);
            
            if (oversizedFiles.length > 0) {
                warnings.push(`Large files may impact performance: ${oversizedFiles.map(f => f.name).join(', ')}`);
            }

            // Check total size
            const totalSize = options.files.reduce((sum, file) => sum + file.size, 0);
            if (totalSize > 500 * 1024 * 1024) { // 500MB
                warnings.push('Total file size is very large and may impact performance');
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Preprocess browser data before sending to service worker
     */
    preprocessBrowserData(data: any[], options: ImportOptions): ProcessedData[] {
        const results: ProcessedData[] = [];

        for (const item of data) {
            try {
                let processedItem: ProcessedData;

                if (options.type === 'bookmarks') {
                    const bookmark = item as BrowserBookmark;
                    processedItem = {
                        url: bookmark.url,
                        title: bookmark.title,
                        domain: this.extractDomain(bookmark.url),
                        source: 'bookmarks',
                        lastVisited: bookmark.dateAdded ? new Date(bookmark.dateAdded).toISOString() : undefined,
                        metadata: {
                            id: bookmark.id,
                            parentId: bookmark.parentId,
                            index: bookmark.index
                        }
                    };
                } else {
                    const historyItem = item as BrowserHistoryItem;
                    processedItem = {
                        url: historyItem.url,
                        title: historyItem.title || '',
                        domain: this.extractDomain(historyItem.url),
                        source: 'history',
                        visitCount: historyItem.visitCount,
                        lastVisited: historyItem.lastVisitTime ? new Date(historyItem.lastVisitTime).toISOString() : undefined,
                        metadata: {
                            id: historyItem.id,
                            typedCount: historyItem.typedCount
                        }
                    };
                }

                results.push(processedItem);
            } catch (error) {
                console.error('Failed to preprocess item:', error);
                // Continue with other items
            }
        }

        return results;
    }

    /**
     * Preprocess file data before sending to service worker
     */
    preprocessFileData(files: File[], options: FileImportOptions): ProcessedFileData[] {
        // This will be implemented when we have the actual file processing logic
        // For now, return empty array as placeholder
        return [];
    }

    // Private helper methods

    private generateImportId(): string {
        return `import_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private updateProgress(importId: string, progress: ImportProgress): void {
        const callback = this.progressCallbacks.get('global');
        if (callback) {
            callback(progress);
        }
    }

    private extractDomain(url: string): string {
        try {
            return new URL(url).hostname;
        } catch {
            return 'unknown';
        }
    }

    private async getBrowserBookmarks(source: 'chrome' | 'edge'): Promise<BrowserBookmark[]> {
        try {
            if (typeof chrome !== 'undefined' && chrome.bookmarks) {
                const bookmarks = await chrome.bookmarks.getTree();
                const flattened = this.flattenBookmarks(bookmarks);
                
                // Apply folder filtering if specified in current options
                // This would be enhanced to accept folder parameter
                return flattened;
            }
        } catch (error) {
            console.error('Failed to get bookmarks:', error);
            if (error instanceof Error) {
                if (error.message.includes('permissions')) {
                    throw new Error('Permission denied. Please enable bookmark access in extension settings.');
                }
                throw new Error(`Failed to access ${source} bookmarks: ${error.message}`);
            }
        }
        throw new Error(`${source} bookmarks not available or permission denied.`);
    }

    private async getBrowserHistory(source: 'chrome' | 'edge'): Promise<BrowserHistoryItem[]> {
        try {
            if (typeof chrome !== 'undefined' && chrome.history) {
                // Default to last 30 days if not specified
                const daysBack = 30;
                const startTime = Date.now() - (daysBack * 24 * 60 * 60 * 1000);
                
                const historyItems = await chrome.history.search({
                    text: '',
                    startTime: startTime,
                    maxResults: 10000
                });
                
                return historyItems.map(item => ({
                    id: item.id || '',
                    url: item.url || '',
                    title: item.title,
                    visitCount: item.visitCount,
                    typedCount: item.typedCount,
                    lastVisitTime: item.lastVisitTime
                }));
            }
        } catch (error) {
            console.error('Failed to get history:', error);
            if (error instanceof Error) {
                if (error.message.includes('permissions')) {
                    throw new Error('Permission denied. Please enable history access in extension settings.');
                }
                throw new Error(`Failed to access ${source} history: ${error.message}`);
            }
        }
        throw new Error(`${source} history not available or permission denied.`);
    }

    private flattenBookmarks(bookmarks: chrome.bookmarks.BookmarkTreeNode[], folderFilter?: string): BrowserBookmark[] {
        const result: BrowserBookmark[] = [];
        
        const flatten = (nodes: chrome.bookmarks.BookmarkTreeNode[], currentPath: string = '') => {
            for (const node of nodes) {
                const nodePath = currentPath ? `${currentPath}/${node.title}` : node.title;
                
                if (node.url) {
                    // Only include if folder filter matches or no filter specified
                    if (!folderFilter || nodePath.toLowerCase().includes(folderFilter.toLowerCase())) {
                        result.push({
                            id: node.id,
                            title: node.title,
                            url: node.url,
                            dateAdded: node.dateAdded,
                            parentId: node.parentId,
                            index: node.index
                        });
                    }
                }
                
                if (node.children) {
                    flatten(node.children, nodePath);
                }
            }
        };
        
        flatten(bookmarks);
        return result;
    }

    private async sendToServiceWorker(message: any): Promise<any> {
        try {
            return await chrome.runtime.sendMessage(message);
        } catch (error) {
            console.error('Failed to send message to service worker:', error);
            throw new Error('Failed to communicate with service worker');
        }
    }
}
