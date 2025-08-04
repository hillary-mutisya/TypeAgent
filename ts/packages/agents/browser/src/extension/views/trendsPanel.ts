// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// Import trend types for UI rendering
export enum VisualizationType {
    TIMELINE = "timeline",
    HEATMAP = "heatmap",
    TOPIC_CLOUD = "topic_cloud",
    TREND_DASHBOARD = "trend_dashboard",
    INTENT_JOURNEY = "intent_journey"
}

export enum TrendType {
    EPHEMERAL = "ephemeral",
    RECURRING = "recurring", 
    PERSISTENT = "persistent",
    SEASONAL = "seasonal"
}

export class TrendsPanel {
    private container: HTMLElement;
    private isVisible: boolean = false;

    constructor(container: HTMLElement) {
        this.container = container;
        this.initialize();
    }

    private initialize() {
        this.createTrendsUI();
        this.loadTrends();
    }

    private createTrendsUI() {
        this.container.innerHTML = `
            <div class="trends-panel">
                <div class="trends-header">
                    <h2>📊 Activity Trends</h2>
                    <div class="trends-controls">
                        <button id="refresh-trends" class="btn-secondary">🔄 Refresh</button>
                        <button id="export-trends" class="btn-secondary">📤 Export</button>
                        <select id="trend-filter" class="trend-filter">
                            <option value="all">All Trends</option>
                            <option value="active">Active Only</option>
                            <option value="ephemeral">Ephemeral</option>
                            <option value="persistent">Persistent</option>
                            <option value="recurring">Daily Habits</option>
                        </select>
                    </div>
                </div>
                
                <div class="trends-summary">
                    <div class="summary-card">
                        <span class="summary-label">Active Trends</span>
                        <span class="summary-value" id="active-count">-</span>
                    </div>
                    <div class="summary-card">
                        <span class="summary-label">Total Trends</span>
                        <span class="summary-value" id="total-count">-</span>
                    </div>
                    <div class="summary-card">
                        <span class="summary-label">This Week</span>
                        <span class="summary-value" id="week-count">-</span>
                    </div>
                </div>

                <div class="trends-content">
                    <div class="trends-loading" id="trends-loading">
                        <div class="spinner"></div>
                        <span>Analyzing your browsing patterns...</span>
                    </div>
                    
                    <div class="trends-list" id="trends-list" style="display: none;">
                        <!-- Trends will be populated here -->
                    </div>
                    
                    <div class="trends-empty" id="trends-empty" style="display: none;">
                        <div class="empty-state">
                            <span class="empty-icon">🔍</span>
                            <h3>No Trends Found</h3>
                            <p>Start browsing and we'll identify interesting patterns in your activity.</p>
                        </div>
                    </div>
                </div>

                <div class="trends-insights" id="trends-insights" style="display: none;">
                    <h3>💡 Insights</h3>
                    <div class="insights-list" id="insights-list">
                        <!-- Insights will be populated here -->
                    </div>
                </div>
            </div>
        `;

        this.attachEventListeners();
        this.applyStyles();
    }

    private attachEventListeners() {
        const refreshBtn = this.container.querySelector('#refresh-trends') as HTMLButtonElement;
        const exportBtn = this.container.querySelector('#export-trends') as HTMLButtonElement;
        const filterSelect = this.container.querySelector('#trend-filter') as HTMLSelectElement;

        refreshBtn?.addEventListener('click', () => this.loadTrends());
        exportBtn?.addEventListener('click', () => this.exportTrends());
        filterSelect?.addEventListener('change', (e) => {
            const target = e.target as HTMLSelectElement;
            this.filterTrends(target.value);
        });
    }

    private async loadTrends() {
        this.showLoading();
        
        try {
            // Get trends from service worker
            const response = await this.sendMessage('getTrends', {
                minConfidence: 0.3,
                includeHabits: true,
                limit: 20
            });

            if (response.success) {
                this.displayTrends(response.trends);
                this.updateSummary(response.trends, response.totalCount);
                await this.loadInsights();
            } else {
                this.showError(response.error || 'Failed to load trends');
            }
        } catch (error) {
            console.error('Error loading trends:', error);
            this.showError('Failed to load trends');
        }
    }

