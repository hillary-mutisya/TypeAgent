    /**
     * Enable text layer for a specific page using the enhanced PdfJsTextLayerManager
     */
    private async enableTextLayerForPage(pageNum: number, pageWrapper: HTMLElement, viewport: any): Promise<void> {
        try {
            // Use the enhanced annotation manager's text layer manager
            if (this.annotationManager.isInitialized()) {
                await this.annotationManager.enableTextLayerForPage(pageNum, pageWrapper, viewport);
            } else {
                // Fallback to the current implementation if annotation manager isn't ready
                await this.enableTextLayerForPageFallback(pageNum, pageWrapper, viewport);
            }
        } catch (error) {
            console.error(`❌ Failed to enable text layer for page ${pageNum}:`, error);
            // Try fallback
            await this.enableTextLayerForPageFallback(pageNum, pageWrapper, viewport);
        }
    }

    /**
     * Fallback text layer implementation (original method)
     */
    private async enableTextLayerForPageFallback(pageNum: number, pageWrapper: HTMLElement, viewport: any): Promise<void> {
        try {
            // Get the page
            const page = await this.pdfDoc.getPage(pageNum);
            
            // Get text content
            const textContent = await page.getTextContent();

            // Create text layer
            const textLayerDiv = document.createElement('div');
            textLayerDiv.className = 'textLayer';
            textLayerDiv.setAttribute('data-page-number', pageNum.toString());

            // Get the actual canvas element to match its exact dimensions
            const canvas = pageWrapper.querySelector('canvas') as HTMLCanvasElement;
            if (!canvas) {
                console.error(`Canvas not found for page ${pageNum}`);
                return;
            }

            // Use the canvas CSS dimensions (not the internal canvas.width/height)
            // This ensures the text layer matches exactly what the user sees
            const canvasRect = canvas.getBoundingClientRect();
            const canvasStyle = window.getComputedStyle(canvas);
            const canvasWidth = parseFloat(canvasStyle.width);
            const canvasHeight = parseFloat(canvasStyle.height);

            // Position text layer to exactly match the displayed canvas
            textLayerDiv.style.cssText = `
                position: absolute;
                left: 0;
                top: 0;
                width: ${canvasWidth}px;
                height: ${canvasHeight}px;
                overflow: hidden;
                line-height: 1.0;
                pointer-events: auto;
                user-select: text;
                z-index: 2;
                transform-origin: 0% 0%;
            `;

            // Render text layer with canvas-aligned coordinates
            await this.renderTextLayerManual(textLayerDiv, textContent, viewport, canvasWidth, canvasHeight);
            pageWrapper.appendChild(textLayerDiv);

            console.log(`📝 Text layer enabled for page ${pageNum} (fallback) at scale ${this.scale.toFixed(2)}, canvas: ${canvasWidth}x${canvasHeight}, viewport: ${viewport.width}x${viewport.height}`);
        } catch (error) {
            console.error(`❌ Failed to enable text layer for page ${pageNum}:`, error);
        }
    }