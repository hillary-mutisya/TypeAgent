// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { PDFApiService } from "./services/pdfApiService";
import { PDFSSEClient } from "./services/pdfSSEClient";
import { AnnotationManager } from "./core/annotationManager";
import { AnnotationSidebar } from "./components/annotationSidebar";
import { ContextMenu } from "./components/contextMenu";
import { TextSelectionToolbar } from "./components/textSelectionToolbar";
import { MarkdownNoteEditor } from "./components/markdownNoteEditor";

// PDF.js types
declare global {
    interface Window {
        pdfjsLib: any;
    }
}

/**
 * Basic TypeAgent PDF Viewer Application
 */
export class TypeAgentPDFViewerApp {
    private pdfDoc: any = null;
    private currentPage = 1;
    private scale = 1.0;
    private pdfApiService: PDFApiService;
    private sseClient: PDFSSEClient | null = null;
    private documentId: string | null = null;
    private annotationManager: AnnotationManager;
    private annotationSidebar: AnnotationSidebar;
    private contextMenu: ContextMenu;
    private textSelectionToolbar: TextSelectionToolbar;
    private markdownNoteEditor: MarkdownNoteEditor;
    private _loadingPDF: boolean = false;
    private _eventHandlersSetup: boolean = false;
    private _sidebarIntegrationSetup: boolean = false;
    private _phase2IntegrationSetup: boolean = false;
    private _autoZoomMode: 'auto' | 'fit' | 'width' | 'manual' = 'auto';

    constructor() {
        console.log('🔍 App: Initializing components');
        this.pdfApiService = new PDFApiService();
        this.annotationManager = new AnnotationManager(this.pdfApiService);
        this.annotationSidebar = new AnnotationSidebar();
       
        this.contextMenu = new ContextMenu();
        this.textSelectionToolbar = new TextSelectionToolbar();
        this.markdownNoteEditor = new MarkdownNoteEditor();
        
        this.setupSidebarIntegration();
        this.setupPhase2Integration();
        console.log('🔍 App: All components initialized');
    }

    /**
     * Initialize the PDF viewer application
     */
    async initialize(): Promise<void> {
        console.log("🚀 Initializing TypeAgent PDF Viewer...");

        try {
            // Set up PDF.js worker
            await this.setupPDFJS();

            // Set up UI event handlers
            this.setupEventHandlers();

            // Extract document ID from URL if present
            await this.extractDocumentId();

            // Load document if we have an ID
            if (this.documentId) {
                await this.loadDocument(this.documentId);
            } else {
                await this.loadSampleDocument();
            }

            console.log("✅ PDF Viewer initialized successfully");
        } catch (error) {
            console.error("❌ Failed to initialize PDF viewer:", error);
            this.showError(
                "Failed to initialize PDF viewer: " +
                    (error instanceof Error ? error.message : String(error)),
            );
        }
    }

    /**
     * Set up PDF.js library
     */
    private async setupPDFJS(): Promise<void> {
        // PDF.js should be available from CDN
        if (typeof window.pdfjsLib === "undefined") {
            throw new Error("PDF.js library not loaded");
        }

        // Set up worker
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
            "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.8.69/pdf.worker.min.mjs";
    }

