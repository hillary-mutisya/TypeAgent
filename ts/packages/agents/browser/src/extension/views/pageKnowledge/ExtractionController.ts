// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { PageKnowledgeBaseController, KnowledgeData, ExtractionSettings } from ".";
import {
    notificationManager,
    chromeExtensionService,
    TemplateHelpers,
} from "../knowledgeUtilities";

export const MODE_DESCRIPTIONS = {
    basic: {
        description: "Fast metadata extraction without AI - perfect for bulk operations",
        requiresAI: false,
        features: ["URL analysis", "Domain classification", "Basic topics"],
        performance: "Fastest",
    },
    content: {
        description: "AI-powered content analysis with entity and topic extraction",
        requiresAI: true,
        features: ["AI content analysis", "Entity extraction", "Topic identification"],
        performance: "Fast",
    },
    actions: {
        description: "AI analysis plus interaction detection for dynamic pages",
        requiresAI: true,
        features: ["AI content analysis", "Action detection", "Interactive elements"],
        performance: "Medium",
    },
    full: {
        description: "Complete AI analysis with relationships and cross-references",
        requiresAI: true,
        features: ["Full AI analysis", "Relationship extraction", "Cross-references"],
        performance: "Thorough",
    },
};

export class ExtractionController {
    constructor(private baseController: PageKnowledgeBaseController) {}

    async extractKnowledge() {
        const button = document.getElementById("extractKnowledge") as HTMLButtonElement;
        const originalContent = button.innerHTML;

        button.innerHTML = '<i class="bi bi-hourglass-split spinner-grow spinner-grow-sm me-2"></i>Extracting...';
        button.disabled = true;
        button.classList.add("btn-warning");
        button.classList.remove("btn-primary");

        this.showKnowledgeLoading();

        try {
            const settings = this.baseController.getExtractionSettings();
            if (settings.mode !== "basic") {
                if (this.baseController.getAIModelAvailable() === undefined) {
                    console.log("AI availability not yet determined, checking now...");
                    await this.checkAIModelAvailability();
                }

                if (!this.baseController.getAIModelAvailable()) {
                    this.showAIRequiredError();
                    return;
                }
            }

            const startTime = Date.now();
            const response = await chromeExtensionService.extractPageKnowledge(
                this.baseController.getCurrentUrl(),
                settings.mode,
                settings,
            );

            const processingTime = Date.now() - startTime;
            const knowledgeData = response.knowledge;
            this.baseController.setKnowledgeData(knowledgeData);

            if (knowledgeData) {
                const isInsufficientContent = this.checkInsufficientContent(knowledgeData);

                if (isInsufficientContent) {
                    button.innerHTML = '<i class="bi bi-exclamation-triangle me-2"></i>Insufficient Content';
                    button.classList.remove("btn-warning");
                    button.classList.add("btn-warning");

                    this.showInsufficientContentError();
                    notificationManager.showEnhancedNotification(
                        "warning",
                        "Insufficient Content",
                        "This page doesn't have enough content to extract meaningful knowledge or its content is not available. Try refreshing the page.",
                        "bi-exclamation-triangle",
                    );

                    await new Promise((resolve) => setTimeout(resolve, 2000));
                    return;
                }

                button.innerHTML = '<i class="bi bi-check-circle me-2"></i>Extracted!';
                button.classList.remove("btn-warning");
                button.classList.add("btn-success");

                await this.baseController.contentRenderingController.renderKnowledgeResults(knowledgeData);
                this.showExtractionInfo();
                await this.updateQualityIndicator();

                // FIX 1: Refresh page status and reload fresh knowledge to update all modules
                await this.baseController.refreshPageStatusAfterIndexing();
                await this.baseController.loadFreshKnowledge();

                const entityCount = knowledgeData.entities?.length || 0;
                const topicCount = knowledgeData.keyTopics?.length || 0;
                const relationshipCount = knowledgeData.relationships?.length || 0;

                notificationManager.showEnhancedNotification(
                    "success",
                    "Knowledge Extracted Successfully!",
                    `Found ${entityCount} entities, ${topicCount} topics, ${relationshipCount} relationships using ${settings.mode} mode in ${Math.round(processingTime / 1000)}s`,
                    "bi-brain",
                );

                await new Promise((resolve) => setTimeout(resolve, 1500));
            } else {
                // FIX 2: Handle case where knowledgeData is null/undefined as insufficient content
                button.innerHTML = '<i class="bi bi-exclamation-triangle me-2"></i>No Data';
                button.classList.remove("btn-warning");
                button.classList.add("btn-warning");

                this.showInsufficientContentError();
                notificationManager.showEnhancedNotification(
                    "warning",
                    "No Knowledge Extracted",
                    "No knowledge could be extracted from this page. The content may be inaccessible or too short.",
                    "bi-exclamation-triangle",
                );

                await new Promise((resolve) => setTimeout(resolve, 2000));
                return;
            }
        } catch (error) {
            console.error("Error extracting knowledge:", error);

            button.innerHTML = '<i class="bi bi-exclamation-circle me-2"></i>Error';
            button.classList.remove("btn-warning");
            button.classList.add("btn-danger");

            this.showKnowledgeError("Error extracting knowledge. Please try again.");
            notificationManager.showEnhancedNotification(
                "danger",
                "Extraction Failed",
                error instanceof Error ? error.message : "Unknown error occurred",
                "bi-exclamation-triangle",
            );

            await new Promise((resolve) => setTimeout(resolve, 2000));
        } finally {
            button.innerHTML = originalContent;
            button.disabled = false;
            button.classList.remove("btn-warning", "btn-success", "btn-danger");
            button.classList.add("btn-outline-primary");
        }
    }

