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
                backgroundColor: "rgba(34, 197, 94, 0.05)",
                border: "1px solid rgba(34, 197, 94, 0.2)",
                borderRadius: "var(--radius)",
                marginBottom: "8px",
                overflow: "hidden",
                fontSize: "13px",
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
                    color: "#16a34a",
                    fontWeight: 500,
                    textAlign: "left",
                }}
            >
                <span
                    style={{
                        display: "inline-block",
                        transition: "transform 0.2s",
                        transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
                        fontSize: "10px",
                    }}
                >
                    ▶
                </span>
                <span style={{ fontSize: "14px" }}>🔧</span>
                <span style={{ fontFamily: "monospace" }}>{toolName}</span>
                {(input || output) && !isOpen && (
                    <span
                        style={{
                            marginLeft: "auto",
                            color: "var(--muted-foreground)",
                            fontSize: "11px",
                            maxWidth: "300px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            fontFamily: "monospace",
                        }}
                    >
                        {input ? `{ ${input.slice(0, 40)}${input.length > 40 ? "..." : ""} }` : ""}
                        {output ? ` → ${output.slice(0, 30)}${output.length > 30 ? "..." : ""}` : ""}
                    </span>
                )}
            </button>
            {isOpen && (
                <div
                    style={{
                        padding: "0 12px 12px 12px",
                        fontSize: "12px",
                        fontFamily: "monospace",
                    }}
                >
                    {input && (
                        <div style={{ marginBottom: "8px" }}>
                            <div
                                style={{
                                    color: "var(--muted-foreground)",
                                    marginBottom: "4px",
                                    fontSize: "11px",
                                    textTransform: "uppercase",
                                }}
                            >
                                Input
                            </div>
                            <div
                                style={{
                                    backgroundColor: "var(--background)",
                                    padding: "8px",
                                    borderRadius: "4px",
                                    whiteSpace: "pre-wrap",
                                    wordBreak: "break-all",
                                    maxHeight: "150px",
                                    overflowY: "auto",
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
                                    fontSize: "11px",
                                    textTransform: "uppercase",
                                }}
                            >
                                Output
                            </div>
                            <div
                                style={{
                                    backgroundColor: "var(--background)",
                                    padding: "8px",
                                    borderRadius: "4px",
                                    whiteSpace: "pre-wrap",
                                    wordBreak: "break-all",
                                    maxHeight: "150px",
                                    overflowY: "auto",
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
