// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import express, { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import MarkdownIt from "markdown-it";
import { GeoJSONPlugin } from "./plugins/geoJson.js";
import { MermaidPlugin } from "./plugins/mermaid.js";
import { LatexPlugin } from "./plugins/latex.js";
import { CollaborationManager } from "./collaborationManager.js";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import http from "http";
import { WebSocketServer } from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import { Awareness } from 'y-protocols/awareness';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
// import { json } from "stream/consumers";


const app: Express = express();
const port = parseInt(process.argv[2]);
if (isNaN(port)) {
    throw new Error("Port must be a number");
}
const limiter = rateLimit({
    windowMs: 60000,
    max: 100, // limit each IP to 100 requests per windowMs
});

// Serve static content from built directory
const staticPath = fileURLToPath(
    new URL("../../../dist/view/site", import.meta.url),
);

app.use(limiter);

// Root route - default document
app.get("/", (req: Request, res: Response) => {
    res.sendFile(path.join(staticPath, "index.html"));
});

// Document-specific route
app.get("/document/:documentName", (req: Request, res: Response) => {
    res.sendFile(path.join(staticPath, "index.html"));
});

// API endpoint to get current document name from URL
app.get("/api/current-document", (req: Request, res: Response) => {
    res.json({
        currentDocument: filePath ? path.basename(filePath, ".md") : null,
        fullPath: filePath || null,
    });
});

// API endpoint to switch to a specific document
app.post("/api/switch-document", express.json(), (req: Request, res: Response) => {
    try {
        const { documentName } = req.body;
        
        if (!documentName) {
            res.status(400).json({ error: "Document name is required" });
            return;
        }

        // Construct file path - in a real implementation, you'd have a documents directory
        // For now, we'll assume documents are in the same directory as the current file
        const documentPath = filePath 
            ? path.join(path.dirname(filePath), `${documentName}.md`)
            : `${documentName}.md`;

        if (!fs.existsSync(documentPath)) {
            // Create new document if it doesn't exist
            fs.writeFileSync(documentPath, `# ${documentName}\n\nThis is a new document.\n`);
        }

        // Stop watching old file
        if (filePath) {
            fs.unwatchFile(filePath);
        }

        // Set new file path
        filePath = documentPath;

        // Initialize collaboration for new document
        const documentId = documentName;
        collaborationManager.initializeDocument(documentId, documentPath);

        // Load content into collaboration manager
        const content = fs.readFileSync(documentPath, "utf-8");
        collaborationManager.setDocumentContent(documentId, content);

        // Render to clients
        renderFileToClients(filePath!);

        // Watch new file for changes
        fs.watchFile(filePath!, () => {
            renderFileToClients(filePath!);
        });

        res.json({ 
            success: true, 
            documentName: documentName,
            content: content,
            documentPath: documentPath
        });
    } catch (error) {
        res.status(500).json({
            error: "Failed to switch document",
            details: error,
        });
    }
});

// Initialize Markdown It
const md = new MarkdownIt();
md.use(GeoJSONPlugin);
md.use(MermaidPlugin);
md.use(LatexPlugin);
md.use(GeoJSONPlugin);
md.use(MermaidPlugin);
md.use(LatexPlugin);

let clients: any[] = [];
let filePath: string | null;
let collaborationManager: CollaborationManager;

// Auto-save mechanism
let autoSaveTimer: NodeJS.Timeout | null = null;
const AUTO_SAVE_DELAY = 2000; // 2 seconds after last change

// UI Command routing state
let commandCounter = 0;
const pendingCommands = new Map<string, any>();

// Utility function to safely write to response stream
function safeWriteToResponse(res: Response, data: string): boolean {
    try {
        if (res.writable && !res.writableEnded) {
            res.write(data);
            return true;
        }
        console.warn("⚠️ Attempted to write to closed/ended response stream");
        return false;
    } catch (error) {
        console.error("❌ Error writing to response stream:", error);
        return false;
    }
}

// Utility function to safely end response stream
function safeEndResponse(res: Response): void {
    try {
        if (res.writable && !res.writableEnded) {
            res.end();
        }
    } catch (error) {
        console.error("❌ Error ending response stream:", error);
    }
}

async function sendUICommandToAgent(
    command: string, 
    parameters: any
): Promise<any> {
    return new Promise((resolve, reject) => {
        const requestId = `ui_cmd_${++commandCounter}`;
        const timeout = setTimeout(() => {
            pendingCommands.delete(requestId);
            reject(new Error("Agent command timeout"));
        }, 30000); // 30 second timeout for LLM operations
        
        // Store resolver for this request
        pendingCommands.set(requestId, { resolve, reject, timeout });
        
        // Send command to agent process (parent)
        process.send?.({
            type: "uiCommand",
            requestId: requestId,
            command: command,
            parameters: {
                originalRequest: parameters.originalRequest,
                context: parameters.context
            },
            timestamp: Date.now()
        });
        
        console.log(`📤 [VIEW] Sent UI command to agent: ${command} (${requestId})`);
    });
}

// Auto-save functions
function scheduleAutoSave(): void {
    // Cancel previous timer
    if (autoSaveTimer) {
        clearTimeout(autoSaveTimer);
    }
    
    // Schedule new save
    autoSaveTimer = setTimeout(() => {
        performAutoSave();
    }, AUTO_SAVE_DELAY);
}

function performAutoSave(): void {
    if (!filePath) {
        console.log("⚠️ [AUTO-SAVE] No file path set, skipping auto-save");
        return;
    }
    
    try {
        const documentId = path.basename(filePath, ".md");
        
        // Use authoritative document function to ensure consistency
        const ydoc = getAuthoritativeDocument(documentId);
        const ytext = ydoc.getText("content");
        const updatedContent = ytext.toString();
        
        console.log(`💾 [AUTO-SAVE] Got content from authoritative Y.js doc "${documentId}": ${updatedContent.length} chars`);
        
        fs.writeFileSync(filePath, updatedContent, "utf-8");
        console.log("💾 [AUTO-SAVE] Document saved to disk:", filePath);
        
        // Notify clients of save status
        clients.forEach((client) => {
            client.write(`data: ${JSON.stringify({
                type: "autoSave",
                timestamp: Date.now(),
                filePath: path.basename(filePath!)
            })}\n\n`);
        });
    } catch (error) {
        console.error("❌ [AUTO-SAVE] Failed to save document:", error);
        
        // Notify clients of save error
        clients.forEach((client) => {
            client.write(`data: ${JSON.stringify({
                type: "autoSaveError",
                timestamp: Date.now(),
                error: (error as Error).message
            })}\n\n`);
        });
    }
}

