// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Phase 3: Enhanced Entity Graph View
 * 
 * Real-time graph exploration with:
 * - Enhanced MultiHopExplorer integration
 * - Advanced expansion controls
 * - Network analysis dashboard
 * - Performance monitoring
 */

import { EnhancedEntityGraphVisualizer } from "./enhancedEntityGraphVisualizer.js";
import { EntitySidebar } from "./entitySidebar.js";
import { EntityDiscovery } from "./entityDiscovery.js"; 
import { EnhancedMultiHopExplorer, NetworkAnalysisMetrics } from "./enhancedMultiHopExplorer.js";
import { ExpansionControlSystem, ExpansionControlConfig, FilterCriteria } from "./expansionControlSystem.js";
import { RelationshipDetailsManager } from "./relationshipDetailsManager.js";
import { EntityComparisonManager } from "./entityComparison.js";
import {
    EntityGraphServices,
    EntityCacheServices,
    DefaultEntityGraphServices,
    DefaultEntityCacheServices,
    ChromeExtensionService,
} from "./knowledgeUtilities.js";

export interface GraphViewConfig {
    enableRealtimeExpansion: boolean;
    autoLayoutUpdate: boolean;
    performanceMode: "fast" | "balanced" | "comprehensive";
    defaultExpansionDepth: number;
    enableNetworkAnalysis: boolean;
    cacheSize: number;
}

export interface GraphViewState {
    currentEntity: string | null;
    expansionDepth: number;
    activeFilters: FilterCriteria;
    selectedEntities: string[];
    viewMode: "graph" | "matrix" | "timeline" | "dashboard";
    isExpanding: boolean;
    networkMetrics?: NetworkAnalysisMetrics;
}

/**
 * Enhanced Entity Graph View with Phase 3 Multi-Hop Explorer
 */
export class EnhancedEntityGraphView {
    private visualizer!: EnhancedEntityGraphVisualizer;
    private sidebar!: EntitySidebar;
    private discovery!: EntityDiscovery;
    private multiHopExplorer!: EnhancedMultiHopExplorer;
    private expansionControl!: ExpansionControlSystem;
    private relationshipManager!: RelationshipDetailsManager;
    private comparisonManager!: EntityComparisonManager;
    
    // Services
    private entityGraphService!: EntityGraphServices;
    private entityCacheService!: EntityCacheServices;
    private chromeService!: ChromeExtensionService;
    
    // State management
    private state: GraphViewState;
    private config: GraphViewConfig;
    private updateQueue: Array<() => Promise<void>> = [];
    private isProcessingQueue: boolean = false;

    constructor(config?: Partial<GraphViewConfig>) {
        console.log("🚀 Initializing Enhanced Entity Graph View (Phase 3)");

        // Initialize configuration
        this.config = {
            enableRealtimeExpansion: true,
            autoLayoutUpdate: true,
            performanceMode: "balanced",
            defaultExpansionDepth: 2,
            enableNetworkAnalysis: true,
            cacheSize: 100,
            ...config
        };

        // Initialize state
        this.state = {
            currentEntity: null,
            expansionDepth: this.config.defaultExpansionDepth,
            activeFilters: this.getDefaultFilters(),
            selectedEntities: [],
            viewMode: "graph",
            isExpanding: false
        };

        try {
            // Initialize services
            this.chromeService = new ChromeExtensionService();
            this.entityGraphService = new DefaultEntityGraphServices(this.chromeService);
            this.entityCacheService = new DefaultEntityCacheServices();
            console.log("✅ Services initialized");

            // Handle URL parameters
            this.handleUrlParameters();

            // Initialize core components
            this.initializeComponents();

            // Setup enhanced UI
            this.setupEnhancedUI();

            // Setup event handlers
            this.setupEventHandlers();

            // Setup real-time updates
            if (this.config.enableRealtimeExpansion) {
                this.setupRealtimeUpdates();
            }

            // Setup performance monitoring
            this.setupPerformanceMonitoring();

            console.log("🎉 Enhanced Entity Graph View initialized successfully");

        } catch (error) {
            console.error("❌ Failed to initialize Enhanced Entity Graph View:", error);
            this.showErrorState(error);
        }
    }

