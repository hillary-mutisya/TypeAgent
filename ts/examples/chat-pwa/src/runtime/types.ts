// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// Re-define dispatcher types for browser use (avoiding Node.js dependencies)

export type RequestId = {
    connectionId?: string | undefined;
    requestId: string;
    clientRequestId?: unknown | undefined;
};

export type RequestMetrics = {
    duration?: number;
    parseMs?: number;
    dispatchMs?: number;
    actionMs?: number;
    firstResponseMs?: number;
    tokens?: {
        prompt: number;
        completion: number;
    };
};

export type MessageContent = string | string[] | string[][];

export type DisplayType = "text" | "html" | "markdown" | "iframe";

export type TypedDisplayContent = {
    type: DisplayType;
    content: MessageContent;
    kind?: "info" | "status" | "warning" | "error" | "success";
    speak?: boolean;
    alternates?: Array<{
        type: DisplayType;
        content: MessageContent;
    }>;
};

export type DisplayContent = MessageContent | TypedDisplayContent;

export type DisplayAppendMode = "inline" | "block" | "temporary";

export interface IAgentMessage {
    message: DisplayContent;
    requestId: RequestId;
    source: string;
    sourceIcon?: string | undefined;
    actionIndex?: number | undefined;
    metrics?: RequestMetrics | undefined;
}

export type PendingInteractionType = "question" | "proposeAction";

export type PendingInteractionRequest = {
    interactionId: string;
    type: PendingInteractionType;
    requestId?: RequestId;
    source: string;
    timestamp: number;
    message?: string;
    choices?: string[];
    defaultId?: number;
};

export type DisplayLogEntry =
    | {
          type: "set-display";
          seq: number;
          timestamp: number;
          message: IAgentMessage;
      }
    | {
          type: "append-display";
          seq: number;
          timestamp: number;
          message: IAgentMessage;
          mode: DisplayAppendMode;
      }
    | {
          type: "user-request";
          seq: number;
          timestamp: number;
          requestId: RequestId;
          command: string;
      }
    | {
          type: "set-display-info";
          seq: number;
          timestamp: number;
          requestId: RequestId;
          source: string;
          actionIndex?: number;
          action?: unknown;
      }
    | {
          type: "notify";
          seq: number;
          timestamp: number;
          notificationId: string | RequestId | undefined;
          event: string;
          data: unknown;
          source: string;
      }
    | {
          type: "pending-interaction";
          seq: number;
          timestamp: number;
          interactionId: string;
          interactionType: PendingInteractionType;
          requestId?: RequestId;
          source: string;
          message?: string;
          choices?: string[];
          defaultId?: number;
      }
    | {
          type: "interaction-resolved";
          seq: number;
          timestamp: number;
          interactionId: string;
          response: unknown;
      }
    | {
          type: "interaction-cancelled";
          seq: number;
          timestamp: number;
          interactionId: string;
      };

export type ConversationInfo = {
    conversationId: string;
    name: string;
    clientCount: number;
    createdAt: string;
};

export type JoinConversationResult = {
    connectionId: string;
    conversationId: string;
    name: string;
    pendingInteractions?: PendingInteractionRequest[];
};

export type DispatcherConnectOptions = {
    filter?: boolean;
    clientType?: string;
    conversationId?: string;
};

export const AgentServerChannelName = "agent-server";

export function getDispatcherChannelName(conversationId: string): string {
    return `dispatcher:${conversationId}`;
}

export function getClientIOChannelName(conversationId: string): string {
    return `clientio:${conversationId}`;
}
