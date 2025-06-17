// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import {
    ActionContext,
    AppAction,
    AppAgent,
    SessionContext,
    ActionResult,
    Storage,
    AppAgentInitSettings,
} from "@typeagent/agent-sdk";
import { createActionResult } from "@typeagent/agent-sdk/helpers/action";
import { MarkdownAction } from "./markdownActionSchema.js";
import { DocumentOperation } from "./markdownOperationSchema.js";
import { createMarkdownAgent } from "./translator.js";
import { ChildProcess, fork } from "child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { TypeAgentYjsProvider } from "./TypeAgentYjsProvider.js";
import { CollaborationContext } from "./collaborationTypes.js";
import { AIAgentCollaborator } from "./AIAgentCollaborator.js";
import { AsyncResearchHandler } from "./AsyncResearchHandler.js";
import { LLMIntegrationService, DEFAULT_LLM_CONFIG } from "./LLMIntegrationService.js";
import { UICommandResult } from "./ipcTypes.js";
import findConfig from "find-config";
import dotenv from "dotenv";

// Load environment variables from .env file if needed
if (!process.env["AZURE_OPENAI_ENDPOINT"] && !process.env["OPENAI_ENDPOINT"]) {
    const dotEnvPath = findConfig(".env");
    if (dotEnvPath) {
        console.log(`🔧 [Action Handler] Loading environment variables from: ${dotEnvPath}`);
        dotenv.config({ path: dotEnvPath });
    } else {
        console.log("⚠️ [Action Handler] No .env file found, using system environment variables");
    }
}

// Debug: Log Azure OpenAI configuration status in action handler
console.log("🔍 [Action Handler] Azure OpenAI Configuration Debug:");
const azureEnvVars = [
    'AZURE_OPENAI_API_KEY',
    'AZURE_OPENAI_API_INSTANCE_NAME', 
    'AZURE_OPENAI_API_DEPLOYMENT_NAME',
    'AZURE_OPENAI_API_VERSION',
    'AZURE_OPENAI_ENDPOINT'
];

azureEnvVars.forEach(varName => {
    const value = process.env[varName];
    if (value) {
        // Show partial value for security
        const maskedValue = varName.includes('KEY') 
            ? `${value.substring(0, 8)}...` 
            : value;
        console.log(`✅ [Action Handler] ${varName}: ${maskedValue}`);
    } else {
        console.log(`❌ [Action Handler] ${varName}: NOT SET`);
    }
});

console.log("🔧 [Action Handler] Environment configuration check complete.\n");

export function instantiate(): AppAgent {
    return {
        initializeAgentContext: initializeMarkdownContext,
        updateAgentContext: updateMarkdownContext,
        executeAction: executeMarkdownAction,
        validateWildcardMatch: markdownValidateWildcardMatch,
        streamPartialAction: streamPartialMarkdownAction,
    };
}

type MarkdownActionContext = {
    currentFileName?: string | undefined;
    viewProcess?: ChildProcess | undefined;
    collaborationProcess?: ChildProcess | undefined;
    localHostPort: number;
    collaborationProvider?: TypeAgentYjsProvider | undefined;
    collaborationContext?: CollaborationContext | undefined;
    aiCollaborator?: AIAgentCollaborator | undefined;
    researchHandler?: AsyncResearchHandler | undefined;
    llmService?: LLMIntegrationService | undefined;
};

// NEW: Handle UI commands sent from view process (Flow 2)
async function handleUICommand(
    command: string,
    parameters: any,
    context: ActionContext<MarkdownActionContext>,
): Promise<UICommandResult> {
    console.log(`🖥️ [AGENT] Processing UI command: ${command}`);
    
    try {
        // Build action from UI command (similar to CLI action building)
        const action: MarkdownAction = {
            actionName: "updateDocument",
            parameters: {
                originalRequest: parameters.originalRequest,
                aiCommand: command,
            }
        };
        
        // Use existing LLM integration (same as Flow 1)
        const result = await handleMarkdownAction(action, context);
        
        return {
            success: true,
            operations: result.data?.operations || [],
            message: result.data?.operationSummary || "Command completed successfully",
            type: "success"
        };
        
    } catch (error) {
        console.error(`❌ [AGENT] UI command failed:`, error);
        return {
            success: false,
            error: (error as Error).message,
            message: `Failed to execute ${command} command`,
            type: "error"
        };
    }
}

