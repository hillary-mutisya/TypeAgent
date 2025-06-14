// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import express, { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import MarkdownIt from "markdown-it";
import { GeoJSONPlugin } from "./plugins/geoJson.js";
import { MermaidPlugin } from "./plugins/mermaid.js";
import { LatexPlugin } from "./plugins/latex.js";
import { DocumentOperation } from "../../agent/markdownOperationSchema.js";
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
const staticPath = fileURLToPath(new URL("../../../dist/view/site", import.meta.url));

app.use(limiter);
app.use(express.static(staticPath));

app.get("/", (req: Request, res: Response) => {
    res.sendFile(path.join(staticPath, "index.html"));
});

// Markdown rendering code
const md = new MarkdownIt();
md.use(GeoJSONPlugin);
md.use(MermaidPlugin);
md.use(LatexPlugin);

let clients: any[] = [];
let filePath: string;

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
        res.status(500).json({ error: "Failed to load document", details: error });
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
        res.status(500).json({ error: "Failed to save document", details: error });
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
      .then(result => {
        res.json(result);
      })
      .catch(error => {
        res.status(500).json({ error: "Agent execution failed", details: error.message });
      });
      
  } catch (error) {
    res.status(500).json({ error: "Agent execution failed", details: error });
  }
});

async function forwardToMarkdownAgent(action: string, parameters: any): Promise<any> {
  try {
    // Import dynamically to avoid circular dependencies
    const { createMarkdownAgent } = await import("../../agent/translator.js");
    
    // Load current document
    const markdownContent = fs.readFileSync(filePath, "utf-8");
    
    // Create and call the agent
    const agent = await createMarkdownAgent("GPT_4o");
    const response = await agent.updateDocument(markdownContent, parameters.originalRequest);
    
    if (response.success) {
      const updateResult = response.data;
      
      // Apply operations to file if they exist
      if (updateResult.operations && updateResult.operations.length > 0) {
        // Apply operations to markdown locally
        const updatedContent = applyOperationsToMarkdown(markdownContent, updateResult.operations);
        fs.writeFileSync(filePath, updatedContent, "utf-8");
        
        // Trigger preview update
        renderFileToClients(filePath);
        
        return {
          operations: updateResult.operations,
          summary: updateResult.operationSummary,
          success: true
        };
      } else {
        // Fallback: treat as simple content update
        return {
          operations: [{
            type: 'continue',
            position: parameters.context?.position || 0,
            content: [{
              type: 'paragraph',
              content: [{
                type: 'text',
                text: updateResult.operationSummary || 'AI response generated'
              }]
            }],
            description: updateResult.operationSummary || 'Generated content'
          }],
          summary: updateResult.operationSummary || 'Content generated',
          success: true
        };
      }
    }
    
    throw new Error(`Agent execution failed: ${response.message}`);
    
  } catch (error) {
    console.error("Agent forwarding failed:", error);
    
    // Return a test response if agent fails (for development)
    if (parameters.originalRequest?.includes('/test:')) {
      return generateTestResponse(parameters.originalRequest, parameters.context);
    }
    
    throw error;
  }
}