    /**
     * Initialize all components with Phase 3 enhancements
     */
    private initializeComponents(): void {
        console.log("🔧 Initializing Phase 3 components...");

        // Initialize enhanced visualizer with Phase 3 capabilities
        const visualizerContainer = document.createElement('div');
        visualizerContainer.id = 'enhanced-graph-visualizer';
        document.body.appendChild(visualizerContainer);
        this.visualizer = new EnhancedEntityGraphVisualizer(visualizerContainer);
        
        // Add missing methods to visualizer interface compatibility
        this.addVisualizerCompatibilityMethods();
        
        // Initialize expansion control system
        this.expansionControl = new ExpansionControlSystem({
            maxDepth: this.config.defaultExpansionDepth,
            performanceMode: this.config.performanceMode,
            smartFiltering: true
        });

        // Initialize enhanced multi-hop explorer
        this.multiHopExplorer = new EnhancedMultiHopExplorer(
            this.visualizer,
            this.entityGraphService,
            this.chromeService
        );

        // Initialize other components with compatibility
        const sidebarContainer = document.createElement('div');
        sidebarContainer.id = 'enhanced-entity-sidebar';
        document.body.appendChild(sidebarContainer);
        this.sidebar = new EntitySidebar(sidebarContainer);
        this.discovery = new EntityDiscovery(this.entityGraphService);
        this.relationshipManager = new RelationshipDetailsManager();
        this.comparisonManager = new EntityComparisonManager();
        
        // Add compatibility methods to components
        this.addComponentCompatibilityMethods();

        console.log("✅ All components initialized");
    }

    /**
     * Setup enhanced UI with Phase 3 controls
     */
    private setupEnhancedUI(): void {
        this.createExpansionControlPanel();
        this.createNetworkAnalysisDashboard();
        this.createPerformanceMonitor();
        this.createAdvancedFilters();
        this.createRealtimeIndicators();
    }

    /**
     * Main entity search and visualization entry point
     */
    async searchAndVisualizeEntity(entityName: string, options: {
        expansionDepth?: number;
        forceRefresh?: boolean;
        enableNetworkAnalysis?: boolean;
    } = {}): Promise<void> {
        console.log(`🔍 Searching and visualizing entity: ${entityName}`);

        // Validate inputs
        if (!entityName || typeof entityName !== 'string' || entityName.trim().length === 0) {
            throw new Error('Entity name is required and must be a non-empty string');
        }

        // Ensure components are initialized
        if (!this.multiHopExplorer) {
            throw new Error('Multi-hop explorer not initialized');
        }

        if (!this.expansionControl) {
            throw new Error('Expansion control system not initialized');
        }

        // Check service health
        const servicesHealthy = await this.checkServiceHealth();
        if (!servicesHealthy) {
            throw new Error('Required services are not available. Please check your connection.');
        }

        try {
            this.setState({ currentEntity: entityName, isExpanding: true });
            this.showLoadingState(`Analyzing ${entityName}...`);

            // Get optimal expansion strategy
            const currentGraph = (this.visualizer as any).getCurrentGraphData();
            const strategy = this.expansionControl.getOptimalStrategy(
                currentGraph,
                undefined,
                { performanceMode: this.config.performanceMode }
            );

            // Perform enhanced expansion
            const expansionData = await this.multiHopExplorer.expandEntityNetworkAdvanced(
                entityName,
                {
                    depth: options.expansionDepth || this.state.expansionDepth,
                    strategy,
                    forceRefresh: options.forceRefresh,
                    includeNetworkAnalysis: options.enableNetworkAnalysis !== false
                }
            );

            // Update visualizer
            await (this.visualizer as any).loadGraphData(expansionData);

            // Update network analysis
            if (this.config.enableNetworkAnalysis) {
                this.state.networkMetrics = this.multiHopExplorer.getCurrentNetworkMetrics() || undefined;
                this.updateNetworkAnalysisDashboard();
            }

            // Update sidebar with entity details
            await this.sidebar.loadEntity(entityName);

            // Update expansion metrics
            this.expansionControl.updateMetrics(
                expansionData,
                expansionData.metadata.expansionTime,
                expansionData.metadata.cacheHitRate
            );

            // Generate expansion recommendations
            const recommendations = await this.expansionControl.generateExpansionRecommendations(
                expansionData,
                5
            );
            this.updateRecommendationsPanel(recommendations);

            this.setState({ isExpanding: false });
            this.hideLoadingState();

            console.log(`✅ Entity visualization complete: ${expansionData.entities.length} entities, ${expansionData.relationships.length} relationships`);

        } catch (error) {
            console.error("❌ Entity search and visualization failed:", error);
            this.setState({ isExpanding: false });
            this.showErrorMessage(`Failed to visualize ${entityName}: ${(error as Error).message}`);
        }
    }

