// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { PageKnowledgeBaseController, KnowledgeData, Entity, Relationship, CategorizedQuestion, QuestionCategory } from ".";
import {
    TemplateHelpers,
    FormatUtils,
} from "../knowledgeUtilities";

export class ContentRenderingController {
    constructor(private baseController: PageKnowledgeBaseController) {}

    async renderKnowledgeResults(knowledge: KnowledgeData) {
        const knowledgeSection = document.getElementById("knowledgeSection")!;
        knowledgeSection.className = "";
        knowledgeSection.innerHTML = `
            ${knowledge.contentMetrics ? this.renderContentMetricsCard() : ""}
            ${this.renderRelatedContentCard()}
            ${this.renderEntitiesCard()}
            ${this.renderRelationshipsCard()}
            ${this.renderTopicsCard()}
            ${knowledge.detectedActions && knowledge.detectedActions.length > 0 ? this.renderUserActionsCard() : ""}
        `;

        if (knowledge.contentMetrics) {
            this.renderContentMetrics(knowledge.contentMetrics);
        }
        this.renderRelatedContent(knowledge);
        this.renderEntities(knowledge.entities);
        this.renderRelationships(knowledge.relationships);
        this.renderKeyTopics(knowledge.keyTopics);
        if (knowledge.detectedActions && knowledge.detectedActions.length > 0) {
            this.renderDetectedActions(knowledge.detectedActions, knowledge.actionSummary);
        }

        this.renderSuggestedQuestions(knowledge.suggestedQuestions);
        await this.loadRelatedContent(knowledge);

        const questionsSection = document.getElementById("questionsSection")!;
        questionsSection.className = "knowledge-card card";
    }

    private renderEntities(entities: Entity[]) {
        const container = document.getElementById("entitiesContainer")!;
        const countBadge = document.getElementById("entitiesCount")!;

        countBadge.textContent = entities.length.toString();

        if (entities.length === 0) {
            container.innerHTML = `
                <div class="text-muted text-center">
                    <i class="bi bi-info-circle"></i>
                    No entities found on this page
                </div>
            `;
            return;
        }

        container.innerHTML = entities
            .map(entity => `
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <div>
                        <span class="fw-semibold">${entity.name}</span>
                        <span class="entity-badge badge bg-secondary">${entity.type}</span>
                    </div>
                    <div>
                        <div class="progress" style="width: 50px; height: 4px;">
                            <div class="progress-bar" style="width: ${entity.confidence * 100}%"></div>
                        </div>
                    </div>
                </div>
                ${entity.description ? `<small class="text-muted">${entity.description}</small><hr class="my-2">` : ""}
            `).join("");
    }

    private renderRelationships(relationships: Relationship[]) {
        const container = document.getElementById("relationshipsContainer")!;
        const countBadge = document.getElementById("relationshipsCount")!;

        countBadge.textContent = relationships.length.toString();

        if (relationships.length === 0) {
            container.innerHTML = `
                <div class="text-muted text-center">
                    <i class="bi bi-info-circle"></i>
                    No entity actions found
                </div>
            `;
            return;
        }

        container.innerHTML = relationships
            .map(rel => `
                 <div class="relationship-item rounded">
                    <span class="fw-semibold">${rel.from}</span>
                    <i class="bi bi-arrow-right mx-2 text-muted"></i>
                    <span class="text-muted">${rel.relationship}</span>
                    <i class="bi bi-arrow-right mx-2 text-muted"></i>
                    <span class="fw-semibold">${rel.to}</span>
                </div>
            `).join("");
    }

