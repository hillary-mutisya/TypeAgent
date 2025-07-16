// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { SearchFilters } from "../../../knowledgeUtilities";

export interface SearchConfig {
    placeholder?: string;
    showFilters?: boolean;
    showViewModes?: boolean;
    showSorting?: boolean;
    debounceMs?: number;
}

export interface SearchCallbacks {
    onSearch?: (query: string) => void;
    onFilterChange?: (filters: SearchFilters) => void;
    onViewModeChange?: (mode: string) => void;
    onSortChange?: (sortBy: string) => void;
}

export class SearchComponents {
    private searchDebounceTimer: number | null = null;
    private callbacks: SearchCallbacks;
    private config: SearchConfig;

    constructor(callbacks: SearchCallbacks = {}, config: SearchConfig = {}) {
        this.callbacks = callbacks;
        this.config = {
            placeholder: "Search...",
            showFilters: true,
            showViewModes: true,
            showSorting: true,
            debounceMs: 300,
            ...config
        };
    }

    setupSearchInterface(): void {
        this.setupSearchInput();
        if (this.config.showFilters) this.setupFilters();
        if (this.config.showViewModes) this.setupViewModes();
        if (this.config.showSorting) this.setupSorting();
    }

    private setupSearchInput(): void {
        const searchInput = document.getElementById("searchInput") as HTMLInputElement;
        const searchButton = document.getElementById("searchButton");

        if (searchInput) {
            if (this.config.placeholder) {
                searchInput.placeholder = this.config.placeholder;
            }

            searchInput.addEventListener("input", (e) => {
                const query = (e.target as HTMLInputElement).value;
                this.handleSearchInput(query);
            });

            searchInput.addEventListener("keypress", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    const query = (e.target as HTMLInputElement).value;
                    this.callbacks.onSearch?.(query);
                }
            });
        }

        if (searchButton) {
            searchButton.addEventListener("click", () => {
                const query = searchInput?.value || "";
                this.callbacks.onSearch?.(query);
            });
        }
    }

    private handleSearchInput(query: string): void {
        if (this.searchDebounceTimer) {
            clearTimeout(this.searchDebounceTimer);
        }

        this.searchDebounceTimer = window.setTimeout(() => {
            if (query.length > 1) {
                this.callbacks.onSearch?.(query);
            }
        }, this.config.debounceMs);
    }

    private setupFilters(): void {
        const filterButton = document.getElementById("filterButton");
        const filterPanel = document.getElementById("filterPanel");
        const applyFiltersBtn = document.getElementById("applyFilters");
        const clearFiltersBtn = document.getElementById("clearFilters");

        if (filterButton && filterPanel) {
            filterButton.addEventListener("click", () => {
                filterPanel.classList.toggle("show");
            });
        }

        if (applyFiltersBtn) {
            applyFiltersBtn.addEventListener("click", () => {
                this.applyFilters();
            });
        }

        if (clearFiltersBtn) {
            clearFiltersBtn.addEventListener("click", () => {
                this.clearFilters();
            });
        }

        // Listen to individual filter changes
        const filterInputs = document.querySelectorAll(".filter-input");
        filterInputs.forEach((input) => {
            input.addEventListener("change", () => {
                this.applyFilters();
            });
        });
    }

    private setupViewModes(): void {
        const viewModeButtons = document.querySelectorAll(".view-mode-btn");
        viewModeButtons.forEach((button) => {
            button.addEventListener("click", (e) => {
                const target = e.currentTarget as HTMLElement;
                const mode = target.getAttribute("data-mode");
                if (mode) {
                    this.setActiveViewMode(mode);
                    this.callbacks.onViewModeChange?.(mode);
                }
            });
        });
    }

    private setupSorting(): void {
        const sortSelect = document.getElementById("sortSelect") as HTMLSelectElement;
        if (sortSelect) {
            sortSelect.addEventListener("change", () => {
                this.callbacks.onSortChange?.(sortSelect.value);
            });
        }
    }

    private applyFilters(): void {
        const filters = this.getFilters();
        this.callbacks.onFilterChange?.(filters);
    }

    private clearFilters(): void {
        const filterInputs = document.querySelectorAll('.filter-input') as NodeListOf<HTMLInputElement>;
        filterInputs.forEach(input => {
            input.value = '';
        });
        this.applyFilters();
    }

    private getFilters(): SearchFilters {
        const filters: SearchFilters = {};
        
        const dateFrom = (document.getElementById("dateFrom") as HTMLInputElement)?.value;
        const dateTo = (document.getElementById("dateTo") as HTMLInputElement)?.value;
        const sourceType = (document.getElementById("sourceFilter") as HTMLSelectElement)?.value;
        const domain = (document.getElementById("domainFilter") as HTMLInputElement)?.value;
        const minRelevance = parseInt((document.getElementById("relevanceFilter") as HTMLInputElement)?.value || "0");

        if (dateFrom) filters.dateFrom = dateFrom;
        if (dateTo) filters.dateTo = dateTo;
        if (sourceType) filters.sourceType = sourceType as "bookmarks" | "history";
        if (domain) filters.domain = domain;
        if (minRelevance > 0) filters.minRelevance = minRelevance;

        return filters;
    }

    private setActiveViewMode(mode: string): void {
        document.querySelectorAll('.view-mode-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        const activeBtn = document.querySelector(`[data-mode="${mode}"]`);
        if (activeBtn) {
            activeBtn.classList.add('active');
        }
    }

    // Public methods for external control
    public setSearchQuery(query: string): void {
        const searchInput = document.getElementById("searchInput") as HTMLInputElement;
        if (searchInput) {
            searchInput.value = query;
        }
    }

    public getSearchQuery(): string {
        const searchInput = document.getElementById("searchInput") as HTMLInputElement;
        return searchInput?.value || "";
    }

    public setFilters(filters: SearchFilters): void {
        if (filters.dateFrom) {
            const input = document.getElementById("dateFrom") as HTMLInputElement;
            if (input) input.value = filters.dateFrom;
        }
        if (filters.dateTo) {
            const input = document.getElementById("dateTo") as HTMLInputElement;
            if (input) input.value = filters.dateTo;
        }
        if (filters.sourceType) {
            const select = document.getElementById("sourceFilter") as HTMLSelectElement;
            if (select) select.value = filters.sourceType;
        }
        if (filters.domain) {
            const input = document.getElementById("domainFilter") as HTMLInputElement;
            if (input) input.value = filters.domain;
        }
        if (filters.minRelevance) {
            const input = document.getElementById("relevanceFilter") as HTMLInputElement;
            if (input) input.value = filters.minRelevance.toString();
        }
    }
}
