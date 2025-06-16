// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// Import CSS and styles
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";
import "./styles/milkdown-integration.css";
import "./styles/styles.css";
import "./styles/mermaid-styles.css";

// Import core managers
import { EditorManager } from "./core/editor-manager";
import { DocumentManager } from "./core/document-manager";
import { aiAgentManager } from "./core/ai-agent-manager";

// Import UI managers
import { UIManager } from "./ui/ui-manager";

// Import utilities
import { getRequiredElement, eventHandlers } from "./utils";

// Global state for the application
let editorManager: EditorManager | null = null;
let documentManager: DocumentManager | null = null;
let uiManager: UIManager | null = null;

// Main initialization
document.addEventListener("DOMContentLoaded", async () => {
    try {
        await initializeApplication();
    } catch (error) {
        console.error("❌ Failed to initialize application:", error);
        showError("Failed to initialize editor. Please refresh the page.");
    }
});

async function initializeApplication(): Promise<void> {
    console.log("🚀 Starting AI-Enhanced Markdown Editor...");

    // Initialize managers
    editorManager = new EditorManager();
    documentManager = new DocumentManager();
    uiManager = new UIManager();

    // Initialize UI first
    await uiManager.initialize();

    // Get required DOM elements
    const editorElement = getRequiredElement("editor");

    // Initialize editor
    const editor = await editorManager.initialize(editorElement);

    // Setup cross-manager dependencies
    setupManagerDependencies(editor);

    // Setup event handlers
    eventHandlers.setEditor(editor);
    eventHandlers.setupKeyboardShortcuts();

    // Export for global access (for debugging and compatibility)
    setupGlobalAccess(editor);

    console.log("✅ Application initialized successfully");
    logAvailableFeatures();
}

function setupManagerDependencies(editor: any): void {
    // Connect notification manager to other components
    const notificationManager = uiManager!.getNotificationManager();
    documentManager!.setNotificationManager(notificationManager);
    aiAgentManager.setNotificationManager(notificationManager);

    // Connect editor to AI agent manager
    aiAgentManager.setEditor(editor);

    // Connect editor to panel manager
    const panelManager = uiManager!.getPanelManager();
    panelManager.setEditor(editor);

    // Connect panel manager to toolbar
    const toolbarManager = (uiManager as any).toolbarManager;
    if (toolbarManager) {
        toolbarManager.setPanelManager(panelManager);
    }
}

function setupGlobalAccess(editor: any): void {
    // Export for global access (for debugging and slash commands)
    (window as any).editor = editor;
    (window as any).executeAgentCommand =
        aiAgentManager.executeAgentCommand.bind(aiAgentManager);
}

function logAvailableFeatures(): void {
    console.log("🎉 AI-Enhanced Markdown Editor is ready!");
    console.log("📋 Available features:");
    console.log("   • WYSIWYG editing with Milkdown Crepe");
    console.log("   • Real-time collaboration with Yjs");
    console.log("   • AI-powered commands and assistance");
    console.log("   • Mermaid diagram support");
    console.log("   • Raw markdown panel");
    console.log("   • Theme switching (light/dark)");
    console.log("   • Keyboard shortcuts (Ctrl+S to save)");
    console.log("");
    console.log("🤖 AI Commands:");
    console.log('   • Type "/" to open block edit menu');
    console.log("   • /continue - Continue writing");
    console.log("   • /diagram [description] - Generate diagram");
    console.log("   • /augment [instruction] - Improve document");
    console.log('   • Add "test:" prefix for test mode (e.g., /test:continue)');
}

function showError(message: string): void {
    console.error(message);

    // Create error notification
    const errorElement = document.createElement("div");
    errorElement.className = "error-notification";
    errorElement.textContent = message;

    document.body.appendChild(errorElement);

    // Remove after 5 seconds
    setTimeout(() => {
        errorElement.remove();
    }, 5000);
}

// Export managers for external access if needed
export { editorManager, documentManager, uiManager, aiAgentManager };
