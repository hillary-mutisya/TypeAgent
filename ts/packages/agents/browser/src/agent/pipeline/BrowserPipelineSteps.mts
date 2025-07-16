// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { BasePipelineStep, StepResult, PipelineContext } from 'website-memory';
import { BrowserActionContext } from '../actionHandler.mjs';
import { ExtractionMode } from 'website-memory';

export interface BrowserStepOptions {
    enableScreenshots?: boolean;
    enableDiscovery?: boolean;
    timeout?: number;
}

export interface BrowserInput {
    html?: string;
    url?: string;
    title?: string;
    tabId?: number;
    browserContext?: BrowserActionContext;
}

/**
 * Browser-specific step for extracting live DOM content
 * Integrates with browser connector to get real-time page data
 */
export class LiveDOMExtractionStep extends BasePipelineStep<BrowserInput, any> {
    readonly name = 'live-dom-extraction';
    readonly version = '1.0.0';
    readonly description = 'Extract content from live browser DOM';

    private options: BrowserStepOptions;

    constructor(options: BrowserStepOptions = {}) {
        super();
        this.options = {
            enableScreenshots: false,
            enableDiscovery: false,
            timeout: 10000,
            ...options,
        };
    }

    async execute(input: BrowserInput, context: PipelineContext): Promise<StepResult<any>> {
        const startTime = Date.now();
        
        try {
            context.logStep(this.name, 'Extracting live DOM content');

            if (!input.browserContext?.browserConnector) {
                throw new Error('Browser connector not available for live DOM extraction');
            }

            const browser = input.browserContext.browserConnector;
            
            // Extract HTML fragments from browser
            const htmlFragments = await browser.getHtmlFragments();
            if (!htmlFragments || htmlFragments.length === 0) {
                throw new Error('No HTML fragments available from browser');
            }

            // Get current page URL and title from input or context
            const currentUrl = input.url || 'live-browser-page';
            const currentTitle = input.title || 'Live Browser Content';

            // Combine fragments for processing
            const combinedHtml = htmlFragments.join('\n');

            const result: any = {
                html: combinedHtml,
                htmlFragments,
                url: currentUrl,
                title: currentTitle,
                source: 'live-browser',
                tabId: input.tabId,
                fragmentCount: htmlFragments.length,
            };

            // Optionally capture screenshot
            if (this.options.enableScreenshots) {
                try {
                    const screenshot = await browser.getCurrentPageScreenshot();
                    if (screenshot) {
                        result.screenshot = screenshot;
                        context.logStep(this.name, 'Screenshot captured');
                    }
                } catch (error) {
                    context.logStep(this.name, `Screenshot failed: ${error}`, 'warn');
                }
            }

            const executionTime = Date.now() - startTime;
            
            return this.createSuccessResult(result, {
                extractionType: 'live-dom',
                htmlLength: combinedHtml.length,
                fragmentCount: htmlFragments.length,
                executionTime,
            });

        } catch (error) {
            const executionTime = Date.now() - startTime;
            context.logStep(this.name, `Live DOM extraction failed: ${(error as Error).message}`, 'error');
            
            return this.createErrorResult(error as Error, {
                extractionType: 'live-dom',
                executionTime,
            });
        }
    }

    public getInputSchema() {
        return {
            type: 'object',
            properties: {
                browserContext: { type: 'object', description: 'Browser action context' },
                url: { type: 'string', description: 'Page URL' },
                title: { type: 'string', description: 'Page title' },
                tabId: { type: 'number', description: 'Browser tab ID' },
            },
            required: ['browserContext'],
        };
    }
}

/**
 * Browser-specific step for AI-powered knowledge extraction
 * Integrates with the browser knowledge extractor system
 */
export class BrowserKnowledgeExtractionStep extends BasePipelineStep<any, any> {
    readonly name = 'browser-knowledge-extraction';
    readonly version = '1.0.0';
    readonly description = 'Extract knowledge using browser AI systems';

    private extractionMode: ExtractionMode;
    private sessionContext: any;

    constructor(sessionContext: any, extractionMode: ExtractionMode = 'content') {
        super();
        this.sessionContext = sessionContext;
        this.extractionMode = extractionMode;
    }

