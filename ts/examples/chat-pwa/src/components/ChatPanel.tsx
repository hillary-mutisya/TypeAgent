// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { useEffect, useRef, useState, FormEvent } from "react";
import { ChatMessage } from "./ChatMessage";
import type {
    ChatMessage as ChatMessageType,
    PendingQuestion,
} from "../hooks/useTypeAgent";
import { ConnectionState } from "../runtime/WebSocketRpcClient";

type Props = {
    messages: ChatMessageType[];
    connectionState: ConnectionState;
    isProcessing: boolean;
    pendingQuestion: PendingQuestion | null;
    error: string | null;
    onSendMessage: (text: string) => void;
    onCancelCommand: () => void;
    onAnswerQuestion: (choiceIndex: number) => void;
};

export function ChatPanel({
    messages,
    connectionState,
    isProcessing,
    pendingQuestion,
    error,
    onSendMessage,
    onCancelCommand,
    onAnswerQuestion,
}: Props) {
    const [input, setInput] = useState("");
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    useEffect(() => {
        if (!isProcessing && !pendingQuestion) {
            inputRef.current?.focus();
        }
    }, [isProcessing, pendingQuestion]);

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (input.trim() && !isProcessing) {
            onSendMessage(input.trim());
            setInput("");
        }
    };

    const isConnected = connectionState === "connected";

    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                height: "100%",
                backgroundColor: "var(--background)",
            }}
        >
            {/* Messages area */}
            <div
                style={{
                    flex: 1,
                    overflowY: "auto",
                    padding: "16px",
                }}
            >
                {messages.length === 0 && isConnected && (
                    <div
                        style={{
                            textAlign: "center",
                            color: "var(--muted-foreground)",
                            marginTop: "40px",
                        }}
                    >
                        <h2 style={{ marginBottom: "8px" }}>TypeAgent Chat</h2>
                        <p>Send a message to get started</p>
                    </div>
                )}

                {messages.map((msg, idx) => (
                    <ChatMessage
                        key={msg.id}
                        message={msg}
                        isActiveRequest={isProcessing && idx === messages.length - 1}
                    />
                ))}

                {/* Pending question */}
                {pendingQuestion && (
                    <div
                        style={{
                            backgroundColor: "var(--accent)",
                            border: "1px solid var(--border)",
                            borderRadius: "var(--radius)",
                            padding: "16px",
                            marginBottom: "16px",
                        }}
                    >
                        <p style={{ marginBottom: "12px" }}>{pendingQuestion.message}</p>
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                            {pendingQuestion.choices.map((choice, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => onAnswerQuestion(idx)}
                                    style={{
                                        padding: "8px 16px",
                                        borderRadius: "var(--radius)",
                                        border:
                                            idx === pendingQuestion.defaultId
                                                ? "2px solid var(--primary)"
                                                : "1px solid var(--border)",
                                        backgroundColor:
                                            idx === pendingQuestion.defaultId
                                                ? "var(--primary)"
                                                : "var(--background)",
                                        color:
                                            idx === pendingQuestion.defaultId
                                                ? "var(--primary-foreground)"
                                                : "var(--foreground)",
                                        cursor: "pointer",
                                    }}
                                >
                                    {choice}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Error display */}
            {error && (
                <div
                    style={{
                        padding: "8px 16px",
                        backgroundColor: "#fef2f2",
                        color: "#dc2626",
                        borderTop: "1px solid #fecaca",
                    }}
                >
                    {error}
                </div>
            )}

            {/* Input area */}
            <form
                onSubmit={handleSubmit}
                style={{
                    borderTop: "1px solid var(--border)",
                    padding: "16px",
                    display: "flex",
                    gap: "8px",
                }}
            >
                <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={
                        !isConnected
                            ? "Connecting..."
                            : isProcessing
                              ? "Processing..."
                              : "Type a message..."
                    }
                    disabled={!isConnected || isProcessing || !!pendingQuestion}
                    style={{
                        flex: 1,
                        padding: "12px 16px",
                        borderRadius: "var(--radius)",
                        border: "1px solid var(--border)",
                        fontSize: "14px",
                        outline: "none",
                    }}
                />
                {isProcessing ? (
                    <button
                        type="button"
                        onClick={onCancelCommand}
                        style={{
                            padding: "12px 24px",
                            borderRadius: "var(--radius)",
                            border: "none",
                            backgroundColor: "#dc2626",
                            color: "white",
                            cursor: "pointer",
                            fontSize: "14px",
                        }}
                    >
                        Cancel
                    </button>
                ) : (
                    <button
                        type="submit"
                        disabled={!isConnected || !input.trim() || !!pendingQuestion}
                        style={{
                            padding: "12px 24px",
                            borderRadius: "var(--radius)",
                            border: "none",
                            backgroundColor: "var(--primary)",
                            color: "var(--primary-foreground)",
                            cursor:
                                isConnected && input.trim() && !pendingQuestion
                                    ? "pointer"
                                    : "not-allowed",
                            opacity: isConnected && input.trim() && !pendingQuestion ? 1 : 0.5,
                            fontSize: "14px",
                        }}
                    >
                        Send
                    </button>
                )}
            </form>
        </div>
    );
}
