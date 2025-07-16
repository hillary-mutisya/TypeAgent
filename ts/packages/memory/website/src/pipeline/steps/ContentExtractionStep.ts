// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as cheerio from 'cheerio';
import { BasePipelineStep } from '../core/PipelineStep.js';
import { StepResult, PipelineContext } from '../core/types.js';

// Import types from existing extraction system for compatibility
import { PageContent, ImageInfo, LinkInfo } from '../../contentExtractor.js';

export interface ContentExtractionOptions {
    mode?: 'basic' | 'comprehensive';
    extractImages?: boolean;
    extractLinks?: boolean;
    extractHeadings?: boolean;
    maxContentLength?: number;
}

export interface HtmlInput {
    html: string;
    url?: string;
    title?: string;
}

/**
 * Extracts structured content from HTML using Cheerio
 * Produces PageContent compatible with existing system
 */
export class ContentExtractionStep extends BasePipelineStep<HtmlInput | string, PageContent> {
    readonly name = 'content-extraction';
    readonly version = '1.0.0';
    readonly description = 'Extracts structured content from HTML';

    private options: ContentExtractionOptions;

    constructor(options: ContentExtractionOptions = {}) {
        super();
        this.options = {
            mode: 'comprehensive',
            extractImages: true,
            extractLinks: true,
            extractHeadings: true,
            maxContentLength: 1024 * 1024, // 1MB default
            ...options,
        };
    }

    async execute(
        input: HtmlInput | string,
        context: PipelineContext
    ): Promise<StepResult<PageContent>> {
        const startTime = Date.now();
        
        try {
            // Normalize input
            const htmlInput = this.normalizeInput(input);
            context.logStep(this.name, `Extracting content from ${htmlInput.html.length} chars of HTML`);

            if (htmlInput.html.length > this.options.maxContentLength!) {
                throw new Error(`HTML content too large for extraction: ${htmlInput.html.length} chars`);
            }

            // Load HTML with cheerio
            const $ = cheerio.load(htmlInput.html);
            
            // Clean the document
            this.cleanDocument($);
            
            // Extract content components
            const title = this.extractTitle($, htmlInput.title);
            const mainContent = this.extractMainContent($);
            const headings = this.options.extractHeadings ? this.extractHeadings($) : [];
            const images = this.options.extractImages ? this.extractImages($, htmlInput.url) : [];
            const links = this.options.extractLinks ? this.extractLinks($, htmlInput.url) : [];
            
            // Calculate metrics
            const wordCount = this.calculateWordCount(mainContent);
            const readingTime = Math.ceil(wordCount / 200); // ~200 words per minute

            const pageContent: PageContent = {
                title,
                mainContent,
                headings,
                images,
                links,
                wordCount,
                readingTime,
            };

            const executionTime = Date.now() - startTime;
            
            context.logStep(this.name, `Extracted ${wordCount} words, ${headings.length} headings, ${images.length} images, ${links.length} links`);
            
            return this.createSuccessResult(pageContent, {
                originalHtmlLength: htmlInput.html.length,
                extractedContentLength: mainContent.length,
                compressionRatio: mainContent.length / htmlInput.html.length,
                wordCount,
                headingCount: headings.length,
                imageCount: images.length,
                linkCount: links.length,
                executionTime,
            });

        } catch (error) {
            const executionTime = Date.now() - startTime;
            context.logStep(this.name, `Content extraction failed: ${(error as Error).message}`, 'error');
            
            return this.createErrorResult(error as Error, {
                executionTime,
            });
        }
    }

    /**
     * Normalize input to HtmlInput format
     */
    private normalizeInput(input: HtmlInput | string): HtmlInput {
        if (typeof input === 'string') {
            return { html: input };
        }
        return input;
    }

    /**
     * Clean document by removing unwanted elements
     */
    private cleanDocument($: cheerio.CheerioAPI): void {
        // Remove script and style elements
        $('script, style, noscript').remove();
        
        // Remove navigation and UI elements
        $('nav, header, footer, aside').remove();
        $('.nav, .navigation, .sidebar, .menu').remove();
        
        // Remove advertisements and tracking
        $('.advertisement, .ads, .ad-banner').remove();
        $('[class*="ad-"], [id*="ad-"], [class*="ads-"]').remove();
        
        // Remove social sharing and comments
        $('.social-share, .share-buttons, .comments, .comment-section').remove();
        $('.social-media, .social-links').remove();
        
        // Remove cookie banners and popups
        $('.cookie-banner, .cookie-notice, .popup, .modal').remove();
        
        if (this.options.mode === 'basic') {
            // For basic mode, also remove complex interactive elements
            $('form, button, input, select, textarea').remove();
        }
    }

    /**
     * Extract page title from multiple sources
     */
    private extractTitle($: cheerio.CheerioAPI, providedTitle?: string): string {
        if (providedTitle && providedTitle.trim()) {
            return providedTitle.trim();
        }

        // Try different title sources in order of preference
        let title = $('title').first().text().trim();

        if (!title) {
            title = $('meta[property="og:title"]').attr('content') || '';
        }

        if (!title) {
            title = $('meta[name="twitter:title"]').attr('content') || '';
        }

        if (!title) {
            title = $('h1').first().text().trim();
        }

        return title || 'Untitled';
    }

