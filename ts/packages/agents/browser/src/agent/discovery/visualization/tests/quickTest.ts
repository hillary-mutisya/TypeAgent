// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Quick start guide for testing the plan visualizer integration
 */

import { PlanVisualizerIntegrationTest } from "./integration.test.js";

/**
 * Simple test runner for quick validation
 */
async function quickTest() {
    console.log("🚀 Quick Test - Plan Visualizer Integration\n");
    
    const tester = new PlanVisualizerIntegrationTest();
    
    try {
        // Run a basic test to verify integration
        console.log("Testing basic integration...");
        
        const foundationOk = await tester.testFoundationSetup();
        const actionOk = await tester.testActionSchemaIntegration();
        const uiOk = await tester.testUIIntegration();
        const syncOk = await tester.testRealTimeSynchronization();
        
        if (foundationOk && actionOk && uiOk && syncOk) {
            console.log("\n✅ QUICK TEST PASSED!");
            console.log("Integration is working correctly.");
            console.log("\nTo run full tests: npm test");
            console.log("To start visualization server: npm run build:visualization");
        } else {
            console.log("\n❌ QUICK TEST FAILED!");
            console.log("Some components are not working correctly.");
        }
        
    } catch (error) {
        console.error("\n💥 QUICK TEST ERROR:", error);
    } finally {
        await tester.cleanup();
    }
}

// Run if executed directly
if (require.main === module) {
    quickTest();
}

export { quickTest };