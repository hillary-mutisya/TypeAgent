// IPC Message Types for Flow Simplification

// Agent ← View: UI command requests (Flow 2)
export interface UICommandMessage {
    type: "uiCommand";
    requestId: string;
    command: string; // "continue" | "diagram" | "augment"
    parameters: {
        originalRequest: string;
        context?: {
            position?: number;
            selection?: any;
        };
    };
    timestamp: number;
}

// Agent → View: UI command results (Flow 2)
export interface UICommandResultMessage {
    type: "uiCommandResult";
    requestId: string;
    result: UICommandResult;
}

export interface UICommandResult {
    success: boolean;
    operations?: any[]; // DocumentOperation[]
    message: string;
    type: "success" | "error" | "warning";
    error?: string;
}

// Agent → View: Content requests (Flow 1)
export interface GetDocumentContentMessage {
    type: "getDocumentContent";
}

export interface DocumentContentMessage {
    type: "documentContent";
    content: string;
    timestamp: number;
}

// Agent → View: LLM operations (Flow 1 simplification)
export interface LLMOperationsMessage {
    type: "applyLLMOperations";
    operations: any[]; // DocumentOperation[]
    timestamp: number;
}

export interface OperationsAppliedMessage {
    type: "operationsApplied"; 
    success: boolean;
    operationCount?: number;
    error?: string;
}

// View → Frontend: Auto-save notifications
export interface AutoSaveMessage {
    type: "autoSave";
    timestamp: number;
}

// View → Frontend: Notifications and status (Flow 2)
export interface NotificationEvent {
    type: "notification";
    message: string;
    notificationType: "success" | "error" | "warning" | "info";
}

export interface OperationsAppliedEvent {
    type: "operationsApplied";
    operationCount: number;
}
