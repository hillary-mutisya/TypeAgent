// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { useEffect } from "react";
import { useTypeAgent } from "./hooks/useTypeAgent";
import { ChatPanel } from "./components/ChatPanel";
import { ThreadList } from "./components/ThreadList";

export function App() {
    const {
        connectionState,
        messages,
        conversations,
        currentConversation,
        isProcessing,
        pendingQuestion,
        error,
        connect,
        sendMessage,
        cancelCommand,
        answerQuestion,
        switchConversation,
        createConversation,
        refreshConversations,
    } = useTypeAgent();

    useEffect(() => {
        connect();
    }, [connect]);

    return (
        <div
            style={{
                display: "flex",
                height: "100%",
                width: "100%",
            }}
        >
            {/* Sidebar */}
            <ThreadList
                conversations={conversations}
                currentConversationId={currentConversation?.id ?? null}
                onSelect={switchConversation}
                onCreate={createConversation}
                onRefresh={refreshConversations}
            />

            {/* Main chat area */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                {/* Header */}
                <div
                    style={{
                        padding: "12px 16px",
                        borderBottom: "1px solid var(--border)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                    }}
                >
                    <div>
                        <h1 style={{ fontSize: "18px", fontWeight: 600, margin: 0 }}>
                            {currentConversation?.name ?? "TypeAgent"}
                        </h1>
                    </div>
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            fontSize: "13px",
                            color: "var(--muted-foreground)",
                        }}
                    >
                        <span
                            style={{
                                width: "8px",
                                height: "8px",
                                borderRadius: "50%",
                                backgroundColor:
                                    connectionState === "connected"
                                        ? "#22c55e"
                                        : connectionState === "connecting"
                                          ? "#eab308"
                                          : "#dc2626",
                            }}
                        />
                        <span>
                            {connectionState === "connected"
                                ? "Connected"
                                : connectionState === "connecting"
                                  ? "Connecting..."
                                  : "Disconnected"}
                        </span>
                    </div>
                </div>

                {/* Chat panel */}
                <div style={{ flex: 1, minHeight: 0 }}>
                    <ChatPanel
                        messages={messages}
                        connectionState={connectionState}
                        isProcessing={isProcessing}
                        pendingQuestion={pendingQuestion}
                        error={error}
                        onSendMessage={sendMessage}
                        onCancelCommand={cancelCommand}
                        onAnswerQuestion={answerQuestion}
                    />
                </div>
            </div>
        </div>
    );
}