    async execute(input: any, context: PipelineContext): Promise<StepResult<any>> {
        const startTime = Date.now();
        
        try {
            context.logStep(this.name, `Starting AI knowledge extraction (mode: ${this.extractionMode})`);

            // Skip AI extraction if in basic mode
            if (this.extractionMode === 'basic') {
                context.logStep(this.name, 'Skipping AI extraction in basic mode');
                return this.createSuccessResult({
                    knowledge: {
                        entities: [],
                        topics: [],
                        actions: [],
                        inverseActions: [],
                    },
                    aiProcessingUsed: false,
                });
            }

            // Import BrowserKnowledgeExtractor dynamically to avoid circular dependencies
            const { BrowserKnowledgeExtractor } = await import('../knowledge/browserKnowledgeExtractor.mjs');
            
            const extractor = new BrowserKnowledgeExtractor(this.sessionContext);

            // Prepare extraction input
            const extractionInput = {
                url: input.url || 'unknown',
                title: input.title || 'Untitled',
                textContent: input.textContent || input.mainContent || '',
                htmlContent: input.html,
                htmlFragments: input.htmlFragments,
                source: input.source || 'browser',
            };

            // Perform knowledge extraction
            const extractionResult = await extractor.extractKnowledge(
                extractionInput,
                this.extractionMode
            );

            const executionTime = Date.now() - startTime;
            
            context.logStep(this.name, `Knowledge extracted: ${extractionResult.knowledge?.entities?.length || 0} entities, ${extractionResult.knowledge?.topics?.length || 0} topics`);

            return this.createSuccessResult({
                knowledge: extractionResult.knowledge,
                qualityMetrics: extractionResult.qualityMetrics,
                aiProcessingUsed: true,
                extractionMode: this.extractionMode,
            }, {
                executionTime,
                entitiesFound: extractionResult.knowledge?.entities?.length || 0,
                topicsFound: extractionResult.knowledge?.topics?.length || 0,
                actionsFound: extractionResult.knowledge?.actions?.length || 0,
            });

        } catch (error) {
            const executionTime = Date.now() - startTime;
            context.logStep(this.name, `Knowledge extraction failed: ${(error as Error).message}`, 'error');
            
            // Provide fallback empty knowledge
            return this.createSuccessResult({
                knowledge: {
                    entities: [],
                    topics: [],
                    actions: [],
                    inverseActions: [],
                },
                aiProcessingUsed: false,
                error: (error as Error).message,
            }, {
                executionTime,
                failed: true,
            });
        }
    }

    public configure(config: any): void {
        super.configure(config);
        if (config.extractionMode) {
            this.extractionMode = config.extractionMode;
        }
    }
}

/**
 * Browser-specific step for discovery agent integration
 * Integrates with the discovery system for action detection
 */
export class DiscoveryIntegrationStep extends BasePipelineStep<any, any> {
    readonly name = 'discovery-integration';
    readonly version = '1.0.0';
    readonly description = 'Integrate with discovery agent for advanced analysis';

    private sessionContext: any;

    constructor(sessionContext: any) {
        super();
        this.sessionContext = sessionContext;
    }

    async execute(input: any, context: PipelineContext): Promise<StepResult<any>> {
        const startTime = Date.now();
        
        try {
            context.logStep(this.name, 'Integrating with discovery agent');

            // Only proceed if we have HTML fragments for discovery
            if (!input.htmlFragments || input.htmlFragments.length === 0) {
                context.logStep(this.name, 'No HTML fragments available for discovery analysis');
                return this.createSuccessResult({
                    discoveryUsed: false,
                    detectedActions: [],
                });
            }

            // Check if discovery is available
            if (!this.sessionContext?.agentContext?.browserConnector) {
                context.logStep(this.name, 'Browser connector not available for discovery');
                return this.createSuccessResult({
                    discoveryUsed: false,
                    detectedActions: [],
                });
            }

            // Use discovery system for action detection (basic integration)
            // In a full implementation, this would integrate with the discovery translator
            const discoveredActions = [];
            
            // Analyze HTML fragments for form elements and interactive components
            for (const fragment of input.htmlFragments) {
                if (fragment.includes('<form') || fragment.includes('type="submit"') || fragment.includes('button')) {
                    discoveredActions.push({
                        type: 'interactive-element',
                        confidence: 0.7,
                        description: 'Interactive element detected in HTML fragment',
                        selector: 'form, button, input[type="submit"]',
                    });
                }
            }

            const executionTime = Date.now() - startTime;
            
            return this.createSuccessResult({
                discoveryUsed: true,
                detectedActions: discoveredActions,
                fragmentsAnalyzed: input.htmlFragments.length,
            }, {
                executionTime,
                actionsFound: discoveredActions.length,
            });

        } catch (error) {
            const executionTime = Date.now() - startTime;
            context.logStep(this.name, `Discovery integration failed: ${(error as Error).message}`, 'error');
            
            return this.createSuccessResult({
                discoveryUsed: false,
                detectedActions: [],
                error: (error as Error).message,
            }, {
                executionTime,
                failed: true,
            });
        }
    }
}
