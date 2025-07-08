// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import {
    ImportOptions,
    FileImportOptions,
    ImportProgress,
    ImportResult,
    ImportError,
    ValidationResult,
    SUPPORTED_FILE_TYPES,
    DEFAULT_MAX_FILE_SIZE
} from './interfaces/websiteImport.types';

/**
 * UI components and modal management for website import functionality
 * Handles both web activity import (browser data) and file import operations
 */
export class WebsiteImportUI {
    private webActivityModalId = 'webActivityImportModal';
    private fileImportModalId = 'fileImportModal';
    private activeModal: string | null = null;
    private progressCallback: ((progress: ImportProgress) => void) | null = null;
    private completionCallback: ((result: ImportResult) => void) | null = null;
    private errorCallback: ((error: ImportError) => void) | null = null;

    constructor() {
        this.initializeStyles();
    }

    /**
     * Show web activity import modal (browser history/bookmarks)
     */
    public showWebActivityImportModal(): void {
        this.hideActiveModal();
        this.createWebActivityModal();
        this.showModal(this.webActivityModalId);
        this.activeModal = this.webActivityModalId;
    }

    /**
     * Show file import modal (HTML files)
     */
    public showFileImportModal(): void {
        this.hideActiveModal();
        this.createFileImportModal();
        this.showModal(this.fileImportModalId);
        this.activeModal = this.fileImportModalId;
    }

    /**
     * Hide any active import modal
     */
    public hideActiveModal(): void {
        if (this.activeModal) {
            this.hideModal(this.activeModal);
            this.removeModal(this.activeModal);
            this.activeModal = null;
        }
    }

    /**
     * Show import progress in the active modal
     */
    public showImportProgress(progress: ImportProgress): void {
        const modalElement = document.getElementById(this.activeModal || '');
        if (!modalElement) return;

        const progressContainer = modalElement.querySelector('#importProgress');
        const formContainer = modalElement.querySelector('#importForm');
        
        if (progressContainer && formContainer) {
            formContainer.classList.add('d-none');
            progressContainer.classList.remove('d-none');
            this.updateImportProgress(progress);
        }
    }

    /**
     * Update import progress display
     */
    public updateImportProgress(progress: ImportProgress): void {
        const modalElement = document.getElementById(this.activeModal || '');
        if (!modalElement) return;

        const statusElement = modalElement.querySelector('#importStatusMessage');
        const progressBar = modalElement.querySelector('#importProgressBar') as HTMLElement;
        const progressText = modalElement.querySelector('#importProgressText');
        
        if (statusElement) {
            const phaseMessages: Record<string, string> = {
                'initializing': 'Preparing import...',
                'fetching': 'Fetching browser data...',
                'processing': 'Processing items...',
                'extracting': 'Extracting content...',
                'complete': 'Import complete!',
                'error': 'Import failed'
            };
            
            statusElement.textContent = phaseMessages[progress.phase] || progress.phase;
            
            if (progress.currentItem) {
                statusElement.textContent += ` (${progress.currentItem})`;
            }
        }

        // Update progress bar
        if (progressBar && progress.totalItems > 0) {
            const percentage = Math.round((progress.processedItems / progress.totalItems) * 100);
            progressBar.style.width = `${percentage}%`;
            progressBar.setAttribute('aria-valuenow', percentage.toString());
        }

        // Update progress text
        if (progressText) {
            progressText.textContent = `${progress.processedItems} / ${progress.totalItems} items`;
            
            if (progress.estimatedTimeRemaining) {
                const minutes = Math.ceil(progress.estimatedTimeRemaining / 60000);
                progressText.textContent += ` (${minutes}m remaining)`;
            }
        }

        if (this.progressCallback) {
            this.progressCallback(progress);
        }
    }

    /**
     * Show import completion result
     */
    public showImportComplete(result: ImportResult): void {
        const modalElement = document.getElementById(this.activeModal || '');
        if (!modalElement) return;

        const progressContainer = modalElement.querySelector('#importProgress');
        if (progressContainer) {
            const isFileImport = this.activeModal === this.fileImportModalId;
            const iconClass = isFileImport ? 'bi-check2-circle' : 'bi-check-circle';
            const successColor = isFileImport ? 'success' : 'primary';
            
            const successHtml = `
                <div class="text-center">
                    <div class="text-${successColor} mb-3">
                        <i class="bi ${iconClass} fs-1"></i>
                    </div>
                    <h5 class="text-${successColor}">Import Complete!</h5>
                    <p class="mb-3">Successfully imported <strong>${result.itemCount}</strong> items.</p>
                    
                    ${result.summary ? `
                        <div class="import-summary bg-light rounded p-3 mb-3">
                            <div class="row text-center">
                                <div class="col-3">
                                    <div class="h6 mb-1">${result.summary.totalProcessed}</div>
                                    <small class="text-muted">Processed</small>
                                </div>
                                <div class="col-3">
                                    <div class="h6 mb-1">${result.summary.successfullyImported}</div>
                                    <small class="text-muted">Imported</small>
                                </div>
                                <div class="col-3">
                                    <div class="h6 mb-1">${result.summary.knowledgeExtracted}</div>
                                    <small class="text-muted">Knowledge</small>
                                </div>
                                <div class="col-3">
                                    <div class="h6 mb-1">${result.summary.entitiesFound}</div>
                                    <small class="text-muted">Entities</small>
                                </div>
                            </div>
                        </div>
                    ` : ''}
                    
                    <div class="d-flex gap-2 justify-content-center">
                        <button id="viewImportedData" class="btn btn-outline-${successColor}">
                            <i class="bi bi-eye"></i> View Data
                        </button>
                        <button id="closeModal" class="btn btn-${successColor}">
                            <i class="bi bi-check"></i> Done
                        </button>
                    </div>
                </div>
            `;
            
            progressContainer.innerHTML = successHtml;
        }

        // Setup button event listeners
        const closeButton = modalElement.querySelector('#closeModal');
        const viewDataButton = modalElement.querySelector('#viewImportedData');
        
        if (closeButton) {
            closeButton.addEventListener('click', () => {
                this.hideActiveModal();
            });
        }

        if (viewDataButton) {
            viewDataButton.addEventListener('click', () => {
                this.hideActiveModal();
                // Navigate to search page to view imported data
                window.dispatchEvent(new CustomEvent('navigateToSearch'));
            });
        }

        if (this.completionCallback) {
            this.completionCallback(result);
        }
    }

