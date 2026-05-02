// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { useMemo } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage as ChatMessageType } from "../hooks/useTypeAgent";
import { ThinkingBlock } from "./ThinkingBlock";
import { ToolCallBlock } from "./ToolCallBlock";

type ContentPart =
    | { type: "text"; content: string }
    | { type: "thinking"; content: string }
    | { type: "tool"; toolName: string; input?: string; output?: string };

// Known tool names that should be rendered as tool blocks
const KNOWN_TOOLS = [
    "ToolSearch",
    "discover_actions",
    "execute_action",
    "Read",
    "Write",
    "Edit",
    "Bash",
    "Glob",
    "Grep",
    "WebFetch",
    "WebSearch",
];

function parseToolCalls(text: string): ContentPart[] {
    const parts: ContentPart[] = [];

    // Match patterns:
    // 1. **Tool:** ToolName ... (with optional **Tool:** prefix)
    // 2. ToolName `{ ... }` **↳** `result` (tool with input and output)
    // 3. ToolName — description **↳** `result` (tool with description and output)
    const lines = text.split("\n");
    let currentToolLines: string[] = [];
    let currentToolName: string | null = null;
    let nonToolLines: string[] = [];

    const flushTool = () => {
        if (currentToolName && currentToolLines.length > 0) {
            const fullContent = currentToolLines.join("\n");

            // Extract input (content in braces or backticks before ↳)
            let input: string | undefined;
            let output: string | undefined;

            // Look for { ... } or `{ ... }` pattern for input
            const inputMatch = fullContent.match(/[`{]([^`}]*)[`}]/);
            if (inputMatch) {
                input = inputMatch[1].trim();
            }

            // Look for ↳ pattern for output (everything after it)
            // Handle both ↳ and **↳** patterns
            const outputMatch = fullContent.match(/(?:\*\*)?↳(?:\*\*)?\s*[`]?([^`\n]*)[`]?/);
            if (outputMatch) {
                output = outputMatch[1].trim();
            }

            // If no structured output found, use content after — as description
            if (!output) {
                const descMatch = fullContent.match(/—\s*(.+)/);
                if (descMatch) {
                    output = descMatch[1].trim();
                }
            }

            parts.push({ type: "tool", toolName: currentToolName, input, output });
            currentToolLines = [];
            currentToolName = null;
        }
    };

    const flushText = () => {
        if (nonToolLines.length > 0) {
            const content = nonToolLines.join("\n").trim();
            if (content) {
                parts.push({ type: "text", content });
            }
            nonToolLines = [];
        }
    };

    for (const line of lines) {
        const trimmedLine = line.trim();

        // Check if line starts a tool call
        // Pattern: **Tool:** ToolName or just ToolName at start
        const toolStartMatch = trimmedLine.match(
            /^(?:\*\*Tool:\*\*\s*)?(\w+)(?:\s+[`{—]|\s*$)/,
        );

        if (toolStartMatch && KNOWN_TOOLS.includes(toolStartMatch[1])) {
            // Flush previous content
            flushText();
            flushTool();

            // Start new tool
            currentToolName = toolStartMatch[1];
            currentToolLines = [trimmedLine.replace(/^\*\*Tool:\*\*\s*/, "")];
        } else if (currentToolName) {
            // Continue current tool if line contains tool-related content
            if (trimmedLine.match(/^[↳**↳**]/) || trimmedLine.match(/^[`{]/)) {
                currentToolLines.push(trimmedLine);
            } else {
                // End tool and start text
                flushTool();
                nonToolLines.push(line);
            }
        } else {
            nonToolLines.push(line);
        }
    }

    // Flush remaining content
    flushText();
    flushTool();

    return parts.length > 0 ? parts : [{ type: "text", content: text }];
}

