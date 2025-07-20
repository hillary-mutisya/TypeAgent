// Entity Graph View - Main entry point for entity visualization
import { EnhancedEntityGraphVisualizer } from './enhancedEntityGraphVisualizer.js';
import { EntitySidebar } from './entitySidebar.js';

interface MockScenario {
    id: string;
    name: string;
    description: string;
}

/**
 * Main class for the Entity Graph View page
 */
class EntityGraphView {
    private visualizer: EnhancedEntityGraphVisualizer;
    private sidebar: EntitySidebar;
    private currentEntity: string | null = null;
    private mockMode: boolean = true;
    private currentMockScenario: string | null = null;

    private mockScenarios: MockScenario[] = [
        { id: 'tech_ecosystem', name: 'Tech Ecosystem', description: 'Tesla, SpaceX, and tech innovation' },
        { id: 'ai_research', name: 'AI Research', description: 'OpenAI, Anthropic, and AI development' },
        { id: 'startup_valley', name: 'Startup Valley', description: 'Y Combinator, venture capital, and entrepreneurship' },
        { id: 'academic_research', name: 'Academic Research', description: 'MIT, research institutions, and academia' }
    ];

    constructor() {
        // Initialize components
        const graphContainer = document.getElementById('cytoscape-container')!;
        const sidebarContainer = document.getElementById('entitySidebar')!;
        
        this.visualizer = new EnhancedEntityGraphVisualizer(graphContainer);
        this.sidebar = new EntitySidebar(sidebarContainer);
        
        this.initialize();
    }

    /**
     * Initialize the entity graph view
     */
    private async initialize(): Promise<void> {
        try {
            // Initialize visualizer
            await this.visualizer.initialize();

            // Set up event handlers
            this.setupEventHandlers();
            this.setupMockScenarios();
            this.setupControlHandlers();
            this.setupLayoutControls();
            this.setupSearchHandlers();

            // Show loading state initially
            this.showGraphLoading();

            // Update URL parameters
            this.handleUrlParameters();

            // Initialize with default mock scenario if none specified
            if (!this.currentMockScenario) {
                await this.loadMockScenario('tech_ecosystem');
            }

        } catch (error) {
            console.error('Failed to initialize entity graph view:', error);
            this.showGraphError('Failed to initialize entity graph');
        }
    }

    /**
     * Set up event handlers
     */
    private setupEventHandlers(): void {
        // Mock mode toggle
        const mockToggle = document.getElementById('mockModeToggle') as HTMLButtonElement;
        if (mockToggle) {
            mockToggle.addEventListener('click', () => this.toggleMockMode());
        }

        // Entity click navigation
        this.visualizer.onEntityClick((entityData) => {
            this.navigateToEntity(entityData.name);
        });
    }

    /**
     * Set up mock scenario controls
     */
    private setupMockScenarios(): void {
        const scenarioContainer = document.getElementById('mockScenarios');
        if (!scenarioContainer) return;

        this.mockScenarios.forEach(scenario => {
            const button = document.createElement('button');
            button.className = 'scenario-button';
            button.textContent = scenario.name;
            button.title = scenario.description;
            button.addEventListener('click', () => this.loadMockScenario(scenario.id));
            scenarioContainer.appendChild(button);
        });
    }

    /**
     * Set up graph control handlers
     */
    private setupControlHandlers(): void {
        // Export controls
        const exportButton = document.getElementById('exportGraph');
        if (exportButton) {
            exportButton.addEventListener('click', () => this.exportGraph());
        }

        // Refresh controls
        const refreshButton = document.getElementById('refreshGraph');
        if (refreshButton) {
            refreshButton.addEventListener('click', () => this.refreshGraph());
        }
    }

    /**
     * Set up layout controls
     */
    private setupLayoutControls(): void {
        const layoutControls = document.querySelectorAll('.layout-control');
        layoutControls.forEach(control => {
            control.addEventListener('click', (e) => {
                const target = e.target as HTMLElement;
                const layout = target.dataset.layout;
                if (layout) {
                    this.changeLayout(layout);
                }
            });
        });
    }

