// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Type definitions for the Web Plan Visualizer
 */

declare global {
    interface Window {
        webPlanData?: any;
        showScreenshotUploadModal?: (nodeId: string, nodeLabel: string) => void;
        uploadScreenshot?: () => void;
    }
}

// Node in the web plan
export interface PlanNode {
    id: string;
    label: string;
    type: string;
    isTemporary?: boolean;
    screenshot?: string;
}

// Link between nodes in the web plan
export interface PlanLink {
    source: string;
    target: string;
    label?: string;
}

// Complete web plan data structure
export interface WebPlanData {
    nodes: PlanNode[];
    links: PlanLink[];
    currentNode: string | null;
    title: string;
}

// Form data for transition API
export interface TransitionFormData {
    currentState: string;
    action: string;
    nodeType: string;
    screenshot?: string | null;
}

// API transition response
export interface TransitionResponse {
    oldData: WebPlanData;
    newData: WebPlanData;
}

// SSE event data structure
export interface SSEEvent {
    type: string;
    data?: WebPlanData;
    timestamp?: string;
}

// Cytoscape node data
export interface CytoscapeNodeData {
    id: string;
    label: string;
    type: string;
    isActive?: boolean;
    isTemporary?: boolean;
    originalId?: string;
}

// Cytoscape edge data
export interface CytoscapeEdgeData {
    id: string;
    source: string;
    target: string;
    label?: string;
    edgeType: string;
}

// Cytoscape element data (either node or edge)
export type CytoscapeElementData = CytoscapeNodeData | CytoscapeEdgeData;

// NodeSelector callback type
export type NodeSelectCallback = (nodeId: string) => void;

// Callback for animation completion
export type AnimationCallback = () => void;

// Position interface for node placement
export interface Position {
    x: number;
    y: number;
}

// Animation options
export interface AnimationOptions {
    duration?: number;
    easing?: string;
    complete?: AnimationCallback;
}

// Layout options base interface
export interface LayoutOptions {
    name: string;
    animate?: boolean;
    fit?: boolean;
    padding?: number;
    [key: string]: any;
}

// Title update request
export interface TitleUpdateRequest {
    title: string;
}

// State and execution handlers
export type StateChangeHandler = (state: WebPlanData) => void;
export type ErrorHandler = (error: Error) => void;

// DOM event handlers
export interface GenericEvent {
    preventDefault: () => void;
    stopPropagation: () => void;
    target: any;
    [key: string]: any;
}

export type NodeClickHandler = (nodeId: string, event: GenericEvent) => void;
export type EdgeClickHandler = (edgeId: string, event: GenericEvent) => void;

// Events that can be emitted by the system
export type EventType =
    | "transition"
    | "reset"
    | "title"
    | "connected"
    | "focus"
    | "error";

// Event listener type
export type EventListener = (data: any) => void;

// Event emitter interface
export interface EventEmitter {
    on(event: EventType, listener: EventListener): void;
    off(event: EventType, listener: EventListener): void;
    emit(event: EventType, data: any): void;
}

/**
 * PDF-specific type definitions for annotations
 */

// Enhanced annotation types
export interface PDFHighlight {
    id: string;
    documentId: string;
    page: number;
    color: string;
    selectedText: string;
    coordinates: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    textRange?: {
        startOffset: number;
        endOffset: number;
        startContainer: string;
        endContainer: string;
    };
    createdAt: string;
    userId?: string;
}

export interface PDFNote {
    id: string;
    documentId: string;
    page: number;
    content: string;
    coordinates: {
        x: number;
        y: number;
    };
    createdAt: string;
    updatedAt: string;
    userId?: string;
}

export interface PDFDrawingStroke {
    points: { x: number; y: number; pressure?: number }[];
    color: string;
    thickness: number;
    timestamp: number;
}

export interface PDFDrawing {
    id: string;
    documentId: string;
    page: number;
    strokes: PDFDrawingStroke[];
    createdAt: string;
    updatedAt: string;
    userId?: string;
}

// Text selection events
export interface PDFTextSelectionEvent extends CustomEvent {
    detail: {
        text: string;
        range: Range;
    };
}

// Annotation tool types
export type PDFAnnotationTool = 'select' | 'highlight' | 'note' | 'ink';

// Tool change events
export interface PDFToolChangeEvent extends CustomEvent {
    detail: {
        tool: PDFAnnotationTool;
    };
}

// Annotation mode events
export interface PDFAnnotationModeEvent extends CustomEvent {
    detail: {
        isActive: boolean;
    };
}

// Page render events for annotation setup
export interface PDFPageRenderEvent extends CustomEvent {
    detail: {
        pageNum: number;
        pageElement: HTMLElement;
        viewport: any;
    };
}

// Annotation selection events
export interface PDFAnnotationSelectionEvent extends CustomEvent {
    detail: {
        type: string;
        annotation: PDFHighlight | PDFNote | PDFDrawing;
    };
}

// Real-time annotation update events
export interface PDFAnnotationUpdateEvent extends CustomEvent {
    detail: {
        type: string;
        action: 'added' | 'updated' | 'deleted';
        annotation: PDFHighlight | PDFNote | PDFDrawing;
    };
}

// Color picker data
export interface ColorOption {
    name: string;
    value: string;
    isDefault?: boolean;
}

// Annotation filter options
export interface PDFAnnotationFilter {
    type?: string[];
    page?: number;
    userId?: string;
    dateRange?: {
        start: string;
        end: string;
    };
}

// Annotation statistics
export interface PDFAnnotationStats {
    total: number;
    highlights: number;
    notes: number;
    drawings: number;
    byPage: Map<number, number>;
}

// Sidebar view types
export type PDFSidebarView = 'annotations' | 'thumbnails' | 'outline' | 'none';

// Annotation sidebar item
export interface PDFAnnotationListItem {
    id: string;
    type: 'highlight' | 'note' | 'drawing';
    page: number;
    preview: string;
    createdAt: string;
    userId?: string;
}

declare global {
    interface DocumentEventMap {
        'pdfTextSelected': PDFTextSelectionEvent;
        'annotationToolChanged': PDFToolChangeEvent;
        'highlightModeChanged': PDFAnnotationModeEvent;
        'noteModeChanged': PDFAnnotationModeEvent;
        'inkModeChanged': PDFAnnotationModeEvent;
        'activeToolChanged': PDFToolChangeEvent;
        'pageRendered': PDFPageRenderEvent;
        'pageCleanup': CustomEvent<{ pageNum: number }>;
        'annotationSelected': PDFAnnotationSelectionEvent;
        'highlightSelected': CustomEvent<PDFHighlight>;
        'annotationUpdate': PDFAnnotationUpdateEvent;
    }
}
