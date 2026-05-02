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
                backgroundColor: "rgba(37, 99, 235, 0.04)",
                border: "1px solid rgba(37, 99, 235, 0.15)",
                borderRadius: "var(--radius)",
                marginBottom: "10px",
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
                    padding: "8px 12px",
                    border: "none",
                    backgroundColor: "transparent",
                    cursor: "pointer",
                    fontSize: "12px",
                    color: "var(--primary)",
                    fontWeight: 500,
                    textAlign: "left",
                    transition: "background-color 0.15s",
                }}
                onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = "rgba(37, 99, 235, 0.05)";
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
                <span style={{ opacity: 0.9 }}>Thinking...</span>
            </button>
            {isOpen && (
                <div
                    style={{
                        padding: "0 12px 12px 36px",
                        fontSize: "12px",
                        lineHeight: 1.6,
                        color: "var(--muted-foreground)",
                        whiteSpace: "pre-wrap",
                        fontFamily:
                            '"SF Mono", "Consolas", "Monaco", monospace',
                        maxHeight: "250px",
                        overflowY: "auto",
                    }}
                >
                    {content}
                </div>
            )}
        </div>
    );
}