// Initialize collaboration manager
collaborationManager = new CollaborationManager();

app.get("/preview", (req: Request, res: Response) => {
    if (!filePath) {
        // Return rendered default content when no file is loaded
        const defaultContent = `# Welcome to AI-Enhanced Markdown Editor

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
        const htmlContent = md.render(defaultContent);
        res.send(htmlContent);
    } else {
        const fileContent = fs.readFileSync(filePath, "utf-8");
        const htmlContent = md.render(fileContent);
        res.send(htmlContent);
    }
});

// Get document as markdown text
app.get("/document", (req: Request, res: Response) => {
    if (!filePath) {
        console.log("[NO-FILE-MODE]  No file provided when resolving the /document call")
        // Memory-only mode: get content from authoritative Y.js document
        const documentId = "default"; // Use consistent document ID
        
        const ydoc = getAuthoritativeDocument(documentId);
        const ytext = ydoc.getText("content");
        const content = ytext.toString();
        
        console.log(`📄 [GET /document] Retrieved content from authoritative Y.js doc: ${content.length} chars`);
        console.log(content)
        res.send(content);
        return;
    }

    try {
        console.log( "[FILE_MODE] File provided when resolving the /document call "+ filePath )

        // File mode: get content from authoritative document (which should be synced with file)
        const documentId = path.basename(filePath, ".md");
        const ydoc = getAuthoritativeDocument(documentId);
        const ytext = ydoc.getText("content");
        const content = ytext.toString();
        
        console.log(`📄 [GET /document] Retrieved content from authoritative Y.js doc "${documentId}": ${content.length} chars`);
        console.log(content)

        res.send(content);
    } catch (error) {
        // Fallback to reading from file if authoritative document fails
        try {
            const fileContent = fs.readFileSync(filePath, "utf-8");
            console.log(`📄 [GET /document] Fallback: read content from file: ${fileContent.length} chars`);
            console.log(fileContent)

            res.send(fileContent);
        } catch (fileError) {
            res.status(500).json({
                error: "Failed to load document",
                details: fileError,
            });
        }
    }
});

// Save document from markdown text
app.post("/document", express.json(), (req: Request, res: Response) => {
    const markdownContent = req.body.content || "";
    
    if (!filePath) {
        // Memory-only mode: save to authoritative Y.js document
        const documentId = "default"; // Use consistent document ID
        
        const ydoc = getAuthoritativeDocument(documentId);
        const ytext = ydoc.getText("content");
        
        // Replace entire content atomically
        ytext.delete(0, ytext.length);
        ytext.insert(0, markdownContent);
        
        console.log(`💾 [POST /document] Saved content to authoritative Y.js doc: ${markdownContent.length} chars`);
        res.json({ success: true, message: "Content saved to memory (no file mode)" });
        
        // Notify clients via SSE of the change (WebSocket will auto-sync)
        renderFileToClients("");
        return;
    }

    try {
        // File mode: save to both authoritative document and file
        const documentId = path.basename(filePath, ".md");
        const ydoc = getAuthoritativeDocument(documentId);
        const ytext = ydoc.getText("content");
        
        // Update authoritative document first
        ytext.delete(0, ytext.length);
        ytext.insert(0, markdownContent);
        
        // Then save to file
        fs.writeFileSync(filePath, markdownContent, "utf-8");
        
        console.log(`💾 [POST /document] Saved content to both authoritative Y.js doc and file: ${markdownContent.length} chars`);
        res.json({ success: true });

        // Notify clients of the change
        renderFileToClients(filePath);
    } catch (error) {
        res.status(500).json({
            error: "Failed to save document",
            details: error,
        });
    }
});

// Add collaboration info endpoint
app.get("/collaboration/info", (req: Request, res: Response) => {
    const stats = collaborationManager.getStats();
    const currentDocument = filePath ? path.basename(filePath, ".md") : "default";
    
    console.log(`📊 [COLLAB-INFO] Returning collaboration info - currentDocument: "${currentDocument}", filePath: ${filePath}`);
    
    res.json({
        ...stats,
        websocketServerUrl: `ws://localhost:${port}`,
        currentDocument: currentDocument,
    });
});

// Add file operations endpoints
app.post("/file/load", express.json(), (req: Request, res: Response) => {
    try {
        const { filePath: newFilePath } = req.body;
        
        if (!newFilePath || !fs.existsSync(newFilePath)) {
            res.status(404).json({ error: "File not found" });
            return;
        }

        // Stop watching old file
        if (filePath) {
            fs.unwatchFile(filePath);
        }

        // Set new file path
        filePath = newFilePath;

        // Initialize collaboration for new document
        const documentId = path.basename(newFilePath, ".md");
        collaborationManager.initializeDocument(documentId, newFilePath);

        // Load content into collaboration manager
        const content = fs.readFileSync(newFilePath, "utf-8");
        collaborationManager.setDocumentContent(documentId, content);

        // Render to clients
        renderFileToClients(filePath!);

        // Watch new file for changes
        fs.watchFile(filePath!, () => {
            renderFileToClients(filePath!);
        });

        res.json({ 
            success: true, 
            fileName: path.basename(newFilePath),
            content: content
        });
    } catch (error) {
        res.status(500).json({
            error: "Failed to load file",
            details: error,
        });
    }
});

app.get("/file/info", (req: Request, res: Response) => {
    if (!filePath) {
        res.status(404).json({ error: "No file loaded" });
        return;
    }

    try {
        const stats = fs.statSync(filePath);
        res.json({
            fileName: path.basename(filePath),
            fullPath: filePath,
            size: stats.size,
            modified: stats.mtime,
        });
    } catch (error) {
        res.status(500).json({
            error: "Failed to get file info",
            details: error,
        });
    }
});

