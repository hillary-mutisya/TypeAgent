// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { BasePipelineStep } from '../core/PipelineStep.js';
import { StepResult, PipelineContext } from '../core/types.js';

export interface HtmlValidationOptions {
    allowFragments?: boolean;
    sanitizeContent?: boolean;
    maxLength?: number;
}

/**
 * Validates and cleans HTML content for processing
 * Removes dangerous elements and ensures basic HTML structure
 */
export class HtmlValidationStep extends BasePipelineStep<string, string> {
    readonly name = 'html-validation';
    readonly version = '1.0.0';
    readonly description = 'Validates and sanitizes HTML content';

    private options: HtmlValidationOptions;

    constructor(options: HtmlValidationOptions = {}) {
        super();
        this.options = {
            allowFragments: true,
            sanitizeContent: true,
            maxLength: 10 * 1024 * 1024, // 10MB default
            ...options,
        };
    }

    async execute(html: string, context: PipelineContext): Promise<StepResult<string>> {
        const startTime = Date.now();
        
        try {
            context.logStep(this.name, 'Starting HTML validation');

            // Basic validation
            if (!html || html.trim().length === 0) {
                throw new Error('Empty HTML content provided');
            }

            if (html.length > this.options.maxLength!) {
                throw new Error(`HTML content too large: ${html.length} bytes (max: ${this.options.maxLength})`);
            }

            let processedHtml = html.trim();

            // Ensure basic HTML structure if not a fragment
            if (!this.options.allowFragments && !this.hasHtmlStructure(processedHtml)) {
                processedHtml = this.wrapInHtmlStructure(processedHtml);
                context.logStep(this.name, 'Wrapped fragment in HTML structure');
            }

            // Sanitize content if requested
            if (this.options.sanitizeContent) {
                processedHtml = this.sanitizeHtml(processedHtml);
                context.logStep(this.name, 'Sanitized HTML content');
            }

            const executionTime = Date.now() - startTime;
            
            return this.createSuccessResult(processedHtml, {
                originalLength: html.length,
                processedLength: processedHtml.length,
                sanitized: this.options.sanitizeContent,
                wrapped: !this.hasHtmlStructure(html) && !this.options.allowFragments,
                executionTime,
            });

        } catch (error) {
            const executionTime = Date.now() - startTime;
            context.logStep(this.name, `Validation failed: ${(error as Error).message}`, 'error');
            
            return this.createErrorResult(error as Error, {
                originalLength: html?.length || 0,
                executionTime,
            });
        }
    }

    /**
     * Check if HTML has basic document structure
     */
    private hasHtmlStructure(html: string): boolean {
        const lowerHtml = html.toLowerCase();
        return lowerHtml.includes('<html') || lowerHtml.includes('<!doctype');
    }

    /**
     * Wrap content in basic HTML structure
     */
    private wrapInHtmlStructure(content: string): string {
        return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Document</title>
</head>
<body>
${content}
</body>
</html>`;
    }

    /**
     * Sanitize HTML by removing potentially dangerous content
     */
    private sanitizeHtml(html: string): string {
        let sanitized = html;

        // Remove script tags and their content
        sanitized = sanitized.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
        
        // Remove style tags and their content (optional - might want to keep some styling)
        sanitized = sanitized.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
        
        // Remove inline event handlers
        sanitized = sanitized.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '');
        
        // Remove javascript: URLs
        sanitized = sanitized.replace(/href\s*=\s*["']javascript:[^"']*["']/gi, '');
        sanitized = sanitized.replace(/src\s*=\s*["']javascript:[^"']*["']/gi, '');
        
        // Remove data: URLs from scripts (but keep data URLs for images)
        sanitized = sanitized.replace(/src\s*=\s*["']data:(?!image)[^"']*["']/gi, '');
        
        return sanitized;
    }

    /**
     * Configure validation options
     */
    public configure(config: any): void {
        super.configure(config);
        if (config.validation) {
            this.options = { ...this.options, ...config.validation };
        }
    }

    public getInputSchema() {
        return {
            type: 'string',
            description: 'HTML content to validate and sanitize',
            minLength: 1,
        };
    }

    public getOutputSchema() {
        return {
            type: 'string',
            description: 'Validated and sanitized HTML content',
        };
    }
}
