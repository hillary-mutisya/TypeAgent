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
            this.extractDocumentId();

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
        console.log("🔧 Setting up event handlers...");

        const prevBtn = document.getElementById("prevPage");
        const nextBtn = document.getElementById("nextPage");
        const pageNumInput = document.getElementById(
            "pageNum",
        ) as HTMLInputElement;
        const zoomInBtn = document.getElementById("zoomIn");
        const zoomOutBtn = document.getElementById("zoomOut");
        const openBtn = document.getElementById("openFile");
        const fileInput = document.getElementById(
            "fileInput",
        ) as HTMLInputElement;

        console.log("🔍 Found elements:", {
            prevBtn: !!prevBtn,
            nextBtn: !!nextBtn,
            pageNumInput: !!pageNumInput,
            zoomInBtn: !!zoomInBtn,
            zoomOutBtn: !!zoomOutBtn,
            openBtn: !!openBtn,
            fileInput: !!fileInput,
        });

        if (
            !prevBtn ||
            !nextBtn ||
            !pageNumInput ||
            !zoomInBtn ||
            !zoomOutBtn ||
            !openBtn ||
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

        // Zoom events
        zoomInBtn.addEventListener("click", () => this.zoomIn());
        zoomOutBtn.addEventListener("click", () => this.zoomOut());

        // File open events
        openBtn.addEventListener("click", () => this.openFileDialog());
        fileInput.addEventListener("change", (e) => this.handleFileSelect(e));

        // Annotation tool events
        this.setupAnnotationToolHandlers();

        console.log("✅ Event handlers set up successfully");
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
            
            // Render all pages for continuous scrolling
            await this.renderAllPages();

            // Initialize annotation system
            if (this.documentId) {
                await this.annotationManager.initialize(this.documentId, this.pdfDoc);
            }

            // Setup scroll tracking for page navigation
            this.setupScrollTracking();

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
    private extractDocumentId(): void {
        const path = window.location.pathname;
        const urlParams = new URLSearchParams(window.location.search);

        // Check for URL parameter (for direct PDF URLs)
        const fileUrl = urlParams.get("url") || urlParams.get("file");
        if (fileUrl) {
            this.documentId = fileUrl;
            console.log("📄 PDF URL from query parameter:", this.documentId);
            return;
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

            // Check if documentId is a direct URL
            if (this.isUrl(documentId)) {
                console.log("📄 Loading PDF from direct URL:", documentId);
                await this.loadPDFFromUrl(documentId);
                return;
            }

            // Otherwise, treat as document ID and get from API
            console.log("📄 Loading document via API:", documentId);

            // Get document metadata from API
            const docInfo = await this.pdfApiService.getDocument(documentId);
            console.log("📋 Document info:", docInfo);

            // For now, load a sample PDF since we don't have upload implemented
            await this.loadSampleDocument();

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
            this.showLoading("Loading PDF from URL...");

            const loadingTask = window.pdfjsLib.getDocument(url);
            this.pdfDoc = await loadingTask.promise;

            console.log("📄 PDF loaded from URL. Pages:", this.pdfDoc.numPages);

            // Update UI
            this.updatePageCount();
            this.currentPage = 1;
            
            // Render all pages for continuous scrolling
            await this.renderAllPages();

            // Initialize annotation system
            if (this.documentId) {
                await this.annotationManager.initialize(this.documentId, this.pdfDoc);
            }

            // Setup scroll tracking for page navigation
            this.setupScrollTracking();
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
            
            // Render all pages for continuous scrolling
            await this.renderAllPages();

            // Initialize annotation system
            if (this.documentId) {
                await this.annotationManager.initialize(this.documentId, this.pdfDoc);
            }

            // Setup scroll tracking for page navigation
            this.setupScrollTracking();
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
            // Check if page already exists (prevent duplicates)
            const existingPage = container.querySelector(`[data-page-number="${pageNum}"]`);
            if (existingPage) {
                console.log(`⚠️ Page ${pageNum} already exists, skipping`);
                return;
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
        
        // Store current scroll position relative to current page
        const scrollPosition = this.getCurrentScrollPosition();
        
        // Re-render all pages with new scale
        await this.renderAllPages();
        this.updateScaleIndicator();
        
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
        
        // Store current scroll position relative to current page
        const scrollPosition = this.getCurrentScrollPosition();
        
        // Re-render all pages with new scale
        await this.renderAllPages();
        this.updateScaleIndicator();
        
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
    private zoomToFit(): void {
        // Implementation would depend on existing zoom logic
        console.log('Zoom to fit requested');
    }

    /**
     * Zoom to fit page width
     */
    private zoomToWidth(): void {
        // Implementation would depend on existing zoom logic
        console.log('Zoom to width requested');
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

// Fallback in case DOMContentLoaded already fired
if (document.readyState !== "loading") {
    console.log("🔄 DOM already ready, initializing immediately...");
    document.dispatchEvent(new Event("DOMContentLoaded"));
}

// Export for global access
export default TypeAgentPDFViewerApp;
