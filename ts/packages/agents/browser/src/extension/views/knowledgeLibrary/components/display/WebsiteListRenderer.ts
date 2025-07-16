// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { Website, KnowledgeFormatUtils as FormatUtils } from "../../../knowledgeUtilities";

export interface WebsiteListOptions {
    showFavicons?: boolean;
    showBadges?: boolean;
    showActions?: boolean;
    viewMode?: "list" | "grid" | "compact";
    onWebsiteClick?: (website: Website) => void;
    onExtractKnowledge?: (website: Website) => void;
}

export class WebsiteListRenderer {
    static renderWebsiteList(
        websites: Website[], 
        options: WebsiteListOptions = {}
    ): string {
        const {
            showFavicons = true,
            showBadges = true,
            showActions = false,
            viewMode = "list"
        } = options;

        if (websites.length === 0) {
            return `
                <div class="no-results">
                    <i class="bi bi-search"></i>
                    <h5>No websites found</h5>
                    <p>Try adjusting your search or filters</p>
                </div>
            `;
        }

        switch (viewMode) {
            case "grid":
                return this.renderGridView(websites, options);
            case "compact":
                return this.renderCompactView(websites, options);
            default:
                return this.renderListView(websites, options);
        }
    }

    private static renderListView(websites: Website[], options: WebsiteListOptions): string {
        return websites.map(website => `
            <div class="result-item list-view" data-url="${website.url}">
                ${options.showFavicons ? this.renderFavicon(website) : ''}
                <div class="result-content">
                    <div class="result-header">
                        <h5 class="result-title">
                            <a href="${website.url}" target="_blank">${FormatUtils.escapeHtml(website.title)}</a>
                        </h5>
                        ${options.showBadges ? this.renderBadges(website) : ''}
                    </div>
                    <div class="result-meta">
                        <span class="result-domain">${website.domain}</span>
                        <span class="result-date">${FormatUtils.formatDate(website.lastVisited || '')}</span>
                        ${website.visitCount ? `<span class="result-visits">${website.visitCount} visits</span>` : ''}
                    </div>
                    ${website.snippet ? `<p class="result-description">${FormatUtils.escapeHtml(website.snippet)}</p>` : ''}
                </div>
                ${options.showActions ? this.renderActions(website) : ''}
            </div>
        `).join('');
    }

    private static renderGridView(websites: Website[], options: WebsiteListOptions): string {
        return `
            <div class="grid-results">
                ${websites.map(website => `
                    <div class="result-card" data-url="${website.url}">
                        <div class="card-header">
                            ${options.showFavicons ? this.renderFavicon(website, 'card-favicon') : ''}
                            ${options.showBadges ? this.renderBadges(website, 'card-badges') : ''}
                        </div>
                        <div class="card-body">
                            <h6 class="card-title">
                                <a href="${website.url}" target="_blank">${FormatUtils.escapeHtml(website.title)}</a>
                            </h6>
                            <p class="card-domain">${website.domain}</p>
                            <p class="card-meta">${FormatUtils.formatDate(website.lastVisited || '')} ${website.visitCount ? `• ${website.visitCount} visits` : ''}</p>
                        </div>
                        ${options.showActions ? this.renderActions(website, 'card-actions') : ''}
                    </div>
                `).join('')}
            </div>
        `;
    }

    private static renderCompactView(websites: Website[], options: WebsiteListOptions): string {
        return websites.map(website => `
            <div class="result-item compact-view" data-url="${website.url}">
                ${options.showFavicons ? this.renderFavicon(website, 'compact-favicon') : ''}
                <div class="compact-content">
                    <div class="compact-title">
                        <a href="${website.url}" target="_blank">${FormatUtils.escapeHtml(website.title)}</a>
                    </div>
                    <div class="compact-meta">
                        ${website.domain} • ${FormatUtils.formatDate(website.lastVisited || '')}
                    </div>
                </div>
                ${options.showBadges ? this.renderBadges(website, 'compact-badges') : ''}
            </div>
        `).join('');
    }

    private static renderFavicon(website: Website, className: string = 'result-favicon'): string {
        if (website.favicon) {
            return `
                <div class="${className}">
                    <img src="${website.favicon}" alt="${website.domain}" onerror="this.style.display='none'">
                </div>
            `;
        } else {
            return `
                <div class="${className}">
                    <i class="bi bi-globe"></i>
                </div>
            `;
        }
    }

    private static renderBadges(website: Website, className: string = 'result-badges'): string {
        const badges: string[] = [];

        if (website.source === 'bookmarks') {
            badges.push('<span class="badge bg-primary">Bookmarked</span>');
        }

        if (website.knowledge?.hasKnowledge) {
            const badgeClass = website.knowledge.status === 'extracted' ? 'bg-success' : 'bg-warning';
            badges.push(`<span class="badge ${badgeClass}">Knowledge</span>`);
        }

        return badges.length > 0 ? `<div class="${className}">${badges.join('')}</div>` : '';
    }

    private static renderActions(website: Website, className: string = 'result-actions'): string {
        return `
            <div class="${className}">
                <button class="btn btn-sm btn-outline-secondary extract-knowledge-btn" 
                        data-url="${website.url}">
                    <i class="bi bi-lightbulb"></i> Extract Knowledge
                </button>
            </div>
        `;
    }

    static attachEventListeners(
        container: HTMLElement, 
        options: WebsiteListOptions = {}
    ): void {
        // Handle website clicks
        if (options.onWebsiteClick) {
            container.querySelectorAll('[data-url]').forEach(item => {
                item.addEventListener('click', (e) => {
                    if ((e.target as HTMLElement).tagName !== 'A' && 
                        (e.target as HTMLElement).tagName !== 'BUTTON') {
                        const url = item.getAttribute('data-url');
                        if (url) {
                            // Find the website object - in practice, this would be passed differently
                            options.onWebsiteClick?.({ url } as Website);
                        }
                    }
                });
            });
        }

        // Handle extract knowledge clicks
        if (options.onExtractKnowledge) {
            container.querySelectorAll('.extract-knowledge-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const url = btn.getAttribute('data-url');
                    if (url) {
                        options.onExtractKnowledge?.({ url } as Website);
                    }
                });
            });
        }
    }
}