async function streamPartialMarkdownAction(
    actionName: string,
    name: string,
    value: string,
    delta: string | undefined,
    context: ActionContext<MarkdownActionContext>,
): Promise<void> {
    if (actionName !== "streamingUpdateDocument") {
        return;
    }

    console.log(`🌊 Streaming ${name}: delta="${delta}"`);

    const collaborationProvider = context.sessionContext.agentContext.collaborationProvider;
    
    switch (name) {
        case "parameters.generatedContent":
            // Stream text content in real-time
            handleStreamingContent(delta, context, collaborationProvider);
            break;
            
        case "parameters.progressStatus":
            // Show progress updates for research operations
            handleProgressUpdate(delta, context);
            break;
            
        case "parameters.validationResults":
            // Show validation feedback
            handleValidationFeedback(delta, context);
            break;
    }
}

function handleStreamingContent(
    delta: string | undefined,
    context: ActionContext<MarkdownActionContext>,
    collaborationProvider?: TypeAgentYjsProvider
): void {
    if (delta === undefined) {
        // Streaming completed - finalize
        context.actionIO.appendDisplay("");
        console.log("🏁 Streaming completed");
        return;
    }

    if (delta) {
        // Accumulate streaming content
        if (context.streamingContext === undefined) {
            context.streamingContext = "";
        }
        context.streamingContext += delta;

        // Show delta to user
        context.actionIO.appendDisplay({
            type: "text",
            content: delta,
            speak: false, // Don't speak markdown content
        }, "inline");

        // Apply to collaborative document in real-time
        if (collaborationProvider) {
            const currentContent = collaborationProvider.getMarkdownContent();
            const insertPosition = currentContent.length; // Append at end
            collaborationProvider.applyTextOperation(insertPosition, delta);
            console.log(`📝 Applied delta to collaboration doc at position ${insertPosition}`);
        }
    }
}

function handleProgressUpdate(
    delta: string | undefined,
    context: ActionContext<MarkdownActionContext>
): void {
    if (delta) {
        context.actionIO.appendDisplay({
            type: "text",
            content: `🔄 ${delta}`,
            kind: "status"
        }, "temporary");
    }
}

function handleValidationFeedback(
    delta: string | undefined,
    context: ActionContext<MarkdownActionContext>
): void {
    if (delta) {
        context.actionIO.appendDisplay({
            type: "text",
            content: `✓ ${delta}`,
            kind: "info"
        }, "block");
    }
}

async function markdownValidateWildcardMatch(
    action: AppAction,
    context: SessionContext<MarkdownActionContext>,
) {
    return true;
}

async function initializeMarkdownContext(
    settings?: AppAgentInitSettings,
): Promise<MarkdownActionContext> {
    const localHostPort = settings?.localHostPort;
    if (localHostPort === undefined) {
        throw new Error("Local view port not assigned.");
    }
    return {
        localHostPort: localHostPort,
    };
}

