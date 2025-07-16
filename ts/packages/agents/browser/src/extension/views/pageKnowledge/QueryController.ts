// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { PageKnowledgeBaseController } from ".";
import {
    chromeExtensionService,
    TemplateHelpers,
} from "../knowledgeUtilities";

export class QueryController {
    constructor(private baseController: PageKnowledgeBaseController) {}

    async submitQuery() {
        const queryInput = document.getElementById("knowledgeQuery") as HTMLInputElement;
        const queryResults = document.getElementById("queryResults")!;
        const query = queryInput.value.trim();

        if (!query) return;

        const advancedControls = document.getElementById("advancedQueryControls");
        const useAdvanced = advancedControls && advancedControls.style.display !== "none";

        if (useAdvanced) {
            await this.submitEnhancedQuery(query);
        } else {
            queryResults.innerHTML = TemplateHelpers.createSearchLoadingState();

            try {
                const response = await chromeExtensionService.queryKnowledge({
                    query: query,
                    url: this.baseController.getCurrentUrl(),
                    searchScope: "current_page",
                });

                queryResults.innerHTML = TemplateHelpers.createQueryAnswer(
                    response.answer,
                    response.sources,
                );
                queryInput.value = "";
            } catch (error) {
                console.error("Error querying knowledge:", error);
                queryResults.innerHTML = TemplateHelpers.createAlert(
                    "danger",
                    "bi bi-exclamation-triangle",
                    "Error processing query. Please try again.",
                );
            }
        }
    }

    async submitEnhancedQuery(query: string): Promise<void> {
        const queryResults = document.getElementById("queryResults")!;

        const filters: any = {};

        const timeRange = (document.getElementById("timeRangeFilter") as HTMLSelectElement)?.value;
        if (timeRange) filters.timeRange = timeRange;

        const domain = (document.getElementById("domainFilter") as HTMLInputElement)?.value;
        if (domain) filters.domain = domain;

        queryResults.innerHTML = this.createEnhancedSearchLoadingState();

        try {
            const response = await chromeExtensionService.searchWebMemoriesAdvanced({
                query: query,
                searchScope: "all_indexed",
                generateAnswer: true,
                includeRelatedEntities: true,
                enableAdvancedSearch: true,
                limit: 10,
                domain: filters.domain,
                source: filters.source,
                pageType: filters.pageType,
                temporalSort: filters.temporalSort,
                frequencySort: filters.frequencySort,
            });

            this.renderEnhancedQueryResults(response);

            if (response.metadata?.filtersApplied?.length > 0) {
                this.showAppliedFilters(response.metadata.filtersApplied);
            }
        } catch (error) {
            console.error("Error querying enhanced knowledge:", error);
            queryResults.innerHTML = TemplateHelpers.createAlert(
                "danger",
                "bi bi-exclamation-triangle",
                "Failed to search knowledge base. Please try again.",
            );
        }
    }

    setupAdvancedQueryControls(): void {
        const queryInput = document.getElementById("knowledgeQuery");
        if (queryInput && queryInput.parentNode) {
            const toggleButton = document.createElement("button");
            toggleButton.className = "btn btn-sm btn-outline-primary ms-2";
            toggleButton.id = "toggleAdvancedQuery";
            toggleButton.innerHTML = '<i class="bi bi-gear"></i>';
            toggleButton.title = "Advanced Search Options";

            queryInput.parentNode.appendChild(toggleButton);

            const controlsHtml = this.renderAdvancedQueryControls();
            (queryInput.parentNode as Element).insertAdjacentHTML("afterend", controlsHtml);

            toggleButton.addEventListener("click", () => {
                const controls = document.getElementById("advancedQueryControls");
                if (controls) {
                    const isVisible = controls.style.display !== "none";
                    controls.style.display = isVisible ? "none" : "block";
                    toggleButton.innerHTML = isVisible
                        ? '<i class="bi bi-gear"></i>'
                        : '<i class="bi bi-gear-fill"></i>';
                }
            });

            document.getElementById("clearFilters")?.addEventListener("click", () => {
                this.clearAllFilters();
            });
        }
    }

    clearAllFilters(): void {
        (document.getElementById("timeRangeFilter") as HTMLSelectElement).value = "";
        (document.getElementById("domainFilter") as HTMLInputElement).value = "";
    }