    /**
     * Show import error
     */
    public showImportError(error: ImportError): void {
        const modalElement = document.getElementById(this.activeModal || '');
        if (!modalElement) return;

        const progressContainer = modalElement.querySelector('#importProgress');
        if (progressContainer) {
            const errorTypeMessages: Record<string, string> = {
                'validation': 'Please check your import settings and try again.',
                'network': 'Please check your internet connection and try again.',
                'processing': 'There was an issue processing the data.',
                'extraction': 'Content extraction failed for some items.'
            };

            const suggestion = errorTypeMessages[error.type] || 'Please try again or contact support if the issue persists.';
            
            const errorHtml = `
                <div class="text-center">
                    <div class="text-danger mb-3">
                        <i class="bi bi-x-circle fs-1"></i>
                    </div>
                    <h5 class="text-danger">Import Failed</h5>
                    <div class="alert alert-danger text-start" role="alert">
                        <strong>Error:</strong> ${error.message}<br>
                        <small class="text-muted">${suggestion}</small>
                    </div>
                    <div class="d-flex gap-2 justify-content-center">
                        <button id="retryImport" class="btn btn-outline-danger">
                            <i class="bi bi-arrow-clockwise"></i> Retry
                        </button>
                        <button id="closeModal" class="btn btn-secondary">
                            <i class="bi bi-x"></i> Close
                        </button>
                    </div>
                </div>
            `;
            
            progressContainer.innerHTML = errorHtml;
        }

        // Setup button handlers
        const closeButton = modalElement.querySelector('#closeModal');
        const retryButton = modalElement.querySelector('#retryImport');
        
        if (closeButton) {
            closeButton.addEventListener('click', () => {
                this.hideActiveModal();
            });
        }

        if (retryButton) {
            retryButton.addEventListener('click', () => {
                // Reset to form view
                const formContainer = modalElement.querySelector('#importForm');
                const progressContainer = modalElement.querySelector('#importProgress');
                
                if (formContainer && progressContainer) {
                    progressContainer.classList.add('d-none');
                    formContainer.classList.remove('d-none');
                }
            });
        }

        if (this.errorCallback) {
            this.errorCallback(error);
        }
    }

    /**
     * Get web activity import options from form
     */
    public getWebActivityImportOptions(): ImportOptions | null {
        const modal = document.getElementById(this.webActivityModalId);
        if (!modal) return null;

        const selectedBrowser = modal.querySelector('[data-browser].selected');
        const selectedType = modal.querySelector('[data-type].selected');

        if (!selectedBrowser || !selectedType) {
            return null;
        }

        const source = selectedBrowser.getAttribute('data-browser') as 'chrome' | 'edge';
        const type = selectedType.getAttribute('data-type') as 'bookmarks' | 'history';

        // Get form values
        const limitInput = modal.querySelector('#importLimit') as HTMLInputElement;
        const daysBackInput = modal.querySelector('#daysBack') as HTMLInputElement;
        const folderInput = modal.querySelector('#bookmarkFolder') as HTMLInputElement;
        const extractContentInput = modal.querySelector('#extractContent') as HTMLInputElement;
        const intelligentAnalysisInput = modal.querySelector('#enableIntelligentAnalysis') as HTMLInputElement;
        const actionDetectionInput = modal.querySelector('#enableActionDetection') as HTMLInputElement;
        const extractionModeInput = modal.querySelector('#extractionMode') as HTMLSelectElement;
        const maxConcurrentInput = modal.querySelector('#maxConcurrent') as HTMLInputElement;
        const contentTimeoutInput = modal.querySelector('#contentTimeout') as HTMLInputElement;

        const options: ImportOptions = {
            source,
            type,
            extractContent: extractContentInput?.checked ?? true,
            enableIntelligentAnalysis: intelligentAnalysisInput?.checked ?? true,
            enableActionDetection: actionDetectionInput?.checked ?? false,
            extractionMode: (extractionModeInput?.value as any) ?? 'content',
            maxConcurrent: maxConcurrentInput?.value ? parseInt(maxConcurrentInput.value) : 5,
            contentTimeout: contentTimeoutInput?.value ? parseInt(contentTimeoutInput.value) * 1000 : 30000
        };

        // Add optional parameters
        if (limitInput?.value) {
            options.limit = parseInt(limitInput.value);
        }

        if (type === 'history' && daysBackInput?.value) {
            options.days = parseInt(daysBackInput.value);
        }

        if (type === 'bookmarks' && folderInput?.value) {
            options.folder = folderInput.value.trim();
        }

        return options;
    }

