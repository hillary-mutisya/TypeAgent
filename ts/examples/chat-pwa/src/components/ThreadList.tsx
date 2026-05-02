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
};

export function ThreadList({
    conversations,
    currentConversationId,
    onSelect,
    onCreate,
    onRefresh,
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
                width: "280px",
                borderRight: "1px solid var(--border)",
                display: "flex",
                flexDirection: "column",
                backgroundColor: "var(--muted)",
            }}
        >
            {/* Header */}
            <div
                style={{
                    padding: "16px",
                    borderBottom: "1px solid var(--border)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                }}
            >
                <h2 style={{ fontSize: "16px", fontWeight: 600 }}>Conversations</h2>
                <div style={{ display: "flex", gap: "8px" }}>
                    <button
                        onClick={onRefresh}
                        title="Refresh"
                        style={{
                            padding: "4px 8px",
                            borderRadius: "var(--radius)",
                            border: "1px solid var(--border)",
                            backgroundColor: "var(--background)",
                            cursor: "pointer",
                            fontSize: "14px",
                        }}
                    >
                        ↻
                    </button>
                    <button
                        onClick={() => setIsCreating(true)}
                        title="New conversation"
                        style={{
                            padding: "4px 8px",
                            borderRadius: "var(--radius)",
                            border: "none",
                            backgroundColor: "var(--primary)",
                            color: "var(--primary-foreground)",
                            cursor: "pointer",
                            fontSize: "14px",
                        }}
                    >
                        +
                    </button>
                </div>
            </div>

            {/* New conversation input */}
            {isCreating && (
                <div
                    style={{
                        padding: "8px 16px",
                        borderBottom: "1px solid var(--border)",
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
                            padding: "8px",
                            borderRadius: "var(--radius)",
                            border: "1px solid var(--border)",
                            fontSize: "13px",
                        }}
                    />
                    <button
                        onClick={handleCreate}
                        style={{
                            padding: "8px 12px",
                            borderRadius: "var(--radius)",
                            border: "none",
                            backgroundColor: "var(--primary)",
                            color: "var(--primary-foreground)",
                            cursor: "pointer",
                            fontSize: "13px",
                        }}
                    >
                        Create
                    </button>
                </div>
            )}

            {/* Conversation list */}
            <div style={{ flex: 1, overflowY: "auto" }}>
                {conversations.length === 0 ? (
                    <div
                        style={{
                            padding: "16px",
                            color: "var(--muted-foreground)",
                            fontSize: "14px",
                            textAlign: "center",
                        }}
                    >
                        No conversations yet
                    </div>
                ) : (
                    conversations.map((conv) => (
                        <button
                            key={conv.conversationId}
                            onClick={() => onSelect(conv.conversationId)}
                            style={{
                                width: "100%",
                                padding: "12px 16px",
                                border: "none",
                                borderBottom: "1px solid var(--border)",
                                backgroundColor:
                                    conv.conversationId === currentConversationId
                                        ? "var(--background)"
                                        : "transparent",
                                cursor: "pointer",
                                textAlign: "left",
                                display: "flex",
                                flexDirection: "column",
                                gap: "4px",
                            }}
                        >
                            <span
                                style={{
                                    fontWeight:
                                        conv.conversationId === currentConversationId ? 600 : 400,
                                    color: "var(--foreground)",
                                    fontSize: "14px",
                                }}
                            >
                                {conv.name}
                            </span>
                            <span
                                style={{
                                    fontSize: "12px",
                                    color: "var(--muted-foreground)",
                                }}
                            >
                                {new Date(conv.createdAt).toLocaleDateString()}
                                {conv.clientCount > 0 && (
                                    <span style={{ marginLeft: "8px" }}>
                                        {conv.clientCount} connected
                                    </span>
                                )}
                            </span>
                        </button>
                    ))
                )}
            </div>
        </div>
    );
}