async function updateMarkdownContext(
    enable: boolean,
    context: SessionContext<MarkdownActionContext>,
): Promise<void> {
    if (enable) {
        // Store agent context for UI command processing
        setCurrentAgentContext(context.agentContext);
        
        if (!context.agentContext.currentFileName) {
            context.agentContext.currentFileName = "live.md";
        }

        const storage = context.sessionStorage;
        const fileName = context.agentContext.currentFileName;

        if (!(await storage?.exists(fileName))) {
            await storage?.write(fileName, "");
        }

        // Initialize collaboration provider
        if (!context.agentContext.collaborationProvider) {
            try {
                // Start y-websocket server if not already running
                if (!context.agentContext.collaborationProcess) {
                    context.agentContext.collaborationProcess = await startCollaborationServer();
                }

                const collaborationConfig = {
                    documentId: fileName.replace(".md", ""), // Use filename as document ID
                    websocketUrl: "ws://localhost:1234", // Standard y-websocket-server port
                    userInfo: {
                        id: `user-${Date.now()}`, // Generate unique user ID
                        name: "User",
                        avatar: "👤",
                        color: "#4A90E2",
                    },
                    enableAI: true,
                };

                context.agentContext.collaborationProvider =
                    new TypeAgentYjsProvider(collaborationConfig);
                context.agentContext.collaborationContext =
                    context.agentContext.collaborationProvider.getContext();

                // Initialize AI collaborator and research handler
                context.agentContext.aiCollaborator = new AIAgentCollaborator(
                    context.agentContext.collaborationProvider,
                );
                context.agentContext.researchHandler = new AsyncResearchHandler(
                    context.agentContext.aiCollaborator,
                );

                // Initialize LLM Integration Service
                if (!context.agentContext.llmService) {
                    context.agentContext.llmService = new LLMIntegrationService(
                        "GPT_4o", // Default model
                        DEFAULT_LLM_CONFIG
                    );
                    
                    // Connect LLM service to AI collaborator
                    context.agentContext.aiCollaborator.setLLMService(
                        context.agentContext.llmService
                    );
                    
                    console.log("🧠 LLM Integration Service initialized and connected");
                }

                // Load existing content into Yjs document
                const existingContent =
                    (await storage?.read(fileName, "utf8")) || "";
                if (existingContent) {
                    context.agentContext.collaborationProvider.setMarkdownContent(
                        existingContent,
                    );
                }

                console.log(
                    "✅ Collaboration provider initialized for:",
                    fileName,
                );
                console.log("🤖 AI collaborator initialized and ready");
            } catch (error) {
                console.error(
                    "❌ Failed to initialize collaboration provider:",
                    error,
                );
                // Continue without collaboration if it fails
            }
        }

        if (!context.agentContext.viewProcess) {
            const fullPath = await getFullMarkdownFilePath(fileName, storage!);
            if (fullPath) {
                process.env.MARKDOWN_FILE = fullPath;
                context.agentContext.viewProcess = await createViewServiceHost(
                    fullPath,
                    context.agentContext.localHostPort,
                );
            }
        }
    } else {
        // Shut down services
        if (context.agentContext.collaborationProvider) {
            context.agentContext.collaborationProvider.disconnect();
            context.agentContext.collaborationProvider = undefined;
            context.agentContext.collaborationContext = undefined;
        }

        if (context.agentContext.aiCollaborator) {
            context.agentContext.aiCollaborator = undefined;
        }

        if (context.agentContext.researchHandler) {
            context.agentContext.researchHandler.cleanup();
            context.agentContext.researchHandler = undefined;
        }

        if (context.agentContext.collaborationProcess) {
            context.agentContext.collaborationProcess.kill();
            context.agentContext.collaborationProcess = undefined;
        }

        if (context.agentContext.viewProcess) {
            context.agentContext.viewProcess.kill();
            context.agentContext.viewProcess = undefined;
        }
    }
}

async function getFullMarkdownFilePath(fileName: string, storage: Storage) {
    const paths = await storage?.list("", { fullPath: true });
    const candidates = paths?.filter((item) => item.endsWith(fileName!));

    return candidates ? candidates[0] : undefined;
}

