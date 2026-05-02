// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

type ColorScheme = "default" | "nord" | "zenburn" | "rose" | "forest";

type Props = {
    theme: "light" | "dark";
    colorScheme: ColorScheme;
    onThemeChange: (theme: "light" | "dark") => void;
    onColorSchemeChange: (scheme: ColorScheme) => void;
    onClose: () => void;
};

const COLOR_SCHEMES: {
    id: ColorScheme;
    name: string;
    description: string;
    preview: { light: string; dark: string };
}[] = [
    {
        id: "default",
        name: "Default",
        description: "Clean blue accent with neutral tones",
        preview: { light: "#2563eb", dark: "#3b82f6" },
    },
    {
        id: "nord",
        name: "Nord",
        description: "Arctic, cool blue-gray palette",
        preview: { light: "#5e81ac", dark: "#88c0d0" },
    },
    {
        id: "zenburn",
        name: "Zenburn",
        description: "Warm, low-contrast earthy tones",
        preview: { light: "#7f9f7f", dark: "#dcdccc" },
    },
    {
        id: "rose",
        name: "Rose",
        description: "Soft pink and rose accents",
        preview: { light: "#e11d48", dark: "#fb7185" },
    },
    {
        id: "forest",
        name: "Forest",
        description: "Natural green-based theme",
        preview: { light: "#059669", dark: "#34d399" },
    },
];

