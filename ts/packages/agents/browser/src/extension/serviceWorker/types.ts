// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

export interface AppAction {
    actionName: string;
    fullActionName?: string;
    parameters: any;
}

export interface BoundingBox {
    top: number;
    left: number;
    bottom: number;
    right: number;
    selector?: string;
    index?: number;
}

export interface Settings {
    [key: string]: any;
    websocketHost?: string;
}

export interface HTMLFragment {
    frameId: number;
    content: string;
    text: string;
}

export interface AriaSnapshotOptions {
    includeTextContent?: boolean;
    maxTextPerNode?: number;
}

export interface AriaSnapshotResult {
    version: number;
    tree: string;
    textContent?: string;
    refCount: number;
    frameId: number;
}

export interface InteractionResult {
    success: boolean;
    error?: string;
}

export interface TabAriaSnapshot {
    frames: AriaSnapshotResult[];
    timestamp: number;
}

// Re-export types that are used across multiple files
export {
    isWebAgentMessage,
    isWebAgentMessageFromDispatcher,
    WebAgentDisconnectMessage,
} from "../../common/webAgentMessageTypes.mjs";