    /**
     * Get file import options from form
     */
    public getFileImportOptions(): FileImportOptions | null {
        const modal = document.getElementById(this.fileImportModalId);
        if (!modal) return null;

        const files = (modal as any)._selectedFiles as File[];
        if (!files || files.length === 0) {
            return null;
        }

        // Get form values
        const extractContentInput = modal.querySelector('#fileExtractContent') as HTMLInputElement;
        const intelligentAnalysisInput = modal.querySelector('#fileIntelligentAnalysis') as HTMLInputElement;
        const actionDetectionInput = modal.querySelector('#fileActionDetection') as HTMLInputElement;
        const extractionModeInput = modal.querySelector('#fileExtractionMode') as HTMLSelectElement;
        const preserveStructureInput = modal.querySelector('#preserveStructure') as HTMLInputElement;

        const options: FileImportOptions = {
            files,
            extractContent: extractContentInput?.checked ?? true,
            enableIntelligentAnalysis: intelligentAnalysisInput?.checked ?? true,
            enableActionDetection: actionDetectionInput?.checked ?? false,
            extractionMode: (extractionModeInput?.value as any) ?? 'content',
            preserveStructure: preserveStructureInput?.checked ?? true,
            allowedTypes: SUPPORTED_FILE_TYPES.slice(),
            maxFileSize: DEFAULT_MAX_FILE_SIZE
        };

        return options;
    }

    /**
     * Validate import form
     */
    public validateImportForm(): boolean {
        const modal = document.getElementById(this.activeModal || '');
        if (!modal) return false;

        if (this.activeModal === this.webActivityModalId) {
            const selectedBrowser = modal.querySelector('[data-browser].selected');
            const selectedType = modal.querySelector('[data-type].selected');
            return !!(selectedBrowser && selectedType);
        }

        if (this.activeModal === this.fileImportModalId) {
            const fileInput = modal.querySelector('#fileInput') as HTMLInputElement;
            return !!(fileInput?.files && fileInput.files.length > 0);
        }

        return false;
    }

    /**
     * Handle file drop for file import
     */
    public handleFileDrop(files: FileList): void {
        this.processSelectedFiles(Array.from(files));
    }

    /**
     * Handle file selection
     */
    public handleFileSelection(files: FileList): void {
        this.processSelectedFiles(Array.from(files));
    }

    /**
     * Process selected files and update UI
     */
    private processSelectedFiles(files: File[]): void {
        const modal = document.getElementById(this.fileImportModalId);
        if (!modal) return;

        // Validate files
        const validFiles = files.filter(file => this.isValidFile(file));
        
        if (validFiles.length === 0) {
            this.showFileError('No valid HTML files selected. Please select .html, .htm, or .mhtml files.');
            return;
        }

        if (validFiles.length !== files.length) {
            this.showFileWarning(`${files.length - validFiles.length} files were skipped (invalid type or too large).`);
        }

        this.updateFileList(validFiles);
        this.updateFileImportState();
    }

    /**
     * Validate a single file
     */
    private isValidFile(file: File): boolean {
        const validExtensions = ['.html', '.htm', '.mhtml'];
        const extension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
        const maxSize = DEFAULT_MAX_FILE_SIZE; // 50MB

        return validExtensions.includes(extension) && file.size <= maxSize;
    }

    /**
     * Update file list display
     */
    private updateFileList(files: File[]): void {
        const modal = document.getElementById(this.fileImportModalId);
        if (!modal) return;

        const fileList = modal.querySelector('#fileList');
        const fileListContainer = modal.querySelector('#fileListContainer');
        const fileCount = modal.querySelector('#fileCount');
        const totalSize = modal.querySelector('#totalSize');
        const importOptions = modal.querySelector('#fileImportOptions') as HTMLElement;

        if (!fileList || !fileListContainer || !fileCount || !totalSize) return;

        // Show file list
        fileList.classList.remove('d-none');
        importOptions.style.display = 'block';

        // Clear existing list
        fileListContainer.innerHTML = '';

        // Add files to list
        let totalSizeBytes = 0;
        files.forEach((file, index) => {
            totalSizeBytes += file.size;
            
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item d-flex align-items-center justify-content-between p-2 border-bottom';
            fileItem.innerHTML = `
                <div class="d-flex align-items-center">
                    <i class="bi bi-file-earmark-code text-primary me-2"></i>
                    <div>
                        <div class="fw-semibold">${file.name}</div>
                        <small class="text-muted">${this.formatFileSize(file.size)} • ${file.type || 'HTML file'}</small>
                    </div>
                </div>
                <button type="button" class="btn btn-sm btn-outline-danger remove-file-btn" data-index="${index}">
                    <i class="bi bi-x"></i>
                </button>
            `;

            // Add remove button event listener
            const removeBtn = fileItem.querySelector('.remove-file-btn');
            if (removeBtn) {
                removeBtn.addEventListener('click', () => {
                    this.removeFileFromList(index);
                });
            }

            fileListContainer.appendChild(fileItem);
        });

        // Update summary
        fileCount.textContent = files.length.toString();
        totalSize.textContent = this.formatFileSize(totalSizeBytes);

        // Store files for later use
        (modal as any)._selectedFiles = files;
    }

