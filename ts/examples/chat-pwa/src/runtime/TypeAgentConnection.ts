// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { WebSocketRpcClient, ConnectionState } from "./WebSocketRpcClient";
import {
    AgentServerChannelName,
    ConversationInfo,
    DisplayLogEntry,
    DispatcherConnectOptions,
    getClientIOChannelName,
    getDispatcherChannelName,
    IAgentMessage,
    JoinConversationResult,
    DisplayAppendMode,
    PendingInteractionRequest,
    RequestId,
} from "./types";

export type ClientIOCallbacks = {
    onSetDisplay?: (message: IAgentMessage) => void;
    onAppendDisplay?: (message: IAgentMessage, mode: DisplayAppendMode) => void;
    onSetUserRequest?: (requestId: RequestId, command: string) => void;
    onClear?: (requestId: RequestId) => void;
    onRequestInteraction?: (interaction: PendingInteractionRequest) => void;
    onInteractionResolved?: (interactionId: string, response: unknown) => void;
    onInteractionCancelled?: (interactionId: string) => void;
};

export class TypeAgentConnection {
    private rpc: WebSocketRpcClient;
    private currentConversationId: string | null = null;
    private cleanupHandlers: (() => void)[] = [];

    constructor(url: string = "ws://localhost:8999") {
        this.rpc = new WebSocketRpcClient(url);
    }

    get connectionState(): ConnectionState {
        return this.rpc.state;
    }

    onStateChange(listener: (state: ConnectionState) => void): () => void {
        return this.rpc.onStateChange(listener);
    }

    async connect(): Promise<void> {
        await this.rpc.connect();
    }

    async joinConversation(
        callbacks: ClientIOCallbacks,
        options?: DispatcherConnectOptions,
    ): Promise<JoinConversationResult> {
        // Clean up previous conversation handlers
        this.cleanupHandlers.forEach((cleanup) => cleanup());
        this.cleanupHandlers = [];

        const result = await this.rpc.invoke<JoinConversationResult>(
            AgentServerChannelName,
            "joinConversation",
            options ?? {},
        );

        this.currentConversationId = result.conversationId;
        const clientIOChannel = getClientIOChannelName(result.conversationId);

        // Register ClientIO callbacks
        if (callbacks.onSetDisplay) {
            this.cleanupHandlers.push(
                this.rpc.onCall(clientIOChannel, "setDisplay", (message: unknown) => {
                    callbacks.onSetDisplay!(message as IAgentMessage);
                }),
            );
        }

        if (callbacks.onAppendDisplay) {
            this.cleanupHandlers.push(
                this.rpc.onCall(
                    clientIOChannel,
                    "appendDisplay",
                    (message: unknown, mode: unknown) => {
                        callbacks.onAppendDisplay!(
                            message as IAgentMessage,
                            mode as DisplayAppendMode,
                        );
                    },
                ),
            );
        }

        if (callbacks.onSetUserRequest) {
            this.cleanupHandlers.push(
                this.rpc.onCall(
                    clientIOChannel,
                    "setUserRequest",
                    (requestId: unknown, command: unknown) => {
                        callbacks.onSetUserRequest!(requestId as RequestId, command as string);
                    },
                ),
            );
        }

        if (callbacks.onClear) {
            this.cleanupHandlers.push(
                this.rpc.onCall(clientIOChannel, "clear", (requestId: unknown) => {
                    callbacks.onClear!(requestId as RequestId);
                }),
            );
        }

        if (callbacks.onRequestInteraction) {
            this.cleanupHandlers.push(
                this.rpc.onCall(
                    clientIOChannel,
                    "requestInteraction",
                    (interaction: unknown) => {
                        callbacks.onRequestInteraction!(interaction as PendingInteractionRequest);
                    },
                ),
            );
        }

        if (callbacks.onInteractionResolved) {
            this.cleanupHandlers.push(
                this.rpc.onCall(
                    clientIOChannel,
                    "interactionResolved",
                    (interactionId: unknown, response: unknown) => {
                        callbacks.onInteractionResolved!(interactionId as string, response);
                    },
                ),
            );
        }

        if (callbacks.onInteractionCancelled) {
            this.cleanupHandlers.push(
                this.rpc.onCall(
                    clientIOChannel,
                    "interactionCancelled",
                    (interactionId: unknown) => {
                        callbacks.onInteractionCancelled!(interactionId as string);
                    },
                ),
            );
        }

        return result;
    }