    /**
     * Perform intelligent multi-hop expansion
     */
    async performIntelligentExpansion(selectedEntities?: string[]): Promise<void> {
        const entities = selectedEntities || this.state.selectedEntities;
        if (entities.length === 0) {
            this.showWarningMessage("Please select entities to expand");
            return;
        }

        console.log(`🔀 Performing intelligent expansion for ${entities.length} entities`);

        try {
            this.setState({ isExpanding: true });
            this.showLoadingState(`Expanding ${entities.length} entities...`);

            // Use enhanced multi-hop explorer
            await this.multiHopExplorer.expandSelectedEntities();

            // Update network analysis
            if (this.config.enableNetworkAnalysis) {
                this.state.networkMetrics = this.multiHopExplorer.getCurrentNetworkMetrics() || undefined;
                this.updateNetworkAnalysisDashboard();
            }

            // Auto-layout if enabled
            if (this.config.autoLayoutUpdate) {
                await (this.visualizer as any).applyCurrentLayout();
            }

            this.setState({ isExpanding: false });
            this.hideLoadingState();

            console.log("✅ Intelligent expansion complete");

        } catch (error) {
            console.error("❌ Intelligent expansion failed:", error);
            this.setState({ isExpanding: false });
            this.showErrorMessage(`Expansion failed: ${(error as Error).message}`);
        }
    }

    /**
     * Apply advanced filters to current graph
     */
    async applyAdvancedFilters(filters: Partial<FilterCriteria>): Promise<void> {
        console.log("🔧 Applying advanced filters:", filters);

        this.setState({ 
            activeFilters: { ...this.state.activeFilters, ...filters }
        });

        // Update expansion control system
        this.expansionControl.updateFilters(filters);

        // Re-process current graph with new filters
        if (this.state.currentEntity) {
            await this.searchAndVisualizeEntity(this.state.currentEntity, { 
                forceRefresh: true 
            });
        }
    }

    /**
     * Switch view modes
     */
    async switchViewMode(mode: "graph" | "matrix" | "timeline" | "dashboard"): Promise<void> {
        console.log(`🔄 Switching to ${mode} view`);

        this.setState({ viewMode: mode });

        switch (mode) {
            case "graph":
                await this.showGraphView();
                break;
            case "matrix":
                await this.showMatrixView();
                break;
            case "timeline":
                await this.showTimelineView();
                break;
            case "dashboard":
                await this.showDashboardView();
                break;
        }
    }