// Add agent execution endpoint
app.post("/agent/execute", express.json(), (req: Request, res: Response) => {
    // Allow agent execution even without a file loaded - it can work with in-memory content
    try {
        const { action, parameters } = req.body;

        // Forward to the actual markdown agent
        forwardToMarkdownAgent(action, parameters)
            .then((result) => {
                res.json(result);
            })
            .catch((error) => {
                res.status(500).json({
                    error: "Agent execution failed",
                    details: error.message,
                });
            });
    } catch (error) {
        res.status(500).json({
            error: "Agent execution failed",
            details: error,
        });
    }
});

// Add streaming agent execution endpoint
app.post("/agent/stream", express.json(), (req: Request, res: Response) => {
    // Allow streaming even without a file loaded - useful for testing and new documents
    
    // Set up SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("Access-Control-Allow-Origin", "*");

    // Add error handler for response stream
    res.on('error', (error) => {
        console.error('❌ [STREAM] Response stream error:', error);
    });

    res.on('close', () => {
        console.log('🔌 [STREAM] Client disconnected');
    });

    try {
        const { action, parameters } = req.body;

        // Start streaming response with proper error handling
        streamAgentResponse(action, parameters, res).catch((error) => {
            console.error('❌ [STREAM] Stream error caught:', error);
            
            // Only try to write if stream is still open
            if (safeWriteToResponse(res,
                `data: ${JSON.stringify({ 
                    type: "notification", 
                    message: "AI service temporarily unavailable", 
                    notificationType: "error" 
                })}\n\n`
            )) {
                safeWriteToResponse(res,
                    `data: ${JSON.stringify({ type: "error", error: error.message })}\n\n`
                );
            }
            
            safeEndResponse(res);
        });
    } catch (error) {
        console.error('❌ [STREAM] Immediate error in /agent/stream:', error);
        
        safeWriteToResponse(res,
            `data: ${JSON.stringify({ 
                type: "notification", 
                message: "Failed to start AI processing", 
                notificationType: "error" 
            })}\n\n`
        );
        
        safeEndResponse(res);
    }
});

async function streamAgentResponse(
    action: string,
    parameters: any,
    res: Response,
): Promise<void> {
    try {
        // Send start event
        if (!safeWriteToResponse(res,
            `data: ${JSON.stringify({ type: "start", message: "AI is thinking..." })}\n\n`
        )) {
            return; // Response stream is already closed
        }

        // Check if this is a test command
        if (parameters.originalRequest?.includes("/test:")) {
            await streamTestResponse(
                parameters.originalRequest,
                parameters.context,
                res,
            );
        } else {
            await streamRealAgentResponse(action, parameters, res);
        }

        // Send completion event only if stream is still open
        safeWriteToResponse(res, `data: ${JSON.stringify({ type: "complete" })}\n\n`);
        safeEndResponse(res);
    } catch (error) {
        console.error("❌ [STREAM] Error in streamAgentResponse:", error);
        
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        
        // Try to send error message to user
        const errorData = JSON.stringify({ 
            type: "notification", 
            message: "AI service temporarily unavailable. Please try again later.",
            notificationType: "error"
        });
        
        if (safeWriteToResponse(res, `data: ${errorData}\n\n`)) {
            safeWriteToResponse(res, `data: ${JSON.stringify({ type: "error", error: errorMessage })}\n\n`);
        }
        
        safeEndResponse(res);
    }
}

