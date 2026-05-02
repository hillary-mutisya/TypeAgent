// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { useState } from "react";

type Props = {
    toolName: string;
    input?: string;
    output?: string;
    defaultOpen?: boolean;
};

export function ToolCallBlock({ toolName, input, output, defaultOpen = false }: Props) {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <div
            style={{
                backgroundColor: "rgba(16, 185, 129, 0.04)",
                border: "1px solid rgba(16, 185, 129, 0.15)",
                borderRadius: "var(--radius)",
                marginBottom: "8px",
                overflow: "hidden",
                fontSize: "12px",
            }}
        >
            <button
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "8px 12px",
                    border: "none",
                    backgroundColor: "transparent",
                    cursor: "pointer",
                    color: "var(--success)",
                    fontWeight: 500,
                    textAlign: "left",
                    transition: "background-color 0.15s",
                }}
                onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = "rgba(16, 185, 129, 0.05)";
                }}
                onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                }}
            >
                <span
                    style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "16px",
                        height: "16px",
                        fontSize: "8px",
                        transition: "transform 0.15s",
                        transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
                    }}
                >
                    ▶
                </span>
                <span
                    style={{
                        fontFamily: '"SF Mono", "Consolas", "Monaco", monospace',
                        fontSize: "12px",
                    }}
                >
                    {toolName}
                </span>
                {(input || output) && !isOpen && (
                    <span
                        style={{
                            marginLeft: "auto",
                            color: "var(--muted-foreground)",
                            fontSize: "11px",
                            maxWidth: "280px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            fontFamily: '"SF Mono", "Consolas", "Monaco", monospace',
                            opacity: 0.7,
                        }}
                    >
                        {input ? input.slice(0, 35) + (input.length > 35 ? "..." : "") : ""}
                        {output ? ` → ${output.slice(0, 25)}${output.length > 25 ? "..." : ""}` : ""}
                    </span>
                )}
            </button>
            {isOpen && (
                <div
                    style={{
                        padding: "0 12px 12px 36px",
                        fontSize: "11px",
                        fontFamily: '"SF Mono", "Consolas", "Monaco", monospace',
                    }}
                >
                    {input && (
                        <div style={{ marginBottom: "10px" }}>
                            <div
                                style={{
                                    color: "var(--muted-foreground)",
                                    marginBottom: "4px",
                                    fontSize: "10px",
                                    fontWeight: 600,
                                    textTransform: "uppercase",
                                    letterSpacing: "0.5px",
                                    fontFamily: "inherit",
                                }}
                            >
                                Input
                            </div>
                            <div
                                style={{
                                    backgroundColor: "var(--background)",
                                    padding: "10px 12px",
                                    borderRadius: "6px",
                                    whiteSpace: "pre-wrap",
                                    wordBreak: "break-all",
                                    maxHeight: "120px",
                                    overflowY: "auto",
                                    lineHeight: 1.5,
                                }}
                            >
                                {input}
                            </div>
                        </div>
                    )}
                    {output && (
                        <div>
                            <div
                                style={{
                                    color: "var(--muted-foreground)",
                                    marginBottom: "4px",
                                    fontSize: "10px",
                                    fontWeight: 600,
                                    textTransform: "uppercase",
                                    letterSpacing: "0.5px",
                                    fontFamily: "inherit",
                                }}
                            >
                                Output
                            </div>
                            <div
                                style={{
                                    backgroundColor: "var(--background)",
                                    padding: "10px 12px",
                                    borderRadius: "6px",
                                    whiteSpace: "pre-wrap",
                                    wordBreak: "break-all",
                                    maxHeight: "120px",
                                    overflowY: "auto",
                                    lineHeight: 1.5,
                                }}
                            >
                                {output}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
