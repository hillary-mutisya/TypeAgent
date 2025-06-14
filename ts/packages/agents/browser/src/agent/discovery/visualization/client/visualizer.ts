// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Simplified Visualizer class for plan visualization
 */
import cytoscape from "cytoscape";
import cytoscapeDagre from "cytoscape-dagre";
import CONFIG from "./config.js";
import CytoscapeConfig from "./cytoscapeConfig.js";
import { WebPlanData, NodeSelectCallback } from "../shared/types.js";

// Register the extension
cytoscape.use(cytoscapeDagre as any);

class Visualizer {
    private container: HTMLElement;
    private webPlanData: WebPlanData;
    private cy: cytoscape.Core | null;
    public pathHighlighted: boolean;
    private tempAnimInterval: number | null;

    constructor(container: HTMLElement, webPlanData: WebPlanData) {
        this.container = container;
        this.webPlanData = webPlanData;
        this.cy = null;
        this.pathHighlighted = false;
        this.tempAnimInterval = null;
    }

    /**
     * Initialize the Cytoscape visualization
     */
    initialize(): void {
        // Handle empty plan case
        if (this.webPlanData.nodes.length === 0) {
            this.cy = cytoscape({
                container: this.container,
                elements: [],
                style: CytoscapeConfig.getStyles(),
            });
            return;
        }

        // Convert data to Cytoscape format
        const elements = this._convertDataToElements();

        // Create Cytoscape instance
        this.cy = cytoscape({
            container: this.container,
            elements: elements,
            style: CytoscapeConfig.getStyles(),
        });

        // Apply layout
        this.applyLayout();

        // Start temporary node animation if there are any temporary nodes
        this.startTemporaryNodeAnimation();
    }    /**
     * Convert web plan data to Cytoscape elements format
     */
    private _convertDataToElements(): Array<cytoscape.ElementDefinition> {
        const elements: Array<cytoscape.ElementDefinition> = [];

        // Add nodes
        this.webPlanData.nodes.forEach((node) => {
            const nodeData: any = {
                id: node.id,
                label: node.label,
                type: node.type,
                isActive: node.id === this.webPlanData.currentNode,
                isTemporary: node.isTemporary || false,
            };

            // Only add screenshot data if it exists
            if (node.screenshot) {
                nodeData.screenshot = node.screenshot;
                nodeData.hasScreenshot = true;
            }

            elements.push({
                data: nodeData,
            });
        });

        // Add edges
        this.webPlanData.links.forEach((link, index) => {
            elements.push({
                data: {
                    id: `edge-${index}`,
                    source: link.source,
                    target: link.target,
                    label: link.label || "",
                    edgeType: this._getEdgeType(link),
                },
            });
        });

        return elements;
    }

    /**
     * Determine edge type based on connection
     */
    private _getEdgeType(link: any): string {
        if (link.label === "Yes") {
            return CONFIG.EDGE_TYPES.DECISION_YES;
        } else if (link.label === "No") {
            return CONFIG.EDGE_TYPES.DECISION_NO;
        } else {
            return CONFIG.EDGE_TYPES.STANDARD;
        }
    }

    /**
     * Apply layout to the graph
     */
    applyLayout(): void {
        if (!this.cy) return;

        try {
            const dagreLayout = this.cy.layout(
                CytoscapeConfig.getDagreLayoutOptions(),
            );
            dagreLayout.run();
        } catch (e) {
            console.error("Error running dagre layout:", e);
            
            // Use breadthfirst as fallback
            const fallbackLayout = this.cy.layout(
                CytoscapeConfig.getFallbackLayoutOptions(),
            );
            fallbackLayout.run();
        }
    }    /**
     * Update current node and zoom to show its context
     */
    updateCurrentNode(nodeId: string): void {
        if (!this.cy) return;

        // Reset all nodes
        this.cy.nodes().forEach((node) => {
            node.data("isActive", false);
        });

        // Set the active node
        const activeNode = this.cy.getElementById(nodeId);
        if (activeNode.length > 0) {
            activeNode.data("isActive", true);
            this.webPlanData.currentNode = nodeId;

            // Center the viewport on the active node
            this.cy.animate({
                fit: {
                    eles: activeNode,
                    padding: 200,
                },
                duration: CONFIG.ANIMATION.LAYOUT,
                easing: "ease-in-out-cubic",
            });
        }
    }

    /**
     * Fit the graph to view
     */
    fitToView(): void {
        if (!this.cy) return;
        this.cy.fit(undefined, 50);
        this.cy.center();
    }

    /**
     * Start temporary node animation
     */
    startTemporaryNodeAnimation(): void {
        // This is handled by CSS animations defined in cytoscapeConfig
    }

    /**
     * Setup event listeners for Cytoscape
     */
    setupEventListeners(
        onNodeSelect: NodeSelectCallback,
        tooltip: HTMLElement,
    ): void {
        if (!this.cy) return;

        // Node click handler
        this.cy.on("tap", "node", (evt: any) => {
            const nodeId = evt.target.id();
            onNodeSelect(nodeId);
            this.updateCurrentNode(nodeId);
        });

        // Node hover for tooltip
        this.cy.on("mouseover", "node", (evt: any) => {
            const node = evt.target;
            const label = node.data("label");
            const type = node.data("type");
            
            if (tooltip && label) {
                tooltip.textContent = `${type}: ${label}`;
                tooltip.style.display = "block";
            }
        });

        this.cy.on("mouseout", "node", () => {
            if (tooltip) {
                tooltip.style.display = "none";
            }
        });
    }

    /**
     * Destroy the visualization
     */
    destroy(): void {
        if (this.cy) {
            this.cy.destroy();
            this.cy = null;
        }
        
        if (this.tempAnimInterval) {
            clearInterval(this.tempAnimInterval);
            this.tempAnimInterval = null;
        }
    }

    /**
     * Update plan data and refresh visualization
     */
    updatePlanData(newPlanData: WebPlanData): void {
        this.webPlanData = newPlanData;
        
        if (this.cy) {
            this.cy.remove("*");
            const elements = this._convertDataToElements();
            this.cy.add(elements);
            this.applyLayout();
            this.startTemporaryNodeAnimation();
        }
    }
}

export default Visualizer;