export function Settings({
    theme,
    colorScheme,
    onThemeChange,
    onColorSchemeChange,
    onClose,
}: Props) {
    return (
        <div
            style={{
                position: "fixed",
                inset: 0,
                backgroundColor: "rgba(0, 0, 0, 0.5)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1000,
            }}
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div
                style={{
                    backgroundColor: "var(--background)",
                    borderRadius: "var(--radius-lg)",
                    boxShadow: "var(--shadow-lg)",
                    width: "100%",
                    maxWidth: "480px",
                    maxHeight: "90vh",
                    overflow: "auto",
                    margin: "16px",
                }}
            >
                {/* Header */}
                <div
                    style={{
                        padding: "20px 24px",
                        borderBottom: "1px solid var(--border)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                    }}
                >
                    <h2
                        style={{
                            fontSize: "18px",
                            fontWeight: 600,
                            margin: 0,
                            color: "var(--foreground)",
                        }}
                    >
                        Settings
                    </h2>
                    <button
                        onClick={onClose}
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
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div style={{ padding: "24px" }}>
                    {/* Theme Section */}
                    <div style={{ marginBottom: "32px" }}>
                        <h3
                            style={{
                                fontSize: "13px",
                                fontWeight: 600,
                                color: "var(--muted-foreground)",
                                textTransform: "uppercase",
                                letterSpacing: "0.5px",
                                marginBottom: "16px",
                            }}
                        >
                            Appearance
                        </h3>
                        <div style={{ display: "flex", gap: "12px" }}>
                            <button
                                onClick={() => onThemeChange("light")}
                                style={{
                                    flex: 1,
                                    padding: "16px",
                                    borderRadius: "var(--radius-lg)",
                                    border:
                                        theme === "light"
                                            ? "2px solid var(--primary)"
                                            : "1px solid var(--border)",
                                    backgroundColor:
                                        theme === "light" ? "var(--accent)" : "var(--background)",
                                    cursor: "pointer",
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    gap: "12px",
                                    transition: "all 0.15s",
                                }}
                            >
                                <div
                                    style={{
                                        width: "48px",
                                        height: "32px",
                                        borderRadius: "6px",
                                        backgroundColor: "#ffffff",
                                        border: "1px solid #e2e8f0",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                    }}
                                >
                                    <svg
                                        width="18"
                                        height="18"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="#0f172a"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    >
                                        <circle cx="12" cy="12" r="5" />
                                        <line x1="12" y1="1" x2="12" y2="3" />
                                        <line x1="12" y1="21" x2="12" y2="23" />
                                        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                                        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                                        <line x1="1" y1="12" x2="3" y2="12" />
                                        <line x1="21" y1="12" x2="23" y2="12" />
                                        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                                        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                                    </svg>
                                </div>
                                <span
                                    style={{
                                        fontSize: "14px",
                                        fontWeight: theme === "light" ? 600 : 400,
                                        color: "var(--foreground)",
                                    }}
                                >
                                    Light
                                </span>
                            </button>
                            <button
                                onClick={() => onThemeChange("dark")}
                                style={{
                                    flex: 1,
                                    padding: "16px",
                                    borderRadius: "var(--radius-lg)",
                                    border:
                                        theme === "dark"
                                            ? "2px solid var(--primary)"
                                            : "1px solid var(--border)",
                                    backgroundColor:
                                        theme === "dark" ? "var(--accent)" : "var(--background)",
                                    cursor: "pointer",
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    gap: "12px",
                                    transition: "all 0.15s",
                                }}
                            >
                                <div
                                    style={{
                                        width: "48px",
                                        height: "32px",
                                        borderRadius: "6px",
                                        backgroundColor: "#1e293b",
                                        border: "1px solid #334155",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                    }}
                                >
                                    <svg
                                        width="18"
                                        height="18"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="#f1f5f9"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    >
                                        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                                    </svg>
                                </div>
                                <span
                                    style={{
                                        fontSize: "14px",
                                        fontWeight: theme === "dark" ? 600 : 400,
                                        color: "var(--foreground)",
                                    }}
                                >
                                    Dark
                                </span>
                            </button>
                        </div>
                    </div>

                    {/* Color Scheme Section */}
                    <div>
                        <h3
                            style={{
                                fontSize: "13px",
                                fontWeight: 600,
                                color: "var(--muted-foreground)",
                                textTransform: "uppercase",
                                letterSpacing: "0.5px",
                                marginBottom: "16px",
                            }}
                        >
                            Color Scheme
                        </h3>
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                            {COLOR_SCHEMES.map((scheme) => {
                                const isSelected = colorScheme === scheme.id;
                                return (
                                    <button
                                        key={scheme.id}
                                        onClick={() => onColorSchemeChange(scheme.id)}
                                        style={{
                                            padding: "14px 16px",
                                            borderRadius: "var(--radius-lg)",
                                            border: isSelected
                                                ? "2px solid var(--primary)"
                                                : "1px solid var(--border)",
                                            backgroundColor: isSelected
                                                ? "var(--accent)"
                                                : "var(--background)",
                                            cursor: "pointer",
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "14px",
                                            textAlign: "left",
                                            transition: "all 0.15s",
                                        }}
                                        onMouseOver={(e) => {
                                            if (!isSelected) {
                                                e.currentTarget.style.backgroundColor = "var(--muted)";
                                            }
                                        }}
                                        onMouseOut={(e) => {
                                            if (!isSelected) {
                                                e.currentTarget.style.backgroundColor =
                                                    "var(--background)";
                                            }
                                        }}
                                    >
                                        <div
                                            style={{
                                                width: "32px",
                                                height: "32px",
                                                borderRadius: "50%",
                                                background: `linear-gradient(135deg, ${scheme.preview.light} 50%, ${scheme.preview.dark} 50%)`,
                                                flexShrink: 0,
                                                boxShadow: "var(--shadow-sm)",
                                            }}
                                        />
                                        <div style={{ flex: 1 }}>
                                            <div
                                                style={{
                                                    fontSize: "14px",
                                                    fontWeight: isSelected ? 600 : 500,
                                                    color: "var(--foreground)",
                                                    marginBottom: "2px",
                                                }}
                                            >
                                                {scheme.name}
                                            </div>
                                            <div
                                                style={{
                                                    fontSize: "12px",
                                                    color: "var(--muted-foreground)",
                                                }}
                                            >
                                                {scheme.description}
                                            </div>
                                        </div>
                                        {isSelected && (
                                            <svg
                                                width="20"
                                                height="20"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="var(--primary)"
                                                strokeWidth="2"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                            >
                                                <polyline points="20 6 9 17 4 12" />
                                            </svg>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export type { ColorScheme };