async function handleMarkdownAction(
    action: MarkdownAction,
    actionContext: ActionContext<MarkdownActionContext>,
) {
    let result: ActionResult | undefined = undefined;
    const agent = await createMarkdownAgent("GPT_4o");
    const storage = actionContext.sessionContext.sessionStorage;

    switch (action.actionName) {
        case "openDocument":
        case "createDocument": {
            if (!action.parameters.name) {
                result = createActionResult(
                    "Document could not be created: no name was provided",
                );
            } else {
                result = createActionResult("Opening document ...");

                const newFileName = action.parameters.name.trim() + ".md";
                actionContext.sessionContext.agentContext.currentFileName =
                    newFileName;

                if (!(await storage?.exists(newFileName))) {
                    await storage?.write(newFileName, "");
                }

                if (actionContext.sessionContext.agentContext.viewProcess) {
                    const fullPath = await getFullMarkdownFilePath(
                        newFileName,
                        storage!,
                    );

                    actionContext.sessionContext.agentContext.viewProcess.send({
                        type: "setFile",
                        filePath: fullPath,
                    });
                }
                result = createActionResult("Document opened");
                result.activityContext = {
                    activityName: "editingMarkdown",
                    description: "Editing a Markdown document",
                    state: {
                        fileName: newFileName,
                    },
                    openLocalView: true,
                };
            }
            break;
        }
        case "updateDocument": {
            console.log("🔍 [PHASE1] Starting updateDocument action in agent process");
            result = createActionResult("Updating document ...");

            const filePath = `${actionContext.sessionContext.agentContext.currentFileName}`;
            let markdownContent;
            if (await storage?.exists(filePath)) {
                markdownContent = await storage?.read(filePath, "utf8");
                console.log("🔍 [PHASE1] Read content from storage:", markdownContent?.length, "chars");
            }

            // Use collaboration provider if available
            const collaborationProvider =
                actionContext.sessionContext.agentContext.collaborationProvider;
            const researchHandler =
                actionContext.sessionContext.agentContext.researchHandler;

            if (collaborationProvider) {
                // Update collaboration document content
                markdownContent = collaborationProvider.getMarkdownContent();
                console.log("🔍 [PHASE1] Got content from collaboration provider:", markdownContent?.length, "chars");
            }

            // Check if this is an AI command that should be handled asynchronously
            const request = action.parameters.originalRequest;
            const position = 0; // Default position for now - can be enhanced later

            if (researchHandler && isAsyncAICommand(request)) {
                // Handle async AI requests through the research handler
                const requestId = await handleAsyncAIRequest(
                    researchHandler,
                    request,
                    position,
                );
                result = createActionResult(
                    `AI request queued (${requestId}). Working asynchronously...`,
                );
            } else {
                // Handle synchronous requests through the agent
                const response = await agent.updateDocument(
                    markdownContent,
                    action.parameters.originalRequest,
                );

                if (response.success) {
                    const updateResult = response.data;

                    // Apply operations to the document
                    if (
                        updateResult.operations &&
                        updateResult.operations.length > 0
                    ) {
                        // Apply to collaboration provider first
                        if (collaborationProvider) {
                            console.log("🔍 [PHASE1] Agent applying operations to Yjs:", updateResult.operations.length);
                            applyOperationsToYjsDocument(
                                collaborationProvider,
                                updateResult.operations,
                            );

                            // Sync back to storage
                            const updatedContent =
                                collaborationProvider.getMarkdownContent();
                            await storage?.write(filePath, updatedContent);
                            console.log("🔍 [PHASE1] Agent wrote updated content to storage:", updatedContent.length, "chars");
                        } else {
                            // Fallback to direct file operations
                            if (markdownContent) {
                                const updatedContent =
                                    applyOperationsToMarkdown(
                                        markdownContent,
                                        updateResult.operations,
                                    );
                                await storage?.write(filePath, updatedContent);
                            }
                        }

                        // Send operations to the view process
                        if (
                            actionContext.sessionContext.agentContext
                                .viewProcess
                        ) {
                            console.log("🔍 [PHASE1] Agent sending operations to view process via IPC");
                            actionContext.sessionContext.agentContext.viewProcess.send(
                                {
                                    type: "applyOperations",
                                    operations: updateResult.operations,
                                },
                            );
                        }
                    }

                    if (updateResult.operationSummary) {
                        result = createActionResult(
                            updateResult.operationSummary,
                        );
                    } else {
                        result = createActionResult("Updated document");
                    }
                } else {
                    console.error(response.message);
                    result = createActionResult(
                        "Failed to update document: " + response.message,
                    );
                }
            }
            break;
        }
        case "streamingUpdateDocument": {
            // Handle streaming AI commands with real-time updates
            result = createActionResult("Processing AI request with streaming...");

            const filePath = `${actionContext.sessionContext.agentContext.currentFileName}`;
            let markdownContent = "";
            if (await storage?.exists(filePath)) {
                markdownContent = (await storage?.read(filePath, "utf8")) || "";
            }

            const collaborationProvider = actionContext.sessionContext.agentContext.collaborationProvider;
            const llmService = actionContext.sessionContext.agentContext.llmService;

            if (collaborationProvider) {
                markdownContent = collaborationProvider.getMarkdownContent();
            }

            if (llmService) {
                // Use streaming LLM integration
                const request = action.parameters.originalRequest;
                const aiCommand = action.parameters.aiCommand || detectAICommand(request);
                
                try {
                    // Build context for AI request
                    const context = {
                        currentContent: markdownContent,
                        cursorPosition: markdownContent.length,
                        surroundingText: markdownContent,
                    };

                    // Process with streaming callback
                    const aiResult = await llmService.processAIRequest(
                        aiCommand,
                        { hint: extractHintFromRequest(request) },
                        context,
                        {
                            onContent: (delta) => {
                                // This will be handled by streamPartialAction
                                console.log(`📝 Streaming content: ${delta.substring(0, 50)}...`);
                            },
                            onProgress: (status) => {
                                console.log(`🔄 Progress: ${status}`);
                            }
                        }
                    );

                    // Apply the complete result to the document
                    if (aiResult.operations) {
                        if (collaborationProvider) {
                            applyOperationsToYjsDocument(collaborationProvider, aiResult.operations);
                            const updatedContent = collaborationProvider.getMarkdownContent();
                            await storage?.write(filePath, updatedContent);
                        } else if (markdownContent) {
                            const updatedContent = applyOperationsToMarkdown(markdownContent, aiResult.operations);
                            await storage?.write(filePath, updatedContent);
                        }
                    }

                    result = createActionResult(
                        `AI ${aiCommand} command completed successfully`
                    );
                } catch (error) {
                    console.error("Streaming AI request failed:", error);
                    result = createActionResult(
                        `Failed to process AI request: ${(error as Error).message}`
                    );
                }
            } else {
                result = createActionResult(
                    "LLM service not available - using fallback"
                );
            }
            break;
        }
    }
    return result;
}

