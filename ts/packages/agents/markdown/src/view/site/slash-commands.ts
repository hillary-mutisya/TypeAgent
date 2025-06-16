// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { $prose } from "@milkdown/utils";
import { Plugin, PluginKey } from "prosemirror-state";

/**
 * Enhanced slash command handler that properly detects and executes typed commands
 */
export const slashCommandHandler = $prose((_ctx) => {
    return new Plugin({
        key: new PluginKey("slash-command-handler"),

        props: {
            handleKeyDown(view: any, event: any) {
                // Only handle Enter key
                if (event.key !== "Enter") {
                    return false;
                }

                const { state } = view;
                const { selection } = state;
                const { $from } = selection;

                // Get the current line content
                const lineStart = $from.start($from.depth);
                const lineEnd = $from.end($from.depth);
                const lineText = state.doc.textBetween(lineStart, lineEnd);

                // Check for various slash commands
                const commands = [
                    {
                        pattern: /^\/test:continue\s*$/,
                        handler: () => {
                            console.log(
                                "🧪 Test continue command triggered on Enter",
                            );
                            executeSlashCommand(
                                "continue",
                                {},
                                true,
                                view,
                                lineStart,
                                lineEnd,
                            );
                        },
                    },
                    {
                        pattern: /^\/continue\s*$/,
                        handler: () => {
                            console.log(
                                "🤖 Continue command triggered on Enter",
                            );
                            executeSlashCommand(
                                "continue",
                                {},
                                false,
                                view,
                                lineStart,
                                lineEnd,
                            );
                        },
                    },
                    {
                        pattern: /^\/test:diagram(?:\s+(.+))?\s*$/,
                        handler: (match: RegExpMatchArray) => {
                            const description =
                                match[1]?.trim() || "test diagram";
                            console.log(
                                "🧪 Test diagram command triggered on Enter with description:",
                                description,
                            );
                            executeSlashCommand(
                                "diagram",
                                { description },
                                true,
                                view,
                                lineStart,
                                lineEnd,
                            );
                        },
                    },
                    {
                        pattern: /^\/diagram\s+(.+)\s*$/,
                        handler: (match: RegExpMatchArray) => {
                            const description = match[1]?.trim();
                            console.log(
                                "📊 Diagram command triggered on Enter with description:",
                                description,
                            );
                            executeSlashCommand(
                                "diagram",
                                { description },
                                false,
                                view,
                                lineStart,
                                lineEnd,
                            );
                        },
                    },
                    {
                        pattern: /^\/test:augment(?:\s+(.+))?\s*$/,
                        handler: (match: RegExpMatchArray) => {
                            const instruction =
                                match[1]?.trim() || "improve formatting";
                            console.log(
                                "🧪 Test augment command triggered on Enter with instruction:",
                                instruction,
                            );
                            executeSlashCommand(
                                "augment",
                                { instruction },
                                true,
                                view,
                                lineStart,
                                lineEnd,
                            );
                        },
                    },
                    {
                        pattern: /^\/augment\s+(.+)\s*$/,
                        handler: (match: RegExpMatchArray) => {
                            const instruction = match[1]?.trim();
                            console.log(
                                "✨ Augment command triggered on Enter with instruction:",
                                instruction,
                            );
                            executeSlashCommand(
                                "augment",
                                { instruction },
                                false,
                                view,
                                lineStart,
                                lineEnd,
                            );
                        },
                    },
                ];

                // Check each command pattern
                for (const command of commands) {
                    const match = lineText.match(command.pattern);
                    if (match) {
                        // Prevent default Enter behavior
                        event.preventDefault();
                        command.handler(match);
                        return true;
                    }
                }

                return false;
            },
        },
    });
});

/**
 * Execute a slash command by removing the command text and triggering the appropriate action
 */
async function executeSlashCommand(
    command: string,
    params: any,
    testMode: boolean,
    view: any,
    lineStart: number,
    lineEnd: number,
) {
    // Remove the command line
    const tr = view.state.tr.delete(lineStart, lineEnd);
    view.dispatch(tr);

    // Get cursor position after deletion
    const newPos = lineStart;

    // Build the agent request
    const requestParams = {
        position: newPos,
        testMode,
        ...params,
    };

    // Use the existing executeAgentCommand function
    setTimeout(() => {
        if (
            typeof window !== "undefined" &&
            (window as any).executeAgentCommand
        ) {
            (window as any).executeAgentCommand(command, requestParams);
        } else {
            console.error("executeAgentCommand not available on window");
        }
    }, 100);
}

/**
 * Visual feedback for slash commands as user types
 */
export const slashCommandPreview = $prose(() => {
    return new Plugin({
        key: new PluginKey("slash-command-preview"),

        props: {
            decorations(state: any) {
                const { selection } = state;
                const { $from } = selection;

                // Only show preview if cursor is at end of line
                if (!selection.empty) return null;

                const lineStart = $from.start($from.depth);
                const lineEnd = $from.end($from.depth);
                const lineText = state.doc.textBetween(lineStart, lineEnd);
                const cursorPos = selection.head;

                // Check if cursor is at the end of the line
                if (cursorPos !== lineEnd) return null;

                // Check for partial slash commands
                const slashCommands = [
                    {
                        pattern: /^\/test:continue$/,
                        preview: " (press Enter to continue with AI test mode)",
                    },
                    {
                        pattern: /^\/continue$/,
                        preview: " (press Enter to continue with AI)",
                    },
                    {
                        pattern: /^\/test:diagram$/,
                        preview:
                            " [description] (press Enter for test diagram)",
                    },
                    {
                        pattern: /^\/diagram$/,
                        preview:
                            " <description> (press Enter to generate diagram)",
                    },
                    {
                        pattern: /^\/test:augment$/,
                        preview:
                            " [instruction] (press Enter for test augmentation)",
                    },
                    {
                        pattern: /^\/augment$/,
                        preview:
                            " <instruction> (press Enter to augment document)",
                    },
                ];

                for (const cmd of slashCommands) {
                    if (lineText.match(cmd.pattern)) {
                        // This is a simple implementation - in a real app you'd create proper decorations
                        // For now we'll just log it since the working example shows this is complex
                        console.log("Preview would show:", cmd.preview);
                        break;
                    }
                }

                return null; // Return null for now - decorations are complex to implement correctly
            },
        },
    });
});