    async indexCurrentPage() {
        const button = document.getElementById("indexPage") as HTMLButtonElement;
        const originalContent = button.innerHTML;

        button.innerHTML = '<i class="bi bi-hourglass-split spinner-grow spinner-grow-sm me-2"></i>Indexing...';
        button.disabled = true;
        button.classList.add("btn-warning");
        button.classList.remove("btn-outline-primary");

        try {
            const settings = this.baseController.getExtractionSettings();
            if (settings.mode !== "basic") {
                if (this.baseController.getAIModelAvailable() === undefined) {
                    console.log("AI availability not yet determined, checking now...");
                    await this.checkAIModelAvailability();
                }

                if (!this.baseController.getAIModelAvailable()) {
                    this.showAIRequiredError();
                    return;
                }
            }

            const startTime = Date.now();
            const response = await chromeExtensionService.indexPageContent(
                this.baseController.getCurrentUrl(),
                settings.mode,
            );

            const processingTime = Date.now() - startTime;

            // FIX 2: Check if indexing actually succeeded with meaningful content
            let actualEntityCount = 0;
            let attempts = 0;
            const maxAttempts = 10;
            let indexingSuccessful = false;

            while (attempts < maxAttempts) {
                await new Promise((resolve) => setTimeout(resolve, 500));
                try {
                    const indexStatus = await chromeExtensionService.getPageIndexStatus(
                        this.baseController.getCurrentUrl()
                    );
                    if (indexStatus.isIndexed) {
                        actualEntityCount = indexStatus.entityCount || 0;
                        indexingSuccessful = true;
                        break;
                    }
                } catch (error) {
                    console.warn("Error checking index status:", error);
                }
                attempts++;
            }

            // FIX 2: Check if indexing resulted in meaningful content
            if (!indexingSuccessful || actualEntityCount === 0) {
                button.innerHTML = '<i class="bi bi-exclamation-triangle me-2"></i>Insufficient Content';
                button.classList.remove("btn-warning");
                button.classList.add("btn-warning");

                notificationManager.showEnhancedNotification(
                    "warning",
                    "Indexing Completed with No Content",
                    "The page was processed but no meaningful content could be extracted. The page may be too short or inaccessible.",
                    "bi-exclamation-triangle",
                );

                await new Promise((resolve) => setTimeout(resolve, 2000));
                return;
            }

            button.innerHTML = '<i class="bi bi-check-circle me-2"></i>Indexed!';
            button.classList.remove("btn-warning");
            button.classList.add("btn-success");

            notificationManager.showEnhancedNotification(
                "success",
                "Page Indexed Successfully!",
                `Page has been indexed using ${settings.mode} mode with ${actualEntityCount} entities in ${Math.round(processingTime / 1000)}s`,
                "bi-collection",
            );

            // FIX 1: Refresh content after successful indexing
            await this.baseController.refreshPageStatusAfterIndexing();
            await this.baseController.loadFreshKnowledge();
            
            await new Promise((resolve) => setTimeout(resolve, 1500));

        } catch (error) {
            console.error("Error indexing page:", error);

            button.innerHTML = '<i class="bi bi-exclamation-circle me-2"></i>Error';
            button.classList.remove("btn-warning");
            button.classList.add("btn-danger");

            notificationManager.showEnhancedNotification(
                "danger",
                "Indexing Failed",
                error instanceof Error ? error.message : "Unknown error occurred",
                "bi-exclamation-triangle",
            );

            await new Promise((resolve) => setTimeout(resolve, 2000));
        } finally {
            button.innerHTML = originalContent;
            button.disabled = false;
            button.classList.remove("btn-warning", "btn-success", "btn-danger");
            button.classList.add("btn-outline-primary");
        }
    }