/**
 * Detect AI command from user request
 */
function detectAICommand(request: string): "continue" | "diagram" | "augment" | "research" {
    const lowerRequest = request.toLowerCase();
    
    if (lowerRequest.includes("/continue") || lowerRequest.includes("continue writing")) {
        return "continue";
    }
    if (lowerRequest.includes("/diagram") || lowerRequest.includes("create diagram")) {
        return "diagram";
    }
    if (lowerRequest.includes("/augment") || lowerRequest.includes("improve") || lowerRequest.includes("enhance")) {
        return "augment";
    }
    if (lowerRequest.includes("/research") || lowerRequest.includes("research")) {
        return "research";
    }
    
    // Default to continue for general content requests
    return "continue";
}

/**
 * Extract hint from user request
 */
function extractHintFromRequest(request: string): string | undefined {
    const match = request.match(/\/continue\s+(.+)/i) || request.match(/continue writing\s+(.+)/i);
    return match ? match[1].trim() : undefined;
}

/**
 * Start y-websocket collaboration server
 */
async function startCollaborationServer(): Promise<ChildProcess | undefined> {
    return new Promise((resolve, reject) => {
        try {
            console.log("🔄 Starting y-websocket collaboration server...");
            
            // Use spawn to run npx y-websocket-server
            const { spawn } = require("child_process");
            const collaborationProcess = spawn("npx", ["-y", "y-websocket-server", "--port", "1234"], {
                stdio: ["pipe", "pipe", "pipe"],
                env: process.env,
            });

            // Handle process events
            collaborationProcess.on("error", (error: Error) => {
                console.error("❌ Failed to start collaboration server:", error);
                reject(error);
            });

            collaborationProcess.on("exit", (code: number | null) => {
                console.log(`📡 Collaboration server exited with code: ${code}`);
            });

            // Wait a moment for the server to start, then resolve
            setTimeout(() => {
                console.log("✅ Collaboration server started on port 1234");
                resolve(collaborationProcess);
            }, 2000);

        } catch (error) {
            console.error("❌ Error starting collaboration server:", error);
            resolve(undefined);
        }
    });
}

