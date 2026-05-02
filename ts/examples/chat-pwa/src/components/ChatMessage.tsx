// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage as ChatMessageType } from "../hooks/useTypeAgent";

type Props = {
    message: ChatMessageType;
    isActiveRequest?: boolean;
};

export function ChatMessage({ message, isActiveRequest }: Props) {
    const isUser = message.role === "user";
    const showStreamingCursor = isActiveRequest && message.isStreaming;

    const renderContent = () => {
        if (isUser) {
            return <span style={{ whiteSpace: "pre-wrap" }}>{message.content}</span>;
        }

        // For assistant messages, use markdown rendering for markdown/html types or tables
        const useMarkdown =
            message.contentType === "markdown" ||
            message.contentType === "html" ||
            message.content.includes("|");

        if (useMarkdown) {
            return (
                <Markdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                        a: ({ href, children }) => (
                            <a href={href} target="_blank" rel="noopener noreferrer">
                                {children}
                            </a>
                        ),
                    }}
                >
                    {message.content}
                </Markdown>
            );
        }

        return <span style={{ whiteSpace: "pre-wrap" }}>{message.content}</span>;
    };

    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                alignItems: isUser ? "flex-end" : "flex-start",
                marginBottom: "16px",
            }}
        >
            {!isUser && message.source && (
                <div
                    style={{
                        fontSize: "12px",
                        color: "var(--muted-foreground)",
                        marginBottom: "4px",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                    }}
                >
                    {message.sourceIcon && <span>{message.sourceIcon}</span>}
                    <span>{message.source}</span>
                </div>
            )}
            <div
                style={{
                    maxWidth: "80%",
                    padding: "12px 16px",
                    borderRadius: "var(--radius)",
                    backgroundColor: isUser ? "var(--primary)" : "var(--muted)",
                    color: isUser ? "var(--primary-foreground)" : "var(--foreground)",
                    wordBreak: "break-word",
                }}
                className={isUser ? undefined : "markdown-content"}
            >
                {renderContent()}
                {showStreamingCursor && (
                    <span
                        style={{
                            display: "inline-block",
                            width: "8px",
                            height: "16px",
                            backgroundColor: "currentColor",
                            marginLeft: "2px",
                            animation: "blink 1s infinite",
                        }}
                    />
                )}
            </div>
            {message.metrics && (
                <div
                    style={{
                        fontSize: "11px",
                        color: "var(--muted-foreground)",
                        marginTop: "4px",
                    }}
                >
                    {message.metrics.duration && (
                        <span>{(message.metrics.duration / 1000).toFixed(1)}s</span>
                    )}
                    {message.metrics.tokens && (
                        <span style={{ marginLeft: "8px" }}>
                            {message.metrics.tokens.prompt + message.metrics.tokens.completion} tokens
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}
