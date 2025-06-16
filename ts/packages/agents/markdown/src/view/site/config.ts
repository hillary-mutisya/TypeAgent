import { CrepeFeature } from "@milkdown/crepe";
import type { EditorConfig } from "./types";

export const EDITOR_CONFIG = {
    FEATURES: {
        BLOCK_EDIT: true,
        LINK_TOOLTIP: true,
        COLLABORATION: true,
        AI_INTEGRATION: true,
        MERMAID_SUPPORT: true,
        HISTORY: true,
    },

    TIMING: {
        CONTENT_INSERT_DELAY: 150,
        STATUS_HIDE_DELAY: 2000,
        ERROR_HIDE_DELAY: 3000,
        COLLABORATION_STATUS_HIDE_DELAY: 3000,
        PANEL_RESTORE_DELAY: 500,
        MARKDOWN_UPDATE_DELAY: 100,
    },

    STORAGE_KEYS: {
        THEME: "theme",
        RAW_MARKDOWN_PANEL_VISIBLE: "rawMarkdownPanelVisible",
    },

    THEMES: {
        LIGHT: "light",
        DARK: "dark",
    },
} as const;

export const COLLABORATION_CONFIG = {
    DEFAULT_WEBSOCKET_URL: "ws://localhost:1234",
    DEFAULT_DOCUMENT_ID: "live",
    RETRY_ATTEMPTS: 3,
    RETRY_DELAY: 1000,
} as const;

export const AI_CONFIG = {
    ENDPOINTS: {
        STREAM: "/agent/stream",
        DOCUMENT: "/document",
        COLLABORATION_INFO: "/collaboration/info",
    },

    COMMANDS: {
        CONTINUE: "continue",
        DIAGRAM: "diagram",
        AUGMENT: "augment",
    },

    COMMAND_PREFIXES: {
        STANDARD: "/",
        TEST: "/test:",
    },
} as const;

export const DEFAULT_MARKDOWN_CONTENT = `# Welcome to AI-Enhanced Markdown Editor

Start editing your markdown document with AI assistance!

## Features

- **WYSIWYG Editing** with Milkdown Crepe
- **AI-Powered Tools** integrated with TypeAgent
- **Real-time Preview** with full markdown support
- **Mermaid Diagrams** with visual editing
- **Math Equations** with LaTeX support
- **GeoJSON Maps** for location data

## AI Commands

Try these AI-powered commands:

- Type \`/\` to open the block edit menu with AI tools
- Use **Continue Writing** to let AI continue writing
- Use **Generate Diagram** to create Mermaid diagrams
- Use **Augment Document** to improve the document
- Test versions available for testing without API calls

## Example Diagram

\`\`\`mermaid
graph TD
    A[Start Editing] --> B{Need AI Help?}
    B -->|Yes| C[Use / Commands]
    B -->|No| D[Continue Writing]
    C --> E[AI Generates Content]
    E --> F[Review & Edit]
    F --> G[Save Document]
    D --> G
\`\`\`

Start typing to see the editor in action!
`;

export function createEditorConfig(): EditorConfig {
    return {
        enableCollaboration: EDITOR_CONFIG.FEATURES.COLLABORATION,
        enableAI: EDITOR_CONFIG.FEATURES.AI_INTEGRATION,
        enableMermaid: EDITOR_CONFIG.FEATURES.MERMAID_SUPPORT,
        defaultContent: "", // Will be loaded from server or default
    };
}

export function createCrepeFeatures(): Partial<Record<CrepeFeature, boolean>> {
    return {
        [CrepeFeature.BlockEdit]: EDITOR_CONFIG.FEATURES.BLOCK_EDIT,
        [CrepeFeature.LinkTooltip]: EDITOR_CONFIG.FEATURES.LINK_TOOLTIP,
    };
}

export function createCrepeFeatureConfigs(): Partial<
    Record<CrepeFeature, any>
> {
    return {
        [CrepeFeature.BlockEdit]: {
            buildMenu: (builder: any) => {
                return builder
                    .addGroup("ai-tools", "AI Tools")
                    .addItem("ai-continue", {
                        label: "Continue Writing",
                        icon: "✨",
                        onRun: async (ctx: any) => {
                            const { executeAgentCommand } = await import(
                                "./core/ai-agent-manager"
                            );
                            const view = ctx.get(
                                (await import("@milkdown/core")).editorViewCtx,
                            );
                            const { from } = view.state.selection;
                            await executeAgentCommand("continue", {
                                position: from,
                            });
                        },
                    })
                    .addItem("ai-diagram", {
                        label: "Generate Diagram",
                        icon: "📊",
                        onRun: async (ctx: any) => {
                            const { executeAgentCommand } = await import(
                                "./core/ai-agent-manager"
                            );
                            const view = ctx.get(
                                (await import("@milkdown/core")).editorViewCtx,
                            );
                            const { from } = view.state.selection;
                            const description = prompt(
                                "Describe the diagram you want to generate:",
                            );
                            if (description) {
                                await executeAgentCommand("diagram", {
                                    description,
                                    position: from,
                                });
                            }
                        },
                    })
                    .addItem("ai-augment", {
                        label: "Augment Document",
                        icon: "🔧",
                        onRun: async (ctx: any) => {
                            const { executeAgentCommand } = await import(
                                "./core/ai-agent-manager"
                            );
                            const view = ctx.get(
                                (await import("@milkdown/core")).editorViewCtx,
                            );
                            const { from } = view.state.selection;
                            const instruction = prompt(
                                "How would you like to improve the document?",
                            );
                            if (instruction) {
                                await executeAgentCommand("augment", {
                                    instruction,
                                    position: from,
                                });
                            }
                        },
                    })
                    .addItem("test-continue", {
                        label: "Test: Continue",
                        icon: "🧪",
                        onRun: async (ctx: any) => {
                            const { executeAgentCommand } = await import(
                                "./core/ai-agent-manager"
                            );
                            const view = ctx.get(
                                (await import("@milkdown/core")).editorViewCtx,
                            );
                            const { from } = view.state.selection;
                            await executeAgentCommand("continue", {
                                position: from,
                                testMode: true,
                            });
                        },
                    })
                    .addItem("test-diagram", {
                        label: "Test: Diagram",
                        icon: "🧪",
                        onRun: async (ctx: any) => {
                            const { executeAgentCommand } = await import(
                                "./core/ai-agent-manager"
                            );
                            const view = ctx.get(
                                (await import("@milkdown/core")).editorViewCtx,
                            );
                            const { from } = view.state.selection;
                            const description =
                                prompt("Test diagram description:") ||
                                "test flowchart";
                            await executeAgentCommand("diagram", {
                                description,
                                position: from,
                                testMode: true,
                            });
                        },
                    })
                    .addItem("test-augment", {
                        label: "Test: Augment",
                        icon: "🧪",
                        onRun: async (ctx: any) => {
                            const { executeAgentCommand } = await import(
                                "./core/ai-agent-manager"
                            );
                            const view = ctx.get(
                                (await import("@milkdown/core")).editorViewCtx,
                            );
                            const { from } = view.state.selection;
                            const instruction =
                                prompt("Test augmentation instruction:") ||
                                "improve formatting";
                            await executeAgentCommand("augment", {
                                instruction,
                                position: from,
                                testMode: true,
                            });
                        },
                    });
            },
        } as any,
    };
}
