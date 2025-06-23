// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { SessionContext } from "@typeagent/agent-sdk";
import { BrowserActionContext } from "../../../actionHandler.mjs";
import { AuthoringState, WebPlanData } from "../shared/types.js";
import registerDebug from "debug";

const debug = registerDebug("typeagent:agent:browser:planVisualizationSync");

/**
 * WebSocket-based real-time synchronization for plan visualization
 * Uses the existing browser agent WebSocket infrastructure
 */
export class PlanVisualizationSync {
    private context: SessionContext<BrowserActionContext>;
    private isEnabled: boolean = false;

    constructor(context: SessionContext<BrowserActionContext>) {
        this.context = context;
    }

    /**
     * Enable plan visualization synchronization
     */
    enable(): void {
        this.isEnabled = true;
        debug("Plan visualization sync enabled");
    }

    /**
     * Disable plan visualization synchronization
     */
    disable(): void {
        this.isEnabled = false;
        debug("Plan visualization sync disabled");
    }

    /**
     * Send plan update to visualization via WebSocket
     */
    async sendPlanUpdate(planData: AuthoringState | WebPlanData): Promise<void> {
        if (!this.isEnabled || !this.context.agentContext.webSocket) {
            return;
        }

        try {
            const message = {
                id: new Date().getTime().toString(),
                method: "planVisualization/updatePlan",
                params: {
                    planData: planData,
                    timestamp: new Date().toISOString(),
                },
            };

            this.context.agentContext.webSocket.send(JSON.stringify(message));
            debug("Sent plan update via WebSocket", { planData });
        } catch (error) {
            debug("Error sending plan update via WebSocket:", error);
        }
    }

    /**
     * Send plan state change notification
     */
    async sendStateChange(state: "authoring" | "executing" | "completed", stepIndex?: number): Promise<void> {
        if (!this.isEnabled || !this.context.agentContext.webSocket) {
            return;
        }

        try {
            const message = {
                id: new Date().getTime().toString(),
                method: "planVisualization/stateChange",
                params: {
                    state: state,
                    stepIndex: stepIndex,
                    timestamp: new Date().toISOString(),
                },
            };

            this.context.agentContext.webSocket.send(JSON.stringify(message));
            debug("Sent state change via WebSocket", { state, stepIndex });
        } catch (error) {
            debug("Error sending state change via WebSocket:", error);
        }
    }

    /**
     * Send screenshot update for a plan step
     */
    async sendScreenshotUpdate(stepName: string, screenshot: string): Promise<void> {
        if (!this.isEnabled || !this.context.agentContext.webSocket) {
            return;
        }

        try {
            const message = {
                id: new Date().getTime().toString(),
                method: "planVisualization/addScreenshot",
                params: {
                    stepName: stepName,
                    screenshot: screenshot,
                    timestamp: new Date().toISOString(),
                },
            };

            this.context.agentContext.webSocket.send(JSON.stringify(message));
            debug("Sent screenshot update via WebSocket", { stepName });
        } catch (error) {
            debug("Error sending screenshot update via WebSocket:", error);
        }
    }

    /**
     * Send plan validation results
     */
    async sendValidationResult(isValid: boolean, errors: string[]): Promise<void> {
        if (!this.isEnabled || !this.context.agentContext.webSocket) {
            return;
        }

        try {
            const message = {
                id: new Date().getTime().toString(),
                method: "planVisualization/validation",
                params: {
                    isValid: isValid,
                    errors: errors,
                    timestamp: new Date().toISOString(),
                },
            };

            this.context.agentContext.webSocket.send(JSON.stringify(message));
            debug("Sent validation result via WebSocket", { isValid, errors });
        } catch (error) {
            debug("Error sending validation result via WebSocket:", error);
        }
    }

    /**
     * Check if WebSocket is connected and ready
     */
    isConnected(): boolean {
        return !!(this.context.agentContext.webSocket && 
                 this.context.agentContext.webSocket.readyState === 1); // WebSocket.OPEN
    }

    /**
     * Get connection status for debugging
     */
    getConnectionStatus(): string {
        if (!this.context.agentContext.webSocket) {
            return "no_websocket";
        }

        switch (this.context.agentContext.webSocket.readyState) {
            case 0: return "connecting";
            case 1: return "open";
            case 2: return "closing";
            case 3: return "closed";
            default: return "unknown";
        }
    }
}