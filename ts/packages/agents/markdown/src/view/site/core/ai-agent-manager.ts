import type { Editor } from "@milkdown/core";
import { editorViewCtx } from "@milkdown/core";
import type {
    AgentRequest,
    AgentCommandParams,
    StreamEvent,
    DocumentOperation,
    AgentCommand,
} from "../types";
import { AI_CONFIG, EDITOR_CONFIG } from "../config";
import {
    insertContentChunk,
    insertMarkdownContentAtEnd,
    contentItemToNode,
} from "../utils";

export class AIAgentManager {
    private editor: Editor | null = null;
    private notificationManager: any = null;
    private aiPresenceIndicator: HTMLElement | null = null;
    private isTestMode: boolean = false; // Track test mode to prevent duplicate content

    public setEditor(editor: Editor): void {
        this.editor = editor;
    }

    public setNotificationManager(notificationManager: any): void {
        this.notificationManager = notificationManager;
    }

    public async executeAgentCommand(
        command: AgentCommand,
        params: AgentCommandParams,
    ): Promise<void> {
        try {
            console.log(`🤖 Executing agent command: ${command}`, params);

            // Always use streaming for better UX
            await this.executeStreamingAgentCommand(command, params);
        } catch (error) {
            console.error(`❌ Agent command failed:`, error);
            this.showNotification(
                `Failed to execute ${command} command. Please try again.`,
                "error",
            );
        }
    }

