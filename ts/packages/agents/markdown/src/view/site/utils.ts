// Consolidated utilities for the markdown editor site

import type { Editor } from "@milkdown/core";
import { editorViewCtx } from "@milkdown/core";
import type { ContentItem } from "./types";
import { aiAgentManager } from "./core/ai-agent-manager";
import { EDITOR_CONFIG } from "./config";

// ============================================================================
// DOM Manipulation Utilities
// ============================================================================

export function getElementById(id: string): HTMLElement | null {
    return document.getElementById(id);
}

export function getRequiredElement(id: string): HTMLElement {
    const element = document.getElementById(id);
    if (!element) {
        throw new Error(`Required element with id '${id}' not found`);
    }
    return element;
}

export function createCollaborationStatusElement(): HTMLElement {
    const statusElement = document.createElement("div");
    statusElement.id = "collaboration-status";
    statusElement.className = "collaboration-status";
    statusElement.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    padding: 8px 12px;
    border-radius: 4px;
    font-size: 14px;
    z-index: 1000;
    display: none;
    transition: opacity 0.3s ease;
  `;
    document.body.appendChild(statusElement);
    return statusElement;
}

export function createNotificationElement(
    message: string,
    type: string,
): HTMLElement {
    const notification = document.createElement("div");
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    return notification;
}

export function createErrorNotificationElement(message: string): HTMLElement {
    const errorElement = document.createElement("div");
    errorElement.className = "error-notification";
    errorElement.textContent = message;
    return errorElement;
}

export function addToBody(element: HTMLElement): void {
    document.body.appendChild(element);
}

export function removeElement(element: HTMLElement): void {
    element.remove();
}

export function toggleClass(element: HTMLElement, className: string): void {
    element.classList.toggle(className);
}

export function addClass(element: HTMLElement, className: string): void {
    element.classList.add(className);
}

export function removeClass(element: HTMLElement, className: string): void {
    element.classList.remove(className);
}

export function hasClass(element: HTMLElement, className: string): boolean {
    return element.classList.contains(className);
}

// ============================================================================
// Markdown Parsing Utilities
// ============================================================================

export function parseInlineText(text: string, schema: any): any[] {
    const nodes = [];

    // Simple inline parsing for bold text
    const parts = text.split(/(\*\*[^*]+\*\*)/);

    for (const part of parts) {
        if (part.startsWith("**") && part.endsWith("**")) {
            // Bold text
            const boldText = part.slice(2, -2);
            if (schema.marks.strong) {
                nodes.push(
                    schema.text(boldText, [schema.marks.strong.create()]),
                );
            } else {
                nodes.push(schema.text(part));
            }
        } else if (part.trim()) {
            nodes.push(schema.text(part));
        }
    }

    return nodes.length > 0 ? nodes : [schema.text(text)];
}

export function parseMarkdownLines(content: string): string[] {
    return content.split("\n");
}

export function isHeading(line: string, level: number): boolean {
    const prefix = "#".repeat(level);
    return line.startsWith(prefix + " ");
}

export function extractHeadingText(line: string, level: number): string {
    const prefix = "#".repeat(level);
    return line.replace(new RegExp(`^${prefix}\\s*`), "");
}

export function isImage(line: string): boolean {
    return line.startsWith("![");
}

export function isMathBlock(line: string): boolean {
    return line.startsWith("$$") && line.endsWith("$$");
}

export function extractMathContent(line: string): string {
    return line.slice(2, -2);
}

export function isListItem(line: string): boolean {
    return line.startsWith("- ");
}

export function isBlockquote(line: string): boolean {
    return line.startsWith("> ");
}

export function parseImageMarkdown(
    imageMarkdown: string,
): { alt: string; src: string } | null {
    const imageMatch = imageMarkdown.match(/!\[([^\]]*)\]\(([^)]+)\)/);
    if (imageMatch) {
        const [, alt, src] = imageMatch;
        return { alt: alt || "", src };
    }
    return null;
}

export function contentItemToNode(item: ContentItem, schema: any): any {
    try {
        switch (item.type) {
            case "paragraph":
                const textNodes =
                    item.content
                        ?.map((child: any) =>
                            child.type === "text"
                                ? schema.text(child.text)
                                : null,
                        )
                        .filter(Boolean) || [];
                return schema.nodes.paragraph.create(null, textNodes);

            case "code_block":
                const codeText = item.content?.[0]?.text || "";
                return schema.nodes.code_block.create(
                    { params: item.attrs?.params || "" },
                    codeText ? [schema.text(codeText)] : [],
                );

            default:
                console.warn("Unknown content item type:", item.type);
                return null;
        }
    } catch (error) {
        console.error("Failed to create node from content item:", error);
        return null;
    }
}

// ============================================================================
// Content Insertion Utilities
// ============================================================================

export async function insertContentChunk(
    editor: Editor,
    chunk: string,
    position: number,
): Promise<void> {
    if (!editor || !chunk.trim()) return;

    editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        let tr = view.state.tr;

        // Insert text at position
        tr = tr.insertText(chunk, position);

        if (tr.docChanged) {
            view.dispatch(tr);
        }
    });
}

export async function insertMarkdownContentAtEnd(
    content: string,
    view: any,
): Promise<void> {
    console.log(
        "🔍 Starting markdown parsing with content:",
        content.substring(0, 100) + "...",
    );
    console.log(
        "🔍 Available schema nodes:",
        Object.keys(view.state.schema.nodes),
    );
    console.log(
        "🔍 Available schema marks:",
        Object.keys(view.state.schema.marks),
    );

    const lines = parseMarkdownLines(content);

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        console.log(`🔍 Processing line ${i}: "${line}"`);

        // Skip empty lines completely to avoid extra spacing
        if (!line.trim()) {
            console.log("⏭️ Skipping empty line to prevent extra spacing");
            continue;
        }

        // Parse different markdown elements and always append at end
        await processMarkdownLine(line, view);
        await delay(EDITOR_CONFIG.TIMING.CONTENT_INSERT_DELAY);
    }

    console.log("✅ Finished processing all markdown lines");
}

async function processMarkdownLine(line: string, view: any): Promise<void> {
    if (isHeading(line, 2)) {
        console.log("📝 Found H2 heading:", line);
        await insertHeadingAtEnd(view, extractHeadingText(line, 2), 2);
    } else if (isHeading(line, 3)) {
        console.log("📝 Found H3 heading:", line);
        await insertHeadingAtEnd(view, extractHeadingText(line, 3), 3);
    } else if (isImage(line)) {
        console.log("📝 Found image:", line);
        await insertImageAtEnd(view, line);
    } else if (isMathBlock(line)) {
        console.log("📝 Found math block:", line);
        await insertMathBlockAtEnd(view, extractMathContent(line));
    } else {
        console.log("📝 Found paragraph:", line);
        await insertParagraphAtEnd(view, line);
    }
}

export async function insertHeadingAtEnd(
    view: any,
    text: string,
    level: number,
): Promise<void> {
    const schema = view.state.schema;
    const headingType = schema.nodes.heading;

    if (headingType) {
        const tr = view.state.tr;
        const docSize = tr.doc.content.size;
        const endPos = Math.max(0, docSize - 2); // Before closing doc node

        const headingNode = headingType.create({ level }, schema.text(text));
        tr.insert(endPos, headingNode);
        view.dispatch(tr);
        console.log(`✅ Inserted heading level ${level}: ${text}`);
    } else {
        console.log("❌ No heading node type found, falling back to paragraph");
        await insertParagraphAtEnd(view, "#".repeat(level) + " " + text);
    }
}

export async function insertMathBlockAtEnd(
    view: any,
    mathContent: string,
): Promise<void> {
    const schema = view.state.schema;

    if (schema.nodes.code_block) {
        const tr = view.state.tr;
        const docSize = tr.doc.content.size;
        const endPos = Math.max(0, docSize - 2);

        // Try different attribute formats
        let codeNode;
        try {
            // Try language first
            codeNode = schema.nodes.code_block.create(
                { language: "latex" },
                schema.text(mathContent),
            );
        } catch (e) {
            try {
                // Try params as fallback
                codeNode = schema.nodes.code_block.create(
                    { params: "latex" },
                    schema.text(mathContent),
                );
            } catch (e2) {
                // Try no attributes
                codeNode = schema.nodes.code_block.create(
                    {},
                    schema.text(mathContent),
                );
            }
        }

        tr.insert(endPos, codeNode);
        view.dispatch(tr);
    } else {
        await insertParagraphAtEnd(view, "$$" + mathContent + "$$");
    }
}

export async function insertParagraphAtEnd(
    view: any,
    text: string,
): Promise<void> {
    const schema = view.state.schema;
    const paragraphType = schema.nodes.paragraph;

    if (paragraphType) {
        const tr = view.state.tr;
        const docSize = tr.doc.content.size;
        const endPos = Math.max(0, docSize - 2);

        // Handle text with inline formatting
        const textNodes = parseInlineText(text, schema);
        const paragraphNode = paragraphType.create(null, textNodes);

        tr.insert(endPos, paragraphNode);
        view.dispatch(tr);
    } else {
        console.log("❌ No paragraph node type found");
    }
}

export async function insertImageAtEnd(
    view: any,
    imageMarkdown: string,
): Promise<void> {
    const schema = view.state.schema;
    const imageData = parseImageMarkdown(imageMarkdown);

    if (imageData && schema.nodes.image) {
        const tr = view.state.tr;
        const docSize = tr.doc.content.size;
        const endPos = Math.max(0, docSize - 2);

        const imageNode = schema.nodes.image.create({
            src: imageData.src,
            alt: imageData.alt,
            title: imageData.alt,
        });
        tr.insert(endPos, imageNode);
        view.dispatch(tr);
    } else {
        await insertParagraphAtEnd(view, imageMarkdown);
    }
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Event Handling Utilities
// ============================================================================

export class EventHandlers {
    private editor: Editor | null = null;

    public setEditor(editor: Editor): void {
        this.editor = editor;
    }

    public setupKeyboardShortcuts(): void {
        document.addEventListener("keydown", (e) => {
            // Handle Enter key for slash commands
            if (e.key === "Enter" && this.editor) {
                this.handleEnterKeyForCommands(e);
            }
        });
    }

    private handleEnterKeyForCommands(e: KeyboardEvent): void {
        if (!this.editor) return;

        this.editor.action((ctx) => {
            const view = ctx.get(editorViewCtx);
            const { from } = view.state.selection;

            // Get the current line content
            const line = view.state.doc.cut(
                view.state.doc.resolve(from).before(),
                view.state.doc.resolve(from).after(),
            );
            const lineText = line.textContent.trim();

            // Check if this is a slash command
            if (lineText.startsWith("/test:") || lineText.startsWith("/")) {
                const command = lineText.trim();
                console.log("🎯 Detected slash command:", command);

                // Prevent default Enter behavior
                e.preventDefault();

                // Handle the command
                this.handleSlashCommand(command, from);
            }
        });
    }

    private async handleSlashCommand(
        command: string,
        position: number,
    ): Promise<void> {
        console.log(
            `⚡ Executing slash command: ${command} at position ${position}`,
        );

        try {
            // Parse command
            if (command.startsWith("/test:continue")) {
                await aiAgentManager.executeAgentCommand("continue", {
                    position,
                    testMode: true,
                });
            } else if (command.startsWith("/continue")) {
                await aiAgentManager.executeAgentCommand("continue", {
                    position,
                    testMode: false,
                });
            } else if (command.startsWith("/test:diagram")) {
                const description =
                    command.replace("/test:diagram", "").trim() ||
                    "test process";
                await aiAgentManager.executeAgentCommand("diagram", {
                    description,
                    position,
                    testMode: true,
                });
            } else if (command.startsWith("/diagram")) {
                const description =
                    command.replace("/diagram", "").trim() || "diagram";
                await aiAgentManager.executeAgentCommand("diagram", {
                    description,
                    position,
                    testMode: false,
                });
            } else if (command.startsWith("/test:augment")) {
                const instruction =
                    command.replace("/test:augment", "").trim() ||
                    "improve formatting";
                await aiAgentManager.executeAgentCommand("augment", {
                    instruction,
                    position,
                    testMode: true,
                });
            } else if (command.startsWith("/augment")) {
                const instruction =
                    command.replace("/augment", "").trim() ||
                    "improve formatting";
                await aiAgentManager.executeAgentCommand("augment", {
                    instruction,
                    position,
                    testMode: false,
                });
            } else {
                console.warn("⚠️ Unknown slash command:", command);
                // Show notification through AI agent manager
                if (aiAgentManager) {
                    aiAgentManager["showNotification"]?.(
                        `Unknown command: ${command}`,
                        "error",
                    );
                }
            }
        } catch (error) {
            console.error("❌ Slash command execution failed:", error);
            if (aiAgentManager) {
                aiAgentManager["showNotification"]?.(
                    `Failed to execute command: ${command}`,
                    "error",
                );
            }
        }
    }

    public parseSlashCommand(command: string): {
        type: string;
        isTest: boolean;
        parameters: string;
    } {
        const isTest = command.startsWith("/test:");
        const cleanCommand = isTest
            ? command.replace("/test:", "")
            : command.replace("/", "");

        const parts = cleanCommand.split(" ");
        const type = parts[0];
        const parameters = parts.slice(1).join(" ");

        return { type, isTest, parameters };
    }
}

// Export singleton for global access
export const eventHandlers = new EventHandlers();