    private renderKeyTopics(topics: string[]) {
        const container = document.getElementById("topicsContainer")!;
        const countBadge = document.getElementById("topicsCount")!;

        countBadge.textContent = topics.length.toString();

        if (topics.length === 0) {
            container.innerHTML = `
                <div class="text-muted text-center">
                    <i class="bi bi-info-circle"></i>
                    No key topics identified
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="d-flex flex-wrap gap-2">
                ${topics.map(topic => `
                    <span class="badge bg-primary">${topic}</span>
                `).join("")}
            </div>
        `;
    }

    private renderSuggestedQuestions(questions: string[]) {
        const container = document.getElementById("questionsContainer")!;
        const countBadge = document.getElementById("questionsCount")!;

        if(!countBadge || !container){
            return;
        }

        if (!questions || questions.length === 0) {
            countBadge.textContent = "0";
            container.innerHTML = `
                <div class="text-muted text-center">
                    <i class="bi bi-info-circle"></i>
                    No questions suggested
                </div>
            `;
            return;
        }

        countBadge.textContent = questions.length.toString();

        const categories = this.categorizeQuestions(questions);
        const sortedCategories = categories.sort((a, b) => b.priority - a.priority);

        let questionsHtml = sortedCategories.map(category => {
            if (category.questions.length === 0) return "";

            return `
                <div class="question-category mb-3">
                    <div class="d-flex align-items-center mb-2">
                        <i class="${category.icon} me-2" style="color: ${category.color}"></i>
                        <strong class="category-title">${category.name}</strong>
                        <span class="badge bg-secondary ms-2">${category.count}</span>
                    </div>
                    <div class="questions-list">
                        ${category.questions.map(q => `
                            <div class="question-item p-2 border rounded mb-1 ${q.recommended ? 'border-primary bg-light' : ''}" 
                                 data-priority="${q.priority}" data-confidence="${q.confidence}">
                                <div class="d-flex justify-content-between align-items-start">
                                    <span class="question-text">${q.text}</span>
                                    <div class="question-badges">
                                        ${q.recommended ? '<span class="badge bg-primary">Recommended</span>' : ''}
                                        <span class="badge bg-${this.getPriorityColor(q.priority)}">${q.priority}</span>
                                    </div>
                                </div>
                            </div>
                        `).join("")}
                    </div>
                </div>
            `;
        }).join("");

        container.innerHTML = questionsHtml;
        this.setupQuestionInteractions(container);
    }

    private renderEntitiesCard(): string {
        const content = this.createContainer(
            "entitiesContainer",
            TemplateHelpers.createEmptyState("bi bi-info-circle", "No entities extracted yet")
        );
        return TemplateHelpers.createCard("Entities", content, "bi bi-tags", "entitiesCount");
    }

    private renderRelationshipsCard(): string {
        const content = this.createContainer(
            "relationshipsContainer",
            TemplateHelpers.createEmptyState("bi bi-info-circle", "No entity actions found yet")
        );
        return TemplateHelpers.createCard("Entity Actions", content, "bi bi-diagram-3", "relationshipsCount");
    }

    private renderTopicsCard(): string {
        const content = this.createContainer(
            "topicsContainer",
            TemplateHelpers.createEmptyState("bi bi-info-circle", "No topics identified yet")
        );
        return TemplateHelpers.createCard("Key Topics", content, "bi bi-bookmark", "topicsCount");
    }

    private renderContentMetricsCard(): string {
        const content = this.createContainer(
            "contentMetricsContainer",
            TemplateHelpers.createEmptyState("bi bi-info-circle", "No content metrics available")
        );
        return TemplateHelpers.createCard("Content Analysis", content, "bi bi-bar-chart-line");
    }

    private renderRelatedContentCard(): string {
        const content = this.createContainer(
            "relatedContentContainer",
            TemplateHelpers.createEmptyState("bi bi-info-circle", "No related content found")
        );
        return TemplateHelpers.createCard("Related Content", content, "bi bi-link-45deg");
    }

    private renderUserActionsCard(): string {
        const content = this.createContainer(
            "userActionsContainer",
            TemplateHelpers.createEmptyState("bi bi-info-circle", "No user actions detected")
        );
        return TemplateHelpers.createCard("User Actions", content, "bi bi-cursor");
    }

    private createContainer(id: string, defaultContent: string): string {
        return `<div id="${id}">${defaultContent}</div>`;
    }

    private categorizeQuestions(questions: string[]): QuestionCategory[] {
        const categorizedQuestions: CategorizedQuestion[] = questions.map(question => {
            return this.categorizeAndScoreQuestion(question);
        });

        const categoryMap = new Map<string, CategorizedQuestion[]>();
        categorizedQuestions.forEach(question => {
            if (!categoryMap.has(question.category)) {
                categoryMap.set(question.category, []);
            }
            categoryMap.get(question.category)!.push(question);
        });

        const categories: QuestionCategory[] = [];

        if (categoryMap.has("relationship")) {
            categories.push({
                name: "Relationships",
                icon: "bi-diagram-3",
                color: "info",
                questions: categoryMap.get("relationship")!.sort((a, b) => this.getQuestionScore(b) - this.getQuestionScore(a)),
                priority: 1.5,
                count: categoryMap.get("relationship")!.length,
            });
        }

        if (categoryMap.has("learning")) {
            categories.push({
                name: "Learning Path",
                icon: "bi-mortarboard",
                color: "success",
                questions: categoryMap.get("learning")!.sort((a, b) => this.getQuestionScore(b) - this.getQuestionScore(a)),
                priority: 1,
                count: categoryMap.get("learning")!.length,
            });
        }

        if (categoryMap.has("technical")) {
            categories.push({
                name: "Technical Details",
                icon: "bi-gear",
                color: "primary",
                questions: categoryMap.get("technical")!.sort((a, b) => this.getQuestionScore(b) - this.getQuestionScore(a)),
                priority: 2,
                count: categoryMap.get("technical")!.length,
            });
        }

        if (categoryMap.has("content")) {
            categories.push({
                name: "Content Understanding",
                icon: "bi-book",
                color: "info",
                questions: categoryMap.get("content")!.sort((a, b) => this.getQuestionScore(b) - this.getQuestionScore(a)),
                priority: 3,
                count: categoryMap.get("content")!.length,
            });
        }

        if (categoryMap.has("discovery")) {
            categories.push({
                name: "Discovery & Context",
                icon: "bi-search",
                color: "warning",
                questions: categoryMap.get("discovery")!.sort((a, b) => this.getQuestionScore(b) - this.getQuestionScore(a)),
                priority: 4,
                count: categoryMap.get("discovery")!.length,
            });
        }

        return categories;
    }

    private categorizeAndScoreQuestion(question: string): CategorizedQuestion {
        const lowerQuestion = question.toLowerCase();

        let category = "content";
        let priority: "high" | "medium" | "low" = "medium";
        let source: "content" | "temporal" | "technical" | "discovery" | "learning" = "content";
        let confidence = 0.7;
        let recommended = false;

        if (lowerQuestion.includes("how") && (lowerQuestion.includes("learn") || lowerQuestion.includes("understand"))) {
            category = "learning";
            priority = "high";
            source = "learning";
            confidence = 0.9;
            recommended = true;
        } else if (lowerQuestion.includes("relationship") || lowerQuestion.includes("connect") || lowerQuestion.includes("relate")) {
            category = "relationship";
            priority = "high";
            source = "technical";
            confidence = 0.85;
            recommended = true;
        } else if (lowerQuestion.includes("what is") || lowerQuestion.includes("define")) {
            category = "technical";
            priority = "high";
            source = "technical";
            confidence = 0.8;
        } else if (lowerQuestion.includes("why") || lowerQuestion.includes("because")) {
            category = "content";
            priority = "medium";
            source = "content";
            confidence = 0.75;
        } else if (lowerQuestion.includes("when") || lowerQuestion.includes("time")) {
            category = "discovery";
            priority = "low";
            source = "temporal";
            confidence = 0.6;
        }

        return {
            text: question,
            category,
            priority,
            source,
            confidence,
            recommended,
        };
    }

    private getQuestionScore(question: CategorizedQuestion): number {
        let score = 0;
        
        if (question.priority === "high") score += 3;
        else if (question.priority === "medium") score += 2;
        else score += 1;
        
        score += question.confidence;
        
        if (question.recommended) score += 1;
        
        return score;
    }

    private getPriorityColor(priority: "high" | "medium" | "low"): string {
        switch (priority) {
            case "high": return "success";
            case "medium": return "warning";
            case "low": return "secondary";
        }
    }

    private setupQuestionInteractions(container: HTMLElement) {
        const questionItems = container.querySelectorAll(".question-item");
        questionItems.forEach(item => {
            item.addEventListener("click", () => {
                const questionText = item.querySelector(".question-text")?.textContent;
                if (questionText) {
                    const queryInput = document.getElementById("knowledgeQuery") as HTMLInputElement;
                    if (queryInput) {
                        queryInput.value = questionText;
                        queryInput.focus();
                    }
                }
            });
        });
    }

    private renderContentMetrics(metrics: any) {
        const container = document.getElementById("contentMetricsContainer")!;

        const readingTimeCategory = this.getReadingTimeCategory(metrics.readingTime);
        const wordCountCategory = this.getWordCountCategory(metrics.wordCount);

        container.innerHTML = `
            <div class="metric-section mb-4">
                <div class="d-flex align-items-center justify-content-between mb-2">
                    <h6 class="mb-0 text-primary">
                        <i class="bi bi-clock me-2"></i>Reading Time
                    </h6>
                    <span class="badge bg-${readingTimeCategory.color}">${readingTimeCategory.label}</span>
                </div>
                <div class="metric-visual-container">
                    <div class="d-flex align-items-center mb-2">
                        <div class="reading-time-display me-3">
                            <span class="h4 mb-0 text-primary">${metrics.readingTime}</span>
                            <small class="text-muted ms-1">min</small>
                        </div>
                        <div class="flex-grow-1">
                            <div class="progress" style="height: 8px;">
                                <div class="progress-bar bg-${readingTimeCategory.color}" 
                                     style="width: ${Math.min(metrics.readingTime * 10, 100)}%"
                                     title="${metrics.readingTime} minutes">
                                </div>
                            </div>
                            <small class="text-muted">${readingTimeCategory.description}</small>
                        </div>
                    </div>
                </div>
            </div>

            <div class="metric-section mb-4">
                <div class="d-flex align-items-center justify-content-between mb-2">
                    <h6 class="mb-0 text-info">
                        <i class="bi bi-file-text me-2"></i>Word Count
                    </h6>
                    <span class="badge bg-${wordCountCategory.color}">${wordCountCategory.label}</span>
                </div>
                <div class="metric-visual-container">
                    <div class="d-flex align-items-center mb-2">
                        <div class="word-count-display me-3">
                            <span class="h4 mb-0 text-info">${metrics.wordCount.toLocaleString()}</span>
                            <small class="text-muted ms-1">words</small>
                        </div>
                        <div class="flex-grow-1">
                            <div class="progress" style="height: 8px;">
                                <div class="progress-bar bg-${wordCountCategory.color}" 
                                     style="width: ${Math.min(metrics.wordCount / 50, 100)}%"
                                     title="${metrics.wordCount} words">
                                </div>
                            </div>
                            <small class="text-muted">${wordCountCategory.description}</small>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    private getReadingTimeCategory(readingTime: number) {
        if (readingTime <= 1) {
            return { color: "success", label: "Quick Read", description: "Very short content" };
        } else if (readingTime <= 5) {
            return { color: "info", label: "Short Read", description: "Brief content" };
        } else if (readingTime <= 15) {
            return { color: "warning", label: "Medium Read", description: "Moderate length" };
        } else {
            return { color: "danger", label: "Long Read", description: "Extensive content" };
        }
    }

    private getWordCountCategory(wordCount: number) {
        if (wordCount <= 250) {
            return { color: "success", label: "Brief", description: "Short content" };
        } else if (wordCount <= 1000) {
            return { color: "info", label: "Standard", description: "Regular length" };
        } else if (wordCount <= 3000) {
            return { color: "warning", label: "Detailed", description: "Comprehensive content" };
        } else {
            return { color: "danger", label: "Extensive", description: "Very long content" };
        }
    }

    private renderRelatedContent(knowledge: KnowledgeData) {
        const container = document.getElementById("relatedContentContainer")!;
        container.innerHTML = `
            <div class="text-muted text-center">
                <i class="bi bi-search"></i>
                Loading related content...
            </div>
        `;
    }

    private renderDetectedActions(detectedActions: any[], actionSummary: any) {
        const container = document.getElementById("userActionsContainer")!;
        
        if (!detectedActions || detectedActions.length === 0) {
            container.innerHTML = `
                <div class="text-muted text-center">
                    <i class="bi bi-info-circle"></i>
                    No user actions detected
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="actions-summary mb-3">
                <div class="d-flex justify-content-between">
                    <span>Total Actions: ${actionSummary?.totalActions || detectedActions.length}</span>
                    <span>High Confidence: ${actionSummary?.highConfidenceActions || 0}</span>
                </div>
            </div>
            <div class="actions-list">
                ${detectedActions.map(action => `
                    <div class="action-item mb-2 p-2 border rounded">
                        <div class="d-flex justify-content-between">
                            <span class="fw-semibold">${action.type}</span>
                            <span class="badge bg-${action.confidence > 0.7 ? 'success' : 'warning'}">
                                ${Math.round(action.confidence * 100)}%
                            </span>
                        </div>
                        <div class="small text-muted">${action.element}</div>
                        ${action.text ? `<div class="small">"${action.text}"</div>` : ''}
                    </div>
                `).join('')}
            </div>
        `;
    }

    private async loadRelatedContent(knowledge: KnowledgeData) {
        // Placeholder for related content loading logic
        // This would typically make API calls to find related pages
        console.log("Loading related content for knowledge data:", knowledge);
    }
}
