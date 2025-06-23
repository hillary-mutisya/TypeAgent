// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Main application script for the Web Plan Visualizer
 */
import cytoscape from "cytoscape";
import cytoscapeDagre from "cytoscape-dagre";
import CONFIG from "./config.js";
import ApiService from "./apiService.js";
import Visualizer from "./visualizer.js";
import { WebPlanData, SSEEvent } from "../shared/types.js";

declare global {
    interface Window {
        visualizer?: Visualizer;
        webPlanData?: WebPlanData;
    }
}

document.addEventListener("DOMContentLoaded", function () {
    // Check if dagre and cytoscape-dagre are properly loaded
    if (typeof cytoscape === "undefined") {
        console.error("Cytoscape library not loaded properly");
        return;
    }

    // Register dagre layout
    try {
        cytoscape.use(cytoscapeDagre as any);
        console.log("Cytoscape-dagre registered successfully");
    } catch (e) {
        console.error("Failed to register cytoscape-dagre:", e);
        return;
    }

    // Application state
    let currentViewMode: string = CONFIG.VIEW_MODES.DYNAMIC;
    let webPlanData: WebPlanData = {
        nodes: [],
        links: [],
        currentNode: null,
        title: "Dynamic Plan",
    };
    let visualizer: Visualizer | null = null;
    let eventSource: EventSource | null = null;

    // DOM elements
    const cyContainer = document.getElementById("cy-container") as HTMLElement;
    const nodeSelect = document.getElementById("node-select") as HTMLSelectElement;
    const zoomFitButton = document.getElementById("zoom-fit-button") as HTMLButtonElement;
    const showPathButton = document.getElementById("show-path-button") as HTMLButtonElement;
    const statusMessage = document.getElementById("status-message") as HTMLDivElement;
    const tooltip = document.getElementById("tooltip") as HTMLDivElement;
    const viewModeToggle = document.getElementById("view-mode-toggle") as HTMLInputElement;
    const planTitle = document.getElementById("plan-title") as HTMLElement;    /**
     * Show status message
     */
    function showStatus(message: string, isError: boolean = false, duration: number = 3000): void {
        if (!statusMessage) return;
        
        statusMessage.textContent = message;
        statusMessage.className = "status-message " + (isError ? "error" : "success");
        statusMessage.style.display = "block";

        setTimeout(() => {
            statusMessage.style.display = "none";
        }, duration);
    }

    /**
     * Populate node selector dropdown
     */
    function populateNodeSelector(): void {
        if (!nodeSelect) return;
        
        nodeSelect.innerHTML = "";

        if (webPlanData.nodes.length === 0) {
            const option = document.createElement("option");
            option.value = "";
            option.textContent = "No nodes yet";
            option.disabled = true;
            option.selected = true;
            nodeSelect.appendChild(option);
            return;
        }

        webPlanData.nodes.forEach((node) => {
            const option = document.createElement("option");
            option.value = node.id;
            option.textContent = node.label;
            if (node.id === webPlanData.currentNode) {
                option.selected = true;
            }
            nodeSelect.appendChild(option);
        });
    }

    /**
     * Initialize the visualization
     */
    function initializeVisualization(): void {
        if (visualizer) {
            visualizer.destroy();
        }

        visualizer = new Visualizer(cyContainer, webPlanData);
        visualizer.initialize();

        // Make visualizer accessible globally
        if(visualizer){
        window.visualizer = visualizer;
        }
        window.webPlanData = webPlanData;

        if (tooltip) {
            visualizer.setupEventListeners((nodeId: string) => {
                if (nodeSelect) nodeSelect.value = nodeId;
            }, tooltip);
        }

        populateNodeSelector();
    }

    /**
     * Load data from the server
     */
    async function loadData(): Promise<void> {
        try {
            webPlanData = await ApiService.getPlan(currentViewMode);
            initializeVisualization();

            if (planTitle && webPlanData.title) {
                planTitle.textContent = webPlanData.title;
            }
        } catch (error) {
            console.error("Error loading plan data:", error);
            showStatus(`Error loading plan data: ${(error as Error).message}`, true);
        }
    }    /**
     * Initialize Server-Sent Events connection
     */
    function initializeSSE(): void {
        if (eventSource) {
            eventSource.close();
        }

        eventSource = new EventSource("/api/events");

        eventSource.onopen = () => {
            console.log("SSE connection established");
            showStatus("Connected to visualization server");
        };

        eventSource.onerror = (error) => {
            console.error("SSE connection error:", error);
            showStatus("Connection error, attempting to reconnect...", true);
            
            setTimeout(() => {
                console.log("Attempting to reconnect SSE...");
                initializeSSE();
            }, 5000);
        };

        eventSource.onmessage = (event) => {
            try {
                const eventData = JSON.parse(event.data) as SSEEvent;
                handleSSEEvent(eventData);
            } catch (error) {
                console.error("Error parsing SSE data:", error);
            }
        };
    }

    /**
     * Handle SSE events for real-time updates
     */
    function handleSSEEvent(eventData: SSEEvent): void {
        console.log("Received SSE event:", eventData.type);

        // Only process events for the current view mode
        if (currentViewMode !== CONFIG.VIEW_MODES.DYNAMIC) {
            if (eventData.data) {
                webPlanData = eventData.data;
            }
            return;
        }

        switch (eventData.type) {
            case "connected":
                console.log("SSE connection confirmed");
                break;

            case "transition":
                if (eventData.data) {
                    handlePlanUpdate(eventData.data);
                }
                break;

            case "reset":
                if (eventData.data) {
                    webPlanData = eventData.data;
                    initializeVisualization();
                    updateTitle(webPlanData.title);
                    showStatus("Plan reset");
                }
                break;

            case "title":
                if (eventData.data) {
                    updateTitle(eventData.data.title);
                    if (webPlanData) {
                        webPlanData.title = eventData.data.title;
                    }
                }
                break;

            default:
                console.log("Unknown SSE event type:", eventData.type);
        }
    }    /**
     * Handle plan updates from SSE
     */
    function handlePlanUpdate(newPlanData: WebPlanData): void {
        if (!newPlanData || !newPlanData.nodes) {
            console.error("Invalid plan data received:", newPlanData);
            return;
        }

        webPlanData = newPlanData;
        window.webPlanData = webPlanData;

        if (visualizer) {
            visualizer.updatePlanData(webPlanData);
        } else {
            initializeVisualization();
        }

        populateNodeSelector();
        showStatus("Plan updated", false, 1000);
    }

    /**
     * Update the plan title in the UI
     */
    function updateTitle(title: string): void {
        if (planTitle && title) {
            planTitle.textContent = title;
        }
    }

    // Event Listeners
    
    // Toggle view mode
    if (viewModeToggle) {
        viewModeToggle.addEventListener("change", function () {
            currentViewMode = this.checked
                ? CONFIG.VIEW_MODES.DYNAMIC
                : CONFIG.VIEW_MODES.STATIC;
            loadData();
            showStatus(`Switched to ${currentViewMode} plan view`);
        });
    }

    // Handle node selection change via dropdown
    if (nodeSelect) {
        nodeSelect.addEventListener("change", (e) => {
            if (visualizer) {
                visualizer.updateCurrentNode((e.target as HTMLSelectElement).value);
            }
        });
    }

    // Zoom fit button handler
    if (zoomFitButton) {
        zoomFitButton.addEventListener("click", () => {
            if (visualizer) {
                visualizer.fitToView();
            }
        });
    }

    // Show path button handler (basic implementation)
    if (showPathButton) {
        showPathButton.addEventListener("click", () => {
            // Basic path highlighting - would need more complex implementation
            showStatus("Path highlighting not yet implemented");
        });
    }

    // Window resize handler
    window.addEventListener("resize", function () {
        if (visualizer) {
            // Give a small delay for the resize to complete
            setTimeout(() => {
                if (visualizer) {
                    visualizer.fitToView();
                }
            }, 100);
        }
    });

    // Cleanup on page unload
    window.addEventListener("beforeunload", () => {
        if (eventSource) {
            eventSource.close();
        }
    });

    // Initialize the application
    console.log("Initializing Plan Visualizer...");
    loadData();
    initializeSSE();
});