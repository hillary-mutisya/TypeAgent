// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { useCallback, useEffect, useRef, useState } from "react";
import { TypeAgentConnection, ClientIOCallbacks } from "../runtime/TypeAgentConnection";
import { ConnectionState } from "../runtime/WebSocketRpcClient";
import {
    ConversationInfo,
    DisplayAppendMode,
    DisplayContent,
    DisplayType,
    IAgentMessage,
    MessageContent,
    PendingInteractionRequest,
    TypedDisplayContent,
} from "../runtime/types";

export type ChatMessage = {
    id: string;
    role: "user" | "assistant";
    content: string;
    contentType: DisplayType;
    source?: string;
    sourceIcon?: string;
    timestamp: number;
    isStreaming?: boolean;
    metrics?: {
        duration?: number;
        tokens?: { prompt: number; completion: number };
    };
};

export type PendingQuestion = {
    interactionId: string;
    message: string;
    choices: string[];
    defaultId?: number;
    source: string;
};

function stripAnsi(text: string): string {
    return text.replace(/\x1b\[[0-9;]*m/g, "");
}

function isTypedContent(content: DisplayContent): content is TypedDisplayContent {
    return typeof content === "object" && !Array.isArray(content) && "type" in content;
}

function messageContentToString(content: MessageContent): string {
    if (typeof content === "string") {
        return content;
    }
    if (Array.isArray(content)) {
        if (content.length > 0 && Array.isArray(content[0])) {
            // string[][] - table format, convert to markdown table
            const table = content as string[][];
            if (table.length === 0) return "";
            const header = table[0];
            const separator = header.map(() => "---");
            const rows = table.slice(1);
            return [
                "| " + header.map((c) => stripAnsi(c)).join(" | ") + " |",
                "| " + separator.join(" | ") + " |",
                ...rows.map((row) => "| " + row.map((c) => stripAnsi(c)).join(" | ") + " |"),
            ].join("\n");
        }
        // string[] - join with newlines
        return (content as string[]).join("\n");
    }
    return "";
}

function extractContent(content: DisplayContent): { text: string; type: DisplayType } {
    if (isTypedContent(content)) {
        const text = messageContentToString(content.content);
        // For text type, strip ANSI; for markdown/html, preserve (ANSI already stripped in table conversion)
        return {
            text: content.type === "text" ? stripAnsi(text) : text,
            type: content.type,
        };
    }
    // Raw MessageContent - treat as text
    const text = messageContentToString(content);
    return { text: stripAnsi(text), type: "text" };
}

export function useTypeAgent(serverUrl: string = "ws://localhost:8999") {
    const connectionRef = useRef<TypeAgentConnection | null>(null);
    const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [conversations, setConversations] = useState<ConversationInfo[]>([]);
    const [currentConversation, setCurrentConversation] = useState<{
        id: string;
        name: string;
    } | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [pendingQuestion, setPendingQuestion] = useState<PendingQuestion | null>(null);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const currentRequestIdRef = useRef<string | null>(null);

    const getConnection = useCallback(() => {
        if (!connectionRef.current) {
            connectionRef.current = new TypeAgentConnection(serverUrl);
        }
        return connectionRef.current;
    }, [serverUrl]);

    const handleSetDisplay = useCallback((message: IAgentMessage) => {
        const { text, type } = extractContent(message.message);
        const msgId = message.requestId.requestId;

        // Clear status message when real content arrives
        setStatusMessage(null);

        setMessages((prev) => {
            // Find existing message with same requestId
            const existingIdx = prev.findIndex(
                (m) => m.role === "assistant" && m.id === msgId,
            );

            const newMessage: ChatMessage = {
                id: msgId,
                role: "assistant",
                content: text,
                contentType: type,
                source: message.source,
                sourceIcon: message.sourceIcon,
                timestamp: Date.now(),
                isStreaming: false,
                metrics: message.metrics
                    ? {
                          duration: message.metrics.duration,
                          tokens: message.metrics.tokens,
                      }
                    : undefined,
            };

            if (existingIdx >= 0) {
                const updated = [...prev];
                updated[existingIdx] = newMessage;
                return updated;
            }

            return [...prev, newMessage];
        });

        setIsProcessing(false);
    }, []);

    const handleAppendDisplay = useCallback(
        (message: IAgentMessage, mode: DisplayAppendMode) => {
            const { text } = extractContent(message.message);
            const msgId = message.requestId.requestId;

            if (mode === "temporary") {
                // Show temporary messages as status indicators
                setStatusMessage(text);
                return;
            }

            // Clear status when non-temporary content arrives
            setStatusMessage(null);

            const { type } = extractContent(message.message);

            setMessages((prev) => {
                const existingIdx = prev.findIndex(
                    (m) => m.role === "assistant" && m.id === msgId,
                );

                if (existingIdx >= 0) {
                    const updated = [...prev];
                    const existing = updated[existingIdx];
                    updated[existingIdx] = {
                        ...existing,
                        content:
                            mode === "inline"
                                ? existing.content + text
                                : existing.content + "\n" + text,
                        contentType: type,
                        isStreaming: true,
                    };
                    return updated;
                }

                return [
                    ...prev,
                    {
                        id: msgId,
                        role: "assistant",
                        content: text,
                        contentType: type,
                        source: message.source,
                        sourceIcon: message.sourceIcon,
                        timestamp: Date.now(),
                        isStreaming: true,
                    },
                ];
            });
        },
        [],
    );

    const handleRequestInteraction = useCallback((interaction: PendingInteractionRequest) => {
        if (interaction.type === "question" && interaction.message && interaction.choices) {
            setPendingQuestion({
                interactionId: interaction.interactionId,
                message: interaction.message,
                choices: interaction.choices,
                defaultId: interaction.defaultId,
                source: interaction.source,
            });
        }
    }, []);

    const handleInteractionResolved = useCallback(() => {
        setPendingQuestion(null);
    }, []);

    const createClientIOCallbacks = useCallback((): ClientIOCallbacks => {
        return {
            onSetDisplay: handleSetDisplay,
            onAppendDisplay: handleAppendDisplay,
            onRequestInteraction: handleRequestInteraction,
            onInteractionResolved: handleInteractionResolved,
            onInteractionCancelled: handleInteractionResolved,
        };
    }, [handleSetDisplay, handleAppendDisplay, handleRequestInteraction, handleInteractionResolved]);

    const connect = useCallback(async () => {
        try {
            setError(null);

            const currentState = connectionRef.current?.connectionState;

            // If already connected or connecting, skip creation
            if (currentState === "connected" || currentState === "connecting") {
                // Still wait for connection if connecting
                if (currentState === "connecting") {
                    await connectionRef.current!.connect();
                }
                return;
            }

            // Create fresh connection if needed
            if (!connectionRef.current || currentState === "disconnected") {
                connectionRef.current = new TypeAgentConnection(serverUrl);
            }

            const conn = connectionRef.current;
            conn.onStateChange(setConnectionState);

            await conn.connect();

            // Join default conversation
            const result = await conn.joinConversation(createClientIOCallbacks(), {
                clientType: "pwa",
            });

            setCurrentConversation({
                id: result.conversationId,
                name: result.name,
            });

            // Load history
            const history = await conn.getDisplayHistory();
            const loadedMessages: ChatMessage[] = [];

            for (const entry of history) {
                if (entry.type === "user-request") {
                    loadedMessages.push({
                        id: entry.requestId.requestId + "-user",
                        role: "user",
                        content: entry.command,
                        contentType: "text",
                        timestamp: entry.timestamp,
                    });
                } else if (entry.type === "set-display") {
                    const { text, type } = extractContent(entry.message.message);
                    const msgId = entry.message.requestId.requestId;
                    const existingIdx = loadedMessages.findIndex(
                        (m) => m.role === "assistant" && m.id === msgId,
                    );
                    const newMsg: ChatMessage = {
                        id: msgId,
                        role: "assistant",
                        content: text,
                        contentType: type,
                        source: entry.message.source,
                        sourceIcon: entry.message.sourceIcon,
                        timestamp: entry.timestamp,
                        metrics: entry.message.metrics
                            ? {
                                  duration: entry.message.metrics.duration,
                                  tokens: entry.message.metrics.tokens,
                              }
                            : undefined,
                    };
                    if (existingIdx >= 0) {
                        loadedMessages[existingIdx] = newMsg;
                    } else {
                        loadedMessages.push(newMsg);
                    }
                } else if (entry.type === "append-display") {
                    const { text, type } = extractContent(entry.message.message);
                    const msgId = entry.message.requestId.requestId;
                    const existingIdx = loadedMessages.findIndex(
                        (m) => m.role === "assistant" && m.id === msgId,
                    );
                    if (existingIdx >= 0) {
                        const existing = loadedMessages[existingIdx];
                        loadedMessages[existingIdx] = {
                            ...existing,
                            content:
                                entry.mode === "inline"
                                    ? existing.content + text
                                    : existing.content + "\n" + text,
                            contentType: type,
                        };
                    } else {
                        loadedMessages.push({
                            id: msgId,
                            role: "assistant",
                            content: text,
                            contentType: type,
                            source: entry.message.source,
                            sourceIcon: entry.message.sourceIcon,
                            timestamp: entry.timestamp,
                        });
                    }
                }
            }

            setMessages(loadedMessages);

            // Handle pending interactions
            if (result.pendingInteractions?.length) {
                const question = result.pendingInteractions.find((i) => i.type === "question");
                if (question && question.message && question.choices) {
                    setPendingQuestion({
                        interactionId: question.interactionId,
                        message: question.message,
                        choices: question.choices,
                        defaultId: question.defaultId,
                        source: question.source,
                    });
                }
            }

            // Load conversation list
            const convos = await conn.listConversations();
            setConversations(convos);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Connection failed");
            console.error("Connection error:", e);
        }
    }, [getConnection, createClientIOCallbacks]);

    const sendMessage = useCallback(
        async (text: string) => {
            const conn = connectionRef.current;
            if (!conn || connectionState !== "connected") {
                setError("Not connected");
                return;
            }

            const requestId = crypto.randomUUID();
            currentRequestIdRef.current = requestId;

            // Add user message immediately
            setMessages((prev) => [
                ...prev,
                {
                    id: requestId + "-user",
                    role: "user",
                    content: text,
                    contentType: "text",
                    timestamp: Date.now(),
                },
            ]);

            setIsProcessing(true);
            setStatusMessage(null);
            setError(null);

            try {
                await conn.processCommand(text, requestId);
            } catch (e) {
                setError(e instanceof Error ? e.message : "Command failed");
            } finally {
                setIsProcessing(false);
                setStatusMessage(null);
                currentRequestIdRef.current = null;
            }
        },
        [connectionState],
    );

    const cancelCommand = useCallback(() => {
        const conn = connectionRef.current;
        if (conn && currentRequestIdRef.current) {
            conn.cancelCommand(currentRequestIdRef.current);
            setIsProcessing(false);
        }
    }, []);

    const answerQuestion = useCallback(
        async (choiceIndex: number) => {
            const conn = connectionRef.current;
            if (!conn || !pendingQuestion) return;

            try {
                await conn.respondToInteraction(pendingQuestion.interactionId, choiceIndex);
                setPendingQuestion(null);
            } catch (e) {
                setError(e instanceof Error ? e.message : "Failed to respond");
            }
        },
        [pendingQuestion],
    );

    const switchConversation = useCallback(
        async (conversationId: string) => {
            const conn = connectionRef.current;
            if (!conn) return;

            try {
                setMessages([]);
                setPendingQuestion(null);

                const result = await conn.joinConversation(createClientIOCallbacks(), {
                    conversationId,
                    clientType: "pwa",
                });

                setCurrentConversation({
                    id: result.conversationId,
                    name: result.name,
                });

                // Load history
                const history = await conn.getDisplayHistory();
                const loadedMessages: ChatMessage[] = [];

                for (const entry of history) {
                    if (entry.type === "user-request") {
                        loadedMessages.push({
                            id: entry.requestId.requestId + "-user",
                            role: "user",
                            content: entry.command,
                            contentType: "text",
                            timestamp: entry.timestamp,
                        });
                    } else if (entry.type === "set-display") {
                        const { text, type } = extractContent(entry.message.message);
                        const msgId = entry.message.requestId.requestId;
                        const existingIdx = loadedMessages.findIndex(
                            (m) => m.role === "assistant" && m.id === msgId,
                        );
                        const newMsg: ChatMessage = {
                            id: msgId,
                            role: "assistant",
                            content: text,
                            contentType: type,
                            source: entry.message.source,
                            sourceIcon: entry.message.sourceIcon,
                            timestamp: entry.timestamp,
                        };
                        if (existingIdx >= 0) {
                            loadedMessages[existingIdx] = newMsg;
                        } else {
                            loadedMessages.push(newMsg);
                        }
                    } else if (entry.type === "append-display") {
                        const { text, type } = extractContent(entry.message.message);
                        const msgId = entry.message.requestId.requestId;
                        const existingIdx = loadedMessages.findIndex(
                            (m) => m.role === "assistant" && m.id === msgId,
                        );
                        if (existingIdx >= 0) {
                            const existing = loadedMessages[existingIdx];
                            loadedMessages[existingIdx] = {
                                ...existing,
                                content:
                                    entry.mode === "inline"
                                        ? existing.content + text
                                        : existing.content + "\n" + text,
                                contentType: type,
                            };
                        } else {
                            loadedMessages.push({
                                id: msgId,
                                role: "assistant",
                                content: text,
                                contentType: type,
                                source: entry.message.source,
                                sourceIcon: entry.message.sourceIcon,
                                timestamp: entry.timestamp,
                            });
                        }
                    }
                }

                setMessages(loadedMessages);

                // Handle pending interactions
                if (result.pendingInteractions?.length) {
                    const question = result.pendingInteractions.find((i) => i.type === "question");
                    if (question && question.message && question.choices) {
                        setPendingQuestion({
                            interactionId: question.interactionId,
                            message: question.message,
                            choices: question.choices,
                            defaultId: question.defaultId,
                            source: question.source,
                        });
                    }
                }
            } catch (e) {
                setError(e instanceof Error ? e.message : "Failed to switch conversation");
            }
        },
        [createClientIOCallbacks],
    );

    const createConversation = useCallback(async (name: string) => {
        const conn = connectionRef.current;
        if (!conn) return;

        try {
            const info = await conn.createConversation(name);
            const convos = await conn.listConversations();
            setConversations(convos);
            return info;
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to create conversation");
        }
    }, []);

    const refreshConversations = useCallback(async () => {
        const conn = connectionRef.current;
        if (!conn) return;

        try {
            const convos = await conn.listConversations();
            setConversations(convos);
        } catch (e) {
            console.error("Failed to refresh conversations:", e);
        }
    }, []);

    const getCompletions = useCallback(async (prefix: string): Promise<string[]> => {
        const conn = connectionRef.current;
        if (!conn || connectionState !== "connected") return [];

        try {
            return await conn.getCommandCompletion(prefix);
        } catch (e) {
            console.error("Failed to get completions:", e);
            return [];
        }
    }, [connectionState]);

    // Only close on actual unmount, not React StrictMode double-render
    useEffect(() => {
        const connection = connectionRef.current;
        return () => {
            // Check if we're actually unmounting (connection exists and is the same)
            if (connection && connectionRef.current === connection) {
                connection.close();
                connectionRef.current = null;
            }
        };
    }, []);

    return {
        connectionState,
        messages,
        conversations,
        currentConversation,
        isProcessing,
        statusMessage,
        pendingQuestion,
        error,
        connect,
        sendMessage,
        cancelCommand,
        answerQuestion,
        switchConversation,
        createConversation,
        refreshConversations,
        getCompletions,
    };
}