    /**
     * Set up UI event handlers
     */
    private setupEventHandlers(): void {
        // Prevent duplicate event handler setup
        if (this._eventHandlersSetup) {
            console.log("🔧 Event handlers already set up, skipping...");
            return;
        }

        console.log("🔧 Setting up event handlers...");

        const prevBtn = document.getElementById("prevPage");
        const nextBtn = document.getElementById("nextPage");
        const pageNumInput = document.getElementById(
            "pageNum",
        ) as HTMLInputElement;
        const zoomControlButton = document.getElementById("zoomControlButton");
        const fileInput = document.getElementById(
            "fileInput",
        ) as HTMLInputElement;

        console.log("🔍 Found elements:", {
            prevBtn: !!prevBtn,
            nextBtn: !!nextBtn,
            pageNumInput: !!pageNumInput,
            zoomControlButton: !!zoomControlButton,
            fileInput: !!fileInput,
        });

        if (
            !prevBtn ||
            !nextBtn ||
            !pageNumInput ||
            !zoomControlButton ||
            !fileInput
        ) {
            console.error(
                "❌ Some UI elements not found! Retrying in 100ms...",
            );
            setTimeout(() => this.setupEventHandlers(), 100);
            return;
        }

        // Navigation events
        prevBtn.addEventListener("click", () => this.goToPreviousPage());
        nextBtn.addEventListener("click", () => this.goToNextPage());
        pageNumInput.addEventListener("change", (e) => {
            const target = e.target as HTMLInputElement;
            const pageNum = parseInt(target.value);
            if (
                pageNum &&
                pageNum >= 1 &&
                pageNum <= (this.pdfDoc?.numPages || 1)
            ) {
                this.goToPage(pageNum);
            } else {
                // Reset to current page if invalid input
                target.value = this.currentPage.toString();
            }
        });

        // Also handle Enter key
        pageNumInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter") {
                const target = e.target as HTMLInputElement;
                const pageNum = parseInt(target.value);
                if (
                    pageNum &&
                    pageNum >= 1 &&
                    pageNum <= (this.pdfDoc?.numPages || 1)
                ) {
                    this.goToPage(pageNum);
                } else {
                    target.value = this.currentPage.toString();
                }
            }
        });

        // Unified Zoom Control Events
        this.setupUnifiedZoomControl();

        // File input change events (for drag & drop and programmatic file selection)
        fileInput.addEventListener("change", (e) => this.handleFileSelect(e));

        // Add drag & drop functionality and keyboard shortcuts since we removed the Open button
        this.setupFileDropAndKeyboard();

        // Annotation tool events
        this.setupAnnotationToolHandlers();

        // Window resize handler for auto zoom modes
        window.addEventListener('resize', () => this.handleWindowResize());

        // Mouse wheel zoom handler (Ctrl + scroll wheel)
        this.setupMouseWheelZoom();

        // Mark event handlers as set up
        this._eventHandlersSetup = true;
        console.log("✅ Event handlers set up successfully");
    }

    /**
     * Setup the unified zoom control interface
     */
    private setupUnifiedZoomControl(): void {
        const zoomControlButton = document.getElementById("zoomControlButton");
        const zoomFlyout = document.getElementById("zoomFlyout");
        const zoomDisplay = document.getElementById("zoomDisplay");
        
        if (!zoomControlButton || !zoomFlyout || !zoomDisplay) {
            console.error("Zoom control elements not found");
            return;
        }

        // Toggle flyout on button click
        zoomControlButton.addEventListener("click", (e) => {
            e.stopPropagation();
            const isOpen = zoomFlyout.style.display === "block";
            if (isOpen) {
                this.closeZoomFlyout();
            } else {
                this.openZoomFlyout();
            }
        });

        // Close flyout when clicking outside
        document.addEventListener("click", (e) => {
            if (!zoomControlButton.contains(e.target as Node) && !zoomFlyout.contains(e.target as Node)) {
                this.closeZoomFlyout();
            }
        });

        // Zoom mode option buttons
        const zoomOptions = zoomFlyout.querySelectorAll(".zoom-option");
        zoomOptions.forEach(option => {
            option.addEventListener("click", async (e) => {
                const mode = (e.currentTarget as HTMLElement).getAttribute("data-mode");
                await this.handleZoomModeClick(mode);
                this.closeZoomFlyout();
            });
        });

        // Granular zoom controls
        const zoomInBtn = document.getElementById("zoomInFlyout");
        const zoomOutBtn = document.getElementById("zoomOutFlyout");
        const zoomInput = document.getElementById("zoomInput") as HTMLInputElement;

        if (zoomInBtn) {
            zoomInBtn.addEventListener("click", () => this.zoomIn());
        }
        if (zoomOutBtn) {
            zoomOutBtn.addEventListener("click", () => this.zoomOut());
        }
        if (zoomInput) {
            zoomInput.addEventListener("keypress", (e) => {
                if (e.key === "Enter") {
                    this.handleZoomInputChange(zoomInput.value);
                }
            });
            zoomInput.addEventListener("blur", () => {
                this.handleZoomInputChange(zoomInput.value);
            });
        }

        // Preset zoom buttons
        const zoomPresets = zoomFlyout.querySelectorAll(".zoom-preset");
        zoomPresets.forEach(preset => {
            preset.addEventListener("click", async (e) => {
                const zoom = parseFloat((e.currentTarget as HTMLElement).getAttribute("data-zoom") || "1");
                await this.setZoomLevel(zoom);
                this.closeZoomFlyout();
            });
        });

        // Initialize display
        this.updateZoomDisplay();
    }

    /**
     * Setup mouse wheel zoom control (Ctrl + scroll wheel)
     */
    private setupMouseWheelZoom(): void {
        // Add event listener to the viewer container to capture wheel events
        const viewerContainer = document.getElementById("viewerContainer");
        
        if (viewerContainer) {
            viewerContainer.addEventListener('wheel', (e) => {
                // Only handle wheel events with Ctrl key pressed
                if (e.ctrlKey) {
                    e.preventDefault(); // Prevent browser zoom
                    e.stopPropagation();
                    
                    // Determine zoom direction based on wheel delta
                    const delta = e.deltaY;
                    
                    if (delta < 0) {
                        // Scroll up = zoom in
                        this.handleMouseWheelZoom('in');
                    } else if (delta > 0) {
                        // Scroll down = zoom out
                        this.handleMouseWheelZoom('out');
                    }
                }
            }, { passive: false }); // passive: false allows preventDefault()
            
            console.log("🖱️ Mouse wheel zoom control set up (Ctrl + scroll wheel)");
        } else {
            console.error("Viewer container not found for mouse wheel zoom setup");
        }
    }

    /**
     * Setup file drop zone and keyboard shortcuts (since Open button was removed)
     */
    private setupFileDropAndKeyboard(): void {
        const container = document.querySelector('.container') as HTMLElement;
        const fileInput = document.getElementById("fileInput") as HTMLInputElement;
        
        if (container && fileInput) {
            // Drag & Drop events
            container.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.stopPropagation();
                container.classList.add('drag-over');
            });

            container.addEventListener('dragleave', (e) => {
                e.preventDefault();
                e.stopPropagation();
                // Only remove if actually leaving the container
                if (!container.contains(e.relatedTarget as Node)) {
                    container.classList.remove('drag-over');
                }
            });

            container.addEventListener('drop', (e) => {
                e.preventDefault();
                e.stopPropagation();
                container.classList.remove('drag-over');
                
                const files = e.dataTransfer?.files;
                if (files && files.length > 0) {
                    const file = files[0];
                    if (file.type === 'application/pdf') {
                        // Simulate file input change
                        fileInput.files = files;
                        this.handleFileSelect({ target: fileInput } as any);
                    } else {
                        this.showError('Please drop a PDF file.');
                    }
                }
            });

            // Keyboard shortcut: Ctrl+O to open file
            document.addEventListener('keydown', (e) => {
                if (e.ctrlKey && e.key === 'o') {
                    e.preventDefault();
                    fileInput.click();
                }
            });

            console.log("📁 File drop zone and keyboard shortcuts set up (Ctrl+O to open, drag & drop supported)");
        }
    }

    /**
     * Handle mouse wheel zoom events
     */
    private async handleMouseWheelZoom(direction: 'in' | 'out'): Promise<void> {
        const zoomFactor = 1.1; // 10% zoom increment for smooth scrolling
        const oldScale = this.scale;
        
        if (direction === 'in') {
            this.scale = Math.min(this.scale * zoomFactor, 3.0);
        } else {
            this.scale = Math.max(this.scale / zoomFactor, 0.25);
        }
        
        // Only re-render if zoom actually changed
        if (Math.abs(this.scale - oldScale) > 0.001) {
            console.log(`🖱️ Mouse wheel zoom ${direction}: ${oldScale.toFixed(3)} → ${this.scale.toFixed(3)}`);
            
            // Switch to manual mode for mouse wheel zoom
            this._autoZoomMode = 'manual';
            
            // Store current scroll position
            const scrollPosition = this.getCurrentScrollPosition();
            
            // Re-render with new scale
            await this.renderAllPages();
            this.updateScaleIndicator();
            
            // Restore scroll position
            setTimeout(() => {
                this.restoreScrollPosition(scrollPosition);
            }, 50); // Shorter delay for responsive feel
        }
    }

    /**
     * Open file dialog
     */
    private openFileDialog(): void {
        const fileInput = document.getElementById(
            "fileInput",
        ) as HTMLInputElement;
        if (fileInput) {
            fileInput.click();
        }
    }

    /**
     * Coordinate PDF loading to prevent multiple simultaneous loads
     */
    private async ensureSinglePDFLoad(loadingFn: () => Promise<void>): Promise<void> {
        if (this._loadingPDF) {
            console.log('📄 PDF loading already in progress, skipping...');
            return;
        }

        this._loadingPDF = true;
        try {
            // Cleanup any existing annotation system
            await this.annotationManager.cleanup();
            await loadingFn();
        } finally {
            this._loadingPDF = false;
        }
    }

    /**
     * Handle file selection from dialog
     */
    private async handleFileSelect(event: Event): Promise<void> {
        const target = event.target as HTMLInputElement;
        const file = target.files?.[0];

        if (!file) {
            return;
        }

        if (file.type !== "application/pdf") {
            this.showError("Please select a valid PDF file.");
            return;
        }

        try {
            await this.ensureSinglePDFLoad(async () => {
                console.log("📁 Loading selected file:", file.name);
                this.showLoading(`Loading ${file.name}...`);

                // Read file as array buffer
                const arrayBuffer = await file.arrayBuffer();

                // Load PDF from array buffer
                const loadingTask = window.pdfjsLib.getDocument(arrayBuffer);
                this.pdfDoc = await loadingTask.promise;

                console.log(
                    "📄 PDF loaded from file. Pages:",
                    this.pdfDoc.numPages,
                );

                // Update UI
                this.updatePageCount();
                this.currentPage = 1;
                
                // Calculate and apply automatic zoom before rendering
                await this.applyInitialAutoZoom();
                
                // Render all pages for continuous scrolling
                await this.renderAllPages();

                // Initialize annotation system
                if (this.documentId) {
                    await this.annotationManager.initialize(this.documentId, this.pdfDoc);
                }

                // Setup scroll tracking for page navigation
                this.setupScrollTracking();
            });

            // Clear the file input for next use
            target.value = "";
        } catch (error) {
            console.error("❌ Failed to load PDF file:", error);
            this.showError(
                "Failed to load PDF file. Please make sure it is a valid PDF document.",
            );
            target.value = "";
        }
    }

    /**
     * Extract document ID or URL from path and query parameters
     */
    private async extractDocumentId(): Promise<void> {
        const path = window.location.pathname;
        const urlParams = new URLSearchParams(window.location.search);

        // Check for URL parameter (for direct PDF URLs)
        const fileUrl = urlParams.get("url") || urlParams.get("file");
        if (fileUrl) {
            console.log("📄 PDF URL from query parameter:", fileUrl);
            try {
                // Register the URL with the server to get a document ID
                const document = await this.pdfApiService.registerUrlDocument(fileUrl);
                this.documentId = document.id;
                console.log("📄 Registered URL, got document ID:", this.documentId);
                return;
            } catch (error) {
                console.error("❌ Failed to register URL with server:", error);
                // Fallback: use URL as document ID (for backward compatibility)
                this.documentId = fileUrl;
                console.log("📄 Using URL as document ID (fallback):", this.documentId);
                return;
            }
        }

        // Check for document ID in path
        const match = path.match(/\/pdf\/(.+)/);
        if (match && match[1]) {
            this.documentId = match[1];
            console.log("📄 Document ID from URL:", this.documentId);
        }
    }

    /**
     * Load a PDF document
     */
    async loadDocument(documentId: string): Promise<void> {
        try {
            this.showLoading("Loading document...");

            // Check if documentId is a direct URL (including from file query param)
            if (this.isUrl(documentId)) {
                console.log("📄 Loading PDF from URL:", documentId);
                await this.loadPDFFromUrl(documentId);
                return;
            }

            // Check if we have a file query parameter that should be loaded as URL
            const urlParams = new URLSearchParams(window.location.search);
            const fileParam = urlParams.get("file") || urlParams.get("url");
            
            if (fileParam && this.isUrl(fileParam)) {
                console.log("📄 Loading PDF from file query parameter:", fileParam);
                await this.loadPDFFromUrl(fileParam);
                return;
            }

            // Otherwise, treat as document ID and get from API
            console.log("📄 Loading document via API:", documentId);

            try {
                // Get document metadata from API
                const docInfo = await this.pdfApiService.getDocument(documentId);
                console.log("📋 Document info:", docInfo);

                // If the document has a URL, load it directly
                if (docInfo.url) {
                    console.log("📄 Document has URL, loading from:", docInfo.url);
                    await this.loadPDFFromUrl(docInfo.url);
                    return;
                }

                // If the document has file data, handle it appropriately
                if (docInfo.fileData || docInfo.filePath) {
                    console.log("📄 Loading document from server storage");
                    // This would be implemented based on your server's file serving approach
                    // For now, fallback to sample document
                    await this.loadSampleDocument();
                    return;
                }

                // Fallback if no specific loading method is available
                console.log("📄 No specific loading method found, using sample document");
                await this.loadSampleDocument();

            } catch (apiError) {
                console.error("❌ Failed to get document from API:", apiError);
                
                // If API fails but we have a potential URL as documentId, try loading it directly
                if (documentId.includes('http') || documentId.includes('.pdf')) {
                    console.log("📄 API failed, attempting to load documentId as URL:", documentId);
                    await this.loadPDFFromUrl(documentId);
                    return;
                }
                
                // Final fallback
                console.log("📄 All methods failed, loading sample document");
                await this.loadSampleDocument();
            }

            // Set up SSE connection for real-time features
            this.setupSSEConnection(documentId);
        } catch (error) {
            console.error("❌ Failed to load document:", error);
            this.showError(
                "Failed to load document: " +
                    (error instanceof Error ? error.message : String(error)),
            );
        }
    }

    /**
     * Check if a string is a valid URL
     */
    private isUrl(str: string): boolean {
        try {
            new URL(str);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Load PDF directly from a URL
     */
    async loadPDFFromUrl(url: string): Promise<void> {
        try {
            await this.ensureSinglePDFLoad(async () => {
                this.showLoading("Loading PDF from URL...");

                const loadingTask = window.pdfjsLib.getDocument(url);
                this.pdfDoc = await loadingTask.promise;

                console.log("📄 PDF loaded from URL. Pages:", this.pdfDoc.numPages);

                // Update UI
                this.updatePageCount();
                this.currentPage = 1;
                
                // Calculate and apply automatic zoom before rendering
                await this.applyInitialAutoZoom();
                
                // Render all pages for continuous scrolling
                await this.renderAllPages();

                // Initialize annotation system
                if (this.documentId) {
                    await this.annotationManager.initialize(this.documentId, this.pdfDoc);
                }

                // Setup scroll tracking for page navigation
                this.setupScrollTracking();
            });
        } catch (error) {
            console.error("❌ Failed to load PDF from URL:", error);
            this.showError(
                "Failed to load PDF from URL. Please check if the URL is accessible and points to a valid PDF file.",
            );
        }
    }

    /**
     * Load a sample PDF document for demonstration
     */
    async loadSampleDocument(): Promise<void> {
        try {
            await this.ensureSinglePDFLoad(async () => {
                this.showLoading("Loading sample document...");

                // Use a sample PDF URL - you can replace this with your own
                const samplePdfUrl =
                    "https://raw.githubusercontent.com/mozilla/pdf.js/ba2edeae/web/compressed.tracemonkey-pldi-09.pdf";

                const loadingTask = window.pdfjsLib.getDocument(samplePdfUrl);
                this.pdfDoc = await loadingTask.promise;

                console.log("📄 PDF loaded. Pages:", this.pdfDoc.numPages);

                // Update UI
                this.updatePageCount();
                this.currentPage = 1;
                
                // Calculate and apply automatic zoom before rendering
                await this.applyInitialAutoZoom();
                
                // Render all pages for continuous scrolling
                await this.renderAllPages();

                // Initialize annotation system
                if (this.documentId) {
                    await this.annotationManager.initialize(this.documentId, this.pdfDoc);
                }

                // Setup scroll tracking for page navigation
                this.setupScrollTracking();
            });
        } catch (error) {
            console.error("❌ Failed to load sample document:", error);
            this.showError("Failed to load PDF document");
        }
    }
    /**
     * Render all pages for continuous scrolling
     */
    async renderAllPages(): Promise<void> {
        if (!this.pdfDoc) {
            throw new Error("No PDF document loaded");
        }

        // Prevent multiple simultaneous renders
        if ((this as any)._rendering) {
            console.log("🔄 Already rendering, skipping...");
            return;
        }

        try {
            (this as any)._rendering = true;
            console.log("🎨 Rendering all pages for continuous scrolling...");
            
            const container = document.getElementById("viewerContainer");
            if (!container) {
                throw new Error("Viewer container not found");
            }

            // Clear container completely
            container.innerHTML = "";
            container.style.cssText = `
                overflow-y: auto;
                padding: 20px;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 20px;
                background: #323639;
            `;

            // Create all page wrappers first (to prevent race conditions)
            const pagePromises = [];
            for (let pageNum = 1; pageNum <= this.pdfDoc.numPages; pageNum++) {
                pagePromises.push(this.renderPageInContainer(pageNum, container));
            }

            // Wait for all pages to render
            await Promise.all(pagePromises);

            console.log(`✅ All ${this.pdfDoc.numPages} pages rendered successfully`);
            
        } catch (error) {
            console.error("❌ Failed to render pages:", error);
            this.showError("Failed to render PDF pages");
        } finally {
            (this as any)._rendering = false;
        }
    }

    /**
     * Render a single page in the continuous scroll container
     */
    private async renderPageInContainer(pageNum: number, container: HTMLElement): Promise<void> {
        try {
            // Check if page already exists (prevent duplicates) - more robust check
            const existingPages = container.querySelectorAll(`[data-page-number="${pageNum}"]`);
            if (existingPages.length > 0) {
                console.log(`⚠️ Page ${pageNum} already exists (${existingPages.length} copies), removing duplicates and creating fresh`);
                existingPages.forEach(page => page.remove());
            }

            const page = await this.pdfDoc.getPage(pageNum);
            const viewport = page.getViewport({ scale: this.scale });

            // Create page wrapper
            const pageWrapper = document.createElement('div');
            pageWrapper.className = 'page-wrapper';
            pageWrapper.setAttribute('data-page-number', pageNum.toString());
            pageWrapper.style.cssText = `
                position: relative;
                margin-bottom: 20px;
                box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
                border: 1px solid #555;
                background: white;
                width: ${viewport.width}px;
                height: ${viewport.height}px;
            `;

            // Create canvas
            const canvas = document.createElement("canvas");
            const context = canvas.getContext("2d");
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            canvas.className = "page";

            // Add canvas to wrapper and wrapper to container
            pageWrapper.appendChild(canvas);
            container.appendChild(pageWrapper);

            // Render page
            const renderContext = {
                canvasContext: context,
                viewport: viewport,
            };

            await page.render(renderContext).promise;

            // Enable text layer for this page (after canvas is rendered)
            await this.enableTextLayerForPage(pageNum, pageWrapper, viewport);

            // Setup annotations for this page
            if (this.documentId) {
                const pageRenderEvent = new CustomEvent('pageRendered', {
                    detail: {
                        pageNum: pageNum,
                        pageElement: pageWrapper,
                        viewport: viewport
                    }
                });
                document.dispatchEvent(pageRenderEvent);
            }

            console.log(`✅ Page ${pageNum} rendered successfully`);
        } catch (error) {
            console.error(`❌ Failed to render page ${pageNum}:`, error);
        }
    }

    /**
     * Enable text layer for a specific page
     */
    private async enableTextLayerForPage(pageNum: number, pageWrapper: HTMLElement, viewport: any): Promise<void> {
        try {
            // Get the page
            const page = await this.pdfDoc.getPage(pageNum);
            
            // Get text content
            const textContent = await page.getTextContent();

            // Create text layer
            const textLayerDiv = document.createElement('div');
            textLayerDiv.className = 'textLayer';
            textLayerDiv.setAttribute('data-page-number', pageNum.toString());

            // Position over canvas using canvas pixel dimensions (not CSS dimensions)
            const canvas = pageWrapper.querySelector('canvas') as HTMLCanvasElement;
            
            textLayerDiv.style.cssText = `
                position: absolute;
                left: 0;
                top: 0;
                width: ${viewport.width}px;
                height: ${viewport.height}px;
                overflow: hidden;
                line-height: 1.0;
                pointer-events: auto;
                user-select: text;
                z-index: 2;
                transform-origin: 0% 0%;
                transform: scale(${canvas.width / viewport.width}, ${canvas.height / viewport.height});
            `;

            // Render text layer with improved positioning
            await this.renderTextLayerManual(textLayerDiv, textContent, viewport);
            pageWrapper.appendChild(textLayerDiv);

            console.log(`📝 Text layer enabled for page ${pageNum} at scale ${this.scale.toFixed(2)}`);
        } catch (error) {
            console.error(`❌ Failed to enable text layer for page ${pageNum}:`, error);
        }
    }

    /**
     * Manual text layer rendering (fallback)
     */
    private async renderTextLayerManual(textLayerDiv: HTMLElement, textContent: any, viewport: any): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                // Clear existing content
                textLayerDiv.innerHTML = '';

                // Render each text item with improved positioning and width constraints
                textContent.items.forEach((textItem: any) => {
                    const textSpan = document.createElement('span');
                    textSpan.textContent = textItem.str;
                    
                    // Get transform matrix
                    const [a, b, c, d, e, f] = textItem.transform;
                    
                    // Calculate position relative to viewport (not scaled)
                    const x = e;
                    const y = viewport.height - f;
                    const scaleX = Math.abs(a);
                    const scaleY = Math.abs(d);
                    const fontSize = scaleY;
                    
                    // Calculate text width based on PDF text item width
                    // Use the PDF's intrinsic width if available, otherwise estimate
                    const textWidth = textItem.width && textItem.width > 0 ? 
                        Math.abs(textItem.width) : 
                        fontSize * textItem.str.length * 0.6;
                    
                    textSpan.style.cssText = `
                        position: absolute;
                        color: transparent;
                        white-space: pre;
                        cursor: text;
                        transform-origin: 0% 0%;
                        left: ${x}px;
                        top: ${y - fontSize}px;
                        font-size: ${fontSize}px;
                        font-family: sans-serif;
                        line-height: 1;
                        user-select: text;
                        pointer-events: auto;
                        height: ${fontSize}px;
                        width: ${textWidth}px;
                        max-width: ${textWidth}px;
                        overflow: hidden;
                        box-sizing: border-box;
                    `;

                    textLayerDiv.appendChild(textSpan);
                });

                console.log(`📝 Rendered ${textContent.items.length} text items`);
                resolve();
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Setup scroll tracking for page navigation
     */
    private setupScrollTracking(): void {
        const container = document.getElementById('viewerContainer');
        if (!container) return;

        // Debounce function to limit scroll event frequency
        let scrollTimeout: number;
        const debounce = (func: Function, wait: number) => {
            return (...args: any[]) => {
                clearTimeout(scrollTimeout);
                scrollTimeout = window.setTimeout(() => func.apply(this, args), wait);
            };
        };

        const debouncedScrollHandler = debounce(() => {
            this.updateCurrentPageFromScroll();
        }, 100);

        container.addEventListener('scroll', debouncedScrollHandler);
        console.log("📜 Scroll tracking enabled");
    }

    /**
     * Update current page based on scroll position
     */
    private updateCurrentPageFromScroll(): void {
        const container = document.getElementById('viewerContainer');
        if (!container) return;

        const containerRect = container.getBoundingClientRect();
        const pages = container.querySelectorAll('.page-wrapper');
        
        let mostVisiblePage = 1;
        let maxVisibleArea = 0;

        pages.forEach((page, index) => {
            const rect = page.getBoundingClientRect();
            
            // Calculate visible area
            const visibleTop = Math.max(rect.top, containerRect.top);
            const visibleBottom = Math.min(rect.bottom, containerRect.bottom);
            const visibleHeight = Math.max(0, visibleBottom - visibleTop);
            
            if (visibleHeight > maxVisibleArea) {
                maxVisibleArea = visibleHeight;
                mostVisiblePage = index + 1;
            }
        });

        if (mostVisiblePage !== this.currentPage) {
            this.currentPage = mostVisiblePage;
            this.updateCurrentPageIndicator();
        }
    }

    /**
     * Refresh text layers for all visible pages (useful after zoom)
     */
    private async refreshTextLayers(): Promise<void> {
        try {
            const container = document.getElementById('viewerContainer');
            if (!container) return;

            const pageWrappers = container.querySelectorAll('.page-wrapper');
            
            for (const pageWrapper of pageWrappers) {
                const pageNum = parseInt(pageWrapper.getAttribute('data-page-number') || '1');
                
                // Remove existing text layer
                const existingTextLayer = pageWrapper.querySelector('.textLayer');
                if (existingTextLayer) {
                    existingTextLayer.remove();
                }
                
                // Re-create text layer with current scale
                const page = await this.pdfDoc.getPage(pageNum);
                const viewport = page.getViewport({ scale: this.scale });
                await this.enableTextLayerForPage(pageNum, pageWrapper as HTMLElement, viewport);
            }
            
            console.log('🔄 Text layers refreshed for all pages');
        } catch (error) {
            console.error('❌ Failed to refresh text layers:', error);
        }
    }

    /**
     * Render a specific page (legacy method - now scrolls to page)
     */
    async renderPage(pageNum: number): Promise<void> {
        // For backward compatibility, scroll to the specified page
        await this.goToPage(pageNum);
    }

    /**
     * Navigate to previous page
     */
    async goToPreviousPage(): Promise<void> {
        if (this.currentPage > 1) {
            await this.goToPage(this.currentPage - 1);
        }
    }

    /**
     * Navigate to next page
     */
    async goToNextPage(): Promise<void> {
        if (this.pdfDoc && this.currentPage < this.pdfDoc.numPages) {
            await this.goToPage(this.currentPage + 1);
        }
    }

    /**
     * Go to specific page
     */
    async goToPage(pageNum: number): Promise<void> {
        if (!this.pdfDoc || pageNum < 1 || pageNum > this.pdfDoc.numPages) {
            return;
        }

        const container = document.getElementById('viewerContainer');
        if (!container) return;

        // Find the page wrapper for the target page
        const pageWrapper = container.querySelector(`[data-page-number="${pageNum}"]`) as HTMLElement;
        if (!pageWrapper) return;

        // Scroll to the page
        pageWrapper.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'start' 
        });

        // Update current page
        this.currentPage = pageNum;
        this.updateCurrentPageIndicator();
    }

    /**
     * Zoom in
     */
    async zoomIn(): Promise<void> {
        const oldScale = this.scale;
        this.scale = Math.min(this.scale * 1.2, 3.0);
        
        console.log(`🔍 Zooming in: ${oldScale.toFixed(2)} → ${this.scale.toFixed(2)}`);
        
        // Switch to manual mode when user manually adjusts zoom
        this._autoZoomMode = 'manual';
        
        // Store current scroll position relative to current page
        const scrollPosition = this.getCurrentScrollPosition();
        
        // Re-render all pages with new scale
        await this.renderAllPages();
        this.updateScaleIndicator(); // This now also updates zoom display
        
        // Restore scroll position after a brief delay to allow rendering
        setTimeout(() => {
            this.restoreScrollPosition(scrollPosition);
        }, 100);
    }

    /**
     * Zoom out
     */
    async zoomOut(): Promise<void> {
        const oldScale = this.scale;
        this.scale = Math.max(this.scale / 1.2, 0.3);
        
        console.log(`🔍 Zooming out: ${oldScale.toFixed(2)} → ${this.scale.toFixed(2)}`);
        
        // Switch to manual mode when user manually adjusts zoom
        this._autoZoomMode = 'manual';
        
        // Store current scroll position relative to current page
        const scrollPosition = this.getCurrentScrollPosition();
        
        // Re-render all pages with new scale
        await this.renderAllPages();
        this.updateScaleIndicator(); // This now also updates zoom display
        
        // Restore scroll position after a brief delay to allow rendering
        setTimeout(() => {
            this.restoreScrollPosition(scrollPosition);
        }, 100);
    }

    /**
     * Get current scroll position relative to current page
     */
    private getCurrentScrollPosition(): { pageNum: number; relativeY: number } {
        const container = document.getElementById('viewerContainer');
        if (!container) return { pageNum: this.currentPage, relativeY: 0 };
        
        const currentPageElement = container.querySelector(`[data-page-number="${this.currentPage}"]`) as HTMLElement;
        if (!currentPageElement) return { pageNum: this.currentPage, relativeY: 0 };
        
        const containerRect = container.getBoundingClientRect();
        const pageRect = currentPageElement.getBoundingClientRect();
        
        // Calculate how far down the current page we are (0 = top, 1 = bottom)
        const relativeY = Math.max(0, Math.min(1, 
            (containerRect.top - pageRect.top) / pageRect.height
        ));
        
        return { pageNum: this.currentPage, relativeY };
    }

    /**
     * Restore scroll position after zoom
     */
    private restoreScrollPosition(scrollPosition: { pageNum: number; relativeY: number }): void {
        const container = document.getElementById('viewerContainer');
        if (!container) return;
        
        const pageElement = container.querySelector(`[data-page-number="${scrollPosition.pageNum}"]`) as HTMLElement;
        if (!pageElement) return;
        
        const pageRect = pageElement.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        
        // Calculate target scroll position
        const targetY = pageRect.top - containerRect.top + (pageRect.height * scrollPosition.relativeY);
        
        // Scroll to maintain relative position
        container.scrollBy({
            top: targetY,
            behavior: 'auto' // Use 'auto' for immediate positioning
        });
    }

    /**
     * Update page count display
     */
    private updatePageCount(): void {
        const pageCountElement = document.getElementById("pageCount");
        if (pageCountElement && this.pdfDoc) {
            pageCountElement.textContent = this.pdfDoc.numPages.toString();
        }
    }

    /**
     * Update current page indicator and navigation buttons
     */
    private updateCurrentPageIndicator(): void {
        const pageNumInput = document.getElementById(
            "pageNum",
        ) as HTMLInputElement;
        const prevBtn = document.getElementById(
            "prevPage",
        ) as HTMLButtonElement;
        const nextBtn = document.getElementById(
            "nextPage",
        ) as HTMLButtonElement;

        if (pageNumInput) {
            pageNumInput.value = this.currentPage.toString();
        }

        // Update navigation button states
        if (prevBtn) {
            prevBtn.disabled = this.currentPage <= 1;
        }

        if (nextBtn && this.pdfDoc) {
            nextBtn.disabled = this.currentPage >= this.pdfDoc.numPages;
        }
    }

    /**
     * Update scale indicator
     */
    private updateScaleIndicator(): void {
        const scaleElement = document.getElementById("scale");
        if (scaleElement) {
            scaleElement.textContent = Math.round(this.scale * 100) + "%";
        }
    }

    /**
     * Set up SSE connection for real-time features
     */
    private setupSSEConnection(documentId: string): void {
        try {
            this.sseClient = new PDFSSEClient(documentId);
            this.sseClient.on("annotation-added", (data: any) => {
                console.log("📝 Annotation added:", data);
            });
            this.sseClient.on("annotation-updated", (data: any) => {
                console.log("📝 Annotation updated:", data);
            });
            this.sseClient.on("user-joined", (data: any) => {
                console.log("👤 User joined:", data);
            });
        } catch (error) {
            console.warn("⚠️ Failed to set up SSE connection:", error);
        }
    }

    /**
     * Show loading message
     */
    private showLoading(message: string): void {
        const container = document.getElementById("viewerContainer");
        if (container) {
            container.innerHTML = `
                <div class="loading">
                    <div>🔄 ${message}</div>
                </div>
            `;
        }
    }

    /**
     * Hide loading state
     */
    private hideLoadingState(): void {
        // Loading state is hidden when content is rendered to the container
        // This method is kept for consistency with the rendering flow
    }

    /**
     * Show error message
     */
    private showError(message: string): void {
        const container = document.getElementById("viewerContainer");
        if (container) {
            container.innerHTML = `
                <div class="error">
                    <div>❌ Error</div>
                    <p>${message}</p>
                    <button onclick="window.location.reload()" 
                            style="margin-top: 20px; padding: 10px 20px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer;">
                        Reload Page
                    </button>
                </div>
            `;
        }
    }

    /**
     * Setup annotation tool event handlers
     */
    private setupAnnotationToolHandlers(): void {
        // Tool buttons
        const selectTool = document.getElementById('selectTool');
        const highlightTool = document.getElementById('highlightTool');
        const noteTool = document.getElementById('noteTool');
        const inkTool = document.getElementById('inkTool');

        // Color pickers
        const highlightColorPicker = document.getElementById('highlightColorPicker');
        const inkControls = document.getElementById('inkControls');
        const inkThickness = document.getElementById('inkThickness') as HTMLInputElement;

        if (!selectTool || !highlightTool || !noteTool || !inkTool) {
            console.warn('⚠️ Some annotation tool elements not found');
            return;
        }

        // Tool selection handlers
        selectTool.addEventListener('click', () => this.setAnnotationTool('select'));
        highlightTool.addEventListener('click', () => this.setAnnotationTool('highlight'));
        noteTool.addEventListener('click', () => this.setAnnotationTool('note'));
        inkTool.addEventListener('click', () => this.setAnnotationTool('ink'));

        // Highlight color picker
        if (highlightColorPicker) {
            highlightTool.addEventListener('click', (event) => {
                event.stopPropagation();
                const isVisible = highlightColorPicker.style.display !== 'none';
                this.hideAllToolPanels();
                if (!isVisible) {
                    highlightColorPicker.style.display = 'flex';
                }
            });

            highlightColorPicker.addEventListener('click', (event) => {
                const target = event.target as HTMLElement;
                if (target.classList.contains('color-option')) {
                    const color = target.getAttribute('data-color');
                    if (color) {
                        this.setHighlightColor(color);
                        // Update active color
                        highlightColorPicker.querySelectorAll('.color-option').forEach(opt => {
                            opt.classList.remove('active');
                        });
                        target.classList.add('active');
                    }
                }
            });
        }

        // Ink controls
        if (inkControls && inkTool) {
            inkTool.addEventListener('click', (event) => {
                event.stopPropagation();
                const isVisible = inkControls.style.display !== 'none';
                this.hideAllToolPanels();
                if (!isVisible && this.annotationManager.getActiveTool() === 'ink') {
                    inkControls.style.display = 'block';
                }
            });

            // Thickness control
            if (inkThickness) {
                inkThickness.addEventListener('input', () => {
                    const thickness = parseInt(inkThickness.value);
                    this.annotationManager.setInkProperties(
                        this.annotationManager.getCurrentInkProperties().color,
                        thickness
                    );
                });
            }

            // Ink color selection
            const inkColors = inkControls.querySelector('.ink-colors');
            if (inkColors) {
                inkColors.addEventListener('click', (event) => {
                    const target = event.target as HTMLElement;
                    if (target.classList.contains('color-option')) {
                        const color = target.getAttribute('data-color');
                        if (color) {
                            this.setInkColor(color);
                            // Update active color
                            inkColors.querySelectorAll('.color-option').forEach(opt => {
                                opt.classList.remove('active');
                            });
                            target.classList.add('active');
                        }
                    }
                });
            }
        }

        // Hide tool panels when clicking outside
        document.addEventListener('click', (event) => {
            const target = event.target;
            if (target instanceof Element && !target.closest('.annotation-tools')) {
                this.hideAllToolPanels();
            }
        });

        console.log('🔧 Annotation tool handlers setup complete');
    }

    /**
     * Set active annotation tool
     */
    private setAnnotationTool(tool: 'select' | 'highlight' | 'note' | 'ink'): void {
        // Update tool buttons
        document.querySelectorAll('.tool-button').forEach(btn => {
            btn.classList.remove('active');
        });

        const activeBtn = document.getElementById(tool + 'Tool');
        if (activeBtn) {
            activeBtn.classList.add('active');
        }

        // Set tool in annotation manager
        this.annotationManager.setActiveTool(tool);

        // Hide tool panels except for the active tool
        this.hideAllToolPanels();
        
        console.log('🔧 Annotation tool set to:', tool);
    }

    /**
     * Hide all tool control panels
     */
    private hideAllToolPanels(): void {
        const highlightColorPicker = document.getElementById('highlightColorPicker');
        const inkControls = document.getElementById('inkControls');

        if (highlightColorPicker) {
            highlightColorPicker.style.display = 'none';
        }
        if (inkControls) {
            inkControls.style.display = 'none';
        }
    }

    /**
     * Set highlight color
     */
    private setHighlightColor(color: string): void {
        this.annotationManager.setHighlightColor(color);
        console.log('🎨 Highlight color set to:', color);
    }

    /**
     * Set ink color
     */
    private setInkColor(color: string): void {
        const currentProps = this.annotationManager.getCurrentInkProperties();
        this.annotationManager.setInkProperties(color, currentProps.thickness);
        console.log('🎨 Ink color set to:', color);
    }
    /**
     * Setup integration between annotation manager and sidebar
     */
    private setupSidebarIntegration(): void {
        // Prevent duplicate setup
        if (this._sidebarIntegrationSetup) {
            console.log("📁 Sidebar integration already set up, skipping...");
            return;
        }

        console.log("📁 Setting up sidebar integration...");

        // Listen for sidebar toggle
        document.addEventListener('click', (event) => {
            const target = event.target;
            if (target instanceof Element && (target.id === 'sidebarToggle' || target.closest('#sidebarToggle'))) {
                this.annotationSidebar.toggle();
            }
        });

        // Listen for annotation requests from sidebar
        document.addEventListener('getAnnotations', (event: any) => {
            const { filter, search } = event.detail;
            const annotations = this.getFilteredAnnotations(filter, search);
            this.annotationSidebar.updateAnnotations(annotations);
        });

        // Listen for annotation selection from sidebar
        document.addEventListener('annotationItemSelected', (event: any) => {
            const annotation = event.detail;
            this.navigateToAnnotation(annotation);
        });

        // Listen for export requests
        document.addEventListener('exportAnnotationsRequested', () => {
            this.exportAnnotations();
        });

        // Listen for clear all requests
        document.addEventListener('clearAllAnnotationsRequested', () => {
            this.clearAllAnnotations();
        });

        this._sidebarIntegrationSetup = true;
        console.log("✅ Sidebar integration set up successfully");
    }

    /**
     * Get filtered annotations for sidebar
     */
    private getFilteredAnnotations(filter: string, search: string): any[] {
        let annotations = this.annotationManager.getAllAnnotations();

        // Apply type filter
        if (filter && filter !== 'all') {
            annotations = annotations.filter(annotation => {
                if (filter === 'highlight' && 'selectedText' in annotation) return true;
                if (filter === 'note' && 'content' in annotation && !('strokes' in annotation)) return true;
                if (filter === 'drawing' && 'strokes' in annotation) return true;
                return false;
            });
        }

        // Apply search filter
        if (search) {
            const searchLower = search.toLowerCase();
            annotations = annotations.filter(annotation => {
                if ('selectedText' in annotation) {
                    return annotation.selectedText.toLowerCase().includes(searchLower);
                }
                if ('content' in annotation && !('strokes' in annotation)) {
                    return (annotation as any).content.toLowerCase().includes(searchLower);
                }
                return false;
            });
        }

        // Convert to sidebar format
        return annotations.map(annotation => ({
            id: annotation.id,
            type: this.getAnnotationType(annotation),
            page: annotation.page,
            preview: this.getAnnotationPreview(annotation),
            createdAt: annotation.createdAt,
            userId: annotation.userId
        }));
    }

    /**
     * Get annotation type string
     */
    private getAnnotationType(annotation: any): string {
        if ('selectedText' in annotation) return 'highlight';
        if ('content' in annotation && !('strokes' in annotation)) return 'note';
        if ('strokes' in annotation) return 'drawing';
        return 'unknown';
    }

    /**
     * Get annotation preview text
     */
    private getAnnotationPreview(annotation: any): string {
        if ('selectedText' in annotation) {
            return annotation.selectedText.substring(0, 100) + (annotation.selectedText.length > 100 ? '...' : '');
        }
        if ('content' in annotation && !('strokes' in annotation)) {
            return (annotation as any).content.substring(0, 100) + ((annotation as any).content.length > 100 ? '...' : '');
        }
        if ('strokes' in annotation) {
            const strokeCount = (annotation as any).strokes.length;
            return `Drawing with ${strokeCount} stroke${strokeCount !== 1 ? 's' : ''}`;
        }
        return 'Unknown annotation';
    }

    /**
     * Navigate to annotation on page
     */
    private navigateToAnnotation(annotation: any): void {
        // Navigate to page if different
        if (annotation.page !== this.currentPage) {
            this.goToPage(annotation.page);
        }

        // Highlight or focus the annotation
        setTimeout(() => {
            const annotationElement = document.querySelector(`[data-annotation-id="${annotation.id}"], [data-highlight-id="${annotation.id}"], [data-note-id="${annotation.id}"]`);
            if (annotationElement) {
                annotationElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                
                // Add temporary highlight
                annotationElement.classList.add('highlighted');
                setTimeout(() => {
                    annotationElement.classList.remove('highlighted');
                }, 2000);
            }
        }, 100);
    }

    /**
     * Export annotations
     */
    private exportAnnotations(): void {
        try {
            const annotations = this.annotationManager.exportAnnotations('json');
            const blob = new Blob([annotations], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `annotations-${this.documentId || 'document'}-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            console.log('📄 Annotations exported');
        } catch (error) {
            console.error('Failed to export annotations:', error);
        }
    }

    /**
     * Setup Phase 2 component integration
     */
    private setupPhase2Integration(): void {
        // Prevent duplicate setup
        if (this._phase2IntegrationSetup) {
            console.log("🎯 Phase 2 integration already set up, skipping...");
            return;
        }

        console.log("🎯 Setting up Phase 2 integration...");

        // Context Menu Integration
        this.contextMenu.on('highlight-selected', (data) => {
            this.annotationManager.getHighlightManager().createHighlightFromSelection(
                data.selection,
                data.color,
                data.pageElement
            );
        });

        this.contextMenu.on('note-create', (data) => {
            if (data.selectedText) {
                this.annotationManager.getNoteManager().createNoteFromSelection(
                    data.selectedText,
                    data.pageElement,
                    true // Use markdown editor
                );
            } else {
                // Create note at specific position
                const pageNum = this.getPageNumberFromElement(data.pageElement);
                if (pageNum) {
                    this.markdownNoteEditor.show(pageNum, data.position);
                }
            }
        });

        this.contextMenu.on('highlight-delete', async (data) => {
            await this.annotationManager.getHighlightManager().deleteHighlight(data.highlightId);
        });

        this.contextMenu.on('highlight-change-color', async (data) => {
            await this.annotationManager.getHighlightManager().changeHighlightColor(
                data.highlightId,
                data.color
            );
        });

        this.contextMenu.on('copy-text', (data) => {
            if (navigator.clipboard) {
                navigator.clipboard.writeText(data.text);
            }
        });

        // Text Selection Toolbar Integration
        this.textSelectionToolbar.on('highlight-created', (data) => {
            this.annotationManager.getHighlightManager().createHighlightFromSelection(
                data.selection,
                data.color,
                data.pageElement
            );
        });

        this.textSelectionToolbar.on('note-created', (data) => {
            this.annotationManager.getNoteManager().createNoteFromSelection(
                data.selection.toString(),
                data.pageElement,
                true // Use markdown editor
            );
        });

        this.textSelectionToolbar.on('text-copied', (data) => {
            console.log('Text copied via toolbar:', data.text);
        });

        // Markdown Note Editor Integration
        this.markdownNoteEditor.on('note-saved', async (data) => {
            await this.annotationManager.getNoteManager().createNoteWithContent(
                data.pageNumber,
                data.position,
                data.content,
                data.contentType,
                data.selectedText
            );
        });

        this.markdownNoteEditor.on('note-cancelled', () => {
            console.log('Note creation cancelled');
        });

        // Listen for custom events to show markdown editor
        document.addEventListener('show-markdown-editor', (event: any) => {
            const { pageNumber, position, initialContent, selectedText } = event.detail;
            this.markdownNoteEditor.show(pageNumber, position, initialContent, selectedText);
        });

        // Listen for PDF-specific events
        document.addEventListener('pdf-zoom-to-fit', () => {
            this.zoomToFit();
        });

        document.addEventListener('pdf-zoom-to-width', () => {
            this.zoomToWidth();
        });

        this._phase2IntegrationSetup = true;
        console.log("✅ Phase 2 integration set up successfully");
    }

    /**
     * Get page number from page wrapper element
     */
    private getPageNumberFromElement(element: HTMLElement): number | null {
        // Try to find page number from data attribute
        const pageAttr = element.getAttribute('data-page-number');
        if (pageAttr) {
            return parseInt(pageAttr, 10);
        }

        // Look for child page element
        const pageElement = element.querySelector('[data-page-number]') as HTMLElement;
        if (pageElement) {
            const pageNum = pageElement.getAttribute('data-page-number');
            if (pageNum) {
                return parseInt(pageNum, 10);
            }
        }

        // Fallback: find by position
        const container = document.getElementById('viewerContainer') || document.getElementById('pdfContainer');
        if (container) {
            const pageWrappers = container.querySelectorAll('.page-wrapper');
            for (let i = 0; i < pageWrappers.length; i++) {
                if (pageWrappers[i] === element || pageWrappers[i].contains(element)) {
                    return i + 1;
                }
            }
        }

        return null;
    }

    /**
     * Zoom to fit the page in viewport
     */
    /**
     * Zoom to fit the page within the viewport
     */
    private async zoomToFit(): Promise<void> {
        if (!this.pdfDoc) {
            console.log('No PDF document loaded');
            return;
        }

        try {
            // Get the container dimensions
            const container = document.getElementById('viewerContainer');
            if (!container) {
                console.error('Viewer container not found');
                return;
            }

            // Get container dimensions (subtract padding and margins)
            const containerRect = container.getBoundingClientRect();
            const availableWidth = containerRect.width - 40; // Account for padding
            const availableHeight = containerRect.height - 40; // Account for padding

            // Get the first page to calculate optimal scale
            const page = await this.pdfDoc.getPage(1);
            const viewport = page.getViewport({ scale: 1.0 });

            // Calculate scale to fit both width and height
            const scaleX = availableWidth / viewport.width;
            const scaleY = availableHeight / viewport.height;
            
            // Use the smaller scale to ensure page fits completely
            const newScale = Math.min(scaleX, scaleY, 3.0); // Cap at 3x max zoom

            console.log(`🔍 Zoom to fit: ${this.scale.toFixed(2)} → ${newScale.toFixed(2)}`);
            
            // Update scale and re-render
            this.scale = newScale;
            
            // Store current scroll position
            const scrollPosition = this.getCurrentScrollPosition();
            
            // Re-render all pages with new scale
            await this.renderAllPages();
            this.updateScaleIndicator();
            
            // Restore scroll position after rendering
            setTimeout(() => {
                this.restoreScrollPosition(scrollPosition);
            }, 100);

        } catch (error) {
            console.error('Failed to zoom to fit:', error);
        }
    }

    /**
     * Zoom to fit page width
     */
    private async zoomToWidth(): Promise<void> {
        if (!this.pdfDoc) {
            console.log('No PDF document loaded');
            return;
        }

        try {
            // Get the container dimensions
            const container = document.getElementById('viewerContainer');
            if (!container) {
                console.error('Viewer container not found');
                return;
            }

            // Get container width (subtract padding)
            const containerRect = container.getBoundingClientRect();
            const availableWidth = containerRect.width - 40; // Account for padding

            // Get the first page to calculate optimal scale
            const page = await this.pdfDoc.getPage(1);
            const viewport = page.getViewport({ scale: 1.0 });

            // Calculate scale to fit width
            const newScale = Math.min(availableWidth / viewport.width, 3.0); // Cap at 3x max zoom

            console.log(`🔍 Zoom to width: ${this.scale.toFixed(2)} → ${newScale.toFixed(2)}`);
            
            // Update scale and re-render
            this.scale = newScale;
            
            // Store current scroll position
            const scrollPosition = this.getCurrentScrollPosition();
            
            // Re-render all pages with new scale
            await this.renderAllPages();
            this.updateScaleIndicator();
            
            // Restore scroll position after rendering
            setTimeout(() => {
                this.restoreScrollPosition(scrollPosition);
            }, 100);

        } catch (error) {
            console.error('Failed to zoom to width:', error);
        }
    }

    /**
     * Calculate and apply automatic zoom based on container and document size
     * Similar to Mozilla PDF.js automatic zoom functionality
     */
    private async calculateAndApplyAutoZoom(): Promise<void> {
        if (!this.pdfDoc) {
            return;
        }

        try {
            // Get the container dimensions
            const container = document.getElementById('viewerContainer');
            if (!container) {
                console.error('Viewer container not found for auto zoom');
                return;
            }

            // Get container dimensions
            const containerRect = container.getBoundingClientRect();
            const availableWidth = containerRect.width - 40; // Account for padding
            const availableHeight = containerRect.height - 40; // Account for padding

            // Get the first page to analyze document characteristics
            const page = await this.pdfDoc.getPage(1);
            const viewport = page.getViewport({ scale: 1.0 });

            // Calculate potential scales
            const scaleToFitWidth = availableWidth / viewport.width;
            const scaleToFitHeight = availableHeight / viewport.height;
            const scaleToFit = Math.min(scaleToFitWidth, scaleToFitHeight);

            // Mozilla PDF.js automatic zoom logic:
            // - If document is very wide relative to height, prefer width fitting
            // - If document is tall and narrow, use fit to container
            // - Consider viewport aspect ratio
            const documentAspectRatio = viewport.width / viewport.height;
            const containerAspectRatio = availableWidth / availableHeight;
            
            let autoScale: number;
            let zoomType: string;

            // If document is much wider than container, fit to width
            if (documentAspectRatio > containerAspectRatio * 1.5) {
                autoScale = scaleToFitWidth;
                zoomType = 'width-fit';
            } 
            // If document is much taller than container, fit to container
            else if (documentAspectRatio < containerAspectRatio * 0.6) {
                autoScale = scaleToFit;
                zoomType = 'full-fit';
            }
            // For typical documents, prefer a scale that gives good readability
            else {
                // Use width fitting but cap it for readability
                autoScale = Math.min(scaleToFitWidth, 1.5); // Don't go above 150% for readability
                zoomType = 'auto-readable';
            }

            // Apply reasonable bounds (between 25% and 300%)
            autoScale = Math.max(0.25, Math.min(autoScale, 3.0));

            console.log(`🔍 Auto zoom: ${this.scale.toFixed(2)} → ${autoScale.toFixed(2)} (${zoomType})`);
            console.log(`📊 Document: ${viewport.width}x${viewport.height} (ratio: ${documentAspectRatio.toFixed(2)})`);
            console.log(`📊 Container: ${availableWidth}x${availableHeight} (ratio: ${containerAspectRatio.toFixed(2)})`);

            // Update scale
            this.scale = autoScale;

        } catch (error) {
            console.error('Failed to calculate auto zoom:', error);
            // Fallback to a reasonable default scale
            this.scale = 1.0;
        }
    }

    /**
     * Apply automatic zoom when document loads
     */
    private async applyInitialAutoZoom(): Promise<void> {
        if (this._autoZoomMode === 'auto') {
            await this.calculateAndApplyAutoZoom();
            console.log(`🎯 Applied automatic zoom: ${this.scale.toFixed(2)}`);
        }
    }

    /**
     * Handle window resize - reapply zoom modes that depend on container size
     */
    private handleWindowResize(): void {
        // Debounce resize events to avoid excessive re-rendering
        clearTimeout((this as any)._resizeTimeout);
        (this as any)._resizeTimeout = setTimeout(async () => {
            if (!this.pdfDoc) return;

            console.log('🔄 Window resized, checking zoom mode...');

            // Only reapply zoom for modes that depend on container size
            switch (this._autoZoomMode) {
                case 'auto':
                    await this.calculateAndApplyAutoZoom();
                    await this.renderAllPages();
                    this.updateScaleIndicator();
                    break;
                case 'fit':
                    await this.zoomToFit();
                    break;
                case 'width':
                    await this.zoomToWidth();
                    break;
                case 'manual':
                    // Don't change zoom in manual mode
                    break;
            }
        }, 250); // 250ms debounce
    }

    /**
     * Clear all annotations
     */
    private async clearAllAnnotations(): Promise<void> {
        try {
            await this.annotationManager.clearAllAnnotations();
            this.annotationSidebar.refreshList();
            console.log('🗑️ All annotations cleared');
        } catch (error) {
            console.error('Failed to clear annotations:', error);
        }
    }

    /**
     * Open the zoom flyout
     */
    private openZoomFlyout(): void {
        const zoomControlButton = document.getElementById("zoomControlButton");
        const zoomFlyout = document.getElementById("zoomFlyout");
        
        if (zoomControlButton && zoomFlyout) {
            zoomControlButton.classList.add("open");
            zoomFlyout.style.display = "block";
            this.updateZoomOptionStates();
        }
    }

    /**
     * Close the zoom flyout
     */
    private closeZoomFlyout(): void {
        const zoomControlButton = document.getElementById("zoomControlButton");
        const zoomFlyout = document.getElementById("zoomFlyout");
        
        if (zoomControlButton && zoomFlyout) {
            zoomControlButton.classList.remove("open");
            zoomFlyout.style.display = "none";
        }
    }

    /**
     * Update the zoom display percentage
     */
    private updateZoomDisplay(): void {
        const zoomDisplay = document.getElementById("zoomDisplay");
        const zoomInput = document.getElementById("zoomInput") as HTMLInputElement;
        
        if (zoomDisplay) {
            const percentage = Math.round(this.scale * 100);
            zoomDisplay.textContent = `${percentage}%`;
        }
        
        if (zoomInput) {
            const percentage = Math.round(this.scale * 100);
            zoomInput.value = `${percentage}%`;
        }
    }

    /**
     * Update zoom option button states
     */
    private updateZoomOptionStates(): void {
        const zoomOptions = document.querySelectorAll(".zoom-option");
        const zoomPresets = document.querySelectorAll(".zoom-preset");
        
        // Update mode options
        zoomOptions.forEach(option => {
            const mode = option.getAttribute("data-mode");
            option.classList.toggle("active", mode === this._autoZoomMode);
        });
        
        // Update preset buttons
        zoomPresets.forEach(preset => {
            const zoomLevel = parseFloat(preset.getAttribute("data-zoom") || "0");
            const isActive = Math.abs(this.scale - zoomLevel) < 0.01;
            preset.classList.toggle("active", isActive);
        });
    }

    /**
     * Handle zoom mode button clicks
     */
    private async handleZoomModeClick(mode: string | null): Promise<void> {
        if (!mode) return;
        
        console.log(`📐 Zoom mode clicked: ${this._autoZoomMode} → ${mode}`);
        
        switch (mode) {
            case 'auto':
                this._autoZoomMode = 'auto';
                await this.calculateAndApplyAutoZoom();
                await this.renderAllPages();
                this.updateScaleIndicator();
                break;
            case 'fit':
                this._autoZoomMode = 'fit';
                await this.zoomToFit();
                break;
            case 'width':
                this._autoZoomMode = 'width';
                await this.zoomToWidth();
                break;
            case 'actual':
                this._autoZoomMode = 'manual';
                await this.setZoomLevel(1.0);
                break;
        }
        
        this.updateZoomDisplay();
    }

    /**
     * Handle zoom input changes
     */
    private async handleZoomInputChange(value: string): Promise<void> {
        const numericValue = parseFloat(value.replace('%', ''));
        if (!isNaN(numericValue) && numericValue > 0) {
            const scale = numericValue / 100;
            await this.setZoomLevel(scale);
        } else {
            // Reset to current value if invalid
            this.updateZoomDisplay();
        }
    }

    /**
     * Set zoom to specific level
     */
    private async setZoomLevel(scale: number): Promise<void> {
        const oldScale = this.scale;
        this.scale = Math.max(0.25, Math.min(scale, 3.0)); // Clamp between 25% and 300%
        
        console.log(`🔍 Setting zoom level: ${oldScale.toFixed(2)} → ${this.scale.toFixed(2)}`);
        
        // Switch to manual mode for specific zoom levels
        this._autoZoomMode = 'manual';
        
        // Store current scroll position
        const scrollPosition = this.getCurrentScrollPosition();
        
        // Re-render all pages with new scale
        await this.renderAllPages();
        this.updateScaleIndicator();
        this.updateZoomDisplay();
        
        // Restore scroll position
        setTimeout(() => {
            this.restoreScrollPosition(scrollPosition);
        }, 100);
    }

    /**
     * Override updateScaleIndicator to also update zoom display
     */
    updateScaleIndicator(): void {
        const scaleElement = document.getElementById("scale");
        if (scaleElement) {
            scaleElement.textContent = `${Math.round(this.scale * 100)}%`;
        }
        this.updateZoomDisplay();
    }
}

// Initialize the application when DOM is ready
document.addEventListener("DOMContentLoaded", async () => {
    console.log("🚀 TypeAgent PDF Viewer starting...");
    console.log("📄 DOM ready state:", document.readyState);

    // Double-check DOM is ready
    if (document.readyState === "loading") {
        console.log("⏳ DOM still loading, waiting...");
        return;
    }

    try {
        const app = new TypeAgentPDFViewerApp();
        (window as any).TypeAgentPDFViewer = app;
        await app.initialize();
    } catch (error) {
        console.error("❌ Failed to start PDF viewer:", error);
    }
});

// Export for global access
export default TypeAgentPDFViewerApp;
