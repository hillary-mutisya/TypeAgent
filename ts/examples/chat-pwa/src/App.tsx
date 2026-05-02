// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { useEffect, useState, useCallback } from "react";
import { useTypeAgent } from "./hooks/useTypeAgent";
import { usePWA } from "./hooks/usePWA";
import { ChatPanel } from "./components/ChatPanel";
import { ThreadList } from "./components/ThreadList";
import { Settings, type ColorScheme } from "./components/Settings";
import { InstallPrompt } from "./components/InstallPrompt";
import { UpdatePrompt } from "./components/UpdatePrompt";

const MOBILE_BREAKPOINT = 768;

export function App() {
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [theme, setTheme] = useState<"light" | "dark">(() => {
        if (typeof window !== "undefined") {
            const saved = localStorage.getItem("theme");
            if (saved === "dark" || saved === "light") return saved;
            return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
        }
        return "light";
    });
    const [colorScheme, setColorScheme] = useState<ColorScheme>(() => {
        if (typeof window !== "undefined") {
            const saved = localStorage.getItem("colorScheme");
            if (saved) return saved as ColorScheme;
        }
        return "default";
    });

    useEffect(() => {
        document.documentElement.setAttribute("data-theme", theme);
        localStorage.setItem("theme", theme);
    }, [theme]);

    useEffect(() => {
        document.documentElement.setAttribute("data-scheme", colorScheme);
        localStorage.setItem("colorScheme", colorScheme);
    }, [colorScheme]);

    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth < MOBILE_BREAKPOINT) {
                setSidebarCollapsed(true);
            }
        };
        handleResize();
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    const toggleSidebar = useCallback(() => {
        setSidebarCollapsed((prev) => !prev);
    }, []);

    const {
        canInstall,
        isOnline,
        updateAvailable,
        promptInstall,
        dismissInstall,
        applyUpdate,
    } = usePWA();

    const {
        connectionState,
        messages,
        conversations,
        currentConversation,
        isProcessing,
        statusMessage,
        pendingQuestion,
        error,
        connect,
        sendMessage,
        cancelCommand,
        answerQuestion,
        switchConversation,
        createConversation,
        refreshConversations,
        getCompletions,
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
                backgroundColor: "var(--muted)",
            }}
        >
            {/* Sidebar */}
            <ThreadList
                conversations={conversations}
                currentConversationId={currentConversation?.id ?? null}
                onSelect={(id) => {
                    switchConversation(id);
                    if (window.innerWidth < MOBILE_BREAKPOINT) {
                        setSidebarCollapsed(true);
                    }
                }}
                onCreate={createConversation}
                onRefresh={refreshConversations}
                collapsed={sidebarCollapsed}
            />

            {/* Main chat area */}
            <div
                style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    backgroundColor: "var(--background)",
                    borderRadius: sidebarCollapsed
                        ? "0"
                        : "var(--radius-lg) 0 0 var(--radius-lg)",
                    boxShadow: "var(--shadow-lg)",
                    marginLeft: sidebarCollapsed ? "0" : "-1px",
                    position: "relative",
                    zIndex: 1,
                    transition: "border-radius 0.2s, margin-left 0.2s",
                }}
            >
                {/* Header */}
                <div
                    style={{
                        padding: "12px 16px",
                        borderBottom: "1px solid var(--border)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        backgroundColor: "var(--background)",
                        borderRadius: sidebarCollapsed ? "0" : "var(--radius-lg) 0 0 0",
                        gap: "12px",
                    }}
                >
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        {/* Sidebar toggle button */}
                        <button
                            onClick={toggleSidebar}
                            title={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
                            style={{
                                padding: "8px",
                                borderRadius: "var(--radius)",
                                border: "none",
                                backgroundColor: "transparent",
                                cursor: "pointer",
                                color: "var(--muted-foreground)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                transition: "all 0.15s",
                            }}
                            onMouseOver={(e) => {
                                e.currentTarget.style.backgroundColor = "var(--muted)";
                                e.currentTarget.style.color = "var(--foreground)";
                            }}
                            onMouseOut={(e) => {
                                e.currentTarget.style.backgroundColor = "transparent";
                                e.currentTarget.style.color = "var(--muted-foreground)";
                            }}
                        >
                            <svg
                                width="18"
                                height="18"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <rect x="3" y="3" width="18" height="18" rx="2" />
                                <line x1="9" y1="3" x2="9" y2="21" />
                            </svg>
                        </button>
                        <h1
                            style={{
                                fontSize: "16px",
                                fontWeight: 600,
                                margin: 0,
                                color: "var(--foreground)",
                            }}
                        >
                            {currentConversation?.name ?? "TypeAgent"}
                        </h1>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        {/* Settings button */}
                        <button
                            onClick={() => setSettingsOpen(true)}
                            title="Settings"
                            style={{
                                padding: "8px",
                                borderRadius: "var(--radius)",
                                border: "none",
                                backgroundColor: "transparent",
                                cursor: "pointer",
                                color: "var(--muted-foreground)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                transition: "all 0.15s",
                            }}
                            onMouseOver={(e) => {
                                e.currentTarget.style.backgroundColor = "var(--muted)";
                                e.currentTarget.style.color = "var(--foreground)";
                            }}
                            onMouseOut={(e) => {
                                e.currentTarget.style.backgroundColor = "transparent";
                                e.currentTarget.style.color = "var(--muted-foreground)";
                            }}
                        >
                            <svg
                                width="18"
                                height="18"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <circle cx="12" cy="12" r="3" />
                                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                            </svg>
                        </button>
                        {/* Connection status */}
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                                fontSize: "12px",
                                color: "var(--muted-foreground)",
                                padding: "6px 12px",
                                backgroundColor: "var(--muted)",
                                borderRadius: "var(--radius-full)",
                            }}
                        >
                            <span
                                style={{
                                    width: "6px",
                                    height: "6px",
                                    borderRadius: "50%",
                                    backgroundColor:
                                        connectionState === "connected"
                                            ? "var(--success)"
                                            : connectionState === "connecting"
                                              ? "var(--warning)"
                                              : "var(--error)",
                                }}
                            />
                            <span style={{ fontWeight: 500 }}>
                                {connectionState === "connected"
                                    ? "Connected"
                                    : connectionState === "connecting"
                                      ? "Connecting..."
                                      : "Disconnected"}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Chat panel */}
                <div style={{ flex: 1, minHeight: 0 }}>
                    <ChatPanel
                        messages={messages}
                        connectionState={connectionState}
                        isProcessing={isProcessing}
                        statusMessage={statusMessage}
                        pendingQuestion={pendingQuestion}
                        error={error}
                        onSendMessage={sendMessage}
                        onCancelCommand={cancelCommand}
                        onAnswerQuestion={answerQuestion}
                        onGetCompletions={getCompletions}
                    />
                </div>
            </div>

            {/* Settings Modal */}
            {settingsOpen && (
                <Settings
                    theme={theme}
                    colorScheme={colorScheme}
                    onThemeChange={setTheme}
                    onColorSchemeChange={setColorScheme}
                    onClose={() => setSettingsOpen(false)}
                />
            )}

            {/* PWA Install Prompt */}
            {canInstall && (
                <InstallPrompt onInstall={promptInstall} onDismiss={dismissInstall} />
            )}

            {/* PWA Update Prompt */}
            {updateAvailable && <UpdatePrompt onUpdate={applyUpdate} />}

            {/* Offline Indicator */}
            {!isOnline && (
                <div
                    style={{
                        position: "fixed",
                        top: 0,
                        left: 0,
                        right: 0,
                        backgroundColor: "var(--warning)",
                        color: "#000",
                        padding: "8px 16px",
                        textAlign: "center",
                        fontSize: "13px",
                        fontWeight: 500,
                        zIndex: 1002,
                    }}
                >
                    You are offline. Some features may be unavailable.
                </div>
            )}
        </div>
    );
}