async function streamTestResponse(
    originalRequest: string,
    context: any,
    res: Response,
): Promise<void> {
    console.log("🧪 Streaming test response for:", originalRequest);

    let content = "";
    let description = "";

    // Handle both /test:continue and /continue patterns
    if (originalRequest.includes("continue")) {
        content =
            "This is a test continuation of the document. The AI would normally analyze the context and generate appropriate content here. ";
        content +=
            "It would consider the preceding paragraphs, the overall document structure, and the intended audience to create relevant content. ";
        content +=
            "The response would be contextually aware and maintain consistent tone and style throughout.";
        description = "AI continuing document...";
    } else if (originalRequest.includes("diagram")) {
        // Extract description from either /test:diagram or /diagram format
        const diagramDesc =
            originalRequest.replace(/\/test:diagram|\/diagram/, "").trim() ||
            "test process";
        content = `\`\`\`mermaid\ngraph TD\n    A[Start: ${diagramDesc}] --> B{Process}\n    B --> C[Analysis]\n    C --> D[Decision]\n    D --> E[Implementation]\n    E --> F[End]\n\`\`\``;
        description = "AI generating diagram...";
    } else if (originalRequest.includes("augment")) {
        // Extract instruction from either /test:augment or /augment format
        const instruction =
            originalRequest.replace(/\/test:augment|\/augment/, "").trim() ||
            "improve formatting";

        // Check if equations are requested or use as enhanced default
        if (
            instruction.toLowerCase().includes("equation") ||
            instruction.toLowerCase().includes("maxwell") ||
            instruction === "improve formatting"
        ) {
            content = `> ✨ **Enhancement Applied**: ${instruction}`;
            content += `\n## Maxwell's Equations`;
            content += `\nJames Clerk Maxwell formulated a set of four partial differential equations that describe the behavior of electric and magnetic fields and their interactions with matter. These equations unified electricity, magnetism, and optics into a single theoretical framework.`;
            content += `\n### The Four Maxwell Equations`;
            content += `\n**Gauss's Law for Electricity:**`;
            content += `\n$$\\nabla \\cdot \\mathbf{E} = \\frac{\\rho}{\\varepsilon_0}$$`;
            content += `\n**Gauss's Law for Magnetism:**`;
            content += `\n$$\\nabla \\cdot \\mathbf{B} = 0$$`;
            content += `\n**Faraday's Law of Induction:**`;
            content += `\n$$\\nabla \\times \\mathbf{E} = -\\frac{\\partial \\mathbf{B}}{\\partial t}$$`;
            content += `\n**Ampère's Circuital Law (with Maxwell's correction):**`;
            content += `\n$$\\nabla \\times \\mathbf{B} = \\mu_0\\mathbf{J} + \\mu_0\\varepsilon_0\\frac{\\partial \\mathbf{E}}{\\partial t}$$`;
            content += `\n### Historical Context`;
            content += `\nThese equations were developed by James Clerk Maxwell in the 1860s, building upon the experimental work of Michael Faraday, André-Marie Ampère, and Carl Friedrich Gauss. Maxwell's theoretical insight was the addition of the "displacement current" term, which predicted the existence of electromagnetic waves traveling at the speed of light.`;
            content += `\n![James Clerk Maxwell](https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/James_Clerk_Maxwell.png/256px-James_Clerk_Maxwell.png)`;
            content += `\n*James Clerk Maxwell (1831-1879), Scottish physicist and mathematician*`;
            content += `\n### Significance`;
            content += `\n- **Unified Theory**: Combined electricity, magnetism, and light into electromagnetic theory`;
            content += `\n- **Predicted Radio Waves**: Led to Heinrich Hertz's discovery of radio waves`;
            content += `\n- **Foundation for Modern Physics**: Influenced Einstein's special relativity theory`;
            content += `\n- **Technological Impact**: Enabled development of wireless communication, radar, and countless electronic devices`;
            description = "AI adding Maxwell's equations and background...";
        } else {
            // Original augment content for other instructions
            content = `\n> ✨ **Enhancement Applied**: ${instruction}\n\n`;
            content +=
                "This is a test augmentation of the document. The AI would normally analyze the content and apply the requested improvements.\n\n";
            content +=
                "**Potential improvements could include:**\n- Better formatting and structure\n- Enhanced readability\n- Additional context and examples\n- Improved flow and transitions";
            description = "AI enhancing document...";
        }
    } else {
        // Fallback for unknown commands
        content =
            "This is a test response for an unrecognized command. The AI system would normally process the specific request and generate appropriate content.";
        description = "AI processing request...";
    }

    // Send typing indicator
    if (!safeWriteToResponse(res,
        `data: ${JSON.stringify({ type: "typing", message: description })}\n\n`
    )) {
        return; // Response stream closed
    }
    await new Promise((resolve) => setTimeout(resolve, 500));

    // For enhanced content with equations, don't stream - just send final content
    const hasEquations = content.includes("Maxwell") || content.includes("$$");

    if (hasEquations) {
        // Send a message that we're generating complex content
        safeWriteToResponse(res,
            `data: ${JSON.stringify({
                type: "content",
                chunk: "Generating mathematical content...",
                position: context?.position || 0,
            })}\n\n`
        );

        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Send the markdown content as a special operation
        safeWriteToResponse(res,
            `data: ${JSON.stringify({
                type: "operation",
                operation: {
                    type: "insertMarkdown",
                    position: context?.position || 0,
                    markdown: content,
                    description: description,
                },
            })}\n\n`
        );
    } else {
        // Regular streaming for simple content
        const words = content.split(" ");
        let currentChunk = "";

        for (let i = 0; i < words.length; i++) {
            currentChunk += words[i] + " ";

            // Send chunk every 3-5 words for typing effect
            if (i % 4 === 0 || i === words.length - 1) {
                if (!safeWriteToResponse(res,
                    `data: ${JSON.stringify({
                        type: "content",
                        chunk: currentChunk,
                        position: context?.position || 0,
                    })}\n\n`
                )) {
                    return; // Response stream closed
                }

                currentChunk = "";
                // Simulate typing delay
                await new Promise((resolve) =>
                    setTimeout(resolve, 150 + Math.random() * 100),
                );
            }
        }

        // Send final operation for simple content
        const operation = {
            type: "insert",
            position: context?.position || 0,
            content: [
                {
                    type: "paragraph",
                    content: [{ type: "text", text: content }],
                },
            ],
            description: description,
        };

        safeWriteToResponse(res,
            `data: ${JSON.stringify({ type: "operation", operation })}\n\n`
        );
    }

    // Send completion signal
    safeWriteToResponse(res, `data: ${JSON.stringify({ type: "complete" })}\n\n`);
}

async function streamRealAgentResponse(
    action: string,
    parameters: any,
    res: Response,
): Promise<void> {
    console.log("🔄 [VIEW] Routing LLM request to agent process:", action);

    try {
        // Send typing indicator
        if (!safeWriteToResponse(res,
            `data: ${JSON.stringify({ type: "typing", message: "AI is processing..." })}\n\n`
        )) {
            return; // Response stream closed
        }

        // Route to agent process via IPC with timeout handling
        const result = await sendUICommandToAgent(action, parameters);
        
        if (result.success) {
            // Send success notification
            safeWriteToResponse(res,
                `data: ${JSON.stringify({ 
                    type: "notification", 
                    message: result.message,
                    notificationType: "success"
                })}\n\n`
            );
            
            // Operations are already applied to Yjs by agent
            // Just notify frontend that changes are available
            safeWriteToResponse(res,
                `data: ${JSON.stringify({ 
                    type: "operationsApplied",
                    operationCount: result.operations?.length || 0
                })}\n\n`
            );
        } else {
            // Send error notification for failed commands
            safeWriteToResponse(res,
                `data: ${JSON.stringify({ 
                    type: "notification", 
                    message: result.message || "AI command failed",
                    notificationType: "error"
                })}\n\n`
            );
        }
        
    } catch (error) {
        console.error("❌ [VIEW] Failed to route to agent:", error);
        
        // Determine if this is a timeout error or other error
        const isTimeout = error instanceof Error && error.message.includes("timeout");
        const errorMessage = isTimeout 
            ? "AI service is temporarily unavailable. Please try again in a moment."
            : "Failed to process AI command. Please try again.";
        
        // Send user-friendly error notification
        safeWriteToResponse(res,
            `data: ${JSON.stringify({ 
                type: "notification", 
                message: errorMessage,
                notificationType: "error"
            })}\n\n`
        );
        
        // If it's a timeout, provide a clear offline notification but don't generate content
        if (isTimeout && parameters.originalRequest) {
            console.log("🔄 [VIEW] Agent timeout, providing offline notification only");
            
            safeWriteToResponse(res,
                `data: ${JSON.stringify({ 
                    type: "notification", 
                    message: "AI agent is offline. Please try again when the service is available.",
                    notificationType: "warning"
                })}\n\n`
            );
        }
    }
}