    async leaveConversation(conversationId?: string): Promise<void> {
        const id = conversationId ?? this.currentConversationId;
        if (!id) return;

        await this.rpc.invoke<void>(AgentServerChannelName, "leaveConversation", id);

        if (id === this.currentConversationId) {
            this.currentConversationId = null;
            this.cleanupHandlers.forEach((cleanup) => cleanup());
            this.cleanupHandlers = [];
        }
    }

    async listConversations(nameFilter?: string): Promise<ConversationInfo[]> {
        return this.rpc.invoke<ConversationInfo[]>(
            AgentServerChannelName,
            "listConversations",
            nameFilter,
        );
    }

    async createConversation(name: string): Promise<ConversationInfo> {
        return this.rpc.invoke<ConversationInfo>(
            AgentServerChannelName,
            "createConversation",
            name,
        );
    }

    async renameConversation(conversationId: string, newName: string): Promise<void> {
        return this.rpc.invoke<void>(
            AgentServerChannelName,
            "renameConversation",
            conversationId,
            newName,
        );
    }

    async deleteConversation(conversationId: string): Promise<void> {
        return this.rpc.invoke<void>(
            AgentServerChannelName,
            "deleteConversation",
            conversationId,
        );
    }

    async processCommand(
        command: string,
        clientRequestId?: string,
        attachments?: string[],
    ): Promise<unknown> {
        if (!this.currentConversationId) {
            throw new Error("Not connected to a conversation");
        }

        const dispatcherChannel = getDispatcherChannelName(this.currentConversationId);
        return this.rpc.invoke(
            dispatcherChannel,
            "processCommand",
            command,
            clientRequestId,
            attachments,
        );
    }

    cancelCommand(requestId: string): void {
        if (!this.currentConversationId) return;

        const dispatcherChannel = getDispatcherChannelName(this.currentConversationId);
        this.rpc.call(dispatcherChannel, "cancelCommand", requestId);
    }

    async getDisplayHistory(afterSeq?: number): Promise<DisplayLogEntry[]> {
        if (!this.currentConversationId) {
            throw new Error("Not connected to a conversation");
        }

        const dispatcherChannel = getDispatcherChannelName(this.currentConversationId);
        return this.rpc.invoke<DisplayLogEntry[]>(
            dispatcherChannel,
            "getDisplayHistory",
            afterSeq,
        );
    }

    async respondToInteraction(interactionId: string, value: unknown): Promise<void> {
        if (!this.currentConversationId) {
            throw new Error("Not connected to a conversation");
        }

        const dispatcherChannel = getDispatcherChannelName(this.currentConversationId);
        return this.rpc.invoke<void>(dispatcherChannel, "respondToInteraction", {
            interactionId,
            value,
        });
    }

    async getCommandCompletion(prefix: string): Promise<string[]> {
        if (!this.currentConversationId) {
            throw new Error("Not connected to a conversation");
        }

        const dispatcherChannel = getDispatcherChannelName(this.currentConversationId);

        // API returns CommandCompletionResult with completions: CompletionGroup[]
        // Each CompletionGroup has { name, completions: string[], ... }
        type CompletionGroup = {
            name: string;
            completions: string[];
        };
        type CommandCompletionResult = {
            startIndex: number;
            completions: CompletionGroup[];
        };

        const result = await this.rpc.invoke<CommandCompletionResult>(
            dispatcherChannel,
            "getCommandCompletion",
            prefix,
            "forward", // direction parameter
        );

        // Flatten all completion groups into a single array of strings
        const allCompletions: string[] = [];
        if (result.completions) {
            for (const group of result.completions) {
                if (group.completions) {
                    // Prepend the prefix up to startIndex with each completion
                    const prefixPart = prefix.slice(0, result.startIndex);
                    for (const completion of group.completions) {
                        allCompletions.push(prefixPart + completion);
                    }
                }
            }
        }
        return allCompletions;
    }

    get conversationId(): string | null {
        return this.currentConversationId;
    }

    close(): void {
        this.cleanupHandlers.forEach((cleanup) => cleanup());
        this.cleanupHandlers = [];
        this.rpc.close();
    }
}
