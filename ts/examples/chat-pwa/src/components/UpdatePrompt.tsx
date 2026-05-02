// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

type Props = {
    onUpdate: () => void;
};

export function UpdatePrompt({ onUpdate }: Props) {
    return (
        <div
            style={{
                position: "fixed",
                top: "24px",
                left: "50%",
                transform: "translateX(-50%)",
                backgroundColor: "var(--primary)",
                color: "var(--primary-foreground)",
                borderRadius: "var(--radius-lg)",
                boxShadow: "var(--shadow-lg)",
                padding: "12px 16px",
                display: "flex",
                alignItems: "center",
                gap: "12px",
                zIndex: 1001,
                maxWidth: "calc(100% - 48px)",
                animation: "fadeIn 0.3s ease-out",
            }}
        >
            <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                <path d="M21 2v6h-6" />
                <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                <path d="M3 22v-6h6" />
                <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
            </svg>
            <span style={{ fontSize: "14px", fontWeight: 500 }}>
                A new version is available
            </span>
            <button
                onClick={onUpdate}
                style={{
                    padding: "6px 12px",
                    borderRadius: "var(--radius)",
                    border: "2px solid var(--primary-foreground)",
                    backgroundColor: "transparent",
                    color: "var(--primary-foreground)",
                    cursor: "pointer",
                    fontSize: "13px",
                    fontWeight: 600,
                    transition: "all 0.15s",
                }}
                onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--primary-foreground)";
                    e.currentTarget.style.color = "var(--primary)";
                }}
                onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                    e.currentTarget.style.color = "var(--primary-foreground)";
                }}
            >
                Update
            </button>
        </div>
    );
}