export async function createViewServiceHost(filePath: string, port: number) {
    let timeoutHandle: NodeJS.Timeout;

    const timeoutPromise = new Promise<undefined>((_resolve, reject) => {
        timeoutHandle = setTimeout(
            () => reject(new Error("Markdown view service creation timed out")),
            10000,
        );
    });

    const viewServicePromise = new Promise<ChildProcess | undefined>(
        (resolve, reject) => {
            try {
                const expressService = fileURLToPath(
                    new URL(
                        path.join("..", "./view/route/service.js"),
                        import.meta.url,
                    ),
                );

                const childProcess = fork(expressService, [port.toString()], {
                    // Explicitly inherit environment variables to ensure .env values are passed
                    env: process.env
                });

                childProcess.send({
                    type: "setFile",
                    filePath: filePath,
                });

                childProcess.on("message", function (message) {
                    if (message === "Success") {
                        resolve(childProcess);
                    } else if (message === "Failure") {
                        resolve(undefined);
                    }
                });

                childProcess.on("exit", (code) => {
                    console.log("Markdown view server exited with code:", code);
                });
            } catch (e: any) {
                console.error(e);
                resolve(undefined);
            }
        },
    );

    return Promise.race([viewServicePromise, timeoutPromise]).then((result) => {
        clearTimeout(timeoutHandle);
        return result;
    });
}

function applyOperationsToYjsDocument(
    provider: TypeAgentYjsProvider,
    operations: DocumentOperation[],
): void {
    const ytext = provider.getText();

    // Sort operations by position (reverse order for insertions to avoid position shifts)
    const sortedOps = [...operations].sort((a, b) => {
        if (a.type === "insert" || a.type === "replace") {
            return (
                ((b as any).position || (b as any).from || 0) -
                ((a as any).position || (a as any).from || 0)
            );
        }
        return (
            ((a as any).position || (a as any).from || 0) -
            ((b as any).position || (b as any).from || 0)
        );
    });

    for (const operation of sortedOps) {
        try {
            switch (operation.type) {
                case "insert": {
                    const insertText = operation.content
                        .map((item) => contentItemToText(item))
                        .join("");

                    const position = Math.min(
                        operation.position || 0,
                        ytext.length,
                    );
                    provider.applyTextOperation(position, insertText);
                    break;
                }
                case "replace": {
                    const replaceText = operation.content
                        .map((item) => contentItemToText(item))
                        .join("");

                    const fromPos = Math.min(operation.from || 0, ytext.length);
                    const toPos = Math.min(
                        operation.to || fromPos + 1,
                        ytext.length,
                    );
                    const deleteLength = toPos - fromPos;

                    provider.applyTextOperation(
                        fromPos,
                        replaceText,
                        deleteLength,
                    );
                    break;
                }
                case "delete": {
                    const fromPos = Math.min(operation.from || 0, ytext.length);
                    const toPos = Math.min(
                        operation.to || fromPos + 1,
                        ytext.length,
                    );
                    const deleteLength = toPos - fromPos;

                    provider.applyTextOperation(fromPos, "", deleteLength);
                    break;
                }
            }
        } catch (error) {
            console.error(
                `Failed to apply Yjs operation ${operation.type}:`,
                error,
            );
        }
    }
}

function applyOperationsToMarkdown(
    content: string,
    operations: DocumentOperation[],
): string {
    const lines = content.split("\n");

    // Sort operations by position (reverse order for insertions)
    const sortedOps = [...operations].sort((a, b) => {
        if (a.type === "insert" || a.type === "replace") {
            return (
                (b as any).position - (a as any).position ||
                ((b as any).from || 0) - ((a as any).from || 0)
            );
        }
        return (
            (a as any).position - (b as any).position ||
            ((a as any).from || 0) - ((b as any).from || 0)
        );
    });

    for (const operation of sortedOps) {
        try {
            switch (operation.type) {
                case "insert": {
                    const insertContent = operation.content
                        .map((item) => contentItemToText(item))
                        .join("");

                    // Simple position-based insertion (by line for simplicity)
                    const lineIndex = Math.min(
                        operation.position || 0,
                        lines.length,
                    );
                    lines.splice(lineIndex, 0, insertContent);
                    break;
                }

                case "replace": {
                    const replaceContent = operation.content
                        .map((item) => contentItemToText(item))
                        .join("");

                    const fromLine = Math.min(
                        operation.from || 0,
                        lines.length - 1,
                    );
                    const toLine = Math.min(
                        operation.to || fromLine + 1,
                        lines.length,
                    );
                    lines.splice(fromLine, toLine - fromLine, replaceContent);
                    break;
                }

                case "delete": {
                    const fromLine = Math.min(
                        operation.from || 0,
                        lines.length - 1,
                    );
                    const toLine = Math.min(
                        operation.to || fromLine + 1,
                        lines.length,
                    );
                    lines.splice(fromLine, toLine - fromLine);
                    break;
                }
            }
        } catch (error) {
            console.error(
                `Failed to apply operation ${operation.type}:`,
                error,
            );
        }
    }

    return lines.join("\n");
}

