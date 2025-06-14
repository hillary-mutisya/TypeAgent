// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * End-to-end test script for plan visualizer integration
 * Tests all phases of the integration including real-time synchronization
 */

import { VisualizationManager } from "../integration/visualizationManager.js";
import { StateSynchronizer } from "../integration/stateSync.js";
import { PlanVisualizationSync } from "../integration/planVisualizationSync.js";
import { AuthoringState, WebPlanData } from "../shared/types.js";

// Mock WebSocket for testing
class MockWebSocket {
    public readyState: number = 1; // WebSocket.OPEN
    private messageHandler?: (event: any) => void;
    private messages: any[] = [];

    send(data: string) {
        this.messages.push(JSON.parse(data));
    }

    addEventListener(event: string, handler: (event: any) => void) {
        if (event === 'message') {
            this.messageHandler = handler;
        }
    }

    removeEventListener(event: string, handler: (event: any) => void) {
        if (event === 'message') {
            this.messageHandler = undefined;
        }
    }

    simulateMessage(data: any) {
        if (this.messageHandler) {
            this.messageHandler({ data: JSON.stringify(data) });
        }
    }

    getMessages() {
        return this.messages;
    }

    clearMessages() {
        this.messages = [];
    }
}

/**
 * Integration test suite for plan visualizer
 */
export class PlanVisualizerIntegrationTest {
    private visualizationManager: VisualizationManager;
    private stateSynchronizer: StateSynchronizer;
    private planVisualizationSync: PlanVisualizationSync;
    private mockWebSocket: MockWebSocket;
    private mockSessionContext: any;

    constructor() {
        this.setupMocks();
        this.initializeComponents();
    }

    private setupMocks() {
        this.mockWebSocket = new MockWebSocket();
        this.mockSessionContext = {
            agentContext: {
                webSocket: this.mockWebSocket
            }
        };
    }

    private initializeComponents() {
        this.visualizationManager = new VisualizationManager(9052);
        this.planVisualizationSync = new PlanVisualizationSync(this.mockSessionContext);
        this.stateSynchronizer = new StateSynchronizer(
            this.visualizationManager, 
            this.planVisualizationSync
        );
    }

    /**
     * Test Phase 1: Foundation Setup
     */
    async testFoundationSetup(): Promise<boolean> {
        console.log("Testing Phase 1: Foundation Setup...");
        
        try {
            // Test component initialization
            if (!this.visualizationManager || !this.stateSynchronizer || !this.planVisualizationSync) {
                throw new Error("Components not initialized properly");
            }

            // Test WebSocket connection status
            if (!this.planVisualizationSync.isConnected()) {
                throw new Error("WebSocket not connected");
            }

            console.log("✅ Phase 1: Foundation Setup - PASSED");
            return true;
        } catch (error) {
            console.error("❌ Phase 1: Foundation Setup - FAILED:", error);
            return false;
        }
    }

    /**
     * Test Phase 2: Action Schema Integration
     */
    async testActionSchemaIntegration(): Promise<boolean> {
        console.log("Testing Phase 2: Action Schema Integration...");
        
        try {
            const testPlan: AuthoringState = {
                planName: "Test Plan",
                planDescription: "A test plan for validation",
                planSteps: ["Step 1", "Step 2", "Step 3"],
                currentStep: 0,
                isEditing: true
            };

            // Clear previous messages
            this.mockWebSocket.clearMessages();

            // Test plan update synchronization
            await this.stateSynchronizer.syncAuthoringToVisualization(testPlan);
            
            // Verify WebSocket messages were sent
            const messages = this.mockWebSocket.getMessages();
            if (messages.length === 0) {
                throw new Error("No WebSocket messages sent");
            }

            const planUpdateMessage = messages.find(msg => 
                msg.method === 'planVisualization/updatePlan'
            );
            
            if (!planUpdateMessage) {
                throw new Error("Plan update message not found");
            }

            if (JSON.stringify(planUpdateMessage.params.planData) !== JSON.stringify(testPlan)) {
                throw new Error("Plan data mismatch in WebSocket message");
            }

            // Test state change
            await this.planVisualizationSync.sendStateChange("authoring", 1);
            
            const stateChangeMessage = this.mockWebSocket.getMessages().find(msg => 
                msg.method === 'planVisualization/stateChange'
            );
            
            if (!stateChangeMessage || stateChangeMessage.params.state !== "authoring") {
                throw new Error("State change message not sent correctly");
            }

            console.log("✅ Phase 2: Action Schema Integration - PASSED");
            return true;
        } catch (error) {
            console.error("❌ Phase 2: Action Schema Integration - FAILED:", error);
            return false;
        }
    }