    async checkAIModelAvailability() {
        try {
            const response = await chromeExtensionService.checkAIModelAvailability();
            this.baseController.setAIModelAvailable(response.available);

            const indicator = document.getElementById("aiAvailabilityIndicator");
            if (indicator) {
                if (response.available) {
                    indicator.innerHTML = `
                        <span class="badge bg-success">
                            <i class="bi bi-cpu"></i> AI Available
                        </span>
                    `;
                } else {
                    indicator.innerHTML = `
                        <span class="badge bg-warning">
                            <i class="bi bi-cpu"></i> AI Unavailable
                        </span>
                    `;
                }
            }

            this.updateExtractionModeAvailability();
        } catch (error) {
            console.warn("Could not check AI availability:", error);
            this.baseController.setAIModelAvailable(false);
        }
    }

    private showKnowledgeLoading() {
        const knowledgeSection = document.getElementById("knowledgeSection")!;
        knowledgeSection.className = "";
        knowledgeSection.innerHTML = TemplateHelpers.createLoadingState(
            "Extracting knowledge from page...",
            "This may take a few seconds",
        );
    }

    private showKnowledgeError(message: string) {
        const knowledgeSection = document.getElementById("knowledgeSection")!;
        knowledgeSection.className = "";
        knowledgeSection.innerHTML = `
            <div class="knowledge-card card">
                <div class="card-body text-center">
                    <i class="bi bi-exclamation-triangle text-danger h3"></i>
                    <p class="mb-0">${message}</p>
                </div>
            </div>
        `;
    }

    private checkInsufficientContent(knowledge: KnowledgeData): boolean {
        // FIX 2: Enhanced insufficient content detection with more comprehensive checks
        
        // Check for explicit insufficient content indicators
        const hasInsufficientSummary = knowledge.summary === "Insufficient content to extract knowledge." ||
                                       knowledge.summary?.toLowerCase().includes("insufficient") ||
                                       knowledge.summary?.toLowerCase().includes("no content") ||
                                       knowledge.summary?.toLowerCase().includes("unable to extract");
        
        // Check for empty or minimal content metrics
        const hasNoOrMinimalMetrics = knowledge.contentMetrics?.wordCount === 0 || 
                                      knowledge.contentMetrics?.readingTime === 0 ||
                                      (knowledge.contentMetrics?.wordCount && knowledge.contentMetrics.wordCount < 10);
        
        // Check for no meaningful knowledge extraction
        const hasNoEntities = !knowledge.entities || knowledge.entities.length === 0;
        const hasNoTopics = !knowledge.keyTopics || knowledge.keyTopics.length === 0;
        const hasNoRelationships = !knowledge.relationships || knowledge.relationships.length === 0;
        const hasNoQuestions = !knowledge.suggestedQuestions || knowledge.suggestedQuestions.length === 0;
        
        // Check for empty or very short summary
        const hasEmptyOrMinimalSummary = !knowledge.summary || 
                                        knowledge.summary.trim().length === 0 ||
                                        knowledge.summary.trim().length < 20;
        
        // Content is insufficient if:
        // 1. Explicit insufficient content markers are present, OR
        // 2. We have no/minimal metrics AND no meaningful knowledge was extracted AND summary is empty/minimal
        return hasInsufficientSummary || 
               // (hasNoOrMinimalMetrics && hasNoEntities && hasNoTopics && hasNoRelationships && hasNoQuestions && hasEmptyOrMinimalSummary);
               (hasNoEntities && hasNoTopics && hasNoRelationships && hasNoQuestions && hasEmptyOrMinimalSummary);
    }

