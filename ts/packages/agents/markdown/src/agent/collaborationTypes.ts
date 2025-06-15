// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

/**
 * Collaboration message types for websocket communication
 */
export interface CollaborationMessage {
    type: 'yjs-update' | 'awareness' | 'ai-request' | 'ai-status' | 'sync-request';
    documentId: string;
    userId: string;
    timestamp: number;
    data: any;
}

/**
 * User presence information for awareness
 */
export interface UserPresence {
    id: string;
    name: string;
    avatar: string;
    color: string;
    cursor?: number;
    selection?: { from: number; to: number };
    lastSeen: number;
    isAI: boolean;
    status?: {
        working: boolean;
        type?: string;
        description?: string;
    };
}

/**
 * AI request message for async operations
 */
export interface AIRequestMessage extends CollaborationMessage {
    type: 'ai-request';
    data: {
        requestId: string;
        command: 'continue' | 'diagram' | 'augment';
        parameters: any;
        context: {
            position: number;
            documentSnapshot: Uint8Array;
            surroundingText: string;
            sectionHeading?: string;
        };
    };
}

/**
 * AI status update message
 */
export interface AIStatusMessage extends CollaborationMessage {
    type: 'ai-status';
    data: {
        requestId: string;
        status: 'started' | 'processing' | 'completed' | 'failed';
        progress?: number;
        description?: string;
        estimatedCompletion?: number;
    };
}

/**
 * Yjs update message
 */
export interface YjsUpdateMessage extends CollaborationMessage {
    type: 'yjs-update';
    data: {
        update: ArrayBuffer;
        origin?: string;
    };
}

/**
 * Configuration for collaboration provider
 */
export interface CollaborationConfig {
    documentId: string;
    websocketUrl: string;
    userInfo: {
        id: string;
        name: string;
        avatar: string;
        color: string;
    };
    enableAI: boolean;
}

/**
 * Collaboration context for action handlers
 */
export interface CollaborationContext {
    ydoc: Y.Doc;
    provider: WebsocketProvider;
    ytext: Y.Text;
    config: CollaborationConfig;
    connected: boolean;
    userPresence: Map<string, UserPresence>;
    onStatusChange?: (status: 'connecting' | 'connected' | 'disconnected') => void;
    onUserJoin?: (user: UserPresence) => void;
    onUserLeave?: (userId: string) => void;
    onAIStatus?: (status: AIStatusMessage['data']) => void;
}

/**
 * Resolved operation after conflict resolution
 */
export interface ResolvedOperation {
    operation: any;
    position: number;
    resolution: 'original' | 'position-adjusted' | 'content-merged' | 'skipped';
    reason?: string;
}

/**
 * Document context for AI operations
 */
export interface DocumentContext {
    fullContent: string;
    localContext: string;
    sectionContext: string;
    relatedSections: string[];
    position: number;
    timestamp: number;
}

/**
 * Insertion context for smart positioning
 */
export interface InsertionContext {
    originalPosition: number;
    surroundingText: string;
    sectionHeading?: string;
    requestType: 'continue' | 'research' | 'diagram' | 'augment';
    timestamp: number;
    documentSnapshot: Uint8Array;
}
