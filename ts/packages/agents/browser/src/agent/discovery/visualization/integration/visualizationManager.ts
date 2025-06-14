// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { ChildProcess, fork } from "child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { WebPlanData, AuthoringState } from "../shared/types.js";
import registerDebug from "debug";

const debug = registerDebug("typeagent:agent:browser:visualizationManager");

/**
 * Central manager for visualization lifecycle and state
 */
export class VisualizationManager {
    private server?: ChildProcess;
    private port: number;
    private isActive: boolean = false;
    private currentPlan?: WebPlanData;
    private authoringState?: AuthoringState;

    constructor(port: number) {
        this.port = port;
    }

    /**
     * Start the visualization server
     */
    async start(): Promise<void> {
        if (this.server) {
            debug("Visualization server already running");
            return;
        }

        try {
            this.server = await this.createViewServiceHost(this.port);
            this.isActive = true;
            debug("Visualization server started on port", this.port);
        } catch (error) {
            debug("Failed to start visualization server:", error);
            throw error;
        }
    }

    /**
     * Stop the visualization server
     */
    async stop(): Promise<void> {
        if (this.server) {
            this.server.kill();
            this.server = undefined;
            this.isActive = false;
            debug("Visualization server stopped");
        }
    }    /**
     * Update the plan state in visualization
     */
    async updatePlan(plan: any): Promise<void> {
        if (!this.isActive) {
            debug("Visualization not active, skipping plan update");
            return;
        }

        try {
            // Convert plan to WebPlanData format if needed
            const webPlanData = this.convertToWebPlanData(plan);
            this.currentPlan = webPlanData;

            // Send update to visualization server via HTTP API
            const response = await fetch(`http://localhost:${this.port}/api/title`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ title: plan.webPlanName || "Authoring Plan" }),
            });

            if (!response.ok) {
                throw new Error(`Failed to update plan title: ${response.status}`);
            }

            debug("Plan updated in visualization");
        } catch (error) {
            debug("Error updating plan:", error);
        }
    }

    /**
     * Highlight a specific step in the visualization
     */
    async highlightStep(stepIndex: number): Promise<void> {
        if (!this.isActive || !this.currentPlan) {
            return;
        }

        try {
            // Update current node based on step index
            if (this.currentPlan.nodes[stepIndex]) {
                const nodeId = this.currentPlan.nodes[stepIndex].id;
                
                // This would require extending the API to support highlighting
                debug(`Would highlight step ${stepIndex} (node ${nodeId})`);
            }
        } catch (error) {
            debug("Error highlighting step:", error);
        }
    }    /**
     * Add a screenshot to a plan step
     */
    async addScreenshot(stepName: string, screenshot: string): Promise<void> {
        if (!this.isActive) {
            return;
        }

        try {
            // Find node by name and upload screenshot
            const response = await fetch(`http://localhost:${this.port}/api/screenshot`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    nodeId: stepName, // Simplified - in practice, would need node ID lookup
                    screenshot: screenshot,
                }),
            });

            if (!response.ok) {
                throw new Error(`Failed to add screenshot: ${response.status}`);
            }

            debug(`Screenshot added for step: ${stepName}`);
        } catch (error) {
            debug("Error adding screenshot:", error);
        }
    }

    /**
     * Update authoring state
     */
    async updateAuthoringState(state: AuthoringState): Promise<void> {
        this.authoringState = state;
        
        // Convert authoring state to visualization updates
        if (state.planName && state.planDescription && state.planSteps) {
            const webPlanData: WebPlanData = {
                nodes: state.planSteps.map((step, index) => ({
                    id: `step-${index}`,
                    label: step,
                    type: index === 0 ? "start" : index === state.planSteps!.length - 1 ? "end" : "action",
                })),
                links: state.planSteps.slice(0, -1).map((_, index) => ({
                    source: `step-${index}`,
                    target: `step-${index + 1}`,
                    label: `Step ${index + 1}`,
                })),
                currentNode: state.currentStep !== undefined ? `step-${state.currentStep}` : null,
                title: state.planName,
            };

            await this.updatePlan(webPlanData);
        }
    }    /**
     * Convert plan format to WebPlanData
     */
    private convertToWebPlanData(plan: any): WebPlanData {
        // Handle different plan formats and convert to standard WebPlanData
        if (plan.nodes && plan.links) {
            return plan as WebPlanData;
        }

        // Convert from authoring plan format
        const nodes = [];
        const links = [];

        if (plan.webPlanSteps && Array.isArray(plan.webPlanSteps)) {
            plan.webPlanSteps.forEach((step: string, index: number) => {
                nodes.push({
                    id: `step-${index}`,
                    label: step,
                    type: index === 0 ? "start" : index === plan.webPlanSteps.length - 1 ? "end" : "action",
                });

                if (index < plan.webPlanSteps.length - 1) {
                    links.push({
                        source: `step-${index}`,
                        target: `step-${index + 1}`,
                        label: `Step ${index + 1}`,
                    });
                }
            });
        }

        return {
            nodes,
            links,
            currentNode: nodes.length > 0 ? nodes[0].id : null,
            title: plan.webPlanName || "Plan",
        };
    }

    /**
     * Create and start the visualization server process
     */
    private async createViewServiceHost(port: number): Promise<ChildProcess> {
        let timeoutHandle: NodeJS.Timeout;

        const timeoutPromise = new Promise<undefined>((_resolve, reject) => {
            timeoutHandle = setTimeout(
                () => reject(new Error("Plan view service creation timed out")),
                10000,
            );
        });

        const viewServicePromise = new Promise<ChildProcess | undefined>(
            (resolve, reject) => {
                try {
                    const expressService = fileURLToPath(
                        new URL(
                            path.join("..", "server", "server.js"),
                            import.meta.url,
                        ),
                    );

                    const childProcess = fork(expressService, [port.toString()]);

                    childProcess.on("message", function (message) {
                        if (message === "Success") {
                            resolve(childProcess);
                        } else if (message === "Failure") {
                            resolve(undefined);
                        }
                    });

                    childProcess.on("exit", (code) => {
                        debug("Plan view server exited with code:", code);
                    });
                } catch (e: any) {
                    debug("Error creating visualization server:", e);
                    resolve(undefined);
                }
            },
        );

        const result = await Promise.race([viewServicePromise, timeoutPromise]);
        clearTimeout(timeoutHandle);
        
        if (!result) {
            throw new Error("Failed to create visualization server");
        }
        
        return result;
    }

    /**
     * Check if visualization is active
     */
    isVisualizationActive(): boolean {
        return this.isActive;
    }

    /**
     * Get current plan data
     */
    getCurrentPlan(): WebPlanData | undefined {
        return this.currentPlan;
    }

    /**
     * Get current authoring state
     */
    getCurrentAuthoringState(): AuthoringState | undefined {
        return this.authoringState;
    }
}