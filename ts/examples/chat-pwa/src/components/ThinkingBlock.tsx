// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { useState } from "react";

type Props = {
    content: string;
    defaultOpen?: boolean;
};

export function ThinkingBlock({ content, defaultOpen = false }: Props) {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <div
            style={{
                backgroundColor: "rgba(0, 120, 212, 0.05)",
                border: "1px solid rgba(0, 120, 212, 0.2)",
                borderRadius: "var(--radius)",
                marginBottom: "12px",
                overflow: "hidden",
            }}
        >
            <button
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "10px 12px",
                    border: "none",
                    backgroundColor: "transparent",
                    cursor: "pointer",
                    fontSize: "13px",
                    color: "var(--primary)",
                    fontWeight: 500,
                    textAlign: "left",
                }}
            >
                <span
                    style={{
                        display: "inline-block",
                        transition: "transform 0.2s",
                        transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
                    }}
                >
                    ▶
                </span>
                <span>💭 Thinking</span>
            </button>
            {isOpen && (
                <div
                    style={{
                        padding: "12px",
                        paddingTop: "0",
                        fontSize: "13px",
                        lineHeight: 1.6,
                        color: "var(--muted-foreground)",
                        whiteSpace: "pre-wrap",
                        fontFamily: "monospace",
                        maxHeight: "300px",
                        overflowY: "auto",
                    }}
                >
                    {content}
                </div>
            )}
        </div>
    );
}