    /**
     * Extract main content using semantic selectors
     */
    private extractMainContent($: cheerio.CheerioAPI): string {
        const contentSelectors = [
            'main',
            'article', 
            '[role="main"]',
            '.content',
            '.main-content',
            '.post-content',
            '.entry-content',
            '.article-content',
            '#content',
            '#main-content',
            '#main',
        ];

        // Try semantic content selectors first
        for (const selector of contentSelectors) {
            const content = $(selector);
            if (content.length > 0) {
                const text = content.text();
                if (text.trim().length > 100) { // Ensure substantial content
                    return this.cleanText(text);
                }
            }
        }

        // Fallback: extract from body, excluding known non-content areas
        const bodyContent = $('body').clone();
        bodyContent.find('nav, header, footer, aside, .sidebar, .menu').remove();
        
        return this.cleanText(bodyContent.text());
    }

    /**
     * Extract headings with hierarchy information
     */
    private extractHeadings($: cheerio.CheerioAPI): string[] {
        const headings: string[] = [];
        
        $('h1, h2, h3, h4, h5, h6').each((_, element) => {
            const text = $(element).text().trim();
            if (text && text.length > 0) {
                headings.push(text);
            }
        });
        
        return headings;
    }

    /**
     * Extract images with metadata
     */
    private extractImages($: cheerio.CheerioAPI, baseUrl?: string): ImageInfo[] {
        const images: ImageInfo[] = [];
        
        $('img[src]').each((_, element) => {
            const $img = $(element);
            const src = $img.attr('src');
            
            if (src && !src.startsWith('data:') && src.length > 5) {
                const image: ImageInfo = {
                    src: this.resolveUrl(src, baseUrl),
                    isExternal: this.isExternalUrl(src, baseUrl),
                };
                
                const alt = $img.attr('alt');
                if (alt !== undefined) {
                    image.alt = alt;
                }
                
                const width = this.parseNumber($img.attr('width'));
                if (width !== undefined) {
                    image.width = width;
                }
                
                const height = this.parseNumber($img.attr('height'));
                if (height !== undefined) {
                    image.height = height;
                }
                
                images.push(image);
            }
        });
        
        return images;
    }

    /**
     * Extract links with metadata
     */
    private extractLinks($: cheerio.CheerioAPI, baseUrl?: string): LinkInfo[] {
        const links: LinkInfo[] = [];
        
        $('a[href]').each((_, element) => {
            const $link = $(element);
            const href = $link.attr('href');
            
            if (href && 
                !href.startsWith('#') && 
                !href.startsWith('javascript:') &&
                !href.startsWith('mailto:') &&
                !href.startsWith('tel:')) {
                
                const link: LinkInfo = {
                    href: this.resolveUrl(href, baseUrl),
                    text: $link.text().trim(),
                    isExternal: this.isExternalUrl(href, baseUrl),
                };
                
                if (link.text && link.text.length > 0) {
                    links.push(link);
                }
            }
        });
        
        return links;
    }

    /**
     * Clean and normalize text content
     */
    private cleanText(text: string): string {
        return text
            .replace(/\s+/g, ' ')  // Normalize whitespace
            .replace(/\n\s*\n/g, '\n')  // Remove excessive line breaks
            .trim();
    }

    /**
     * Calculate word count
     */
    private calculateWordCount(text: string): number {
        return text
            .trim()
            .split(/\s+/)
            .filter(word => word.length > 0).length;
    }

    /**
     * Resolve relative URLs to absolute URLs
     */
    private resolveUrl(url: string, baseUrl?: string): string {
        if (!baseUrl || url.startsWith('http://') || url.startsWith('https://')) {
            return url;
        }
        
        try {
            return new URL(url, baseUrl).href;
        } catch {
            return url; // Return original if resolution fails
        }
    }

    /**
     * Check if URL is external to the base domain
     */
    private isExternalUrl(url: string, baseUrl?: string): boolean {
        if (!baseUrl) return false;
        
        try {
            const urlObj = new URL(url, baseUrl);
            const baseUrlObj = new URL(baseUrl);
            return urlObj.hostname !== baseUrlObj.hostname;
        } catch {
            return false;
        }
    }

    /**
     * Parse numeric attribute values
     */
    private parseNumber(value: string | undefined): number | undefined {
        if (!value) return undefined;
        const num = parseInt(value, 10);
        return isNaN(num) ? undefined : num;
    }

    public configure(config: any): void {
        super.configure(config);
        if (config.contentExtraction) {
            this.options = { ...this.options, ...config.contentExtraction };
        }
    }

    public getInputSchema() {
        return {
            oneOf: [
                { type: 'string', description: 'HTML content as string' },
                {
                    type: 'object',
                    properties: {
                        html: { type: 'string', description: 'HTML content' },
                        url: { type: 'string', description: 'Base URL for resolving relative links' },
                        title: { type: 'string', description: 'Page title if known' },
                    },
                    required: ['html'],
                },
            ],
        };
    }

    public getOutputSchema() {
        return {
            type: 'object',
            description: 'Extracted page content',
            properties: {
                title: { type: 'string' },
                mainContent: { type: 'string' },
                headings: { type: 'array', items: { type: 'string' } },
                wordCount: { type: 'number' },
                readingTime: { type: 'number' },
            },
        };
    }
}