    /**
     * Test Phase 3: UI Integration
     */
    async testUIIntegration(): Promise<boolean> {
        console.log("Testing Phase 3: UI Integration...");
        
        try {
            this.mockWebSocket.clearMessages();

            // Test screenshot update
            const testScreenshot = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
            await this.planVisualizationSync.sendScreenshotUpdate("Step 1", testScreenshot);
            
            const screenshotMessage = this.mockWebSocket.getMessages().find(msg => 
                msg.method === 'planVisualization/addScreenshot'
            );
            
            if (!screenshotMessage || screenshotMessage.params.stepName !== "Step 1") {
                throw new Error("Screenshot update message not sent correctly");
            }

            // Test validation results
            const errors = ["Missing step description", "Invalid node connection"];
            await this.planVisualizationSync.sendValidationResult(false, errors);
            
            const validationMessage = this.mockWebSocket.getMessages().find(msg => 
                msg.method === 'planVisualization/validation'
            );
            
            if (!validationMessage || validationMessage.params.isValid !== false) {
                throw new Error("Validation message not sent correctly");
            }

            console.log("✅ Phase 3: UI Integration - PASSED");
            return true;
        } catch (error) {
            console.error("❌ Phase 3: UI Integration - FAILED:", error);
            return false;
        }
    }

    /**
     * Test Phase 4: Real-time Synchronization
     */
    async testRealTimeSynchronization(): Promise<boolean> {
        console.log("Testing Phase 4: Real-time Synchronization...");
        
        try {
            this.mockWebSocket.clearMessages();

            // Test real-time plan updates
            const initialState: AuthoringState = {
                planName: "Dynamic Plan",
                planDescription: "Real-time test plan",
                planSteps: ["Initial Step"],
                currentStep: 0,
                isEditing: true
            };

            await this.stateSynchronizer.syncAuthoringToVisualization(initialState);
            
            // Simulate state update
            const updatedState: AuthoringState = {
                ...initialState,
                planSteps: ["Initial Step", "Added Step"],
                currentStep: 1
            };

            await this.stateSynchronizer.syncAuthoringToVisualization(updatedState);
            
            const messages = this.mockWebSocket.getMessages();
            if (messages.length < 2) {
                throw new Error("Real-time updates not sent correctly");
            }

            // Test connection status monitoring
            if (this.planVisualizationSync.getConnectionStatus() !== "open") {
                throw new Error("Connection status not reported correctly");
            }

            // Test bidirectional state conversion
            const convertedData = (this.stateSynchronizer as any).convertAuthoringToVisualization(updatedState);
            
            if (!convertedData || convertedData.nodes.length !== 3) { // start + 2 steps
                throw new Error("State conversion not working correctly");
            }

            console.log("✅ Phase 4: Real-time Synchronization - PASSED");
            return true;
        } catch (error) {
            console.error("❌ Phase 4: Real-time Synchronization - FAILED:", error);
            return false;
        }
    }

    /**
     * Test edge cases and error handling
     */
    async testEdgeCases(): Promise<boolean> {
        console.log("Testing Edge Cases...");
        
        try {
            // Test disabled synchronization
            this.stateSynchronizer.setSyncEnabled(false);
            this.mockWebSocket.clearMessages();

            const testState: AuthoringState = {
                planName: "Disabled Test",
                planDescription: "Should not sync",
                planSteps: ["Step 1"],
                currentStep: 0,
                isEditing: true
            };

            await this.stateSynchronizer.syncAuthoringToVisualization(testState);
            
            if (this.mockWebSocket.getMessages().length > 0) {
                throw new Error("Messages sent when synchronization disabled");
            }

            // Re-enable for other tests
            this.stateSynchronizer.setSyncEnabled(true);

            // Test empty plan data
            const emptyState: AuthoringState = {
                planName: "",
                planDescription: "",
                planSteps: [],
                currentStep: 0,
                isEditing: true
            };

            // Should not throw error
            await this.stateSynchronizer.syncAuthoringToVisualization(emptyState);

            console.log("✅ Edge Cases - PASSED");
            return true;
        } catch (error) {
            console.error("❌ Edge Cases - FAILED:", error);
            return false;
        }
    }

    /**
     * Run all integration tests
     */
    async runAllTests(): Promise<void> {
        console.log("🚀 Starting Plan Visualizer Integration Tests...\n");

        const results = await Promise.all([
            this.testFoundationSetup(),
            this.testActionSchemaIntegration(),
            this.testUIIntegration(),
            this.testRealTimeSynchronization(),
            this.testEdgeCases()
        ]);

        const passedTests = results.filter(result => result).length;
        const totalTests = results.length;

        console.log("\n📊 Test Results Summary:");
        console.log(`✅ Passed: ${passedTests}/${totalTests}`);
        console.log(`❌ Failed: ${totalTests - passedTests}/${totalTests}`);

        if (passedTests === totalTests) {
            console.log("\n🎉 ALL TESTS PASSED! Integration is ready for end-to-end testing.");
        } else {
            console.log("\n⚠️  Some tests failed. Please review the implementation.");
        }

        // Cleanup
        await this.cleanup();
    }

    /**
     * Cleanup test resources
     */
    async cleanup(): Promise<void> {
        try {
            await this.visualizationManager.stop();
            this.planVisualizationSync.disable();
            this.mockWebSocket.clearMessages();
        } catch (error) {
            console.warn("Cleanup warning:", error);
        }
    }
}

// Export test utilities
export {
    MockWebSocket,
    VisualizationManager,
    StateSynchronizer,
    PlanVisualizationSync
};

// If running directly, execute tests
if (require.main === module) {
    const test = new PlanVisualizerIntegrationTest();
    test.runAllTests();
}