    private showInsufficientContentError() {
        const knowledgeSection = document.getElementById("knowledgeSection")!;
        knowledgeSection.className = "";
        knowledgeSection.innerHTML = `
            <div class="knowledge-card card">
                <div class="card-body text-center">
                    <i class="bi bi-info-circle text-warning h3"></i>
                    <h5 class="mb-3">Insufficient Content</h5>
                    <p class="mb-3">This page doesn't contain enough extractable content or the content may not be accessible.</p>
                    <div class="text-start">
                        <p class="mb-2"><strong>Possible reasons:</strong></p>
                        <ul class="list-unstyled">
                            <li>• Page is still loading</li>
                            <li>• Content is generated by JavaScript</li>
                            <li>• Page requires authentication</li>
                            <li>• Content is mostly media or images</li>
                        </ul>
                    </div>
                    <button class="btn btn-outline-primary btn-sm mt-3" onclick="window.location.reload()">
                        <i class="bi bi-arrow-clockwise me-1"></i>Refresh Page
                    </button>
                </div>
            </div>
        `;
    }

    async loadExtractionSettings() {
        try {
            const settings = await chromeExtensionService.getExtractionSettings();
            if (settings) {
                const currentSettings = this.baseController.getExtractionSettings();
                this.baseController.setExtractionSettings({
                    ...currentSettings,
                    ...settings,
                });

                const modernSelect = document.getElementById("extractionMode") as HTMLSelectElement;
                if (modernSelect && settings.mode) {
                    modernSelect.value = settings.mode;
                }
            }
        } catch (error) {
            console.error("Error loading extraction settings:", error);
        }
    }

    private showAIRequiredError() {
        const knowledgeSection = document.getElementById("knowledgeSection")!;
        knowledgeSection.className = "";
        knowledgeSection.innerHTML = `
            <div class="knowledge-card card">
                <div class="card-body text-center">
                    <i class="bi bi-exclamation-triangle text-warning h3"></i>
                    <h5 class="mb-3">AI Model Required</h5>
                    <p class="mb-3">The selected extraction mode requires an AI model, but no AI model is currently available.</p>
                    <div class="text-start">
                        <p class="mb-2"><strong>Options:</strong></p>
                        <ul class="list-unstyled">
                            <li>• Switch to "Basic" mode for non-AI extraction</li>
                            <li>• Check if TypeAgent is running with AI capabilities</li>
                            <li>• Verify your AI model configuration</li>
                        </ul>
                    </div>
                    <button class="btn btn-outline-primary btn-sm mt-3" onclick="this.switchToBasicMode()">
                        <i class="bi bi-arrow-repeat me-1"></i>Switch to Basic Mode
                    </button>
                </div>
            </div>
        `;
    }