function parseContent(content: string): ContentPart[] {
    const parts: ContentPart[] = [];

    // Match <details class="reasoning-thinking">...<pre>CONTENT</pre>...</details>
    const thinkingRegex =
        /<details\s+class="reasoning-thinking"[^>]*>.*?<pre>([\s\S]*?)<\/pre>.*?<\/details>/gi;

    let lastIndex = 0;
    let match;

    while ((match = thinkingRegex.exec(content)) !== null) {
        // Add text before this thinking block (parse for tool calls)
        if (match.index > lastIndex) {
            const textBefore = content.slice(lastIndex, match.index).trim();
            if (textBefore) {
                parts.push(...parseToolCalls(textBefore));
            }
        }

        // Add thinking block
        parts.push({ type: "thinking", content: match[1].trim() });
        lastIndex = match.index + match[0].length;
    }

    // Add remaining text after last thinking block (parse for tool calls)
    if (lastIndex < content.length) {
        const textAfter = content.slice(lastIndex).trim();
        if (textAfter) {
            parts.push(...parseToolCalls(textAfter));
        }
    }

    // If no thinking blocks found, parse entire content for tool calls
    if (parts.length === 0) {
        return parseToolCalls(content);
    }

    return parts;
}

type Props = {
    message: ChatMessageType;
    isActiveRequest?: boolean;
};

export function ChatMessage({ message, isActiveRequest }: Props) {
    const isUser = message.role === "user";
    const showStreamingCursor = isActiveRequest && message.isStreaming;

    const contentParts = useMemo(() => {
        if (isUser) return [{ type: "text" as const, content: message.content }];
        return parseContent(message.content);
    }, [message.content, isUser]);

    const renderTextContent = (text: string) => {
        const useMarkdown =
            message.contentType === "markdown" ||
            message.contentType === "html" ||
            text.includes("|");

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
                    {text}
                </Markdown>
            );
        }

        return <span style={{ whiteSpace: "pre-wrap" }}>{text}</span>;
    };

    const renderContent = () => {
        if (isUser) {
            return <span style={{ whiteSpace: "pre-wrap" }}>{message.content}</span>;
        }

        return (
            <>
                {contentParts.map((part, idx) => {
                    if (part.type === "thinking") {
                        return <ThinkingBlock key={idx} content={part.content} />;
                    }
                    if (part.type === "tool") {
                        return (
                            <ToolCallBlock
                                key={idx}
                                toolName={part.toolName}
                                input={part.input}
                                output={part.output}
                            />
                        );
                    }
                    return <div key={idx}>{renderTextContent(part.content)}</div>;
                })}
            </>
        );
    };

    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                alignItems: isUser ? "flex-end" : "flex-start",
                marginBottom: "20px",
                animation: "fadeIn 0.2s ease-out",
            }}
        >
            {!isUser && message.source && (
                <div
                    style={{
                        fontSize: "11px",
                        color: "var(--muted-foreground)",
                        marginBottom: "6px",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        fontWeight: 500,
                    }}
                >
                    {message.sourceIcon && (
                        <span style={{ fontSize: "14px" }}>{message.sourceIcon}</span>
                    )}
                    <span>{message.source}</span>
                </div>
            )}
            <div
                style={{
                    maxWidth: isUser ? "75%" : "85%",
                    padding: isUser ? "10px 14px" : "14px 18px",
                    borderRadius: isUser
                        ? "var(--radius-lg) var(--radius-lg) 4px var(--radius-lg)"
                        : "var(--radius-lg) var(--radius-lg) var(--radius-lg) 4px",
                    backgroundColor: isUser ? "var(--primary)" : "var(--muted)",
                    color: isUser ? "var(--primary-foreground)" : "var(--foreground)",
                    wordBreak: "break-word",
                    boxShadow: isUser ? "var(--shadow-sm)" : "none",
                }}
                className={isUser ? undefined : "markdown-content"}
            >
                {renderContent()}
                {showStreamingCursor && (
                    <span
                        style={{
                            display: "inline-block",
                            width: "2px",
                            height: "14px",
                            backgroundColor: "var(--primary)",
                            marginLeft: "2px",
                            animation: "blink 1s infinite",
                            verticalAlign: "text-bottom",
                        }}
                    />
                )}
            </div>
            {message.metrics && (
                <div
                    style={{
                        fontSize: "10px",
                        color: "var(--muted-foreground)",
                        marginTop: "6px",
                        display: "flex",
                        gap: "12px",
                    }}
                >
                    {message.metrics.duration && (
                        <span>{(message.metrics.duration / 1000).toFixed(1)}s</span>
                    )}
                    {message.metrics.tokens && (
                        <span>
                            {message.metrics.tokens.prompt + message.metrics.tokens.completion} tokens
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}