/**
 * Detect AI command from user request
 */
/*
function detectAICommand(
    request: string,
): "continue" | "diagram" | "augment" | "research" {
    const lowerRequest = request.toLowerCase();

    if (
        lowerRequest.includes("/continue") ||
        lowerRequest.includes("continue writing")
    ) {
        return "continue";
    }
    if (
        lowerRequest.includes("/diagram") ||
        lowerRequest.includes("create diagram")
    ) {
        return "diagram";
    }
    if (
        lowerRequest.includes("/augment") ||
        lowerRequest.includes("improve") ||
        lowerRequest.includes("enhance")
    ) {
        return "augment";
    }
    if (
        lowerRequest.includes("/research") ||
        lowerRequest.includes("research")
    ) {
        return "research";
    }

    // Default to continue for general content requests
    return "continue";
}
*/

/**
 * Extract hint from user request
 */
/*
function extractHintFromRequest(request: string): string | undefined {
    const match =
        request.match(/\/continue\s+(.+)/i) ||
        request.match(/continue writing\s+(.+)/i);
    return match ? match[1].trim() : undefined;
}
*/

async function forwardToMarkdownAgent(
    action: string,
    parameters: any,
): Promise<any> {
    try {
        console.log("🔄 [VIEW] Forwarding LLM request to agent process:", action);

        // Route to agent process instead of creating duplicate LLM service
        const result = await sendUICommandToAgent(action, parameters);
        
        if (result.success) {
            return {
                operations: result.operations || [],
                summary: result.message || `Generated ${action} content successfully`,
                success: true,
            };
        } else {
            throw new Error(result.error || result.message || "Agent command failed");
        }
        
    } catch (error) {
        console.error("❌ [VIEW] Failed to route to agent:", error);

        // Fallback to test response for development
        if (parameters.originalRequest?.includes("/test:")) {
            return generateTestResponse(
                parameters.originalRequest,
                parameters.context,
            );
        }

        throw error;
    }
}

function generateTestResponse(originalRequest: string, context: any): any {
    console.log("🧪 Generating test response for:", originalRequest);

    if (originalRequest.includes("/test:continue")) {
        return {
            operations: [
                {
                    type: "continue",
                    position: context?.position || 0,
                    content:
                        "This is a test continuation of the document. The AI would normally analyze the context and generate appropriate content here.",
                    style: "paragraph",
                    description: "Added test continuation",
                },
            ],
            summary: "Added test continuation content",
            success: true,
        };
    } else if (originalRequest.includes("/test:diagram")) {
        const description =
            originalRequest.replace("/test:diagram", "").trim() ||
            "test process";
        return {
            operations: [
                {
                    type: "diagram",
                    position: context?.position || 0,
                    diagramType: "mermaid",
                    content: `graph TD\n    A[Start: ${description}] --> B{Process}\n    B --> C[Complete]\n    C --> D[End]`,
                    description: `Generated test diagram for: ${description}`,
                },
            ],
            summary: `Generated test diagram`,
            success: true,
        };
    } else if (originalRequest.includes("/test:augment")) {
        const instruction =
            originalRequest.replace("/test:augment", "").trim() ||
            "improve formatting";
        return {
            operations: [
                {
                    type: "insert",
                    position: context?.position || 0,
                    content: [
                        `\n> ✨ **Enhancement Applied**: ${instruction}\n\nThis is a test augmentation of the document. The AI would normally analyze the content and apply the requested improvements.\n`,
                    ],
                    description: `Applied test augmentation: ${instruction}`,
                },
            ],
            summary: `Applied test augmentation: ${instruction}`,
            success: true,
        };
    }

    return {
        operations: [],
        summary: "Test command completed",
        success: true,
    };
}

app.get("/events", (req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    clients.push(res);

    req.on("close", () => {
        clients = clients.filter((client) => client !== res);
    });
});

// Serve static files AFTER API routes to avoid conflicts
app.use(express.static(staticPath));