    /**
     * Set up search handlers
     */
    private setupSearchHandlers(): void {
        const searchInput = document.getElementById('entitySearch') as HTMLInputElement;
        const searchButton = document.getElementById('searchButton') as HTMLButtonElement;
        
        if (searchInput && searchButton) {
            searchButton.addEventListener('click', () => {
                this.searchEntity(searchInput.value);
            });

            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.searchEntity(searchInput.value);
                }
            });
        }
    }

    /**
     * Handle URL parameters
     */
    private handleUrlParameters(): void {
        const urlParams = new URLSearchParams(window.location.search);
        const entityParam = urlParams.get('entity');
        const mockParam = urlParams.get('mock');

        if (entityParam) {
            this.currentEntity = entityParam;
        }

        if (mockParam !== null) {
            this.mockMode = mockParam === 'true';
        }
    }

    /**
     * Load a mock scenario
     */
    async loadMockScenario(scenarioId: string): Promise<void> {
        try {
            this.currentMockScenario = scenarioId;
            this.showGraphLoading();

            // Load mock data for the scenario
            const mockData = await this.generateMockData(scenarioId);
            
            // Update visualizer
            await this.visualizer.loadEntityGraph(mockData);
            
            // Update sidebar with center entity
            if (mockData.centerEntity) {
                await this.sidebar.loadEntity(mockData.centerEntity);
            }

            this.hideGraphLoading();
            this.updateScenarioButtons();

        } catch (error) {
            console.error('Failed to load mock scenario:', error);
            this.showGraphError('Failed to load scenario');
        }
    }

    /**
     * Generate mock data for a scenario
     */
    private async generateMockData(scenarioId: string): Promise<any> {
        // This would integrate with the mock data generator
        // For now, return basic mock structure
        switch (scenarioId) {
            case 'tech_ecosystem':
                return {
                    centerEntity: 'Tesla',
                    entities: [
                        { name: 'Tesla', type: 'organization', confidence: 0.95 },
                        { name: 'Elon Musk', type: 'person', confidence: 0.98 },
                        { name: 'SpaceX', type: 'organization', confidence: 0.92 },
                        { name: 'Neuralink', type: 'organization', confidence: 0.85 },
                        { name: 'Boring Company', type: 'organization', confidence: 0.80 }
                    ],
                    relationships: [
                        { from: 'Elon Musk', to: 'Tesla', type: 'CEO_of', strength: 0.95 },
                        { from: 'Elon Musk', to: 'SpaceX', type: 'founder_of', strength: 0.98 },
                        { from: 'Elon Musk', to: 'Neuralink', type: 'founder_of', strength: 0.90 },
                        { from: 'Elon Musk', to: 'Boring Company', type: 'founder_of', strength: 0.85 }
                    ]
                };

            case 'ai_research':
                return {
                    centerEntity: 'OpenAI',
                    entities: [
                        { name: 'OpenAI', type: 'organization', confidence: 0.98 },
                        { name: 'Sam Altman', type: 'person', confidence: 0.95 },
                        { name: 'ChatGPT', type: 'product', confidence: 0.92 },
                        { name: 'GPT-4', type: 'product', confidence: 0.90 },
                        { name: 'Anthropic', type: 'organization', confidence: 0.88 },
                        { name: 'Claude', type: 'product', confidence: 0.85 }
                    ],
                    relationships: [
                        { from: 'Sam Altman', to: 'OpenAI', type: 'CEO_of', strength: 0.95 },
                        { from: 'OpenAI', to: 'ChatGPT', type: 'created', strength: 0.85 },
                        { from: 'OpenAI', to: 'GPT-4', type: 'developed', strength: 0.90 },
                        { from: 'Anthropic', to: 'Claude', type: 'developed', strength: 0.92 }
                    ]
                };

            default:
                return {
                    centerEntity: 'Example Entity',
                    entities: [{ name: 'Example Entity', type: 'organization', confidence: 0.80 }],
                    relationships: []
                };
        }
    }

    /**
     * Navigate to a specific entity
     */
    async navigateToEntity(entityName: string): Promise<void> {
        try {
            this.currentEntity = entityName;
            
            // Update URL
            const url = new URL(window.location.href);
            url.searchParams.set('entity', entityName);
            window.history.pushState({}, '', url.toString());

            // Load entity data
            if (this.mockMode) {
                // Find entity in current mock data or load new scenario
                await this.sidebar.loadEntity(entityName);
            } else {
                // Load real entity data
                await this.loadRealEntityData(entityName);
            }

        } catch (error) {
            console.error('Failed to navigate to entity:', error);
        }
    }

    /**
     * Toggle between mock and real data mode
     */
    async toggleMockMode(): Promise<void> {
        this.mockMode = !this.mockMode;
        
        // Update UI
        this.updateMockModeIndicator();
        
        // Reload current entity with new data mode
        if (this.currentEntity) {
            await this.navigateToEntity(this.currentEntity);
        }
    }

    /**
     * Search for an entity
     */
    async searchEntity(query: string): Promise<void> {
        if (!query.trim()) return;

        try {
            if (this.mockMode) {
                // Search in current mock scenario
                await this.searchMockEntity(query);
            } else {
                // Search in real data
                await this.searchRealEntity(query);
            }
        } catch (error) {
            console.error('Failed to search entity:', error);
        }
    }

    /**
     * Change graph layout
     */
    changeLayout(layoutType: string): void {
        this.visualizer.changeLayout(layoutType);
        
        // Update active layout button
        document.querySelectorAll('.layout-control').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-layout="${layoutType}"]`)?.classList.add('active');
    }

    /**
     * Export graph
     */
    exportGraph(): void {
        const graphData = this.visualizer.exportGraph();
        const dataStr = JSON.stringify(graphData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = `entity-graph-${this.currentEntity || 'export'}.json`;
        link.click();
    }

    /**
     * Refresh graph
     */
    async refreshGraph(): Promise<void> {
        if (this.currentMockScenario) {
            await this.loadMockScenario(this.currentMockScenario);
        }
    }

    // UI Helper Methods
    private showGraphLoading(): void {
        const container = document.getElementById('cytoscape-container');
        if (container) {
            container.classList.add('loading');
        }
    }

    private hideGraphLoading(): void {
        const container = document.getElementById('cytoscape-container');
        if (container) {
            container.classList.remove('loading');
        }
    }

    private showGraphError(message: string): void {
        const container = document.getElementById('cytoscape-container');
        if (container) {
            container.innerHTML = `<div class="error-message">${message}</div>`;
        }
    }

    private updateMockModeIndicator(): void {
        const indicator = document.getElementById('mockModeIndicator');
        if (indicator) {
            indicator.style.display = this.mockMode ? 'block' : 'none';
        }
    }

    private updateScenarioButtons(): void {
        document.querySelectorAll('.scenario-button').forEach(btn => {
            btn.classList.remove('active');
        });
        
        const activeBtn = document.querySelector(`[data-scenario="${this.currentMockScenario}"]`);
        if (activeBtn) {
            activeBtn.classList.add('active');
        }
    }

    // Mock data methods
    private async searchMockEntity(query: string): Promise<void> {
        // Implementation for mock entity search
        console.log('Searching mock entities for:', query);
    }

    // Real data methods  
    private async loadRealEntityData(entityName: string): Promise<void> {
        // Implementation for real entity data loading
        console.log('Loading real entity data for:', entityName);
    }

    private async searchRealEntity(query: string): Promise<void> {
        // Implementation for real entity search
        console.log('Searching real entities for:', query);
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new EntityGraphView();
});

// Export for potential external usage
export { EntityGraphView };