    private async executeStreamingAgentCommand(
        command: AgentCommand,
        params: AgentCommandParams,
    ): Promise<void> {
        const request = this.buildAgentRequest(command, params);
        
        // Track test mode to prevent duplicate content insertion
        this.isTestMode = params.testMode || false;

        // Show AI presence cursor
        this.showAIPresence(true);

        try {
            // Call streaming endpoint
            const response = await fetch(AI_CONFIG.ENDPOINTS.STREAM, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(request),
            });

            if (!response.ok) {
                throw new Error(`Streaming failed: ${response.status}`);
            }

            const reader = response.body?.getReader();
            if (!reader) {
                throw new Error("No response stream available");
            }

            await this.processStreamResponse(reader, params.position || 0);

            console.log("✅ Streaming command completed successfully");
            this.showNotification(
                `✅ ${command} completed successfully!`,
                "success",
            );
        } finally {
            // Hide AI presence cursor
            this.showAIPresence(false);
        }
    }

    private async processStreamResponse(
        reader: ReadableStreamDefaultReader<Uint8Array>,
        position: number,
    ): Promise<void> {
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            // Process complete lines
            const lines = buffer.split("\n");
            buffer = lines.pop() || ""; // Keep incomplete line in buffer

            for (const line of lines) {
                if (line.startsWith("data: ")) {
                    try {
                        const data = JSON.parse(line.slice(6));
                        await this.handleStreamEvent(data, position);
                    } catch (e) {
                        console.warn("Failed to parse stream data:", line);
                    }
                }
            }
        }
    }

    private async handleStreamEvent(
        data: StreamEvent,
        position: number,
    ): Promise<void> {
        switch (data.type) {
            case "start":
                console.log("🎬 Stream started:", data.message);
                break;

            case "typing":
                this.updateAIPresenceMessage(
                    data.message || "AI is thinking...",
                );
                break;

            case "notification":
                // NEW: Handle success/error notifications from agent
                console.log(`[${(data as any).notificationType?.toUpperCase()}] ${(data as any).message}`);
                this.showNotification((data as any).message, (data as any).notificationType);
                break;
                
            case "operationsApplied":
                // NEW: Operations already applied by agent, just show completion
                console.log(`✅ Agent applied ${(data as any).operationCount} operations`);
                // Don't show duplicate notification here - the "notification" event handles UI feedback
                break;

            case "complete":
                this.showAIPresence(false);
                this.isTestMode = false; // Reset test mode flag
                console.log("✅ Streaming command completed successfully");
                break;

            case "error":
                console.log(`[ERROR] ${(data as any).error}`);
                this.showNotification((data as any).error, "error");
                this.showAIPresence(false);
                this.isTestMode = false; // Reset test mode flag on error
                break;

            // LEGACY: Keep old handlers for backward compatibility during transition
            case "content":
                // Skip content events for test mode commands to prevent duplicate content
                // Test mode sends both content chunks AND operations, but we only want operations
                if (this.isTestMode) {
                    console.log("🚫 Skipping content chunk in test mode to prevent duplicate:", 
                        data.chunk?.substring(0, 50) + "...");
                    break;
                }
                
                // Insert content chunk at position for non-test content
                if (this.editor && data.chunk) {
                    await insertContentChunk(
                        this.editor,
                        data.chunk,
                        data.position || position,
                    );
                }
                break;

            case "operation":
                // Apply operation to document
                if (data.operation) {
                    this.applyAgentOperations([data.operation]);
                }
                break;
        }
    }

    private buildAgentRequest(
        command: AgentCommand,
        params: AgentCommandParams,
    ): AgentRequest {
        let originalRequest = "";

        // Add test prefix if in test mode
        const prefix = params.testMode
            ? AI_CONFIG.COMMAND_PREFIXES.TEST
            : AI_CONFIG.COMMAND_PREFIXES.STANDARD;

        switch (command) {
            case "continue":
                originalRequest = `${prefix}continue`;
                break;
            case "diagram":
                originalRequest = `${prefix}diagram ${params.description || ""}`;
                break;
            case "augment":
                originalRequest = `${prefix}augment ${params.instruction || ""}`;
                break;
        }

        return {
            action: "updateDocument",
            parameters: {
                originalRequest,
                context: {
                    position: params.position || 0,
                    command: command,
                    params: params,
                },
            },
        };
    }

    private applyAgentOperations(operations: DocumentOperation[]): void {
        if (!this.editor) {
            console.error("Editor not initialized");
            return;
        }

        console.log("📝 Applying operations from agent:", operations);

        this.editor.action((ctx) => {
            const view = ctx.get(editorViewCtx);
            let tr = view.state.tr;

            for (const operation of operations) {
                switch (operation.type) {
                    case "insert":
                        tr = this.applyInsertOperation(tr, operation, view);
                        break;
                    case "insertMarkdown":
                        tr = this.applyInsertMarkdownOperation(
                            tr,
                            operation,
                            view,
                        );
                        break;
                    // Add more operation types as needed
                }
            }

            if (tr.docChanged) {
                view.dispatch(tr);
            }
        });
    }

    private applyInsertOperation(
        tr: any,
        operation: DocumentOperation,
        view: any,
    ): any {
        try {
            const schema = view.state.schema;
            const position = operation.position || tr.selection.head;

            if (operation.content && Array.isArray(operation.content)) {
                for (const contentItem of operation.content) {
                    const node = contentItemToNode(contentItem, schema);
                    if (node) {
                        tr = tr.insert(position, node);
                    }
                }
            }
        } catch (error) {
            console.error("Failed to apply insert operation:", error);
        }

        return tr;
    }

    private applyInsertMarkdownOperation(
        tr: any,
        operation: any,
        view: any,
    ): any {
        try {
            const markdown = operation.markdown || "";

            // Parse markdown content and create proper nodes
            setTimeout(() => {
                insertMarkdownContentAtEnd(markdown, view);
            }, EDITOR_CONFIG.TIMING.MARKDOWN_UPDATE_DELAY);

            return tr;
        } catch (error) {
            console.error("Failed to apply insert markdown operation:", error);
            const position = operation.position || tr.selection.head;
            const markdown = operation.markdown || "";
            return tr.insertText(markdown, position);
        }
    }

    private showAIPresence(show: boolean): void {
        if (show) {
            if (!this.aiPresenceIndicator) {
                this.aiPresenceIndicator = this.createAIPresenceIndicator();
                document.body.appendChild(this.aiPresenceIndicator);
            }
            this.aiPresenceIndicator.style.display = "block";
        } else {
            if (this.aiPresenceIndicator) {
                this.aiPresenceIndicator.style.display = "none";
            }
        }
    }

    private createAIPresenceIndicator(): HTMLElement {
        const indicator = document.createElement("div");
        indicator.id = "ai-presence-indicator";
        indicator.className = "ai-presence-indicator";
        indicator.innerHTML = `
      <div class="ai-avatar">🤖</div>
      <div class="ai-message">AI is thinking...</div>
      <div class="ai-typing-dots">
        <span></span><span></span><span></span>
      </div>
    `;
        return indicator;
    }

    private updateAIPresenceMessage(message: string): void {
        if (this.aiPresenceIndicator) {
            const messageEl =
                this.aiPresenceIndicator.querySelector(".ai-message");
            if (messageEl) {
                messageEl.textContent = message;
            }
        }
    }

    private showNotification(
        message: string,
        type: "success" | "error" | "info" = "info",
    ): void {
        if (this.notificationManager) {
            this.notificationManager.showNotification(message, type);
        } else {
            console.log(`[${type.toUpperCase()}] ${message}`);
        }
    }
}

// Export singleton instance for global access
export const aiAgentManager = new AIAgentManager();

// Export function for external access (maintains compatibility)
export async function executeAgentCommand(
    command: AgentCommand,
    params: AgentCommandParams,
): Promise<void> {
    return aiAgentManager.executeAgentCommand(command, params);
}