function renderFileToClients(filePath: string) {
    let fileContent: string;
    
    if (!filePath || !fs.existsSync(filePath)) {
        // Use default content if no file or file doesn't exist
        fileContent = `# Welcome to AI-Enhanced Markdown Editor

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
    } else {
        fileContent = fs.readFileSync(filePath, "utf-8");
    }
    
    const htmlContent = md.render(fileContent);

    clients.forEach((client) => {
        client.write(`data: ${encodeURIComponent(htmlContent)}\n\n`);
    });
}

// Enhanced operation application in view process
function applyLLMOperationsToCollaboration(operations: any[]): void {
    console.log("📝 [VIEW] Applying LLM operations to live Y.js document:", operations.length);
    
    // Use default document ID for memory-only mode
    const documentId = filePath ? path.basename(filePath, ".md") : "default";
    
    console.log(`🔍 [OPERATION-DEBUG] Target document ID: "${documentId}", filePath: ${filePath}`);
    console.log(`🔍 [OPERATION-DEBUG] Available WebSocket docs: [${Array.from(docs.keys()).join(', ')}]`);
    
    // Use authoritative document function to ensure single source of truth
    const ydoc = getAuthoritativeDocument(documentId);
    const ytext = ydoc.getText("content");


    console.log("::Document contents::")
    Array.from(docs.keys()).forEach(key =>{
        console.log("Key: " + key + " Current: "+ JSON.stringify(docs.get(key)))
        console.log("Key: " + key + " Authoritative: "+ JSON.stringify(getAuthoritativeDocument(key)))
    })
    
    console.log(`🔍 [OPERATION-DEBUG] Authoritative Y.js document "${documentId}" current content length: ${ytext.length} chars`);
    
    // Add update event listener to debug broadcasting
    let updateEventFired = false;
    const debugUpdateHandler = (update: Uint8Array, origin: any) => {
        updateEventFired = true;
        console.log(`🔔 [BROADCAST-DEBUG] Y.js update event fired for "${documentId}" (${update.length} bytes), origin:`, origin);
    };
    ydoc.on('update', debugUpdateHandler);
    
    // Apply operations to authoritative Y.js document (SINGLE SOURCE OF TRUTH)
    // Wrap all operations in a single transaction to ensure proper update event firing
    ydoc.transact(() => {
        for (const operation of operations) {
            console.log("📝 [VIEW] Applying operation:", operation.type, "to authoritative document:", documentId);
            
            try {
                switch (operation.type) {
                    case "insert": {
                        const insertText = operation.content
                            .map((item: any) => contentItemToText(item))
                            .join("");
                        const position = Math.min(operation.position || 0, ytext.length);
                        ytext.insert(position, insertText);

                        console.log("Inserted text: "+ insertText)
                        console.log(`✅ [VIEW] Inserted ${insertText.length} chars at position ${position} in authoritative doc`);
                        break;
                    }
                    case "replace": {
                        const replaceText = operation.content
                            .map((item: any) => contentItemToText(item))
                            .join("");
                        const fromPos = Math.min(operation.from || 0, ytext.length);
                        const toPos = Math.min(operation.to || fromPos + 1, ytext.length);
                        const deleteLength = toPos - fromPos;
                        
                        ytext.delete(fromPos, deleteLength);
                        ytext.insert(fromPos, replaceText);

                        console.log("Replacement text: "+ replaceText)
                        console.log(`✅ [VIEW] Replaced ${deleteLength} chars with ${replaceText.length} chars at position ${fromPos} in authoritative doc`);
                        break;
                    }
                    case "delete": {
                        const fromPos = Math.min(operation.from || 0, ytext.length);
                        const toPos = Math.min(operation.to || fromPos + 1, ytext.length);
                        const deleteLength = toPos - fromPos;
                        ytext.delete(fromPos, deleteLength);
                        console.log(`✅ [VIEW] Deleted ${deleteLength} chars at position ${fromPos} in authoritative doc`);
                        break;
                    }
                    default:
                        console.warn(`❌ [VIEW] Unknown operation type: ${operation.type}`);
                        break;
                }
            } catch (operationError) {
                console.error(`❌ [VIEW] Failed to apply operation ${operation.type}:`, operationError);
            }
        }
    }, 'llm-operations'); // Set origin to identify these operations
    
    // Remove debug handler after a brief delay
    setTimeout(() => {
        ydoc.off('update', debugUpdateHandler);
        if (!updateEventFired) {
            console.warn(`⚠️ [BROADCAST-DEBUG] No Y.js update event fired for operations on "${documentId}" - this may be why frontend doesn't receive updates!`);
        } else {
            console.log(`✅ [BROADCAST-DEBUG] Y.js update event fired successfully for "${documentId}"`);
        }
    }, 100);
    
    // AUTO-SAVE: Trigger async save to disk (non-blocking) only if we have a file
    if (filePath) {
        scheduleAutoSave();
    } else {
        console.log("💡 [VIEW] Memory-only mode - operations applied but not saved to disk");
    }
    
    // Notify frontend clients via SSE (Y.js changes will auto-sync via WebSocket)
    renderFileToClients(filePath || "");
    
    console.log("✅ [VIEW] Operations applied to authoritative Y.js document successfully");
}

// Helper function to convert content items to text (from collaboration manager)
function contentItemToText(item: any): string {
    if (typeof item === "string") {
        return item;
    }
    if (item && typeof item === "object") {
        if (item.type === "text" && item.text) {
            return item.text;
        }
        if (item.text) {
            return item.text;
        }
        if (item.content) {
            return Array.isArray(item.content)
                ? item.content.map(contentItemToText).join("")
                : String(item.content);
        }
    }
    return String(item || "");
}

// Success signal moved to server.listen() callback to ensure WebSocket server is ready