    private displayTrends(trends: any[]) {
        const listContainer = this.container.querySelector('#trends-list') as HTMLElement;
        const loadingContainer = this.container.querySelector('#trends-loading') as HTMLElement;
        const emptyContainer = this.container.querySelector('#trends-empty') as HTMLElement;

        loadingContainer.style.display = 'none';

        if (trends.length === 0) {
            emptyContainer.style.display = 'block';
            listContainer.style.display = 'none';
            return;
        }

        emptyContainer.style.display = 'none';
        listContainer.style.display = 'block';

        listContainer.innerHTML = trends.map(trend => this.createTrendCard(trend)).join('');

        // Add click listeners for trend details
        listContainer.querySelectorAll('.trend-card').forEach((card, index) => {
            card.addEventListener('click', () => this.showTrendDetails(trends[index]));
        });
    }

    private createTrendCard(trend: any): string {
        const typeIcon = this.getTrendTypeIcon(trend.type);
        const confidencePercent = Math.round(trend.confidence * 100);
        const duration = this.calculateDuration(trend.startDate, trend.endDate);
        
        return `
            <div class="trend-card ${trend.type} ${trend.isActive ? 'active' : 'inactive'}" data-trend-id="${trend.id}">
                <div class="trend-header">
                    <div class="trend-title">
                        <span class="trend-icon">${typeIcon}</span>
                        <span class="trend-name">${trend.name}</span>
                        ${trend.isActive ? '<span class="active-badge">Active</span>' : ''}
                    </div>
                    <div class="trend-confidence">${confidencePercent}%</div>
                </div>
                
                <div class="trend-summary">
                    <div class="trend-stats">
                        <span class="stat">
                            <strong>${trend.summary.websites}</strong> sites
                        </span>
                        <span class="stat">
                            <strong>${trend.summary.domains}</strong> domains
                        </span>
                        <span class="stat">
                            <strong>${duration}</strong>
                        </span>
                    </div>
                </div>

                <div class="trend-topics">
                    ${trend.summary.topTopics.slice(0, 3).map((topic: string) => 
                        `<span class="topic-tag">${topic}</span>`
                    ).join('')}
                </div>

                <div class="trend-insights">
                    ${trend.insights.slice(0, 2).map((insight: string) => 
                        `<div class="insight-item">💡 ${insight}</div>`
                    ).join('')}
                </div>
            </div>
        `;
    }

    private getTrendTypeIcon(type: string): string {
        switch (type) {
            case TrendType.EPHEMERAL: return '⚡';
            case TrendType.PERSISTENT: return '🎯';
            case TrendType.RECURRING: return '🔄';
            case TrendType.SEASONAL: return '📅';
            default: return '📊';
        }
    }

    private calculateDuration(startDate: string, endDate?: string): string {
        const start = new Date(startDate);
        const end = endDate ? new Date(endDate) : new Date();
        const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        
        if (days === 1) return '1 day';
        if (days < 7) return `${days} days`;
        if (days < 30) return `${Math.ceil(days / 7)} weeks`;
        return `${Math.ceil(days / 30)} months`;
    }

    private async showTrendDetails(trend: any) {
        try {
            const response = await this.sendMessage('getTrendDetails', {
                trendId: trend.id
            });

            if (response.success) {
                this.openTrendModal(response.details);
            } else {
                console.error('Failed to load trend details:', response.error);
            }
        } catch (error) {
            console.error('Error loading trend details:', error);
        }
    }

