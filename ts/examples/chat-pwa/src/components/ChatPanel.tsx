// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { useEffect, useRef, useState, FormEvent, useCallback } from "react";
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
    statusMessage: string | null;
    pendingQuestion: PendingQuestion | null;
    error: string | null;
    onSendMessage: (text: string) => void;
    onCancelCommand: () => void;
    onAnswerQuestion: (choiceIndex: number) => void;
    onGetCompletions: (prefix: string) => Promise<string[]>;
};

export function ChatPanel({
    messages,
    connectionState,
    isProcessing,
    statusMessage,
    pendingQuestion,
    error,
    onSendMessage,
    onCancelCommand,
    onAnswerQuestion,
    onGetCompletions,
}: Props) {
    const [input, setInput] = useState("");
    const [completions, setCompletions] = useState<string[]>([]);
    const [selectedCompletion, setSelectedCompletion] = useState(-1);
    const [showCompletions, setShowCompletions] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const completionTimeoutRef = useRef<number | null>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    useEffect(() => {
        if (!isProcessing && !pendingQuestion) {
            inputRef.current?.focus();
        }
    }, [isProcessing, pendingQuestion]);

    // Fetch completions with debouncing
    useEffect(() => {
        if (completionTimeoutRef.current) {
            clearTimeout(completionTimeoutRef.current);
        }

        // Only fetch if input starts with @ (agent commands)
        if (!input.startsWith("@") || input.length < 2) {
            setCompletions([]);
            setShowCompletions(false);
            return;
        }

        completionTimeoutRef.current = window.setTimeout(async () => {
            const results = await onGetCompletions(input);
            setCompletions(results);
            setSelectedCompletion(-1);
            setShowCompletions(results.length > 0);
        }, 150);

        return () => {
            if (completionTimeoutRef.current) {
                clearTimeout(completionTimeoutRef.current);
            }
        };
    }, [input, onGetCompletions]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (!showCompletions || completions.length === 0) return;

            if (e.key === "ArrowDown") {
                e.preventDefault();
                setSelectedCompletion((prev) =>
                    prev < completions.length - 1 ? prev + 1 : prev,
                );
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSelectedCompletion((prev) => (prev > 0 ? prev - 1 : -1));
            } else if (e.key === "Tab") {
                // Tab always selects completion if one is highlighted
                if (selectedCompletion >= 0) {
                    e.preventDefault();
                    setInput(completions[selectedCompletion] + " ");
                    setShowCompletions(false);
                    setCompletions([]);
                }
            } else if (e.key === "Enter") {
                // Enter selects completion only if one is highlighted,
                // otherwise let the form submit naturally
                if (selectedCompletion >= 0) {
                    e.preventDefault();
                    setInput(completions[selectedCompletion] + " ");
                    setShowCompletions(false);
                    setCompletions([]);
                } else {
                    // No completion selected - close dropdown and let form submit
                    setShowCompletions(false);
                    setCompletions([]);
                }
            } else if (e.key === "Escape") {
                setShowCompletions(false);
            }
        },
        [showCompletions, completions, selectedCompletion],
    );

    const selectCompletion = useCallback((completion: string) => {
        setInput(completion + " ");
        setShowCompletions(false);
        setCompletions([]);
        inputRef.current?.focus();
    }, []);

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (input.trim() && !isProcessing) {
            onSendMessage(input.trim());
            setInput("");
            setCompletions([]);
            setShowCompletions(false);
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
                    padding: "24px",
                }}
            >
                {messages.length === 0 && isConnected && (
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            height: "100%",
                            color: "var(--muted-foreground)",
                            textAlign: "center",
                        }}
                    >
                        <div
                            style={{
                                width: "48px",
                                height: "48px",
                                borderRadius: "var(--radius-lg)",
                                backgroundColor: "var(--muted)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                marginBottom: "16px",
                                fontSize: "24px",
                            }}
                        >
                            TA
                        </div>
                        <h2
                            style={{
                                marginBottom: "8px",
                                fontSize: "18px",
                                fontWeight: 600,
                                color: "var(--foreground)",
                            }}
                        >
                            TypeAgent Chat
                        </h2>
                        <p style={{ fontSize: "14px", maxWidth: "300px", lineHeight: 1.5 }}>
                            Send a message to get started. Use @ for agent commands.
                        </p>
                    </div>
                )}

                {messages.map((msg, idx) => (
                    <ChatMessage
                        key={msg.id}
                        message={msg}
                        isActiveRequest={isProcessing && idx === messages.length - 1}
                    />
                ))}

                {/* Status message */}
                {statusMessage && (
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                            padding: "12px 16px",
                            color: "var(--muted-foreground)",
                            fontSize: "13px",
                            backgroundColor: "var(--muted)",
                            borderRadius: "var(--radius)",
                            marginBottom: "16px",
                        }}
                    >
                        <span
                            style={{
                                display: "inline-block",
                                width: "14px",
                                height: "14px",
                                border: "2px solid var(--primary)",
                                borderTopColor: "transparent",
                                borderRadius: "50%",
                                animation: "spin 0.8s linear infinite",
                            }}
                        />
                        <span style={{ fontWeight: 500 }}>{statusMessage}</span>
                    </div>
                )}

                {/* Pending question */}
                {pendingQuestion && (
                    <div
                        style={{
                            backgroundColor: "var(--accent)",
                            border: "1px solid var(--primary)",
                            borderRadius: "var(--radius)",
                            padding: "16px",
                            marginBottom: "16px",
                            boxShadow: "0 2px 8px rgba(0, 120, 212, 0.15)",
                        }}
                    >
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                                marginBottom: "12px",
                                color: "var(--primary)",
                                fontSize: "12px",
                                fontWeight: 600,
                                textTransform: "uppercase",
                                letterSpacing: "0.5px",
                            }}
                        >
                            <span>?</span>
                            <span>{pendingQuestion.source}</span>
                        </div>
                        <p style={{ marginBottom: "16px", fontSize: "15px", lineHeight: 1.5 }}>
                            {pendingQuestion.message}
                        </p>
                        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                            {pendingQuestion.choices.map((choice, idx) => {
                                const isDefault = idx === pendingQuestion.defaultId;
                                return (
                                    <button
                                        key={idx}
                                        onClick={() => onAnswerQuestion(idx)}
                                        style={{
                                            padding: "10px 20px",
                                            borderRadius: "var(--radius)",
                                            border: isDefault
                                                ? "2px solid var(--primary)"
                                                : "1px solid var(--border)",
                                            backgroundColor: isDefault
                                                ? "var(--primary)"
                                                : "var(--background)",
                                            color: isDefault
                                                ? "var(--primary-foreground)"
                                                : "var(--foreground)",
                                            cursor: "pointer",
                                            fontSize: "14px",
                                            fontWeight: isDefault ? 600 : 400,
                                            transition: "all 0.15s ease",
                                            minWidth: "80px",
                                        }}
                                        onMouseOver={(e) => {
                                            if (!isDefault) {
                                                e.currentTarget.style.backgroundColor =
                                                    "var(--muted)";
                                                e.currentTarget.style.borderColor =
                                                    "var(--primary)";
                                            }
                                        }}
                                        onMouseOut={(e) => {
                                            if (!isDefault) {
                                                e.currentTarget.style.backgroundColor =
                                                    "var(--background)";
                                                e.currentTarget.style.borderColor =
                                                    "var(--border)";
                                            }
                                        }}
                                    >
                                        {choice}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Error display */}
            {error && (
                <div
                    style={{
                        padding: "12px 24px",
                        backgroundColor: "rgba(239, 68, 68, 0.1)",
                        color: "var(--error)",
                        borderTop: "1px solid rgba(239, 68, 68, 0.2)",
                        fontSize: "13px",
                        fontWeight: 500,
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
                    padding: "16px 24px",
                    display: "flex",
                    gap: "12px",
                    position: "relative",
                    backgroundColor: "var(--background)",
                }}
            >
                <div style={{ flex: 1, position: "relative" }}>
                    <input
                        ref={inputRef}
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onBlur={() => setTimeout(() => setShowCompletions(false), 150)}
                        placeholder={
                            !isConnected
                                ? "Connecting..."
                                : isProcessing
                                  ? "Processing..."
                                  : "Type a message... (use @ for commands)"
                        }
                        disabled={!isConnected || isProcessing || !!pendingQuestion}
                        style={{
                            width: "100%",
                            padding: "12px 16px",
                            borderRadius: "var(--radius-lg)",
                            border: "1px solid var(--border)",
                            fontSize: "14px",
                            outline: "none",
                            backgroundColor: "var(--muted)",
                            transition: "all 0.15s",
                        }}
                        onFocus={(e) => {
                            e.currentTarget.style.borderColor = "var(--primary)";
                            e.currentTarget.style.backgroundColor = "var(--background)";
                            e.currentTarget.style.boxShadow = "0 0 0 3px rgba(37, 99, 235, 0.1)";
                        }}
                        onBlurCapture={(e) => {
                            e.currentTarget.style.borderColor = "var(--border)";
                            e.currentTarget.style.backgroundColor = "var(--muted)";
                            e.currentTarget.style.boxShadow = "none";
                        }}
                    />

                    {/* Completions dropdown */}
                    {showCompletions && completions.length > 0 && (
                        <div
                            style={{
                                position: "absolute",
                                bottom: "100%",
                                left: 0,
                                right: 0,
                                marginBottom: "8px",
                                backgroundColor: "var(--background)",
                                border: "1px solid var(--border)",
                                borderRadius: "var(--radius-lg)",
                                boxShadow: "var(--shadow-lg)",
                                maxHeight: "220px",
                                overflowY: "auto",
                                zIndex: 100,
                            }}
                        >
                            {completions.map((completion, idx) => (
                                <div
                                    key={completion}
                                    onClick={() => selectCompletion(completion)}
                                    style={{
                                        padding: "10px 14px",
                                        cursor: "pointer",
                                        backgroundColor:
                                            idx === selectedCompletion
                                                ? "var(--muted)"
                                                : "transparent",
                                        fontSize: "13px",
                                        fontFamily: "monospace",
                                        color:
                                            idx === selectedCompletion
                                                ? "var(--primary)"
                                                : "var(--foreground)",
                                        transition: "all 0.1s",
                                    }}
                                    onMouseEnter={() => setSelectedCompletion(idx)}
                                >
                                    {completion}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                {isProcessing ? (
                    <button
                        type="button"
                        onClick={onCancelCommand}
                        style={{
                            padding: "12px 20px",
                            borderRadius: "var(--radius-lg)",
                            border: "none",
                            backgroundColor: "var(--error)",
                            color: "white",
                            cursor: "pointer",
                            fontSize: "14px",
                            fontWeight: 500,
                            transition: "all 0.15s",
                        }}
                    >
                        Cancel
                    </button>
                ) : (
                    <button
                        type="submit"
                        disabled={!isConnected || !input.trim() || !!pendingQuestion}
                        style={{
                            padding: "12px 20px",
                            borderRadius: "var(--radius-lg)",
                            border: "none",
                            backgroundColor: "var(--primary)",
                            color: "var(--primary-foreground)",
                            cursor:
                                isConnected && input.trim() && !pendingQuestion
                                    ? "pointer"
                                    : "not-allowed",
                            opacity: isConnected && input.trim() && !pendingQuestion ? 1 : 0.5,
                            fontSize: "14px",
                            fontWeight: 500,
                            transition: "all 0.15s",
                        }}
                    >
                        Send
                    </button>
                )}
            </form>
        </div>
    );
}