process.on("message", (message: any) => {
    if (message.type == "setFile") {
        if (filePath) {
            fs.unwatchFile(filePath);
        }
        if (message.filePath) {
            const oldFilePath = filePath;
            filePath = message.filePath;

            // Initialize collaboration for this document using authoritative document
            const documentId = path.basename(message.filePath, ".md");
            
            // Get or create the authoritative Y.js document
            const ydoc = getAuthoritativeDocument(documentId);
            
            // Load existing content into the authoritative document
            if (fs.existsSync(message.filePath)) {
                const content = fs.readFileSync(message.filePath, "utf-8");
                
                // Set content directly in the authoritative Y.js document
                const ytext = ydoc.getText("content");
                ytext.delete(0, ytext.length); // Clear existing content
                ytext.insert(0, content); // Insert file content

                
                
                console.log(`📄 [FILE-LOAD] Loaded ${content.length} chars into authoritative document "${documentId}"`);

                console.log("Loaded content: "+ JSON.stringify(ytext))
            } else {
                console.log(`📄 [FILE-LOAD] File doesn't exist, authoritative document "${documentId}" remains empty`);
            }

            // Notify frontend clients if the document has changed
            if (oldFilePath !== filePath) {
                console.log(`📡 [SSE] Document changed from ${oldFilePath ? path.basename(oldFilePath, ".md") : "none"} to ${documentId}`);
                
                // Send SSE notification to all clients to switch rooms
                clients.forEach((client) => {
                    client.write(`data: ${JSON.stringify({
                        type: "documentChanged",
                        newDocumentId: documentId,
                        newDocumentName: path.basename(message.filePath, ".md"),
                        timestamp: Date.now()
                    })}\n\n`);
                });
            }

            // initial render/reset for clients
            renderFileToClients(filePath!);

            // watch file changes and render as needed
            fs.watchFile(filePath!, () => {
                renderFileToClients(filePath!);
            });
        } else {
            // No file mode - initialize with default content using authoritative document
            filePath = null;
            console.log("🔄 Running in memory-only mode (no file)");
            
            const documentId = "default";
            
            // Get or create authoritative Y.js document for memory-only mode
            const ydoc = getAuthoritativeDocument(documentId);
            
            // Set default content in the authoritative Y.js document
            const defaultContent = `# Welcome to AI-Enhanced Markdown Editor

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
            
            const ytext = ydoc.getText("content");
            
            // Only set content if document is empty to avoid overwriting existing content
            if (ytext.length === 0) {
                ytext.insert(0, defaultContent);
                console.log(`📄 [MEMORY-ONLY] Initialized authoritative Y.js document "${documentId}" with default content: ${defaultContent.length} chars`);
            } else {
                console.log(`📄 [MEMORY-ONLY] Authoritative Y.js document "${documentId}" already has content: ${ytext.length} chars`);
            }
            
            // Initial render for clients with default content
            renderFileToClients("");
        }
    } else if (message.type == "applyOperations") {
        // Send operations to frontend
        console.log("🔍 [PHASE1] View received IPC operations from agent:", message.operations?.length);
        clients.forEach((client) => {
            client.write(
                `data: ${JSON.stringify({
                    type: "operations", 
                    operations: message.operations,
                })}\n\n`,
            );
        });
    } else if (message.type === "applyLLMOperations") {
        // Enhanced operation application in view process
        try {
            applyLLMOperationsToCollaboration(message.operations);
            
            // Send success confirmation back to agent
            process.send?.({
                type: "operationsApplied",
                success: true,
                operationCount: message.operations.length
            });
            
            console.log("✅ [VIEW] Applied LLM operations successfully");
        } catch (error) {
            console.error("❌ [VIEW] Failed to apply LLM operations:", error);
            process.send?.({
                type: "operationsApplied", 
                success: false,
                error: (error as Error).message
            });
        }
    } else if (message.type === "getDocumentContent") {
        // Handle content requests from agent - read from authoritative Y.js document
        try {
            let documentId = "";
            
            if (!filePath) {
                // Use default document ID for memory-only mode
                documentId = "default";
            } else {
                documentId = path.basename(filePath, ".md");
            }
            
            console.log("Using documentID "+ documentId)

            // Get content from authoritative Y.js document (single source of truth)
            const ydoc = getAuthoritativeDocument(documentId);
            const yText = ydoc.getText('content');
            const content = yText.toString();
            
            console.log(`📄 [VIEW] Retrieved content from authoritative Y.js doc "${documentId}": ${content.length} chars`);

            console.log("Initial content")
            console.log(content)

            console.log("From Prosemirror:")
            console.log(JSON.stringify(ydoc))
            
            process.send?.({
                type: "documentContent",
                content: content,
                timestamp: Date.now()
            });
            
            console.log("📤 [VIEW] Sent document content to agent process");
        } catch (error) {
            console.error("❌ [VIEW] Failed to get document content:", error);
            process.send?.({
                type: "documentContent",
                content: "",
                timestamp: Date.now()
            });
        }
    } else if (message.type === "uiCommandResult") {
        // Handle UI command results from agent
        const pending = pendingCommands.get(message.requestId);
        if (pending) {
            clearTimeout(pending.timeout);
            pendingCommands.delete(message.requestId);
            pending.resolve(message.result);
            console.log(`📨 [VIEW] Received result for ${message.requestId}`);
        }
    } else if (message.type == "initCollaboration") {
        // Handle collaboration initialization from action handler
        console.log(
            "🔄 Collaboration initialized from action handler:",
            message.config,
        );
    }
});

process.on("disconnect", () => {
    process.exit(1);
});

// Add global error handlers to prevent crashes
process.on('uncaughtException', (error) => {
    console.error('❌ [CRITICAL] Uncaught exception:', error);
    // Don't exit immediately, log and continue
    console.error('Service continuing despite error...');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ [CRITICAL] Unhandled promise rejection at:', promise, 'reason:', reason);
    // Don't exit immediately, log and continue  
    console.error('Service continuing despite rejection...');
});

// Y.js WebSocket Server Implementation
// A map to store Y.Doc instances for each room
const docs = new Map<string, Y.Doc>();
// A map to store Awareness instances for each room  
const awarenessStates = new Map<string, any>();
// Track WebSocket connections per room for debugging
const roomConnections = new Map<string, Set<any>>();

/**
 * Get the authoritative Y.js document for a given document ID
 * This ensures we always use the same Y.js document instance across:
 * - WebSocket connections
 * - LLM operations  
 * - Auto-save
 * - CollaborationManager
 */
function getAuthoritativeDocument(documentId: string): Y.Doc {
    // Always prefer WebSocket document as single source of truth
    if (docs.has(documentId)) {
        console.log(`📄 [AUTHORITATIVE] Using existing WebSocket Y.js document: ${documentId}`);
        return docs.get(documentId)!;
    }
    
    // Create if doesn't exist
    console.log(`📄 [AUTHORITATIVE] Creating new Y.js document: ${documentId}`);
    const ydoc = new Y.Doc();
    docs.set(documentId, ydoc);
    awarenessStates.set(documentId, new Awareness(ydoc));
    
    // Ensure CollaborationManager uses same instance
    collaborationManager.useExistingDocument(documentId, ydoc, filePath);
    console.log(`🔄 [AUTHORITATIVE] CollaborationManager now using authoritative document: ${documentId}`);
    
    return ydoc;
}

// Helper function to setup a Yjs connection (compatible with y-websocket)
function setupWSConnection(conn: any, req: any, roomName: string): void {
    console.log(`📡 [WEBSOCKET] Setting up connection for room: "${roomName}"`);
    
    // Track this connection
    if (!roomConnections.has(roomName)) {
        roomConnections.set(roomName, new Set());
    }
    roomConnections.get(roomName)!.add(conn);
    
    // Use authoritative document function to ensure single source of truth
    const ydoc = getAuthoritativeDocument(roomName);
    const ytext = ydoc.getText("content");
    console.log(`🔍 [WEBSOCKET] Room "${roomName}" authoritative document content length: ${ytext.length} chars`);
    console.log(`🔍 [WEBSOCKET] Room "${roomName}" has ${roomConnections.get(roomName)!.size} connected clients`);
    
    // Get awareness for this room (should already exist from getAuthoritativeDocument)
    const awareness = awarenessStates.get(roomName)!;
    
    console.log(`📡 Client connected to room: ${roomName}`);
    
    // Send function for broadcasting to other clients
    const send = (doc: Y.Doc, conn: any, message: Uint8Array) => {
        if (conn.readyState === conn.OPEN) {
            conn.send(message);
        }
    };
    
    // Message handler - exact copy of y-websocket implementation
    const messageListener = (conn: any, doc: Y.Doc, message: Uint8Array) => {
        try {
            const encoder = encoding.createEncoder();
            const decoder = decoding.createDecoder(message);
            const messageType = decoding.readVarUint(decoder);
            
            switch (messageType) {
                case 0: // messageSync
                    encoding.writeVarUint(encoder, 0); // messageSync
                    syncProtocol.readSyncMessage(decoder, encoder, doc, conn);
                    
                    // If the encoder only contains the type of reply message and no
                    // message, there is no need to send the message. When encoder only
                    // contains the type of reply, its length is 1.
                    if (encoding.length(encoder) > 1) {
                        send(doc, conn, encoding.toUint8Array(encoder));
                    }
                    break;
                case 1: // messageAwareness
                    try {
                        const awarenessUpdate = decoding.readVarUint8Array(decoder);
                        awarenessProtocol.applyAwarenessUpdate(awareness, awarenessUpdate, conn);
                    } catch (awarenessError) {
                        console.warn('❌ Error processing awareness message:', awarenessError);
                    }
                    break;
                default:
                    console.warn(`❌ Unknown message type: ${messageType}`);
                    break;
            }
        } catch (err) {
            console.error('❌ Failed to process WebSocket message:', err);
            // Y.Doc doesn't have an 'error' event, so just log the error
        }
    };
    
    // Set up message handling
    conn.on('message', (message: Buffer) => {
        messageListener(conn, ydoc, new Uint8Array(message));
    });
    
    // Send initial sync message to new client
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, 0); // messageSync
    syncProtocol.writeSyncStep1(encoder, ydoc);
    send(ydoc, conn, encoding.toUint8Array(encoder));
    
    // Listen for document updates and broadcast to other clients
    const updateHandler = (update: Uint8Array, origin: any) => {
        console.log(`🔔 [WEBSOCKET-BROADCAST] Update event in room "${roomName}" (${update.length} bytes), origin:`, origin);
        console.log(`🔍 [WEBSOCKET-BROADCAST] Broadcasting to ${roomConnections.get(roomName)?.size || 0} clients in room "${roomName}"`);
        
        // Broadcast to all clients in this room (including the current one for AI updates)
        const connections = roomConnections.get(roomName);
        if (connections) {
            let broadcastCount = 0;
            connections.forEach(clientConn => {
                if (clientConn.readyState === clientConn.OPEN) {
                    const encoder = encoding.createEncoder();
                    encoding.writeVarUint(encoder, 0); // messageSync
                    syncProtocol.writeUpdate(encoder, update);
                    send(ydoc, clientConn, encoding.toUint8Array(encoder));
                    broadcastCount++;
                }
            });
            console.log(`📡 [WEBSOCKET-BROADCAST] Broadcasted update to ${broadcastCount} clients in room "${roomName}"`);
        }
    };
    ydoc.on('update', updateHandler);
    
    // Handle awareness changes and broadcast to other clients  
    const awarenessChangeHandler = (changes: any, origin: any) => {
        try {
            if (origin !== conn) {
                const changedClients = changes.added.concat(changes.updated, changes.removed);
                if (changedClients.length > 0) {
                    const encoder = encoding.createEncoder();
                    encoding.writeVarUint(encoder, 1); // messageAwareness
                    encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients));
                    send(ydoc, conn, encoding.toUint8Array(encoder));
                }
            }
        } catch (awarenessError) {
            console.error('❌ Error handling awareness change:', awarenessError);
        }
    };
    awareness.on('change', awarenessChangeHandler);
    
    // Clean up when client disconnects
    conn.on('close', () => {
        try {
            ydoc.off('update', updateHandler);
            awareness.off('change', awarenessChangeHandler);
            
            // Remove from connection tracking
            const connections = roomConnections.get(roomName);
            if (connections) {
                connections.delete(conn);
                console.log(`🔌 [WEBSOCKET] Client disconnected from room "${roomName}", ${connections.size} clients remaining`);
            }
            
            // Remove awareness state for this client using correct API
            awarenessProtocol.removeAwarenessStates(awareness, [ydoc.clientID], 'disconnect');
            
            console.log(`📡 Client disconnected from room: ${roomName}`);
        } catch (cleanupError) {
            console.error('❌ Error during connection cleanup:', cleanupError);
        }
    });
    
    conn.on('error', (error: any) => {
        console.error('❌ WebSocket error:', error);
    });
}

// Create Yjs WebSocket Server
function createYjsWSServer(server: http.Server): WebSocketServer {
    const wss = new WebSocketServer({ noServer: true });
    
    server.on('upgrade', (request, socket, head) => {
        try {
            // Extract room name from URL path
            const url = new URL(request.url || '/', `http://${request.headers.host}`);
            const roomName = url.pathname.substring(1) || 'default-room';
            
            console.log(`🔄 WebSocket upgrade request for room: ${roomName}`);
            
            wss.handleUpgrade(request, socket, head, (ws) => {
                wss.emit('connection', ws, request, roomName);
            });
        } catch (error) {
            console.error('❌ Error handling WebSocket upgrade:', error);
            socket.destroy();
        }
    });
    
    wss.on('connection', (ws: any, request: any, roomName: string) => {
        setupWSConnection(ws, request, roomName);
    });
    
    return wss;
}

// Create HTTP server and integrate WebSocket support
const server = http.createServer(app);

// Add Y.js WebSocket server for real-time collaboration
createYjsWSServer(server);
console.log(`📡 Y.js WebSocket server integrated`);

// Add global error handlers to prevent crashes
process.on('uncaughtException', (error) => {
    console.error('❌ [CRITICAL] Uncaught exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ [CRITICAL] Unhandled promise rejection:', reason);
});

// Start the HTTP server (which includes WebSocket support)
server.listen(port, () => {
    console.log(`✅ Express server with WebSocket support listening on port ${port}`);
    console.log(`📡 Y.js collaboration available at ws://localhost:${port}/<room-name>`);
    
    // Send success signal to parent process AFTER server is ready to accept WebSocket connections
    process.send?.("Success");
});
