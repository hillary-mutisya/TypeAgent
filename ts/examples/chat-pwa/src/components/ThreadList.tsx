// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { useState } from "react";
import type { ConversationInfo } from "../runtime/types";

type Props = {
    conversations: ConversationInfo[];
    currentConversationId: string | null;
    onSelect: (conversationId: string) => void;
    onCreate: (name: string) => void;
    onRefresh: () => void;
    collapsed?: boolean;
};

export function ThreadList({
    conversations,
    currentConversationId,
    onSelect,
    onCreate,
    onRefresh,
    collapsed = false,
}: Props) {
    const [isCreating, setIsCreating] = useState(false);
    const [newName, setNewName] = useState("");

    const handleCreate = () => {
        if (newName.trim()) {
            onCreate(newName.trim());
            setNewName("");
            setIsCreating(false);
        }
    };

    return (
        <div
            style={{
                width: collapsed ? "0px" : "260px",
                minWidth: collapsed ? "0px" : "260px",
                display: "flex",
                flexDirection: "column",
                backgroundColor: "var(--muted)",
                transition: "width 0.2s ease, min-width 0.2s ease",
                flexShrink: 0,
                overflow: "hidden",
            }}
        >
            {/* Header */}
            <div
                style={{
                    padding: "16px 16px 12px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                }}
            >
                <h2
                    style={{
                        fontSize: "12px",
                        fontWeight: 600,
                        color: "var(--muted-foreground)",
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                    }}
                >
                    Conversations
                </h2>
                <div style={{ display: "flex", gap: "4px" }}>
                    <button
                        onClick={onRefresh}
                        title="Refresh"
                        style={{
                            padding: "6px 8px",
                            borderRadius: "var(--radius)",
                            border: "none",
                            backgroundColor: "transparent",
                            cursor: "pointer",
                            fontSize: "14px",
                            color: "var(--muted-foreground)",
                            transition: "all 0.15s",
                        }}
                        onMouseOver={(e) => {
                            e.currentTarget.style.backgroundColor = "var(--background)";
                            e.currentTarget.style.color = "var(--foreground)";
                        }}
                        onMouseOut={(e) => {
                            e.currentTarget.style.backgroundColor = "transparent";
                            e.currentTarget.style.color = "var(--muted-foreground)";
                        }}
                    >
                        ↻
                    </button>
                    <button
                        onClick={() => setIsCreating(true)}
                        title="New conversation"
                        style={{
                            padding: "6px 10px",
                            borderRadius: "var(--radius)",
                            border: "none",
                            backgroundColor: "var(--primary)",
                            color: "var(--primary-foreground)",
                            cursor: "pointer",
                            fontSize: "13px",
                            fontWeight: 500,
                            transition: "all 0.15s",
                        }}
                        onMouseOver={(e) => {
                            e.currentTarget.style.backgroundColor = "var(--primary-hover)";
                        }}
                        onMouseOut={(e) => {
                            e.currentTarget.style.backgroundColor = "var(--primary)";
                        }}
                    >
                        + New
                    </button>
                </div>
            </div>

            {/* New conversation input */}
            {isCreating && (
                <div
                    style={{
                        padding: "8px 16px 16px",
                        display: "flex",
                        gap: "8px",
                    }}
                >
                    <input
                        type="text"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") handleCreate();
                            if (e.key === "Escape") {
                                setIsCreating(false);
                                setNewName("");
                            }
                        }}
                        placeholder="Conversation name"
                        autoFocus
                        style={{
                            flex: 1,
                            padding: "10px 12px",
                            borderRadius: "var(--radius)",
                            border: "1px solid var(--border)",
                            fontSize: "13px",
                            backgroundColor: "var(--background)",
                            outline: "none",
                        }}
                    />
                    <button
                        onClick={handleCreate}
                        style={{
                            padding: "10px 14px",
                            borderRadius: "var(--radius)",
                            border: "none",
                            backgroundColor: "var(--primary)",
                            color: "var(--primary-foreground)",
                            cursor: "pointer",
                            fontSize: "13px",
                            fontWeight: 500,
                        }}
                    >
                        Create
                    </button>
                </div>
            )}

            {/* Conversation list */}
            <div style={{ flex: 1, overflowY: "auto", padding: "0 8px" }}>
                {conversations.length === 0 ? (
                    <div
                        style={{
                            padding: "24px 16px",
                            color: "var(--muted-foreground)",
                            fontSize: "13px",
                            textAlign: "center",
                        }}
                    >
                        No conversations yet
                    </div>
                ) : (
                    conversations.map((conv) => {
                        const isActive = conv.conversationId === currentConversationId;
                        return (
                            <button
                                key={conv.conversationId}
                                onClick={() => onSelect(conv.conversationId)}
                                style={{
                                    width: "100%",
                                    padding: "10px 12px",
                                    border: "none",
                                    borderRadius: "var(--radius)",
                                    backgroundColor: isActive ? "var(--background)" : "transparent",
                                    boxShadow: isActive ? "var(--shadow-sm)" : "none",
                                    cursor: "pointer",
                                    textAlign: "left",
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "2px",
                                    marginBottom: "2px",
                                    transition: "all 0.15s",
                                }}
                                onMouseOver={(e) => {
                                    if (!isActive) {
                                        e.currentTarget.style.backgroundColor = "var(--background)";
                                    }
                                }}
                                onMouseOut={(e) => {
                                    if (!isActive) {
                                        e.currentTarget.style.backgroundColor = "transparent";
                                    }
                                }}
                            >
                                <span
                                    style={{
                                        fontWeight: isActive ? 600 : 400,
                                        color: "var(--foreground)",
                                        fontSize: "13px",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                    }}
                                >
                                    {conv.name}
                                </span>
                                <span
                                    style={{
                                        fontSize: "11px",
                                        color: "var(--muted-foreground)",
                                    }}
                                >
                                    {new Date(conv.createdAt).toLocaleDateString()}
                                    {conv.clientCount > 0 && (
                                        <span
                                            style={{
                                                marginLeft: "8px",
                                                color: "var(--success)",
                                            }}
                                        >
                                            {conv.clientCount} online
                                        </span>
                                    )}
                                </span>
                            </button>
                        );
                    })
                )}
            </div>
        </div>
    );
}
