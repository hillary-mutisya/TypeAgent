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
        
        // Track if we actually received any successful operations
        let operationsReceived = false;
        let errorOccurred = false;

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

            const result = await this.processStreamResponse(reader, params.position || 0);
            operationsReceived = result.operationsReceived;
            errorOccurred = result.errorOccurred;

            // Only show success message if we actually received operations and no errors occurred
            if (operationsReceived && !errorOccurred) {
                console.log("✅ Streaming command completed successfully");
                this.showNotification(
                    `✅ ${command} completed successfully!`,
                    "success",
                );
            } else if (errorOccurred) {
                // Error message already shown in stream handler, just log
                console.log("❌ Streaming command failed");
            } else {
                // No operations but no explicit error - agent might be unavailable
                console.log("⚠️ Streaming command completed but no content generated");
            }
        } finally {
            // Hide AI presence cursor
            this.showAIPresence(false);
        }
    }

    private async processStreamResponse(
        reader: ReadableStreamDefaultReader<Uint8Array>,
        position: number,
    ): Promise<{ operationsReceived: boolean; errorOccurred: boolean }> {
        const decoder = new TextDecoder();
        let buffer = "";
        let operationsReceived = false;
        let errorOccurred = false;

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
                        const result = await this.handleStreamEvent(data, position);
                        if (result.operationsReceived) operationsReceived = true;
                        if (result.errorOccurred) errorOccurred = true;
                    } catch (e) {
                        console.warn("Failed to parse stream data:", line);
                    }
                }
            }
        }

        return { operationsReceived, errorOccurred };
    }

    private async handleStreamEvent(
        data: StreamEvent,
        position: number,
    ): Promise<{ operationsReceived: boolean; errorOccurred: boolean }> {
        let operationsReceived = false;
        let errorOccurred = false;

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
                // Handle success/error notifications from agent
                const notificationType = (data as any).notificationType;
                const message = (data as any).message;
                
                console.log(`[${notificationType?.toUpperCase()}] ${message}`);
                this.showNotification(message, notificationType);
                
                // Track errors
                if (notificationType === "error") {
                    errorOccurred = true;
                }
                break;
                
            case "operationsApplied":
                // Operations already applied by agent, just track completion
                const operationCount = (data as any).operationCount || 0;
                console.log(`✅ Agent applied ${operationCount} operations`);
                
                // Only count as operations received if we actually got some operations
                if (operationCount > 0) {
                    operationsReceived = true;
                }
                break;

            case "llmOperations":
                // TEMPORARY: Handle operations sent to ALL clients via SSE
                console.log(`🎯 [LLM-OPS] Received ${(data as any).operations?.length || 0} operations via SSE (role: ${(data as any).clientRole || 'unknown'})`);
                
                // LOG DETAILED OPERATION OBJECTS
                if ((data as any).operations && Array.isArray((data as any).operations)) {
                    console.log(`📋 [LLM-OPS-DEBUG] Detailed operation objects:`);
                    (data as any).operations.forEach((operation: any, index: number) => {
                        console.log(`📋 [LLM-OPS-DEBUG] Operation ${index + 1}:`, {
                            type: operation.type,
                            position: operation.position,
                            from: operation.from,
                            to: operation.to,
                            content: operation.content,
                            description: operation.description,
                            fullOperation: operation
                        });
                        
                        // Log content structure in detail
                        if (operation.content) {
                            console.log(`📋 [LLM-OPS-DEBUG] Operation ${index + 1} content structure:`, JSON.stringify(operation.content, null, 2));
                        }
                    });
                }
                
                if (((data as any).clientRole === 'primary' || (data as any).clientRole === 'all') && (data as any).operations && Array.isArray((data as any).operations)) {
                    // Apply operations through editor API (ensures proper markdown parsing)
                    console.log(`📝 [LLM-OPS-DEBUG] About to apply ${(data as any).operations.length} operations through applyAgentOperations`);
                    this.applyAgentOperations((data as any).operations);
                    operationsReceived = true;
                    
                    console.log(`✅ [LLM-OPS] Applied ${(data as any).operations.length} operations via editor API (role: ${(data as any).clientRole})`);
                } else if ((data as any).clientRole && (data as any).clientRole !== 'primary' && (data as any).clientRole !== 'all') {
                    console.log(`ℹ️ [LLM-OPS] Ignoring operations - client role "${(data as any).clientRole}" not authorized`);
                } else {
                    console.warn(`⚠️ [LLM-OPS] No valid operations in SSE event:`, data);
                }
                break;

            case "operationsBeingApplied":
                // NEW: Handle notification that operations are being applied by primary client
                console.log(`📢 [LLM-OPS] Operations being applied by primary client - ${(data as any).operationCount} changes incoming`);
                this.updateAIPresenceMessage(`AI is applying ${(data as any).operationCount} changes...`);
                break;

            case "complete":
                this.showAIPresence(false);
                this.isTestMode = false; // Reset test mode flag
                console.log("✅ Streaming command completed");
                break;

            case "error":
                console.log(`[ERROR] ${(data as any).error}`);
                this.showNotification((data as any).error, "error");
                this.showAIPresence(false);
                this.isTestMode = false; // Reset test mode flag on error
                errorOccurred = true;
                break;

            // Legacy content handlers for backward compatibility
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
                    operationsReceived = true; // Content insertion counts as operation
                }
                break;

            case "operation":
                // Apply operation to document
                if (data.operation) {
                    this.applyAgentOperations([data.operation]);
                    operationsReceived = true;
                }
                break;
        }

        return { operationsReceived, errorOccurred };
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
