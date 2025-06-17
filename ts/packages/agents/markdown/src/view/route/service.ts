// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import express, { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import MarkdownIt from "markdown-it";
import { GeoJSONPlugin } from "./plugins/geoJson.js";
import { MermaidPlugin } from "./plugins/mermaid.js";
import { LatexPlugin } from "./plugins/latex.js";
import { DocumentOperation } from "../../agent/markdownOperationSchema.js";
import { CollaborationManager } from "./collaborationManager.js";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import findConfig from "find-config";
import dotenv from "dotenv";

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
        renderFileToClients(filePath);

        // Watch new file for changes
        fs.watchFile(filePath, () => {
            renderFileToClients(filePath);
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

// Markdown rendering code
const md = new MarkdownIt();
md.use(GeoJSONPlugin);
md.use(MermaidPlugin);
md.use(LatexPlugin);

let clients: any[] = [];
let filePath: string;
let collaborationManager: CollaborationManager;

// Initialize collaboration manager
collaborationManager = new CollaborationManager();

if (!process.env["AZURE_OPENAI_ENDPOINT"] && !process.env["OPENAI_ENDPOINT"]) {
    const dotEnvPath = findConfig(".env");
    if (dotEnvPath) {
        console.log(`🔧 Loading environment variables from: ${dotEnvPath}`);
        dotenv.config({ path: dotEnvPath });
    } else {
        console.log("⚠️ No .env file found, using system environment variables");
    }
}

// Debug: Log Azure OpenAI configuration status
console.log("🔍 Azure OpenAI Configuration Debug:");
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
        // Show partial value for security (first 8 chars + ...)
        const maskedValue = varName.includes('KEY') 
            ? `${value.substring(0, 8)}...` 
            : value;
        console.log(`✅ ${varName}: ${maskedValue}`);
    } else {
        console.log(`❌ ${varName}: NOT SET`);
    }
});

// Also check OpenAI configuration as fallback
console.log("🔍 OpenAI Configuration Debug:");
const openaiEnvVars = ['OPENAI_API_KEY', 'OPENAI_ENDPOINT'];
openaiEnvVars.forEach(varName => {
    const value = process.env[varName];
    if (value) {
        const maskedValue = varName.includes('KEY') 
            ? `${value.substring(0, 8)}...` 
            : value;
        console.log(`✅ ${varName}: ${maskedValue}`);
    } else {
        console.log(`❌ ${varName}: NOT SET`);
    }
});

console.log("🔧 Environment configuration check complete.\n");

app.get("/preview", (req: Request, res: Response) => {
    if (!filePath) {
        res.send("");
    } else {
        const fileContent = fs.readFileSync(filePath, "utf-8");
        const htmlContent = md.render(fileContent);
        res.send(htmlContent);
    }
});