    /**
     * Remove file from list
     */
    private removeFileFromList(index: number): void {
        const modal = document.getElementById(this.fileImportModalId);
        if (!modal || !(modal as any)._selectedFiles) return;

        const files = (modal as any)._selectedFiles as File[];
        const newFiles = files.filter((_, i) => i !== index);
        
        if (newFiles.length === 0) {
            this.clearFileList();
        } else {
            this.updateFileList(newFiles);
        }
        
        this.updateFileImportState();
    }

    /**
     * Clear file list
     */
    private clearFileList(): void {
        const modal = document.getElementById(this.fileImportModalId);
        if (!modal) return;

        const fileList = modal.querySelector('#fileList');
        const importOptions = modal.querySelector('#fileImportOptions') as HTMLElement;
        const fileInput = modal.querySelector('#fileInput') as HTMLInputElement;

        if (fileList) fileList.classList.add('d-none');
        if (importOptions) importOptions.style.display = 'none';
        if (fileInput) fileInput.value = '';

        (modal as any)._selectedFiles = [];
        this.updateFileImportState();
    }

    /**
     * Update file import button state
     */
    private updateFileImportState(): void {
        const modal = document.getElementById(this.fileImportModalId);
        if (!modal) return;

        const startButton = modal.querySelector('#startFileImport') as HTMLButtonElement;
        const files = (modal as any)._selectedFiles as File[] || [];

        if (startButton) {
            startButton.disabled = files.length === 0;
        }
    }