/**
 * Check if a request should be handled asynchronously by the AI collaborator
 */
function isAsyncAICommand(request: string): boolean {
    // Commands that benefit from async processing
    const asyncCommands = ["/continue", "/diagram", "/augment", "/research"];
    return asyncCommands.some((cmd) => request.toLowerCase().startsWith(cmd));
}

/**
 * Handle async AI requests through the research handler
 */
async function handleAsyncAIRequest(
    researchHandler: AsyncResearchHandler,
    request: string,
    position: number,
): Promise<string> {
    const command = request.toLowerCase().trim();

    if (command.startsWith("/continue")) {
        const hint = command.replace("/continue", "").trim();
        return await researchHandler.handleContinueRequest(
            position,
            hint || undefined,
        );
    } else if (command.startsWith("/diagram")) {
        const description =
            command.replace("/diagram", "").trim() || "process diagram";
        return await researchHandler.handleDiagramRequest(
            description,
            "auto",
            position,
        );
    } else if (command.startsWith("/augment")) {
        const instruction =
            command.replace("/augment", "").trim() || "improve formatting";
        return await researchHandler.handleAugmentRequest(
            instruction,
            "section",
            position,
        );
    } else if (command.startsWith("/research")) {
        const query =
            command.replace("/research", "").trim() || "general research";
        return await researchHandler.handleResearchRequest(
            query,
            {
                fullContent: "",
                position,
                timestamp: Date.now(),
            },
            position,
        );
    }

    throw new Error(`Unknown async AI command: ${command}`);
}

function contentItemToText(item: any): string {
    if (item.text) {
        return item.text;
    }

    if (item.content) {
        return item.content
            .map((child: any) => contentItemToText(child))
            .join("");
    }

    // Handle special node types
    switch (item.type) {
        case "paragraph":
            return (
                "\n" +
                (item.content
                    ? item.content.map(contentItemToText).join("")
                    : "") +
                "\n"
            );
        case "heading":
            const level = item.attrs?.level || 1;
            const prefix = "#".repeat(level) + " ";
            return (
                "\n" +
                prefix +
                (item.content
                    ? item.content.map(contentItemToText).join("")
                    : "") +
                "\n"
            );
        case "code_block":
            return (
                "\n```\n" +
                (item.content
                    ? item.content.map(contentItemToText).join("")
                    : "") +
                "\n```\n"
            );
        case "mermaid":
            return "\n```mermaid\n" + (item.attrs?.content || "") + "\n```\n";
        case "math_display":
            return "\n$$\n" + (item.attrs?.content || "") + "\n$$\n";
        default:
            return item.content
                ? item.content.map(contentItemToText).join("")
                : "";
    }
}

// NEW: Global process message handler for UI commands (Flow 2)
// This is a simplified version - in a full implementation, this would be properly 
// integrated with the TypeAgent framework's message handling
let currentAgentContext: MarkdownActionContext | null = null;

// Store agent context for UI command processing
export function setCurrentAgentContext(context: MarkdownActionContext) {
    currentAgentContext = context;
}

// Handle UI commands from view process
if (typeof process !== 'undefined' && process.on) {
    process.on("message", (message: any) => {
        if (message.type === "uiCommand" && currentAgentContext) {
            console.log(`📨 [AGENT] Received UI command: ${message.command}`);
            
            handleUICommandViaIPC(message, currentAgentContext)
                .then(result => {
                    process.send?.({
                        type: "uiCommandResult",
                        requestId: message.requestId,
                        result: result
                    });
                    console.log(`📤 [AGENT] Sent UI command result: ${result.success}`);
                })
                .catch(error => {
                    process.send?.({
                        type: "uiCommandResult", 
                        requestId: message.requestId,
                        result: {
                            success: false,
                            error: error.message,
                            message: "Internal error processing UI command",
                            type: "error"
                        }
                    });
                    console.error(`❌ [AGENT] UI command error:`, error);
                });
        }
    });
}