function generateTestResponse(originalRequest: string, context: any): any {
  console.log('🧪 Generating test response for:', originalRequest);
  
  if (originalRequest.includes('/test:continue')) {
    return {
      operations: [{
        type: 'continue',
        position: context?.position || 0,
        content: 'This is a test continuation of the document. The AI would normally analyze the context and generate appropriate content here.',
        style: 'paragraph',
        description: 'Added test continuation'
      }],
      summary: 'Added test continuation content',
      success: true
    };
  } else if (originalRequest.includes('/test:diagram')) {
    const description = originalRequest.replace('/test:diagram', '').trim() || 'test process';
    return {
      operations: [{
        type: 'diagram',
        position: context?.position || 0,
        diagramType: 'mermaid',
        content: `graph TD\n    A[Start: ${description}] --> B{Process}\n    B --> C[Complete]\n    C --> D[End]`,
        description: `Generated test diagram for: ${description}`
      }],
      summary: `Generated test diagram`,
      success: true
    };
  } else if (originalRequest.includes('/test:augment')) {
    const instruction = originalRequest.replace('/test:augment', '').trim() || 'improve formatting';
    return {
      operations: [{
        type: 'insert',
        position: context?.position || 0,
        content: [`\n> ✨ **Enhancement Applied**: ${instruction}\n\nThis is a test augmentation of the document. The AI would normally analyze the content and apply the requested improvements.\n`],
        description: `Applied test augmentation: ${instruction}`
      }],
      summary: `Applied test augmentation: ${instruction}`,
      success: true
    };
  }
  
  return {
    operations: [],
    summary: 'Test command completed',
    success: true
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

function renderFileToClients(filePath: string) {
    const fileContent = fs.readFileSync(filePath, "utf-8");
    const htmlContent = md.render(fileContent);

    clients.forEach((client) => {
        client.write(`data: ${encodeURIComponent(htmlContent)}\n\n`);
    });
}

function applyOperationsToMarkdown(content: string, operations: DocumentOperation[]): string {
    const lines = content.split('\n');
    
    // Sort operations by position (reverse order for insertions to avoid position shifts)
    const sortedOps = [...operations].sort((a, b) => {
        if (a.type === 'insert' || a.type === 'replace') {
            return ((b as any).position || (b as any).from || 0) - ((a as any).position || (a as any).from || 0);
        }
        return ((a as any).position || (a as any).from || 0) - ((b as any).position || (b as any).from || 0);
    });
    
    for (const operation of sortedOps) {
        try {
            switch (operation.type) {
                case 'insert': {
                    const insertContent = operation.content.map(item => 
                        contentItemToText(item)
                    ).join('');
                    
                    // Simple position-based insertion (by line for simplicity)
                    const lineIndex = Math.min(operation.position || 0, lines.length);
                    lines.splice(lineIndex, 0, insertContent);
                    break;
                }
                case 'replace': {
                    const replaceContent = operation.content.map(item => 
                        contentItemToText(item)
                    ).join('');
                    
                    const fromLine = Math.min(operation.from || 0, lines.length - 1);
                    const toLine = Math.min(operation.to || fromLine + 1, lines.length);
                    lines.splice(fromLine, toLine - fromLine, replaceContent);
                    break;
                }
                case 'delete': {
                    const fromLine = Math.min(operation.from || 0, lines.length - 1);
                    const toLine = Math.min(operation.to || fromLine + 1, lines.length);
                    lines.splice(fromLine, toLine - fromLine);
                    break;
                }
            }
        } catch (error) {
            console.error(`Failed to apply operation ${operation.type}:`, error);
        }
    }
    
    return lines.join('\n');
}

function contentItemToText(item: any): string {
    if (item.text) {
        return item.text;
    }
    
    if (item.content) {
        return item.content.map((child: any) => contentItemToText(child)).join('');
    }
    
    // Handle special node types
    switch (item.type) {
        case 'paragraph':
            return (item.content ? item.content.map(contentItemToText).join('') : '');
        case 'heading':
            const level = item.attrs?.level || 1;
            const prefix = '#'.repeat(level) + ' ';
            return prefix + (item.content ? item.content.map(contentItemToText).join('') : '');
        case 'code_block':
            const lang = item.attrs?.params || '';
            return '```' + lang + '\n' + (item.content ? item.content.map(contentItemToText).join('') : '') + '\n```';
        case 'mermaid':
            return '```mermaid\n' + (item.attrs?.content || '') + '\n```';
        case 'math_display':
            return '$$\n' + (item.attrs?.content || '') + '\n$$';
        default:
            return item.content ? item.content.map(contentItemToText).join('') : '';
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
            client.write(`data: ${JSON.stringify({
                type: "operations",
                operations: message.operations
            })}\n\n`);
        });
    }
});

process.on("disconnect", () => {
    process.exit(1);
});

// Start the server
app.listen(port);