    /**
     * Format file size for display
     */
    private formatFileSize(bytes: number): string {
        if (bytes === 0) return '0 B';
        
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    /**
     * Show file error message
     */
    private showFileError(message: string): void {
        // Could implement toast notification or inline error display
        console.error(message);
        alert(message); // Simple implementation for now
    }

    /**
     * Show file warning message  
     */
    private showFileWarning(message: string): void {
        console.warn(message);
        // Could implement less intrusive warning display
    }

    /**
     * Validate files for import
     */
    public validateFiles(files: File[]): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        if (files.length === 0) {
            errors.push('No files selected for import.');
            return { isValid: false, errors, warnings };
        }

        // Check file types
        const validExtensions = SUPPORTED_FILE_TYPES;
        const invalidFiles = files.filter(file => {
            const extension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
            return !validExtensions.includes(extension as any);
        });

        if (invalidFiles.length > 0) {
            errors.push(`${invalidFiles.length} files have unsupported formats. Supported: ${validExtensions.join(', ')}`);
        }

        // Check file sizes
        const maxSize = DEFAULT_MAX_FILE_SIZE;
        const oversizedFiles = files.filter(file => file.size > maxSize);
        
        if (oversizedFiles.length > 0) {
            const maxSizeMB = Math.round(maxSize / (1024 * 1024));
            warnings.push(`${oversizedFiles.length} files exceed ${maxSizeMB}MB and may cause performance issues.`);
        }

        // Check total size
        const totalSize = files.reduce((sum, file) => sum + file.size, 0);
        const maxTotalSize = 500 * 1024 * 1024; // 500MB
        
        if (totalSize > maxTotalSize) {
            warnings.push('Total file size is very large and may impact browser performance.');
        }

        // Check for duplicate names
        const fileNames = files.map(f => f.name.toLowerCase());
        const duplicateNames = fileNames.filter((name, index) => fileNames.indexOf(name) !== index);
        
        if (duplicateNames.length > 0) {
            warnings.push('Some files have duplicate names. Later files may overwrite earlier ones.');
        }

        // Check for empty files
        const emptyFiles = files.filter(file => file.size === 0);
        if (emptyFiles.length > 0) {
            warnings.push(`${emptyFiles.length} files appear to be empty.`);
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Set progress update callback
     */
    public onProgressUpdate(callback: (progress: ImportProgress) => void): void {
        this.progressCallback = callback;
    }

    /**
     * Set completion callback
     */
    public onImportComplete(callback: (result: ImportResult) => void): void {
        this.completionCallback = callback;
    }

    /**
     * Set error callback
     */
    public onImportError(callback: (error: ImportError) => void): void {
        this.errorCallback = callback;
    }

    // Private helper methods
    
    /**
     * Create web activity import modal
     */
    private createWebActivityModal(): void {
        const modalDiv = document.createElement('div');
        modalDiv.className = 'modal fade';
        modalDiv.id = this.webActivityModalId;
        modalDiv.setAttribute('tabindex', '-1');
        
        modalDiv.innerHTML = `
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
                        <h5 class="modal-title">
                            <i class="bi bi-download me-2"></i>Import Web Activity
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close" style="filter: invert(1);"></button>
                    </div>
                    <div class="modal-body">
                        <div id="importForm">
                            <!-- Browser Selection -->
                            <div class="mb-3">
                                <label class="form-label fw-semibold">Select Browser</label>
                                <div class="row">
                                    <div class="col-md-6">
                                        <div class="import-option" data-browser="chrome">
                                            <div class="d-flex align-items-center">
                                                <i class="bi bi-browser-chrome text-success me-3 fs-4"></i>
                                                <div>
                                                    <div class="fw-semibold">Google Chrome</div>
                                                    <small class="text-muted">Import from Chrome browser</small>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="col-md-6">
                                        <div class="import-option" data-browser="edge">
                                            <div class="d-flex align-items-center">
                                                <i class="bi bi-browser-edge text-primary me-3 fs-4"></i>
                                                <div>
                                                    <div class="fw-semibold">Microsoft Edge</div>
                                                    <small class="text-muted">Import from Edge browser</small>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Data Type Selection -->
                            <div class="mb-3">
                                <label class="form-label fw-semibold">Data Type</label>
                                <div class="row">
                                    <div class="col-md-6">
                                        <div class="import-option" data-type="bookmarks">
                                            <div class="d-flex align-items-center">
                                                <i class="bi bi-bookmark-star text-warning me-3 fs-4"></i>
                                                <div>
                                                    <div class="fw-semibold">Bookmarks</div>
                                                    <small class="text-muted">Saved bookmarks and favorites</small>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="col-md-6">
                                        <div class="import-option" data-type="history">
                                            <div class="d-flex align-items-center">
                                                <i class="bi bi-clock-history text-info me-3 fs-4"></i>
                                                <div>
                                                    <div class="fw-semibold">Browser History</div>
                                                    <small class="text-muted">Recently visited pages</small>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Advanced Options -->
                            <div class="mb-3">
                                <button class="btn btn-outline-secondary btn-sm" type="button" data-bs-toggle="collapse" data-bs-target="#advancedOptions">
                                    <i class="bi bi-gear"></i> Advanced Options
                                </button>

                                <div class="collapse mt-3" id="advancedOptions">
                                    <div class="card card-body bg-light">
                                        <div class="row">
                                            <div class="col-md-6">
                                                <label class="form-label">Limit (max items)</label>
                                                <input type="number" id="importLimit" class="form-control form-control-sm" 
                                                       placeholder="e.g., 1000" min="1" max="50000" value="1000">
                                            </div>
                                            <div class="col-md-6" id="daysBackContainer" style="display: none">
                                                <label class="form-label">Days back (history only)</label>
                                                <input type="number" id="daysBack" class="form-control form-control-sm" 
                                                       placeholder="e.g., 30" min="1" max="365" value="30">
                                            </div>
                                        </div>

                                        <div class="mt-3" id="folderContainer" style="display: none">
                                            <label class="form-label">Bookmark Folder (optional)</label>
                                            <input type="text" id="bookmarkFolder" class="form-control form-control-sm" 
                                                   placeholder="e.g., Work, Personal">
                                        </div>

                                        <div class="mt-3">
                                            <h6 class="mb-3">Enhancement Options</h6>
                                            
                                            <div class="form-check mb-2">
                                                <input class="form-check-input" type="checkbox" id="extractContent" checked>
                                                <label class="form-check-label" for="extractContent">
                                                    <i class="bi bi-download"></i> Extract page content
                                                </label>
                                                <small class="text-muted d-block ms-4">
                                                    Fetch actual page content for semantic search
                                                </small>
                                            </div>

                                            <div class="form-check mb-2">
                                                <input class="form-check-input" type="checkbox" id="enableIntelligentAnalysis" checked>
                                                <label class="form-check-label" for="enableIntelligentAnalysis">
                                                    <i class="bi bi-robot"></i> AI knowledge extraction
                                                </label>
                                                <small class="text-muted d-block ms-4">
                                                    Extract entities, topics, and insights using AI
                                                </small>
                                            </div>

                                            <div class="form-check mb-3">
                                                <input class="form-check-input" type="checkbox" id="enableActionDetection">
                                                <label class="form-check-label" for="enableActionDetection">
                                                    <i class="bi bi-lightning"></i> Action detection
                                                </label>
                                                <small class="text-muted d-block ms-4">
                                                    Identify actionable elements (buy, download, etc.)
                                                </small>
                                            </div>

                                            <div class="mb-3">
                                                <label for="extractionMode" class="form-label">Extraction Quality</label>
                                                <select id="extractionMode" class="form-select form-select-sm">
                                                    <option value="basic">Basic - Fast extraction</option>
                                                    <option value="content" selected>Content - Good quality</option>
                                                    <option value="actions">Actions - Include action detection</option>
                                                    <option value="full">Full - Maximum detail</option>
                                                </select>
                                            </div>

                                            <div class="row">
                                                <div class="col-md-6">
                                                    <label for="maxConcurrent" class="form-label">Max Concurrent</label>
                                                    <input type="number" id="maxConcurrent" class="form-control form-control-sm" 
                                                           value="5" min="1" max="20">
                                                </div>
                                                <div class="col-md-6">
                                                    <label for="contentTimeout" class="form-label">Timeout (seconds)</label>
                                                    <input type="number" id="contentTimeout" class="form-control form-control-sm" 
                                                           value="30" min="5" max="120">
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Import Controls -->
                            <div class="d-flex gap-2">
                                <button id="startWebActivityImport" class="btn btn-primary" disabled>
                                    <i class="bi bi-download"></i> Start Import
                                </button>
                                <button id="cancelWebActivityImport" class="btn btn-outline-secondary d-none">
                                    <i class="bi bi-x-circle"></i> Cancel
                                </button>
                            </div>
                        </div>

                        <!-- Progress Display -->
                        <div id="importProgress" class="d-none">
                            <div class="progress-container">
                                <div class="text-center">
                                    <div class="spinner-border text-primary mb-3" role="status">
                                        <span class="visually-hidden">Importing...</span>
                                    </div>
                                    <div>
                                        <span class="fw-semibold">Importing Data...</span>
                                    </div>
                                    <small id="importStatusMessage" class="text-muted d-block mt-2">
                                        Preparing import...
                                    </small>
                                    <div class="progress mt-3" style="height: 6px;">
                                        <div id="importProgressBar" class="progress-bar" role="progressbar" 
                                             style="width: 0%" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100"></div>
                                    </div>
                                    <small id="importProgressText" class="text-muted d-block mt-1">0 / 0 items</small>
                                </div>

                                <div class="mt-4 text-center">
                                    <button id="cancelImportProgress" class="btn btn-outline-danger btn-sm">
                                        <i class="bi bi-x-circle"></i> Cancel Import
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modalDiv);
        this.setupWebActivityEventListeners();
    }

    /**
     * Create file import modal
     */
    private createFileImportModal(): void {
        const modalDiv = document.createElement('div');
        modalDiv.className = 'modal fade';
        modalDiv.id = this.fileImportModalId;
        modalDiv.setAttribute('tabindex', '-1');
        
        modalDiv.innerHTML = `
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
                        <h5 class="modal-title">
                            <i class="bi bi-file-earmark-arrow-up me-2"></i>Import from Files
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close" style="filter: invert(1);"></button>
                    </div>
                    <div class="modal-body">
                        <div id="importForm">
                            <!-- File Drop Zone -->
                            <div id="fileDropZone" class="file-drop-zone mb-3">
                                <div class="drop-zone-content">
                                    <i class="bi bi-cloud-upload fs-1 text-muted mb-3"></i>
                                    <h5>Drag & Drop HTML Files</h5>
                                    <p class="text-muted mb-3">Or click to browse and select files</p>
                                    <button type="button" class="btn btn-outline-primary" id="browseFilesBtn">
                                        <i class="bi bi-folder2-open"></i> Browse Files
                                    </button>
                                    <input type="file" id="fileInput" multiple accept=".html,.htm,.mhtml" class="d-none">
                                </div>
                                <div class="drop-zone-overlay d-none">
                                    <div class="overlay-content">
                                        <i class="bi bi-download fs-1"></i>
                                        <h5>Drop files here</h5>
                                    </div>
                                </div>
                            </div>

                            <!-- File List -->
                            <div id="fileList" class="file-list d-none">
                                <div class="d-flex justify-content-between align-items-center mb-2">
                                    <h6 class="mb-0">Selected Files</h6>
                                    <div>
                                        <button type="button" class="btn btn-sm btn-outline-secondary" id="clearFilesBtn">
                                            <i class="bi bi-trash"></i> Clear All
                                        </button>
                                    </div>
                                </div>
                                <div id="fileListContainer" class="file-list-container">
                                    <!-- Files will be populated here -->
                                </div>
                                <div class="file-summary mt-2">
                                    <small class="text-muted">
                                        <span id="fileCount">0</span> files selected, 
                                        <span id="totalSize">0 KB</span> total
                                    </small>
                                </div>
                            </div>

                            <!-- Import Options -->
                            <div class="mb-3" id="fileImportOptions" style="display: none;">
                                <button class="btn btn-outline-secondary btn-sm" type="button" data-bs-toggle="collapse" data-bs-target="#fileAdvancedOptions">
                                    <i class="bi bi-gear"></i> Import Options
                                </button>

                                <div class="collapse mt-3" id="fileAdvancedOptions">
                                    <div class="card card-body bg-light">
                                        <div class="mb-3">
                                            <h6 class="mb-3">Processing Options</h6>
                                            
                                            <div class="form-check mb-2">
                                                <input class="form-check-input" type="checkbox" id="fileExtractContent" checked>
                                                <label class="form-check-label" for="fileExtractContent">
                                                    <i class="bi bi-file-text"></i> Extract content from files
                                                </label>
                                                <small class="text-muted d-block ms-4">
                                                    Parse HTML content and extract meaningful text
                                                </small>
                                            </div>

                                            <div class="form-check mb-2">
                                                <input class="form-check-input" type="checkbox" id="fileIntelligentAnalysis" checked>
                                                <label class="form-check-label" for="fileIntelligentAnalysis">
                                                    <i class="bi bi-robot"></i> AI knowledge extraction
                                                </label>
                                                <small class="text-muted d-block ms-4">
                                                    Extract entities, topics, and insights using AI
                                                </small>
                                            </div>

                                            <div class="form-check mb-3">
                                                <input class="form-check-input" type="checkbox" id="fileActionDetection">
                                                <label class="form-check-label" for="fileActionDetection">
                                                    <i class="bi bi-lightning"></i> Action detection
                                                </label>
                                                <small class="text-muted d-block ms-4">
                                                    Identify actionable elements in files
                                                </small>
                                            </div>

                                            <div class="mb-3">
                                                <label for="fileExtractionMode" class="form-label">Processing Quality</label>
                                                <select id="fileExtractionMode" class="form-select form-select-sm">
                                                    <option value="basic">Basic - Fast processing</option>
                                                    <option value="content" selected>Content - Good quality</option>
                                                    <option value="actions">Actions - Include action detection</option>
                                                    <option value="full">Full - Maximum detail</option>
                                                </select>
                                            </div>

                                            <div class="form-check mb-2">
                                                <input class="form-check-input" type="checkbox" id="preserveStructure" checked>
                                                <label class="form-check-label" for="preserveStructure">
                                                    <i class="bi bi-diagram-3"></i> Preserve file structure
                                                </label>
                                                <small class="text-muted d-block ms-4">
                                                    Maintain original file organization and metadata
                                                </small>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Import Controls -->
                            <div class="d-flex gap-2">
                                <button id="startFileImport" class="btn btn-success" disabled>
                                    <i class="bi bi-upload"></i> Start Import
                                </button>
                                <button id="cancelFileImport" class="btn btn-outline-secondary d-none">
                                    <i class="bi bi-x-circle"></i> Cancel
                                </button>
                            </div>
                        </div>

                        <!-- Progress Display -->
                        <div id="importProgress" class="d-none">
                            <div class="progress-container">
                                <div class="text-center">
                                    <div class="spinner-border text-success mb-3" role="status">
                                        <span class="visually-hidden">Processing files...</span>
                                    </div>
                                    <div>
                                        <span class="fw-semibold">Processing Files...</span>
                                    </div>
                                    <small id="importStatusMessage" class="text-muted d-block mt-2">
                                        Preparing files...
                                    </small>
                                    <div class="progress mt-3" style="height: 6px;">
                                        <div id="importProgressBar" class="progress-bar bg-success" role="progressbar" 
                                             style="width: 0%" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100"></div>
                                    </div>
                                    <small id="importProgressText" class="text-muted d-block mt-1">0 / 0 files</small>
                                </div>

                                <div class="mt-4 text-center">
                                    <button id="cancelImportProgress" class="btn btn-outline-danger btn-sm">
                                        <i class="bi bi-x-circle"></i> Cancel Import
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modalDiv);
        this.setupFileImportEventListeners();
    }

    /**
     * Setup event listeners for web activity modal
     */
    private setupWebActivityEventListeners(): void {
        const modal = document.getElementById(this.webActivityModalId);
        if (!modal) return;

        // Browser selection
        const browserOptions = modal.querySelectorAll('[data-browser]');
        browserOptions.forEach(option => {
            option.addEventListener('click', () => {
                browserOptions.forEach(opt => opt.classList.remove('selected'));
                option.classList.add('selected');
                this.updateWebActivityFormState();
            });
        });

        // Data type selection
        const typeOptions = modal.querySelectorAll('[data-type]');
        typeOptions.forEach(option => {
            option.addEventListener('click', () => {
                typeOptions.forEach(opt => opt.classList.remove('selected'));
                option.classList.add('selected');
                this.updateWebActivityFormState();
            });
        });

        // Form inputs
        const formInputs = modal.querySelectorAll('input, select');
        formInputs.forEach(input => {
            input.addEventListener('change', () => {
                this.updateWebActivityFormState();
            });
        });

        // Start import button
        const startButton = modal.querySelector('#startWebActivityImport');
        if (startButton) {
            startButton.addEventListener('click', () => {
                const options = this.getWebActivityImportOptions();
                if (options) {
                    window.dispatchEvent(new CustomEvent('startWebActivityImport', { 
                        detail: options 
                    }));
                }
            });
        }

        // Cancel buttons
        const cancelButtons = modal.querySelectorAll('#cancelWebActivityImport, #cancelImportProgress');
        cancelButtons.forEach(button => {
            button.addEventListener('click', () => {
                window.dispatchEvent(new CustomEvent('cancelImport'));
            });
        });

        modal.addEventListener('hidden.bs.modal', () => {
            this.removeModal(this.webActivityModalId);
        });
    }

    /**
     * Update web activity form state and validation
     */
    private updateWebActivityFormState(): void {
        const modal = document.getElementById(this.webActivityModalId);
        if (!modal) return;

        const selectedBrowser = modal.querySelector('[data-browser].selected');
        const selectedType = modal.querySelector('[data-type].selected');
        const startButton = modal.querySelector('#startWebActivityImport') as HTMLButtonElement;

        // Show/hide conditional fields
        const daysBackContainer = modal.querySelector('#daysBackContainer') as HTMLElement;
        const folderContainer = modal.querySelector('#folderContainer') as HTMLElement;

        if (selectedType) {
            const type = selectedType.getAttribute('data-type');
            if (type === 'history') {
                daysBackContainer.style.display = 'block';
                folderContainer.style.display = 'none';
            } else if (type === 'bookmarks') {
                daysBackContainer.style.display = 'none';
                folderContainer.style.display = 'block';
            }
        }

        // Enable/disable start button
        if (startButton) {
            startButton.disabled = !selectedBrowser || !selectedType;
        }
    }

    /**
     * Setup event listeners for file import modal
     */
    private setupFileImportEventListeners(): void {
        const modal = document.getElementById(this.fileImportModalId);
        if (!modal) return;

        const fileInput = modal.querySelector('#fileInput') as HTMLInputElement;
        const browseBtn = modal.querySelector('#browseFilesBtn');
        const dropZone = modal.querySelector('#fileDropZone');
        const startButton = modal.querySelector('#startFileImport') as HTMLButtonElement;
        const clearFilesBtn = modal.querySelector('#clearFilesBtn');

        // Browse files button
        if (browseBtn && fileInput) {
            browseBtn.addEventListener('click', () => {
                fileInput.click();
            });
        }

        // File input change
        if (fileInput) {
            fileInput.addEventListener('change', () => {
                if (fileInput.files) {
                    this.handleFileSelection(fileInput.files);
                }
            });
        }

        // Drag and drop
        if (dropZone) {
            const overlay = dropZone.querySelector('.drop-zone-overlay');

            dropZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                dropZone.classList.add('drag-over');
                if (overlay) overlay.classList.remove('d-none');
            });

            dropZone.addEventListener('dragleave', (e) => {
                e.preventDefault();
                const dragEvent = e as DragEvent;
                if (!dropZone.contains(dragEvent.relatedTarget as Node)) {
                    dropZone.classList.remove('drag-over');
                    if (overlay) overlay.classList.add('d-none');
                }
            });

            dropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                const dragEvent = e as DragEvent;
                dropZone.classList.remove('drag-over');
                if (overlay) overlay.classList.add('d-none');
                
                if (dragEvent.dataTransfer?.files) {
                    this.handleFileDrop(dragEvent.dataTransfer.files);
                }
            });
        }

        // Clear files button
        if (clearFilesBtn) {
            clearFilesBtn.addEventListener('click', () => {
                this.clearFileList();
            });
        }

        // Start import button
        if (startButton) {
            startButton.addEventListener('click', () => {
                const options = this.getFileImportOptions();
                if (options) {
                    window.dispatchEvent(new CustomEvent('startFileImport', { 
                        detail: options 
                    }));
                }
            });
        }

        // Cancel buttons
        const cancelButtons = modal.querySelectorAll('#cancelFileImport, #cancelImportProgress');
        cancelButtons.forEach(button => {
            button.addEventListener('click', () => {
                window.dispatchEvent(new CustomEvent('cancelImport'));
            });
        });

        modal.addEventListener('hidden.bs.modal', () => {
            this.removeModal(this.fileImportModalId);
        });
    }

    /**
     * Show modal
     */
    private showModal(modalId: string): void {
        const modalElement = document.getElementById(modalId);
        if (modalElement && (window as any).bootstrap) {
            const modal = new (window as any).bootstrap.Modal(modalElement);
            modal.show();
        }
    }

    /**
     * Hide modal
     */
    private hideModal(modalId: string): void {
        const modalElement = document.getElementById(modalId);
        if (modalElement && (window as any).bootstrap) {
            const modal = (window as any).bootstrap.Modal.getInstance(modalElement);
            if (modal) {
                modal.hide();
            }
        }
    }

    /**
     * Remove modal from DOM
     */
    private removeModal(modalId: string): void {
        const modalElement = document.getElementById(modalId);
        if (modalElement) {
            modalElement.remove();
        }
        
        // Clean up any leftover backdrop
        const backdrop = document.querySelector('.modal-backdrop');
        if (backdrop) {
            backdrop.remove();
        }
        
        document.body.classList.remove('modal-open');
        document.body.style.removeProperty('overflow');
        document.body.style.removeProperty('padding-right');
    }

    /**
     * Initialize component styles
     */
    private initializeStyles(): void {
        const styleId = 'websiteImportUIStyles';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = `
                .import-option { 
                    border: 1px solid #e9ecef; 
                    border-radius: 0.375rem; 
                    padding: 1rem; 
                    margin-bottom: 1rem; 
                    transition: all 0.2s ease; 
                    cursor: pointer; 
                } 
                .import-option:hover { 
                    border-color: #667eea; 
                    background-color: #f8f9ff; 
                } 
                .import-option.selected { 
                    border-color: #667eea; 
                    background-color: #f0f2ff; 
                    box-shadow: 0 0 0 0.2rem rgba(102, 126, 234, 0.25);
                }
                
                .file-drop-zone {
                    position: relative;
                    border: 2px dashed #dee2e6;
                    border-radius: 0.5rem;
                    padding: 2rem;
                    text-align: center;
                    transition: all 0.2s ease;
                    background-color: #f8f9fa;
                }
                
                .file-drop-zone:hover {
                    border-color: #667eea;
                    background-color: #f0f2ff;
                }
                
                .file-drop-zone.drag-over {
                    border-color: #667eea;
                    background-color: #e3f2fd;
                    border-style: solid;
                }
                
                .drop-zone-overlay {
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(102, 126, 234, 0.1);
                    border-radius: 0.5rem;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border: 2px solid #667eea;
                }
                
                .overlay-content {
                    text-align: center;
                    color: #667eea;
                }
                
                .file-list-container {
                    max-height: 300px;
                    overflow-y: auto;
                    border: 1px solid #dee2e6;
                    border-radius: 0.375rem;
                }
                
                .file-item {
                    transition: background-color 0.15s ease;
                }
                
                .file-item:hover {
                    background-color: #f8f9fa;
                }
                
                .file-item:last-child {
                    border-bottom: none !important;
                }
                
                .progress-container {
                    padding: 2rem;
                }
                
                .modal-header {
                    border-bottom: none;
                }
                
                .form-check-label {
                    cursor: pointer;
                }
                
                .collapse .card {
                    border: none;
                    box-shadow: none;
                }
                
                .btn-outline-secondary:hover {
                    color: #495057;
                    background-color: #f8f9fa;
                    border-color: #dee2e6;
                }
            `;
            document.head.appendChild(style);
        }
    }
}