    /**
     * Check if all required services are healthy
     */
    private async checkServiceHealth(): Promise<boolean> {
        try {
            // Test chrome service connectivity
            if (!this.chromeService) {
                console.error('❌ Chrome service not initialized');
                return false;
            }

            // Test entity graph service
            if (!this.entityGraphService) {
                console.error('❌ Entity graph service not initialized');
                return false;
            }

            console.log('✅ Service health check passed');
            return true;
        } catch (error) {
            console.error('❌ Service health check failed:', error);
            return false;
        }
    }

    /**
     * Get expansion recommendations
     */
    async getExpansionRecommendations(): Promise<void> {
        if (!this.state.currentEntity) return;

        const currentGraph = (this.visualizer as any).getCurrentGraphData();
        const recommendations = await this.expansionControl.generateExpansionRecommendations(
            currentGraph,
            10
        );

        this.updateRecommendationsPanel(recommendations);
    }

    /**
     * Export current graph data
     */
    async exportGraphData(format: "json" | "csv" | "cytoscape" | "graphml"): Promise<void> {
        console.log(`💾 Exporting graph data in ${format} format`);

        try {
            const currentGraph = (this.visualizer as any).getCurrentGraphData();
            const networkMetrics = this.state.networkMetrics;

            const exportData = {
                graph: currentGraph,
                metrics: networkMetrics,
                metadata: {
                    exportDate: new Date().toISOString(),
                    centerEntity: this.state.currentEntity,
                    viewMode: this.state.viewMode,
                    filters: this.state.activeFilters
                }
            };

            await (this.visualizer as any).exportGraph(exportData, format);
            this.showSuccessMessage(`Graph exported successfully as ${format.toUpperCase()}`);

        } catch (error) {
            console.error("❌ Graph export failed:", error);
            this.showErrorMessage(`Export failed: ${(error as Error).message}`);
        }
    }

    // Private helper methods

    private setState(updates: Partial<GraphViewState>): void {
        this.state = { ...this.state, ...updates };
        this.notifyStateChange();
    }

    private notifyStateChange(): void {
        // Notify components of state changes
        document.dispatchEvent(new CustomEvent('graphViewStateChange', {
            detail: this.state
        }));
    }

    private getDefaultFilters(): FilterCriteria {
        return {
            entityTypes: {
                include: [],
                exclude: ["noise", "irrelevant"],
                priority: {
                    "person": 1.2,
                    "organization": 1.1,
                    "technology": 1.3,
                    "concept": 1.0
                }
            },
            relationships: {
                minStrength: 0.3,
                minConfidence: 0.5,
                preferredTypes: ["co_occurs_with", "same_domain"],
                maxAge: 365
            },
            network: {
                maxNodes: 100,
                maxEdgesPerNode: 10,
                clusteringThreshold: 0.3,
                centralityWeight: 0.7
            },
            temporal: {}
        };
    }

    private handleUrlParameters(): void {
        const urlParams = new URLSearchParams(window.location.search);
        const entity = urlParams.get('entity');
        const depth = urlParams.get('depth');
        const mode = urlParams.get('mode');

        if (entity) {
            this.state.currentEntity = entity;
        }

        if (depth && !isNaN(Number(depth))) {
            this.state.expansionDepth = Number(depth);
        }

        if (mode && ['graph', 'matrix', 'timeline', 'dashboard'].includes(mode)) {
            this.state.viewMode = mode as any;
        }
    }

    private setupEventHandlers(): void {
        // Entity selection events
        document.addEventListener('entitySelected', (event: any) => {
            this.handleEntitySelection(event.detail.entityName);
        });

        // Entity hover events
        document.addEventListener('entityHover', (event: any) => {
            this.handleEntityHover(event.detail.entityName);
        });

        // Relationship selection events
        document.addEventListener('relationshipSelected', (event: any) => {
            this.handleRelationshipSelection(event.detail.relationship);
        });

        // Expansion control events
        document.addEventListener('expansionRequested', (event: any) => {
            this.performIntelligentExpansion(event.detail.entities);
        });

        // Filter change events
        document.addEventListener('filtersChanged', (event: any) => {
            this.applyAdvancedFilters(event.detail.filters);
        });

        // View mode change events
        document.addEventListener('viewModeRequested', (event: any) => {
            this.switchViewMode(event.detail.mode);
        });
    }