    private openTrendModal(details: any) {
        // Create modal overlay
        const modal = document.createElement('div');
        modal.className = 'trend-modal-overlay';
        modal.innerHTML = `
            <div class="trend-modal">
                <div class="modal-header">
                    <h2>${details.trend.name}</h2>
                    <button class="modal-close">&times;</button>
                </div>
                
                <div class="modal-content">
                    <div class="trend-overview">
                        <div class="overview-item">
                            <label>Type:</label>
                            <span class="trend-type-badge ${details.trend.type}">${details.trend.type}</span>
                        </div>
                        <div class="overview-item">
                            <label>Confidence:</label>
                            <span>${Math.round(details.trend.confidence * 100)}%</span>
                        </div>
                        <div class="overview-item">
                            <label>Duration:</label>
                            <span>${this.calculateDuration(details.trend.startDate, details.trend.endDate)}</span>
                        </div>
                        <div class="overview-item">
                            <label>Status:</label>
                            <span class="${details.trend.isActive ? 'active' : 'inactive'}">${details.trend.isActive ? 'Active' : 'Inactive'}</span>
                        </div>
                    </div>

                    ${details.intent ? `
                        <div class="intent-section">
                            <h3>🎯 Detected Intent</h3>
                            <div class="intent-card">
                                <div class="intent-name">${details.intent.intent}</div>
                                <div class="intent-stage">Stage: ${details.intent.stage}</div>
                                <div class="intent-confidence">Confidence: ${Math.round(details.intent.confidence * 100)}%</div>
                                ${details.intent.suggestedActions ? `
                                    <div class="suggested-actions">
                                        <h4>Suggested Next Steps:</h4>
                                        <ul>
                                            ${details.intent.suggestedActions.map((action: string) => `<li>${action}</li>`).join('')}
                                        </ul>
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                    ` : ''}

                    <div class="cluster-details">
                        <h3>📊 Activity Details</h3>
                        <div class="cluster-stats">
                            <div class="stat-item">
                                <label>Websites:</label>
                                <span>${details.cluster.websites.length}</span>
                            </div>
                            <div class="stat-item">
                                <label>Domains:</label>
                                <span>${details.cluster.domains.join(', ')}</span>
                            </div>
                            <div class="stat-item">
                                <label>Intensity:</label>
                                <span>${Math.round(details.cluster.intensity * 100)}%</span>
                            </div>
                        </div>
                        
                        <div class="topics-entities">
                            <div class="topics">
                                <h4>Topics:</h4>
                                <div class="tag-list">
                                    ${details.cluster.topics.map((topic: string) => `<span class="tag">${topic}</span>`).join('')}
                                </div>
                            </div>
                            <div class="entities">
                                <h4>Entities:</h4>
                                <div class="tag-list">
                                    ${details.cluster.entities.map((entity: string) => `<span class="tag">${entity}</span>`).join('')}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="websites-section">
                        <h3>🌐 Related Websites</h3>
                        <div class="websites-list">
                            ${details.websites.slice(0, 10).map((site: any) => `
                                <div class="website-item">
                                    <div class="website-title">${site.title || site.url}</div>
                                    <div class="website-url">${site.url}</div>
                                    <div class="website-meta">
                                        ${site.domain} • ${site.visitCount ? `${site.visitCount} visits` : 'Bookmarked'}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Add event listeners
        const closeBtn = modal.querySelector('.modal-close');
        closeBtn?.addEventListener('click', () => {
            document.body.removeChild(modal);
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });
    }

    private updateSummary(trends: any[], totalCount: number) {
        const activeTrends = trends.filter(t => t.isActive).length;
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const recentTrends = trends.filter(t => new Date(t.startDate) >= weekAgo).length;

        const activeCountEl = this.container.querySelector('#active-count');
        const totalCountEl = this.container.querySelector('#total-count');
        const weekCountEl = this.container.querySelector('#week-count');

        if (activeCountEl) activeCountEl.textContent = activeTrends.toString();
        if (totalCountEl) totalCountEl.textContent = totalCount.toString();
        if (weekCountEl) weekCountEl.textContent = recentTrends.toString();
    }

    private async loadInsights() {
        try {
            const response = await this.sendMessage('getTrendAnalytics', {});
            
            if (response.success) {
                this.displayInsights(response.analytics);
            }
        } catch (error) {
            console.error('Error loading insights:', error);
        }
    }

    private displayInsights(analytics: any) {
        const insightsContainer = this.container.querySelector('#trends-insights') as HTMLElement;
        const insightsList = this.container.querySelector('#insights-list') as HTMLElement;

        if (!analytics.topIntents || analytics.topIntents.length === 0) {
            insightsContainer.style.display = 'none';
            return;
        }

        insightsContainer.style.display = 'block';
        
        const insights = [
            `You've had ${analytics.activeTrends} active interests recently`,
            `Most common activity type: ${this.getMostCommonType(analytics.trendsByType)}`,
            `Average research duration: ${Math.round(analytics.averageTrendDuration)} days`
        ];

        if (analytics.topIntents.length > 0) {
            insights.push(`Top intent: ${analytics.topIntents[0].intent}`);
        }

        insightsList.innerHTML = insights.map(insight => 
            `<div class="insight-item">💡 ${insight}</div>`
        ).join('');
    }

    private getMostCommonType(trendsByType: Record<string, number>): string {
        const entries = Object.entries(trendsByType);
        if (entries.length === 0) return 'None';
        
        const [type] = entries.reduce((a, b) => a[1] > b[1] ? a : b);
        return type;
    }

    private filterTrends(filter: string) {
        const cards = this.container.querySelectorAll('.trend-card');
        
        cards.forEach(card => {
            const cardElement = card as HTMLElement;
            const shouldShow = this.shouldShowTrend(cardElement, filter);
            cardElement.style.display = shouldShow ? 'block' : 'none';
        });
    }

    private shouldShowTrend(card: HTMLElement, filter: string): boolean {
        switch (filter) {
            case 'all':
                return true;
            case 'active':
                return card.classList.contains('active');
            case 'ephemeral':
                return card.classList.contains('ephemeral');
            case 'persistent':
                return card.classList.contains('persistent');
            case 'recurring':
                return card.classList.contains('recurring');
            default:
                return true;
        }
    }

    private async exportTrends() {
        try {
            const response = await this.sendMessage('exportTrends', {
                format: 'json',
                minConfidence: 0.3
            });

            if (response.success) {
                this.downloadReport(response.report, 'trends-report.json');
            } else {
                console.error('Failed to export trends:', response.error);
            }
        } catch (error) {
            console.error('Error exporting trends:', error);
        }
    }

    private downloadReport(content: string, filename: string) {
        const blob = new Blob([content], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    private showLoading() {
        const loadingContainer = this.container.querySelector('#trends-loading') as HTMLElement;
        const listContainer = this.container.querySelector('#trends-list') as HTMLElement;
        const emptyContainer = this.container.querySelector('#trends-empty') as HTMLElement;

        loadingContainer.style.display = 'flex';
        listContainer.style.display = 'none';
        emptyContainer.style.display = 'none';
    }

    private showError(message: string) {
        const loadingContainer = this.container.querySelector('#trends-loading') as HTMLElement;
        const listContainer = this.container.querySelector('#trends-list') as HTMLElement;
        const emptyContainer = this.container.querySelector('#trends-empty') as HTMLElement;

        loadingContainer.style.display = 'none';
        listContainer.style.display = 'none';
        emptyContainer.style.display = 'block';

        const errorElement = emptyContainer.querySelector('.empty-state p');
        if (errorElement) {
            errorElement.textContent = message;
        }
    }

    private async sendMessage(method: string, params: any): Promise<any> {
        return new Promise((resolve, reject) => {
            const messageId = Date.now().toString();
            
            // Listen for response
            const responseHandler = (event: MessageEvent) => {
                if (event.data.id === messageId) {
                    window.removeEventListener('message', responseHandler);
                    resolve(event.data.result);
                }
            };
            
            window.addEventListener('message', responseHandler);
            
            // Send message to service worker via content script
            window.postMessage({
                type: 'TREND_REQUEST',
                id: messageId,
                method,
                params
            }, '*');
            
            // Timeout after 30 seconds
            setTimeout(() => {
                window.removeEventListener('message', responseHandler);
                reject(new Error('Request timeout'));
            }, 30000);
        });
    }

    private applyStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .trends-panel {
                padding: 20px;
                max-width: 800px;
                margin: 0 auto;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
            }

            .trends-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 20px;
                padding-bottom: 15px;
                border-bottom: 2px solid #e1e8ed;
            }

            .trends-header h2 {
                margin: 0;
                color: #1a202c;
                font-size: 24px;
            }

            .trends-controls {
                display: flex;
                gap: 10px;
                align-items: center;
            }

            .btn-secondary {
                padding: 8px 16px;
                background: #f7fafc;
                border: 1px solid #e2e8f0;
                border-radius: 6px;
                cursor: pointer;
                font-size: 14px;
                transition: all 0.2s;
            }

            .btn-secondary:hover {
                background: #edf2f7;
                border-color: #cbd5e0;
            }

            .trend-filter {
                padding: 8px 12px;
                border: 1px solid #e2e8f0;
                border-radius: 6px;
                background: white;
                font-size: 14px;
            }

            .trends-summary {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                gap: 15px;
                margin-bottom: 25px;
            }

            .summary-card {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 20px;
                border-radius: 12px;
                text-align: center;
                box-shadow: 0 4px 15px rgba(102, 126, 234, 0.2);
            }

            .summary-label {
                display: block;
                font-size: 14px;
                opacity: 0.9;
                margin-bottom: 8px;
            }

            .summary-value {
                display: block;
                font-size: 28px;
                font-weight: bold;
            }

            .trends-content {
                margin-bottom: 30px;
            }

            .trends-loading {
                display: flex;
                flex-direction: column;
                align-items: center;
                padding: 40px;
                color: #718096;
            }

            .spinner {
                width: 40px;
                height: 40px;
                border: 4px solid #f3f4f6;
                border-top: 4px solid #4f46e5;
                border-radius: 50%;
                animation: spin 1s linear infinite;
                margin-bottom: 15px;
            }

            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }

            .trends-list {
                display: grid;
                gap: 20px;
            }

            .trend-card {
                background: white;
                border: 1px solid #e2e8f0;
                border-radius: 12px;
                padding: 20px;
                cursor: pointer;
                transition: all 0.3s ease;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            }

            .trend-card:hover {
                transform: translateY(-2px);
                box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
                border-color: #4f46e5;
            }

            .trend-card.active {
                border-left: 4px solid #10b981;
            }

            .trend-card.ephemeral {
                border-left: 4px solid #f59e0b;
            }

            .trend-card.persistent {
                border-left: 4px solid #3b82f6;
            }

            .trend-card.recurring {
                border-left: 4px solid #8b5cf6;
            }

            .trend-header {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                margin-bottom: 15px;
            }

            .trend-title {
                display: flex;
                align-items: center;
                gap: 8px;
                flex: 1;
            }

            .trend-icon {
                font-size: 20px;
            }

            .trend-name {
                font-size: 18px;
                font-weight: 600;
                color: #1a202c;
            }

            .active-badge {
                background: #10b981;
                color: white;
                padding: 4px 8px;
                border-radius: 12px;
                font-size: 12px;
                font-weight: 500;
            }

            .trend-confidence {
                background: #f7fafc;
                color: #4a5568;
                padding: 4px 8px;
                border-radius: 8px;
                font-size: 14px;
                font-weight: 500;
            }

            .trend-stats {
                display: flex;
                gap: 20px;
                margin-bottom: 15px;
            }

            .stat {
                color: #718096;
                font-size: 14px;
            }

            .trend-topics {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                margin-bottom: 15px;
            }

            .topic-tag {
                background: #edf2f7;
                color: #4a5568;
                padding: 4px 10px;
                border-radius: 16px;
                font-size: 12px;
                font-weight: 500;
            }

            .trend-insights {
                border-top: 1px solid #e2e8f0;
                padding-top: 15px;
            }

            .insight-item {
                font-size: 14px;
                color: #4a5568;
                margin-bottom: 8px;
            }

            .empty-state {
                text-align: center;
                padding: 60px 20px;
                color: #718096;
            }

            .empty-icon {
                font-size: 48px;
                display: block;
                margin-bottom: 20px;
            }

            .empty-state h3 {
                margin: 0 0 10px 0;
                color: #4a5568;
            }

            .trends-insights {
                background: #f8fafc;
                border-radius: 12px;
                padding: 20px;
                border: 1px solid #e2e8f0;
            }

            .trends-insights h3 {
                margin: 0 0 15px 0;
                color: #1a202c;
            }

            .insights-list .insight-item {
                background: white;
                padding: 12px;
                border-radius: 8px;
                margin-bottom: 8px;
                border: 1px solid #e2e8f0;
            }

            /* Modal Styles */
            .trend-modal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
            }

