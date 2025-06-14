// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Action schema for plan visualization integration
 */

export type PlanVisualizationActions = 
    | ShowPlanVisualization
    | HighlightPlanNode
    | AddPlanScreenshot
    | UpdatePlanLayout
    | RefreshPlanView
    | GoToPlanNode
    | AddNewNode
    | AddNewEdge
    | ZoomToFitPlanInView;

// Show or activate plan visualization
export type ShowPlanVisualization = {
    actionName: "showPlanVisualization";
    parameters: {
        mode: "static" | "dynamic" | "authoring";
        webPlanName?: string;
        webPlanDescription?: string;
    };
};

// Highlight a specific node in the plan
export type HighlightPlanNode = {
    actionName: "highlightPlanNode";
    parameters: {
        nodeId: string;
        nodeName?: string;
    };
};

// Add or update screenshot for a plan node
export type AddPlanScreenshot = {
    actionName: "addPlanScreenshot";
    parameters: {
        nodeId: string;
        nodeName?: string;
        screenshot: string; // base64 encoded
    };
};

// Update the visualization layout
export type UpdatePlanLayout = {
    actionName: "updatePlanLayout";
    parameters: {
        layoutType?: "dagre" | "breadthfirst" | "grid";
        animate?: boolean;
    };
};

// Refresh the entire plan view
export type RefreshPlanView = {
    actionName: "refreshPlanView";
    parameters?: {
        preservePosition?: boolean;
    };
};

// Navigate to a specific plan node (from original schema)
export type GoToPlanNode = {
    actionName: "goToPlanNode";
    parameters: {
        name: string;
    };
};

// Add a new node to the plan (from original schema)
export type AddNewNode = {
    actionName: "addNewNode";
    parameters: {
        name: string;
        nodeType: string;
        screenshot?: string;
    };
};

// Add a new edge between nodes (from original schema)
export type AddNewEdge = {
    actionName: "addNewEdge";
    parameters: {
        name: string;
        source: string;
        target?: string;
    };
};

// Zoom to fit the plan in view (from original schema)
export type ZoomToFitPlanInView = {
    actionName: "zoomToFitPlanInView";
    parameters?: {};
};