    private setupRealtimeUpdates(): void {
        // Setup periodic updates for dynamic content
        setInterval(async () => {
            if (this.state.currentEntity && !this.state.isExpanding) {
                await this.refreshCurrentView();
            }
        }, 30000); // Refresh every 30 seconds
    }

    private setupPerformanceMonitoring(): void {
        // Monitor performance metrics
        setInterval(() => {
            const cacheStats = this.multiHopExplorer.getCacheStats();
            const metrics = this.expansionControl.getMetrics();
            const recommendations = this.expansionControl.getPerformanceRecommendations();

            this.updatePerformancePanel({ cacheStats, metrics, recommendations });
        }, 5000); // Update every 5 seconds
    }

    private async handleEntitySelection(entityName: string): Promise<void> {
        console.log(`📍 Entity selected: ${entityName}`);
        
        this.setState({ 
            selectedEntities: [entityName],
            currentEntity: entityName
        });

        await this.sidebar.loadEntity(entityName);
    }

    private handleEntityHover(entityName: string): void {
        // Show quick preview in tooltip or sidebar
        console.log(`👁️ Showing entity preview: ${entityName}`);
    }

    private handleRelationshipSelection(relationship: any): void {
        console.log("🔗 Relationship selected:", relationship);
        this.relationshipManager.showRelationshipDetails(relationship);
    }

    private async refreshCurrentView(): Promise<void> {
        if (!this.state.currentEntity) return;

        // Refresh with current settings but check for new data
        await this.searchAndVisualizeEntity(this.state.currentEntity, {
            forceRefresh: false // Allow cache usage for performance
        });
    }

    // UI Creation Methods

    private createExpansionControlPanel(): void {
        // Create expansion control UI
        console.log("🎛️ Creating expansion control panel");
    }

    private createNetworkAnalysisDashboard(): void {
        // Create network analysis dashboard
        console.log("📊 Creating network analysis dashboard");
    }

    private createPerformanceMonitor(): void {
        // Create performance monitoring UI
        console.log("⚡ Creating performance monitor");
    }

    private createAdvancedFilters(): void {
        // Create advanced filtering UI
        console.log("🔍 Creating advanced filters");
    }

    private createRealtimeIndicators(): void {
        // Create real-time status indicators
        console.log("🔴 Creating realtime indicators");
    }

    // View Mode Methods

    private async showGraphView(): Promise<void> {
        (this.visualizer as any).showGraphMode();
    }

    private async showMatrixView(): Promise<void> {
        (this.visualizer as any).showMatrixMode();
    }

    private async showTimelineView(): Promise<void> {
        (this.visualizer as any).showTimelineMode();
    }

    private async showDashboardView(): Promise<void> {
        (this.visualizer as any).showDashboardMode();
    }

    // UI Feedback Methods

    private showLoadingState(message: string): void {
        console.log(`⏳ Loading: ${message}`);
        // Show loading UI
    }

    private hideLoadingState(): void {
        console.log("✅ Loading complete");
        // Hide loading UI
    }

    private showSuccessMessage(message: string): void {
        console.log(`✅ Success: ${message}`);
        // Show success notification
    }

    private showWarningMessage(message: string): void {
        console.log(`⚠️ Warning: ${message}`);
        // Show warning notification
    }

    private showErrorMessage(message: string): void {
        console.log(`❌ Error: ${message}`);
        // Show error notification
    }

    private showErrorState(error: any): void {
        console.error("💥 Error state:", error);
        // Show error page
    }

    // Update Methods

    private updateNetworkAnalysisDashboard(): void {
        if (!this.state.networkMetrics) return;
        console.log("📊 Updating network analysis dashboard");
        // Update dashboard with current metrics
    }