// Get document as markdown text
app.get("/document", (req: Request, res: Response) => {
    if (!filePath) {
        res.status(404).json({ error: "No document loaded" });
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
        res.status(404).json({ error: "No document loaded" });
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
        renderFileToClients(filePath);

        // Watch new file for changes
        fs.watchFile(filePath, () => {
            renderFileToClients(filePath);
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
    if (!filePath) {
        res.status(404).json({ error: "No document loaded" });
        return;
    }

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
    if (!filePath) {
        res.status(404).json({ error: "No document loaded" });
        return;
    }

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
    console.log("🤖 Streaming real LLM response via TypeAgent integration");

    try {
        // Import our LLM integration components
        const { LLMIntegrationService, DEFAULT_LLM_CONFIG } = await import(
            "../../agent/LLMIntegrationService.js"
        );

        // Initialize LLM service if not already done
        const llmService = new LLMIntegrationService(
            "GPT_4o",
            DEFAULT_LLM_CONFIG,
        );

        // Extract AI command from the original request
        const originalRequest = parameters.originalRequest || "";
        const aiCommand = detectAICommand(originalRequest);

        // Load current document content
        const markdownContent = fs.readFileSync(filePath, "utf-8");

        // Build context for AI request
        const context = {
            currentContent: markdownContent,
            cursorPosition:
                parameters.context?.position || markdownContent.length,
            surroundingText: markdownContent,
        };

        // Extract parameters for specific commands
        let commandParams = {};
        if (aiCommand === "continue") {
            commandParams = { hint: extractHintFromRequest(originalRequest) };
        } else if (aiCommand === "diagram") {
            commandParams = {
                description:
                    originalRequest.replace(/\/diagram|diagram/, "").trim() ||
                    "process flow",
                diagramType: "mermaid",
            };
        } else if (aiCommand === "augment") {
            commandParams = {
                instruction:
                    originalRequest.replace(/\/augment|augment/, "").trim() ||
                    "improve formatting",
                scope: "section",
            };
        }

        // Set up streaming callback to send updates to client
        const streamingCallback = {
            onContent: (delta: string) => {
                // Send content chunk to client
                res.write(
                    `data: ${JSON.stringify({
                        type: "content",
                        chunk: delta,
                        position: parameters.context?.position || 0,
                    })}\n\n`,
                );
            },
            onProgress: (status: string) => {
                // Send progress update to client
                res.write(
                    `data: ${JSON.stringify({
                        type: "typing",
                        message: status,
                    })}\n\n`,
                );
            },
            onComplete: () => {
                console.log("✅ LLM streaming completed");
            },
            onError: (error: Error) => {
                console.error("❌ LLM streaming error:", error);
                res.write(
                    `data: ${JSON.stringify({
                        type: "error",
                        error: error.message,
                    })}\n\n`,
                );
            },
        };

        // Send initial status
        res.write(
            `data: ${JSON.stringify({
                type: "typing",
                message: `AI processing ${aiCommand} command...`,
            })}\n\n`,
        );

        // Process AI request with streaming
        const aiResult = await llmService.processAIRequest(
            aiCommand,
            commandParams,
            context,
            streamingCallback,
        );

        // Apply operations to the document if successful
        if (aiResult.operations && aiResult.operations.length > 0) {
            // Apply operations to file
            const updatedContent = applyOperationsToMarkdown(
                markdownContent,
                aiResult.operations,
            );
            fs.writeFileSync(filePath, updatedContent, "utf-8");

            // Send operations to client for immediate UI update
            for (const operation of aiResult.operations) {
                res.write(
                    `data: ${JSON.stringify({
                        type: "operation",
                        operation: operation,
                    })}\n\n`,
                );
            }

            // Trigger preview update for other clients
            renderFileToClients(filePath);
        } else {
            // Fallback: send content as a simple operation
            const operation = {
                type: "insert",
                position: parameters.context?.position || 0,
                content: [
                    {
                        type: "paragraph",
                        content: [{ type: "text", text: aiResult.content }],
                    },
                ],
                description: `Generated ${aiCommand} content`,
            };

            res.write(
                `data: ${JSON.stringify({ type: "operation", operation })}\n\n`,
            );

            // Update file with the generated content
            const lines = markdownContent.split("\n");
            const insertPosition = Math.min(
                parameters.context?.position || lines.length,
                lines.length,
            );
            lines.splice(insertPosition, 0, aiResult.content);
            const updatedContent = lines.join("\n");
            fs.writeFileSync(filePath, updatedContent, "utf-8");
            renderFileToClients(filePath);
        }

        console.log(`✅ Real LLM ${aiCommand} command completed successfully`);
    } catch (error) {
        console.error("❌ Real LLM streaming failed:", error);

        // Enhanced error logging for debugging
        const err = error as Error;
        console.error("Error details:", {
            name: err.name,
            message: err.message,
            stack: err.stack
        });
        
        // Check if it's a specific type of error we can handle
        if (err.message.includes("Azure") || err.message.includes("API")) {
            console.log("💡 Azure OpenAI API issue detected - check environment variables");
        } else if (err.message.includes("schema") || err.message.includes("validation")) {
            console.log("💡 Schema validation issue detected - check TypeChat setup");
        }
        
        // Provide enhanced fallback with error info
        console.log("🔄 Falling back to enhanced test response with error context");
        
        // Send error info to client
        res.write(
            `data: ${JSON.stringify({
                type: "typing",
                message: "LLM service unavailable, using fallback mode..."
            })}\n\n`,
        );

        // Fallback to test response if LLM integration fails
        await streamTestResponse(
            "/test:" +
                detectAICommand(parameters.originalRequest || "continue"),
            parameters.context,
            res,
        );
    }
}

/**
 * Detect AI command from user request (helper function for service.ts)
 */
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

/**
 * Extract hint from user request (helper function for service.ts)
 */
function extractHintFromRequest(request: string): string | undefined {
    const match =
        request.match(/\/continue\s+(.+)/i) ||
        request.match(/continue writing\s+(.+)/i);
    return match ? match[1].trim() : undefined;
}

async function forwardToMarkdownAgent(
    action: string,
    parameters: any,
): Promise<any> {
    try {
        console.log("🤖 Forwarding to TypeAgent LLM integration");

        // Import our LLM integration components
        const { LLMIntegrationService, DEFAULT_LLM_CONFIG } = await import(
            "../../agent/LLMIntegrationService.js"
        );

        // Initialize LLM service
        const llmService = new LLMIntegrationService(
            "GPT_4o",
            DEFAULT_LLM_CONFIG,
        );

        // Load current document content
        const markdownContent = fs.readFileSync(filePath, "utf-8");

        // Extract AI command from the original request
        const originalRequest = parameters.originalRequest || "";
        const aiCommand = detectAICommand(originalRequest);

        // Build context for AI request
        const context = {
            currentContent: markdownContent,
            cursorPosition:
                parameters.context?.position || markdownContent.length,
            surroundingText: markdownContent,
        };

        // Extract parameters for specific commands
        let commandParams = {};
        if (aiCommand === "continue") {
            commandParams = { hint: extractHintFromRequest(originalRequest) };
        } else if (aiCommand === "diagram") {
            commandParams = {
                description:
                    originalRequest.replace(/\/diagram|diagram/, "").trim() ||
                    "process flow",
                diagramType: "mermaid",
            };
        } else if (aiCommand === "augment") {
            commandParams = {
                instruction:
                    originalRequest.replace(/\/augment|augment/, "").trim() ||
                    "improve formatting",
                scope: "section",
            };
        }

        // Process AI request (non-streaming for direct API calls)
        const aiResult = await llmService.processAIRequest(
            aiCommand,
            commandParams,
            context,
            // No streaming callback for direct API calls
        );

        // Apply operations to file if successful
        if (aiResult.operations && aiResult.operations.length > 0) {
            const updatedContent = applyOperationsToMarkdown(
                markdownContent,
                aiResult.operations,
            );
            fs.writeFileSync(filePath, updatedContent, "utf-8");

            // Trigger preview update
            renderFileToClients(filePath);

            return {
                operations: aiResult.operations,
                summary: `Generated ${aiCommand} content successfully`,
                success: true,
            };
        } else {
            // Fallback: treat as simple content update
            const operation = {
                type: "insert",
                position: parameters.context?.position || 0,
                content: [
                    {
                        type: "paragraph",
                        content: [
                            {
                                type: "text",
                                text:
                                    aiResult.content || "AI response generated",
                            },
                        ],
                    },
                ],
                description: `Generated ${aiCommand} content`,
            };

            return {
                operations: [operation],
                summary: `Generated ${aiCommand} content successfully`,
                success: true,
            };
        }
    } catch (error) {
        console.error("❌ LLM integration failed:", error);

        // Fallback to legacy agent if LLM integration fails
        console.log("🔄 Falling back to legacy agent");

        try {
            // Import dynamically to avoid circular dependencies
            const { createMarkdownAgent } = await import(
                "../../agent/translator.js"
            );

            // Load current document
            const markdownContent = fs.readFileSync(filePath, "utf-8");

            // Create and call the legacy agent
            const agent = await createMarkdownAgent("GPT_4o");
            const response = await agent.updateDocument(
                markdownContent,
                parameters.originalRequest,
            );

            if (response.success) {
                const updateResult = response.data;

                // Apply operations to file if they exist
                if (
                    updateResult.operations &&
                    updateResult.operations.length > 0
                ) {
                    const updatedContent = applyOperationsToMarkdown(
                        markdownContent,
                        updateResult.operations,
                    );
                    fs.writeFileSync(filePath, updatedContent, "utf-8");

                    // Trigger preview update
                    renderFileToClients(filePath);

                    return {
                        operations: updateResult.operations,
                        summary: updateResult.operationSummary,
                        success: true,
                    };
                }
            }
        } catch (legacyError) {
            console.error("❌ Legacy agent also failed:", legacyError);
        }

        // Final fallback to test response for development
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
    const fileContent = fs.readFileSync(filePath, "utf-8");
    const htmlContent = md.render(fileContent);

    clients.forEach((client) => {
        client.write(`data: ${encodeURIComponent(htmlContent)}\n\n`);
    });
}

function applyOperationsToMarkdown(
    content: string,
    operations: DocumentOperation[],
): string {
    const lines = content.split("\n");

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
            return item.content
                ? item.content.map(contentItemToText).join("")
                : "";
        case "heading":
            const level = item.attrs?.level || 1;
            const prefix = "#".repeat(level) + " ";
            return (
                prefix +
                (item.content
                    ? item.content.map(contentItemToText).join("")
                    : "")
            );
        case "code_block":
            const lang = item.attrs?.params || "";
            return (
                "```" +
                lang +
                "\n" +
                (item.content
                    ? item.content.map(contentItemToText).join("")
                    : "") +
                "\n```"
            );
        case "mermaid":
            return "```mermaid\n" + (item.attrs?.content || "") + "\n```";
        case "math_display":
            return "$$\n" + (item.attrs?.content || "") + "\n$$";
        default:
            return item.content
                ? item.content.map(contentItemToText).join("")
                : "";
    }
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
        }
    } else if (message.type == "applyOperations") {
        // Send operations to frontend
        clients.forEach((client) => {
            client.write(
                `data: ${JSON.stringify({
                    type: "operations",
                    operations: message.operations,
                })}\n\n`,
            );
        });
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