    toggleEnhancedQuery(enabled: boolean): void {
        const controls = document.getElementById("advancedQueryControls");
        if (controls) {
            controls.style.display = enabled ? "block" : "none";
        }
    }

    private createEnhancedSearchLoadingState(): string {
        return `
            <div class="d-flex align-items-center">
                <div class="spinner-border spinner-border-sm text-primary me-2" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
                <span class="text-muted">Searching with advanced filters...</span>
            </div>
        `;
    }

    private renderEnhancedQueryResults(response: any): void {
        const queryResults = document.getElementById("queryResults")!;

        let html = `
            <div class="enhanced-query-results">
                <div class="query-answer mb-3">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <h6 class="mb-0">Search Results</h6>
                        <div class="d-flex align-items-center">
                            <small class="text-muted me-2">
                                ${response.metadata.totalFound} found in ${response.metadata.processingTime}ms
                            </small>
                            <span class="badge bg-primary">${response.metadata.searchScope}</span>
                            ${response.metadata.temporalQuery
                                ? `<span class="badge bg-success ms-1">⏰ ${response.metadata.temporalQuery.timeframe}</span>`
                                : ""
                            }
                        </div>
                    </div>
                    ${response.answer ? `<div class="alert alert-info">${response.answer}</div>` : ''}
                </div>
                
                <div class="search-results">
                    ${response.websites?.map((website: any) => `
                        <div class="result-item mb-3 p-3 border rounded">
                            <div class="d-flex justify-content-between align-items-start">
                                <div class="flex-grow-1">
                                    <h6 class="mb-1">
                                        <a href="${website.url}" target="_blank" class="text-decoration-none">
                                            ${website.title}
                                        </a>
                                    </h6>
                                    <p class="mb-1 text-muted small">${website.excerpt || ''}</p>
                                    <div class="d-flex align-items-center text-muted small">
                                        <span>${new URL(website.url).hostname}</span>
                                        ${website.lastVisited ? `<span class="ms-2">• ${new Date(website.lastVisited).toLocaleDateString()}</span>` : ''}
                                    </div>
                                </div>
                                ${website.knowledge?.entityCount ? `
                                    <span class="badge bg-info ms-2">
                                        ${website.knowledge.entityCount} entities
                                    </span>
                                ` : ''}
                            </div>
                        </div>
                    `).join('') || '<p class="text-muted">No results found.</p>'}
                </div>
            </div>
        `;

        queryResults.innerHTML = html;
    }

    private showAppliedFilters(filters: string[]): void {
        const queryResults = document.getElementById("queryResults")!;
        const filtersHtml = `
            <div class="applied-filters mt-2 p-2 bg-light rounded">
                <small class="text-muted">Applied filters: ${filters.join(', ')}</small>
            </div>
        `;
        queryResults.insertAdjacentHTML('beforeend', filtersHtml);
    }

    private renderAdvancedQueryControls(): string {
        return `
            <div class="advanced-query-controls mb-3" id="advancedQueryControls" style="display: none;">
                <div class="card border-light">
                    <div class="card-header bg-light py-2">
                        <h6 class="mb-0">
                            <i class="bi bi-funnel me-2"></i>Advanced Filters
                        </h6>
                    </div>
                    <div class="card-body p-3">
                        <div class="row g-2">
                            <div class="col-md-6">
                                <label class="form-label">Time Range</label>
                                <select class="form-select form-select-sm" id="timeRangeFilter">
                                    <option value="">All Time</option>
                                    <option value="week">Last Week</option>
                                    <option value="month">Last Month</option>
                                    <option value="quarter">Last 3 Months</option>
                                    <option value="year">Last Year</option>
                                </select>
                            </div>
                            <div class="col-md-6">
                                <label class="form-label">Domain</label>
                                <input type="text" class="form-control form-control-sm" id="domainFilter" 
                                       placeholder="e.g., github.com">
                            </div>
                        </div>
                        <div class="row g-2 mt-2">
                            <div class="col-12">
                                <button type="button" class="btn btn-sm btn-outline-secondary" id="clearFilters">
                                    <i class="bi bi-x-circle me-1"></i>Clear Filters
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
}