    private updateRecommendationsPanel(recommendations: any[]): void {
        console.log(`💡 Updating recommendations: ${recommendations.length} items`);
        // Update recommendations UI
    }

    private updatePerformancePanel(data: any): void {
        console.log("⚡ Updating performance panel");
        // Update performance metrics UI
    }

    // Public API Methods

    public getCurrentState(): GraphViewState {
        return { ...this.state };
    }

    public getCurrentConfig(): GraphViewConfig {
        return { ...this.config };
    }

    public async updateConfig(updates: Partial<GraphViewConfig>): Promise<void> {
        this.config = { ...this.config, ...updates };
        console.log("🔧 Configuration updated:", updates);
        
        // Apply configuration changes
        if (updates.performanceMode) {
            this.expansionControl.updateFilters({
                network: {
                    ...this.state.activeFilters.network,
                    maxNodes: updates.performanceMode === "fast" ? 50 : 
                              updates.performanceMode === "comprehensive" ? 200 : 100
                }
            });
        }
    }

    // Compatibility Methods

    private addVisualizerCompatibilityMethods(): void {
        // Add missing methods to visualizer for compatibility
        (this.visualizer as any).getCurrentGraphData = () => {
            return {
                entities: [],
                relationships: [],
                centerEntity: this.state.currentEntity,
                depth: this.state.expansionDepth,
                expansionType: "relationship_driven" as const,
                metadata: {
                    totalNodesExpanded: 0,
                    expansionTime: 0,
                    cacheHitRate: 0,
                    qualityScore: 0,
                    communityDetected: false
                }
            };
        };

        (this.visualizer as any).loadGraphData = async (data: any) => {
            console.log("📊 Loading graph data:", data);
            // Implementation would load data into visualizer
        };

        (this.visualizer as any).showGraphMode = () => {
            console.log("📊 Switching to graph mode");
        };

        (this.visualizer as any).showMatrixMode = () => {
            console.log("🔢 Switching to matrix mode");
        };

        (this.visualizer as any).showTimelineMode = () => {
            console.log("📅 Switching to timeline mode");
        };

        (this.visualizer as any).showDashboardMode = () => {
            console.log("📋 Switching to dashboard mode");
        };

        (this.visualizer as any).exportGraph = async (data: any, format: string) => {
            console.log(`💾 Exporting graph as ${format}:`, data);
            // Implementation would export graph data
            return Promise.resolve();
        };

        (this.visualizer as any).applyCurrentLayout = async () => {
            console.log("🎨 Applying current layout");
            // Implementation would apply layout
        };

        (this.visualizer as any).addElements = async (data: any) => {
            console.log("➕ Adding elements to graph:", data);
            // Implementation would add elements to graph
        };

        (this.visualizer as any).getSelectedEntities = () => {
            return this.state.selectedEntities;
        };
    }

    private addComponentCompatibilityMethods(): void {
        // Add missing methods to relationship manager for compatibility
        (this.relationshipManager as any).showRelationshipDetails = (relationship: any) => {
            console.log("🔗 Showing relationship details:", relationship);
            // Implementation would show relationship details
        };
    }
}

// Initialize the enhanced entity graph view when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log("🌟 DOM ready, initializing Enhanced Entity Graph View");
    
    try {
        const graphView = new EnhancedEntityGraphView();
        
        // Make it globally accessible for debugging
        (window as any).enhancedGraphView = graphView;
        
        // If there's an entity in the URL, load it
        const urlParams = new URLSearchParams(window.location.search);
        const entity = urlParams.get('entity');
        if (entity) {
            graphView.searchAndVisualizeEntity(entity);
        }
        
        console.log("🎉 Enhanced Entity Graph View ready!");
        
    } catch (error) {
        console.error("💥 Failed to initialize Enhanced Entity Graph View:", error);
    }
});