// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { AuthoringState, WebPlanData } from "../shared/types.js";
import { VisualizationManager } from "./visualizationManager.mjs";
import { PlanVisualizationSync } from "./planVisualizationSync.mjs";
import registerDebug from "debug";

const debug = registerDebug("typeagent:agent:browser:stateSync");

/**
 * Handles bidirectional synchronization between authoring and visualization state
 * Enhanced with WebSocket real-time communication
 */
export class StateSynchronizer {
    private visualizationManager: VisualizationManager;
    private planVisualizationSync?: PlanVisualizationSync | undefined;
    private currentAuthoringState?: AuthoringState | undefined;
    private currentVisualizationState?: WebPlanData | undefined;
    private syncEnabled: boolean = true;

    constructor(visualizationManager: VisualizationManager, planVisualizationSync?: PlanVisualizationSync) {
        this.visualizationManager = visualizationManager;
        this.planVisualizationSync = planVisualizationSync;
    }

    /**
     * Update visualization based on authoring changes
     * Enhanced with WebSocket real-time sync
     */
    async syncAuthoringToVisualization(state: AuthoringState): Promise<void> {
        if (!this.syncEnabled) {
            return;
        }

        try {
            this.currentAuthoringState = state;
            
            // Convert authoring state to visualization format
            const visualizationData = this.convertAuthoringToVisualization(state);
            
            if (visualizationData) {
                // Update local visualization manager
                await this.visualizationManager.updatePlan(visualizationData);
                this.currentVisualizationState = visualizationData;
                
                // Send real-time update via WebSocket if available
                if (this.planVisualizationSync) {
                    await this.planVisualizationSync.sendPlanUpdate(state);
                    await this.planVisualizationSync.sendStateChange("authoring", state.currentStep);
                }
                
                debug("Synced authoring state to visualization", {
                    planName: state.planName,
                    steps: state.planSteps?.length || 0,
                    currentStep: state.currentStep,
                    websocketEnabled: !!this.planVisualizationSync
                });
            }
        } catch (error) {
            debug("Error syncing authoring to visualization:", error);
        }
    }    /**
     * Update authoring based on visualization interactions
     */
    async syncVisualizationToAuthoring(state: WebPlanData): Promise<AuthoringState | null> {
        if (!this.syncEnabled) {
            return null;
        }

        try {
            this.currentVisualizationState = state;
            
            // Convert visualization state back to authoring format
            const authoringState = this.convertVisualizationToAuthoring(state);
            
            if (authoringState) {
                this.currentAuthoringState = authoringState;
                
                debug("Synced visualization state to authoring", {
                    planName: authoringState.planName,
                    steps: authoringState.planSteps?.length || 0
                });
                
                return authoringState;
            }
        } catch (error) {
            debug("Error syncing visualization to authoring:", error);
        }
        
        return null;
    }

    /**
     * Enable or disable synchronization
     */
    setSyncEnabled(enabled: boolean): void {
        this.syncEnabled = enabled;
        debug(`State synchronization ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * Get current authoring state
     */
    getCurrentAuthoringState(): AuthoringState | undefined {
        return this.currentAuthoringState;
    }

    /**
     * Get current visualization state
     */
    getCurrentVisualizationState(): WebPlanData | undefined {
        return this.currentVisualizationState;
    }    /**
     * Convert authoring state to visualization data
     */
    private convertAuthoringToVisualization(state: AuthoringState): WebPlanData | null {
        if (!state.planName) {
            return null;
        }

        const nodes = [];
        const links: { source: string; target: string; label: string; }[] = [];

        // Create initial node for plan start
        nodes.push({
            id: "start",
            label: state.planName,
            type: "start",
        });

        // Add nodes for each step
        if (state.planSteps && state.planSteps.length > 0) {
            state.planSteps.forEach((step, index) => {
                const nodeId = `step-${index}`;
                nodes.push({
                    id: nodeId,
                    label: step,
                    type: index === state.planSteps!.length - 1 ? "end" : "action",
                });

                // Link from previous node
                const previousId = index === 0 ? "start" : `step-${index - 1}`;
                links.push({
                    source: previousId,
                    target: nodeId,
                    label: `Step ${index + 1}`,
                });
            });
        }

        // Determine current node
        let currentNode = "start";
        if (state.currentStep !== undefined && state.currentStep >= 0 && state.planSteps) {
            if (state.currentStep < state.planSteps.length) {
                currentNode = `step-${state.currentStep}`;
            }
        }

        return {
            nodes,
            links,
            currentNode,
            title: state.planDescription || state.planName,
        };
    }    /**
     * Convert visualization data back to authoring state
     */
    private convertVisualizationToAuthoring(state: WebPlanData): AuthoringState | null {
        if (!state.title) {
            return null;
        }

        // Extract steps from nodes (excluding start node)
        const steps = state.nodes
            .filter(node => node.type !== "start")
            .sort((a, b) => {
                // Sort by step number if available in ID
                const aStep = parseInt(a.id.replace("step-", "")) || 0;
                const bStep = parseInt(b.id.replace("step-", "")) || 0;
                return aStep - bStep;
            })
            .map(node => node.label);

        // Determine current step from current node
        let currentStep = 0;
        if (state.currentNode) {
            const stepMatch = state.currentNode.match(/step-(\d+)/);
            if (stepMatch) {
                currentStep = parseInt(stepMatch[1]);
            }
        }

        // Check for validation errors (empty labels, disconnected nodes, etc.)
        const validationErrors = [];
        
        if (steps.some(step => !step || step.trim() === "")) {
            validationErrors.push("Some steps have empty descriptions");
        }

        if (state.nodes.length > 1 && state.links.length === 0) {
            validationErrors.push("Steps are not connected");
        }

        return {
            planName: state.title,
            planDescription: state.title, // Could be enhanced to separate description
            planSteps: steps,
            currentStep,
            isEditing: true,
            validationErrors: validationErrors.length > 0 ? validationErrors : undefined,
        };
    }

    /**
     * Force synchronization in both directions
     */
    async forceSyncAll(): Promise<void> {
        if (this.currentAuthoringState) {
            await this.syncAuthoringToVisualization(this.currentAuthoringState);
        }
    }

    /**
     * Reset synchronization state
     */
    reset(): void {
        this.currentAuthoringState = undefined;
        this.currentVisualizationState = undefined;
        debug("State synchronization reset");
    }
}