    private showExtractionInfo() {
        const knowledgeData = this.baseController.getKnowledgeData();
        if (!knowledgeData) return;

        const infoDiv = document.createElement("div");
        infoDiv.className = "alert alert-info mt-2";

        const qualityMetrics = this.calculateKnowledgeQuality(knowledgeData);
        const settings = this.baseController.getExtractionSettings();

        let content = `<small>
            <i class="bi bi-cpu me-1"></i>
            <strong>Enhanced Extraction</strong> using <strong>${settings.mode}</strong> mode
            <div class="mt-2">
                <div class="d-flex align-items-center justify-content-between">
                    <span>Knowledge Quality:</span>
                    <div class="d-flex align-items-center">
                        <div class="progress me-2" style="width: 80px; height: 8px;">
                            <div class="progress-bar bg-${this.getQualityColorClass(qualityMetrics.overallScore)}" 
                                 style="width: ${qualityMetrics.overallScore * 100}%"></div>
                        </div>
                        <span class="badge bg-${this.getQualityColorClass(qualityMetrics.overallScore)}">
                            ${Math.round(qualityMetrics.overallScore * 100)}%
                        </span>
                    </div>
                </div>
            </div>
        </small>`;

        infoDiv.innerHTML = content;

        const knowledgeSection = document.getElementById("knowledgeSection")!;
        const firstCard = knowledgeSection.querySelector(".knowledge-card");
        if (firstCard) {
            firstCard.appendChild(infoDiv);
        }
    }

    private calculateKnowledgeQuality(knowledge: KnowledgeData) {
        const entityScore = Math.min((knowledge.entities?.length || 0) / 10, 1);
        const topicScore = Math.min((knowledge.keyTopics?.length || 0) / 5, 1);
        const relationshipScore = Math.min((knowledge.relationships?.length || 0) / 5, 1);
        const questionScore = Math.min((knowledge.suggestedQuestions?.length || 0) / 10, 1);
        
        const overallScore = (entityScore + topicScore + relationshipScore + questionScore) / 4;
        
        return {
            overallScore,
            entityScore,
            topicScore,
            relationshipScore,
            questionScore,
        };
    }

    private getQualityColorClass(score: number): string {
        if (score >= 0.8) return "success";
        if (score >= 0.6) return "info";
        if (score >= 0.4) return "warning";
        return "danger";
    }

    private updateExtractionModeAvailability() {
        const modeSelect = document.getElementById("extractionMode") as HTMLSelectElement;
        if (!modeSelect) return;

        const aiAvailable = this.baseController.getAIModelAvailable();
        const options = modeSelect.querySelectorAll("option");

        options.forEach(option => {
            const mode = option.value;
            const modeInfo = MODE_DESCRIPTIONS[mode as keyof typeof MODE_DESCRIPTIONS];
            
            if (modeInfo && modeInfo.requiresAI && !aiAvailable) {
                option.disabled = true;
                option.textContent = `${option.textContent} (AI Required)`;
            } else {
                option.disabled = false;
            }
        });
    }

    async saveExtractionSettings() {
        try {
            await chromeExtensionService.saveExtractionSettings(
                this.baseController.getExtractionSettings()
            );
        } catch (error) {
            console.warn("Could not save extraction settings:", error);
        }
    }

    private async updateQualityIndicator() {
        try {
            const response = await chromeExtensionService.getPageQualityMetrics(
                this.baseController.getCurrentUrl()
            );

            const indicator = document.getElementById("qualityIndicator");
            if (indicator && response.quality) {
                const quality = response.quality;
                let qualityClass = "bg-secondary";
                let qualityText = "Unknown";

                if (quality.score >= 0.8) {
                    qualityClass = "quality-excellent";
                    qualityText = "Excellent";
                } else if (quality.score >= 0.6) {
                    qualityClass = "quality-good";
                    qualityText = "Good";
                } else if (quality.score >= 0.4) {
                    qualityClass = "quality-basic";
                    qualityText = "Basic";
                } else {
                    qualityClass = "quality-poor";
                    qualityText = "Poor";
                }

                indicator.className = `badge ${qualityClass}`;
                indicator.textContent = qualityText;
                indicator.title = `Quality Score: ${Math.round(quality.score * 100)}% • ${quality.entityCount} entities • ${quality.topicCount} topics`;
            }
        } catch (error) {
            console.warn("Could not get quality metrics:", error);
        }
    }
}