            .trend-modal {
                background: white;
                border-radius: 12px;
                max-width: 800px;
                max-height: 90vh;
                overflow-y: auto;
                box-shadow: 0 25px 50px rgba(0, 0, 0, 0.25);
            }

            .modal-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 20px;
                border-bottom: 1px solid #e2e8f0;
            }

            .modal-header h2 {
                margin: 0;
                color: #1a202c;
            }

            .modal-close {
                background: none;
                border: none;
                font-size: 24px;
                cursor: pointer;
                color: #718096;
                padding: 0;
                width: 30px;
                height: 30px;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .modal-content {
                padding: 20px;
            }

            .trend-overview {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 15px;
                margin-bottom: 25px;
                padding: 20px;
                background: #f8fafc;
                border-radius: 8px;
            }

            .overview-item {
                display: flex;
                flex-direction: column;
                gap: 5px;
            }

            .overview-item label {
                font-weight: 600;
                color: #4a5568;
                font-size: 14px;
            }

            .trend-type-badge {
                padding: 4px 12px;
                border-radius: 16px;
                font-size: 12px;
                font-weight: 500;
                text-transform: uppercase;
                width: fit-content;
            }

            .trend-type-badge.ephemeral {
                background: #fed7aa;
                color: #9a3412;
            }

            .trend-type-badge.persistent {
                background: #bfdbfe;
                color: #1e40af;
            }

            .trend-type-badge.recurring {
                background: #ddd6fe;
                color: #5b21b6;
            }

            .intent-section {
                margin-bottom: 25px;
            }

            .intent-card {
                background: #f0f9ff;
                border: 1px solid #0ea5e9;
                border-radius: 8px;
                padding: 20px;
            }

            .intent-name {
                font-size: 18px;
                font-weight: 600;
                color: #0c4a6e;
                margin-bottom: 10px;
            }

            .suggested-actions {
                margin-top: 15px;
            }

            .suggested-actions h4 {
                margin: 0 0 10px 0;
                color: #0c4a6e;
            }

            .suggested-actions ul {
                margin: 0;
                padding-left: 20px;
            }

            .cluster-details, .websites-section {
                margin-bottom: 25px;
            }

            .cluster-stats {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                gap: 15px;
                margin-bottom: 20px;
            }

            .stat-item {
                display: flex;
                flex-direction: column;
                gap: 5px;
            }

            .stat-item label {
                font-weight: 600;
                color: #4a5568;
                font-size: 14px;
            }

            .topics-entities {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 20px;
            }

            .tag-list {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
            }

            .tag {
                background: #edf2f7;
                color: #4a5568;
                padding: 4px 10px;
                border-radius: 12px;
                font-size: 12px;
            }

            .websites-list {
                max-height: 300px;
                overflow-y: auto;
            }

            .website-item {
                padding: 12px;
                border: 1px solid #e2e8f0;
                border-radius: 8px;
                margin-bottom: 10px;
            }

            .website-title {
                font-weight: 500;
                color: #1a202c;
                margin-bottom: 4px;
            }

            .website-url {
                color: #4f46e5;
                font-size: 14px;
                margin-bottom: 4px;
            }

            .website-meta {
                color: #718096;
                font-size: 12px;
            }
        `;

        if (!document.head.querySelector('#trends-panel-styles')) {
            style.id = 'trends-panel-styles';
            document.head.appendChild(style);
        }
    }

    public show() {
        this.container.style.display = 'block';
        this.isVisible = true;
        this.loadTrends();
    }

    public hide() {
        this.container.style.display = 'none';
        this.isVisible = false;
    }

    public toggle() {
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }
}