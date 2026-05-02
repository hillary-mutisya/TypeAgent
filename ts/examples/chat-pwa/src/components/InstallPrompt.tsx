// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

type Props = {
    onInstall: () => void;
    onDismiss: () => void;
};

export function InstallPrompt({ onInstall, onDismiss }: Props) {
    return (
        <div
            style={{
                position: "fixed",
                bottom: "24px",
                left: "50%",
                transform: "translateX(-50%)",
                backgroundColor: "var(--background)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-lg)",
                boxShadow: "var(--shadow-lg)",
                padding: "16px 20px",
                display: "flex",
                alignItems: "center",
                gap: "16px",
                zIndex: 1000,
                maxWidth: "calc(100% - 48px)",
                animation: "fadeIn 0.3s ease-out",
            }}
        >
            <div
                style={{
                    width: "40px",
                    height: "40px",
                    borderRadius: "var(--radius)",
                    backgroundColor: "var(--primary)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                }}
            >
                <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--primary-foreground)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
            </div>
            <div style={{ flex: 1 }}>
                <div
                    style={{
                        fontSize: "14px",
                        fontWeight: 600,
                        color: "var(--foreground)",
                        marginBottom: "2px",
                    }}
                >
                    Install TypeAgent
                </div>
                <div
                    style={{
                        fontSize: "13px",
                        color: "var(--muted-foreground)",
                    }}
                >
                    Add to your home screen for quick access
                </div>
            </div>
            <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
                <button
                    onClick={onDismiss}
                    style={{
                        padding: "8px 16px",
                        borderRadius: "var(--radius)",
                        border: "1px solid var(--border)",
                        backgroundColor: "transparent",
                        color: "var(--muted-foreground)",
                        cursor: "pointer",
                        fontSize: "13px",
                        fontWeight: 500,
                        transition: "all 0.15s",
                    }}
                    onMouseOver={(e) => {
                        e.currentTarget.style.backgroundColor = "var(--muted)";
                    }}
                    onMouseOut={(e) => {
                        e.currentTarget.style.backgroundColor = "transparent";
                    }}
                >
                    Not now
                </button>
                <button
                    onClick={onInstall}
                    style={{
                        padding: "8px 16px",
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
                    Install
                </button>
            </div>
        </div>
    );
}
