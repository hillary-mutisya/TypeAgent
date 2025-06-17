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
        const updatedContent = collaborationManager.getDocumentContent(documentId);
        
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
        // Return default content instead of error when no file is loaded
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
        res.send(defaultContent);
        return;
    }

    try {
        const fileContent = fs.readFileSync(filePath, "utf-8");
        res.send(fileContent);
    } catch (error) {
        res.status(500).json({
            error: "Failed to load document",
            details: error,
        });
    }
});

// Save document from markdown text
app.post("/document", express.json(), (req: Request, res: Response) => {
    if (!filePath) {
        // If no file is loaded, we can't save to disk, but we can still accept the content
        // This allows the editor to work in memory-only mode
        console.log("⚠️ No file path set, cannot save to disk. Content received but not persisted.");
        res.json({ success: true, warning: "No file loaded - content not saved to disk" });
        return;
    }

    try {
        const markdownContent = req.body.content || "";
        fs.writeFileSync(filePath, markdownContent, "utf-8");
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
    res.json({
        ...stats,
        websocketServerUrl: "ws://localhost:1234",
        currentDocument: filePath ? path.basename(filePath) : null,
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

    try {
        const { action, parameters } = req.body;

        // Start streaming response
        streamAgentResponse(action, parameters, res).catch((error) => {
            res.write(
                `data: ${JSON.stringify({ type: "error", error: error.message })}\n\n`,
            );
            res.end();
        });
    } catch (error) {
        res.write(
            `data: ${JSON.stringify({ type: "error", error: "Streaming failed" })}\n\n`,
        );
        res.end();
    }
});

async function streamAgentResponse(
    action: string,
    parameters: any,
    res: Response,
): Promise<void> {
    try {
        // Send start event
        res.write(
            `data: ${JSON.stringify({ type: "start", message: "AI is thinking..." })}\n\n`,
        );

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

        // Send completion event
        res.write(`data: ${JSON.stringify({ type: "complete" })}\n\n`);
        res.end();
    } catch (error) {
        const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
        res.write(
            `data: ${JSON.stringify({ type: "error", error: errorMessage })}\n\n`,
        );
        res.end();
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
    res.write(
        `data: ${JSON.stringify({ type: "typing", message: description })}\n\n`,
    );
    await new Promise((resolve) => setTimeout(resolve, 500));

    // For enhanced content with equations, don't stream - just send final content
    const hasEquations = content.includes("Maxwell") || content.includes("$$");

    if (hasEquations) {
        // Send a message that we're generating complex content
        res.write(
            `data: ${JSON.stringify({
                type: "content",
                chunk: "Generating mathematical content...",
                position: context?.position || 0,
            })}\n\n`,
        );

        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Send the markdown content as a special operation
        res.write(
            `data: ${JSON.stringify({
                type: "operation",
                operation: {
                    type: "insertMarkdown",
                    position: context?.position || 0,
                    markdown: content,
                    description: description,
                },
            })}\n\n`,
        );
    } else {
        // Regular streaming for simple content
        const words = content.split(" ");
        let currentChunk = "";

        for (let i = 0; i < words.length; i++) {
            currentChunk += words[i] + " ";

            // Send chunk every 3-5 words for typing effect
            if (i % 4 === 0 || i === words.length - 1) {
                res.write(
                    `data: ${JSON.stringify({
                        type: "content",
                        chunk: currentChunk,
                        position: context?.position || 0,
                    })}\n\n`,
                );

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

        res.write(
            `data: ${JSON.stringify({ type: "operation", operation })}\n\n`,
        );
    }

    // Send completion signal
    res.write(`data: ${JSON.stringify({ type: "complete" })}\n\n`);
}

async function streamRealAgentResponse(
    action: string,
    parameters: any,
    res: Response,
): Promise<void> {
    console.log("🔄 [VIEW] Routing LLM request to agent process:", action);

    try {
        // Send typing indicator
        res.write(
            `data: ${JSON.stringify({ type: "typing", message: "AI is processing..." })}\n\n`,
        );

        // Route to agent process via IPC
        const result = await sendUICommandToAgent(action, parameters);
        
        if (result.success) {
            // Send success notification
            res.write(
                `data: ${JSON.stringify({ 
                    type: "notification", 
                    message: result.message,
                    notificationType: "success"
                })}\n\n`,
            );
            
            // Operations are already applied to Yjs by agent
            // Just notify frontend that changes are available
            res.write(
                `data: ${JSON.stringify({ 
                    type: "operationsApplied",
                    operationCount: result.operations?.length || 0
                })}\n\n`,
            );
            
            // Send completion only on success
            res.write(`data: ${JSON.stringify({ type: "complete" })}\n\n`);
        } else {
            // Send error notification
            res.write(
                `data: ${JSON.stringify({ 
                    type: "notification", 
                    message: result.message || "AI command failed",
                    notificationType: "error"
                })}\n\n`,
            );
            
            // Send error completion
            res.write(`data: ${JSON.stringify({ 
                type: "error", 
                error: result.error || result.message || "AI command failed"
            })}\n\n`);
        }
        
        res.end();
        
    } catch (error) {
        console.error("❌ [VIEW] Failed to route to agent:", error);
        res.write(
            `data: ${JSON.stringify({ 
                type: "notification", 
                message: "Failed to process AI command",
                notificationType: "error"
            })}\n\n`,
        );
        res.write(
            `data: ${JSON.stringify({ 
                type: "error",
                error: "Failed to process AI command"
            })}\n\n`,
        );
        res.end();
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
    console.log("📝 [VIEW] Applying LLM operations to collaboration document:", operations.length);
    
    // Use default document ID for memory-only mode
    const documentId = filePath ? path.basename(filePath, ".md") : "default";
    
    // Apply operations to local Yjs document (SINGLE SOURCE OF TRUTH)
    for (const operation of operations) {
        collaborationManager.applyOperation(documentId, operation);
    }
    
    // AUTO-SAVE: Trigger async save to disk (non-blocking) only if we have a file
    if (filePath) {
        scheduleAutoSave();
    } else {
        console.log("💡 [VIEW] Memory-only mode - operations applied but not saved to disk");
    }
    
    // Notify frontend clients via SSE (Yjs also syncs via y-websocket)
    renderFileToClients(filePath || "");
    
    console.log("✅ [VIEW] Operations applied successfully");
}

process.send?.("Success");

process.on("message", (message: any) => {
    if (message.type == "setFile") {
        if (filePath) {
            fs.unwatchFile(filePath);
        }
        if (message.filePath) {
            filePath = message.filePath;

            // Initialize collaboration for this document
            const documentId = path.basename(message.filePath, ".md");
            collaborationManager.initializeDocument(
                documentId,
                message.filePath,
            );

            // Load existing content into collaboration manager
            if (fs.existsSync(message.filePath)) {
                const content = fs.readFileSync(message.filePath, "utf-8");
                collaborationManager.setDocumentContent(documentId, content);
            }

            // initial render/reset for clients
            renderFileToClients(filePath!);

            // watch file changes and render as needed
            fs.watchFile(filePath!, () => {
                renderFileToClients(filePath!);
            });
        } else {
            // No file mode - initialize with default content
            filePath = null;
            console.log("🔄 Running in memory-only mode (no file)");
            
            // Initialize collaboration with default document
            const documentId = "default";
            collaborationManager.initializeDocument(documentId, null);
            
            // Set default content in collaboration manager
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
            collaborationManager.setDocumentContent(documentId, defaultContent);
            
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
        // NEW: Handle content requests from agent (Flow 1 simplification)
        try {
            if (!filePath) {
                // Use default document ID for memory-only mode
                const documentId = "default";
                const content = collaborationManager.getDocumentContent(documentId);
                
                // If no content in collaboration manager, return default content
                const finalContent = content || `# Welcome to AI-Enhanced Markdown Editor

Start editing your markdown document with AI assistance!

Start typing to see the editor in action!
`;
                
                process.send?.({
                    type: "documentContent",
                    content: finalContent,
                    timestamp: Date.now()
                });
            } else {
                const documentId = path.basename(filePath, ".md");
                const content = collaborationManager.getDocumentContent(documentId);
                
                process.send?.({
                    type: "documentContent",
                    content: content,
                    timestamp: Date.now()
                });
            }
            
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

// Start the server
app.listen(port);
