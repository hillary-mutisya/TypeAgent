import { Editor, editorViewCtx } from '@milkdown/core'
import { Crepe, CrepeFeature } from '@milkdown/crepe'
import { commonmark } from '@milkdown/preset-commonmark'
import { gfm } from '@milkdown/preset-gfm'
import { history } from '@milkdown/plugin-history'

// Import Crepe CSS
import '@milkdown/crepe/theme/common/style.css'
import '@milkdown/crepe/theme/frame.css'

// Import custom styles
import './styles/milkdown-integration.css'
import './styles.css'

// Types for operations
interface DocumentOperation {
  type: string;
  position?: number;
  content?: any;
  description?: string;
}

let editor: Editor | null = null;

document.addEventListener("DOMContentLoaded", async () => {
    await initializeEditor();
    setupPreview();
    setupUI();
});

async function initializeEditor(): Promise<void> {
    const editorElement = document.getElementById("editor");
    if (!editorElement) {
        console.error("Editor element not found");
        return;
    }
    
    try {
        // Load initial content
        const initialContent = await loadInitialContent();
        
        // Create Crepe editor with AI integration
        const crepe = new Crepe({
            root: editorElement,
            defaultValue: initialContent,
            features: {
                [CrepeFeature.BlockEdit]: true,
                [CrepeFeature.LinkTooltip]: true,
            },
            featureConfigs: {
                [CrepeFeature.BlockEdit]: {
                    buildMenu: (builder: any) => {
                        // Add AI Tools group to block edit menu
                        return builder
                            .addGroup('ai-tools', 'AI Tools')
                            .addItem('ai-continue', {
                                label: 'Continue Writing',
                                icon: '✨',
                                onRun: async (ctx: any) => {
                                    const view = ctx.get(editorViewCtx)
                                    const { from } = view.state.selection
                                    await executeAgentCommand('continue', { position: from })
                                },
                            })
                            .addItem('ai-diagram', {
                                label: 'Generate Diagram',
                                icon: '📊',
                                onRun: async (ctx: any) => {
                                    const view = ctx.get(editorViewCtx)
                                    const { from } = view.state.selection
                                    const description = prompt('Describe the diagram you want to generate:')
                                    if (description) {
                                        await executeAgentCommand('diagram', { 
                                            description, 
                                            position: from 
                                        })
                                    }
                                },
                            })
                            .addItem('ai-augment', {
                                label: 'Augment Document',
                                icon: '🔧',
                                onRun: async (ctx: any) => {
                                    const view = ctx.get(editorViewCtx)
                                    const { from } = view.state.selection
                                    const instruction = prompt('How would you like to improve the document?')
                                    if (instruction) {
                                        await executeAgentCommand('augment', { 
                                            instruction, 
                                            position: from 
                                        })
                                    }
                                },
                            })
                            .addItem('test-continue', {
                                label: 'Test: Continue',
                                icon: '🧪',
                                onRun: async (ctx: any) => {
                                    const view = ctx.get(editorViewCtx)
                                    const { from } = view.state.selection
                                    await executeAgentCommand('continue', { position: from, testMode: true })
                                },
                            })
                            .addItem('test-diagram', {
                                label: 'Test: Diagram',
                                icon: '🧪',
                                onRun: async (ctx: any) => {
                                    const view = ctx.get(editorViewCtx)
                                    const { from } = view.state.selection
                                    const description = prompt('Test diagram description:') || 'test flowchart'
                                    await executeAgentCommand('diagram', { 
                                        description, 
                                        position: from, 
                                        testMode: true 
                                    })
                                },
                            })
                            .addItem('test-augment', {
                                label: 'Test: Augment',
                                icon: '🧪',
                                onRun: async (ctx: any) => {
                                    const view = ctx.get(editorViewCtx)
                                    const { from } = view.state.selection
                                    const instruction = prompt('Test augmentation instruction:') || 'improve formatting'
                                    await executeAgentCommand('augment', { 
                                        instruction, 
                                        position: from, 
                                        testMode: true 
                                    })
                                },
                            })
                    }
                } as any
            }
        });
        
        // Configure editor with plugins
        await crepe.editor
            .use(commonmark)                // Basic markdown support
            .use(gfm)                       // GitHub flavored markdown
            .use(history)                   // Undo/redo
            .create()
        
        editor = crepe.editor
        
        // Setup auto-save
        setupAutoSave(crepe);
        
        console.log('✅ Milkdown editor with AI integration initialized successfully');
        console.log('🤖 Available AI commands:');
        console.log('   • Type "/" to open block edit menu with AI tools');
        console.log('   • Available: Continue Writing, Generate Diagram, Augment Document');
        console.log('   • Test versions available for testing without API calls');
        
    } catch (error) {
        console.error('❌ Failed to initialize Milkdown editor:', error);
        showError('Failed to initialize editor. Please refresh the page.');
    }
}

async function loadInitialContent(): Promise<string> {
    try {
        const response = await fetch('/document');
        if (response.ok) {
            return await response.text();
        } else {
            return getDefaultContent();
        }
    } catch (error) {
        console.error('Failed to load initial content:', error);
        return getDefaultContent();
    }
}

function getDefaultContent(): string {
    return `# Welcome to AI-Enhanced Markdown Editor

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
}

/**
 * Execute agent commands
 */
async function executeAgentCommand(command: string, params: any): Promise<void> {
    try {
        console.log(`🤖 Executing agent command: ${command}`, params)
        
        if (params.testMode) {
            // Test mode - simulate response without API call
            await simulateAgentResponse(command, params)
            return
        }
        
        // Build request for the markdown agent
        const request = buildAgentRequest(command, params)
        
        // Call the agent via TypeAgent infrastructure
        const response = await fetch('/agent/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request)
        })
        
        if (!response.ok) {
            throw new Error(`Agent call failed: ${response.status}`)
        }
        
        const result = await response.json()
        
        if (result.operations && result.operations.length > 0) {
            applyAgentOperations(result.operations)
        }
        
        console.log('✅ Agent command completed successfully')
        showNotification(`✅ ${command} completed successfully!`, 'success')
        
    } catch (error) {
        console.error(`❌ Agent command failed:`, error)
        showNotification(`Failed to execute ${command} command. Please try again.`, 'error')
    }
}

function buildAgentRequest(command: string, params: any): any {
    let originalRequest = ''
    
    switch (command) {
        case 'continue':
            originalRequest = '/continue'
            break
        case 'diagram':
            originalRequest = `/diagram ${params.description}`
            break
        case 'augment':
            originalRequest = `/augment ${params.instruction}`
            break
    }
    
    return {
        action: 'updateDocument',
        parameters: {
            originalRequest,
            context: {
                position: params.position || 0,
                command: command,
                params: params
            }
        }
    }
}

/**
 * Simulate agent response for testing
 */
async function simulateAgentResponse(command: string, params: any): Promise<void> {
    console.log(`🧪 Simulating ${command} command in test mode`)
    showNotification(`🧪 Testing ${command} command...`, 'info')
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    let operations: DocumentOperation[] = []
    
    switch (command) {
        case 'continue':
            operations = [{
                type: 'insert',
                position: params.position,
                content: [{
                    type: 'paragraph',
                    content: [{
                        type: 'text',
                        text: 'This is simulated AI-generated content for testing purposes. The actual AI would generate contextually relevant content based on the document.'
                    }]
                }],
                description: 'Test continuation'
            }]
            break
            
        case 'diagram':
            operations = [{
                type: 'insert',
                position: params.position,
                content: [{
                    type: 'code_block',
                    attrs: { params: 'mermaid' },
                    content: [{
                        type: 'text',
                        text: `graph TD\n    A[${params.description}] --> B[Test Node 1]\n    B --> C[Test Node 2]\n    C --> D[Result]`
                    }]
                }],
                description: `Test diagram for: ${params.description}`
            }]
            break
            
        case 'augment':
            operations = [{
                type: 'insert',
                position: params.position,
                content: [{
                    type: 'paragraph',
                    content: [{
                        type: 'text',
                        text: `\n**Test Augmentation**: ${params.instruction}\n\nThis is a test augmentation of the document. The actual AI would analyze the content and apply the requested improvements.\n`
                    }]
                }],
                description: `Test augmentation: ${params.instruction}`
            }]
            break
    }
    
    // Apply simulated operations
    applyAgentOperations(operations)
    showNotification(`✅ Test ${command} completed`, 'success')
}

/**
 * Apply operations from agent to the editor
 */
function applyAgentOperations(operations: DocumentOperation[]): void {
    if (!editor) {
        console.error('Editor not initialized')
        return
    }
    
    console.log('📝 Applying operations from agent:', operations)
    
    editor.action((ctx) => {
        const view = ctx.get(editorViewCtx)
        let tr = view.state.tr
        
        for (const operation of operations) {
            switch (operation.type) {
                case 'insert':
                    tr = applyInsertOperation(tr, operation, view)
                    break
                // Add more operation types as needed
            }
        }
        
        if (tr.docChanged) {
            view.dispatch(tr)
        }
    })
}

function applyInsertOperation(tr: any, operation: DocumentOperation, view: any): any {
    try {
        const schema = view.state.schema
        const position = operation.position || tr.selection.head
        
        if (operation.content && Array.isArray(operation.content)) {
            for (const contentItem of operation.content) {
                const node = contentItemToNode(contentItem, schema)
                if (node) {
                    tr = tr.insert(position, node)
                }
            }
        }
    } catch (error) {
        console.error('Failed to apply insert operation:', error)
    }
    
    return tr
}

function contentItemToNode(item: any, schema: any): any {
    try {
        switch (item.type) {
            case 'paragraph':
                const textNodes = item.content?.map((child: any) => 
                    child.type === 'text' ? schema.text(child.text) : null
                ).filter(Boolean) || []
                return schema.nodes.paragraph.create(null, textNodes)
                
            case 'code_block':
                const codeText = item.content?.[0]?.text || ''
                return schema.nodes.code_block.create(
                    { params: item.attrs?.params || '' },
                    codeText ? [schema.text(codeText)] : []
                )
                
            default:
                console.warn('Unknown content item type:', item.type)
                return null
        }
    } catch (error) {
        console.error('Failed to create node from content item:', error)
        return null
    }
}

function setupAutoSave(crepe: Crepe): void {
    let saveTimeout: number | null = null;
    
    // Listen for content changes
    crepe.editor.action((ctx) => {
        const view = ctx.get(editorViewCtx)
        
        // Override dispatchTransaction to detect changes
        const originalDispatch = view.dispatch
        view.dispatch = (tr) => {
            originalDispatch.call(view, tr)
            
            // Debounce save
            if (tr.docChanged) {
                if (saveTimeout) {
                    clearTimeout(saveTimeout)
                }
                saveTimeout = window.setTimeout(() => {
                    saveDocument()
                }, 1000)
            }
        }
    })
}

async function saveDocument(): Promise<void> {
    if (!editor) return
    
    try {
        showSaveStatus('saving')
        
        // Get markdown content from editor
        const content = await getMarkdownContent()
        
        const response = await fetch('/document', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content })
        })
        
        if (!response.ok) {
            throw new Error(`Save failed: ${response.status}`)
        }
        
        showSaveStatus('saved')
        
    } catch (error) {
        console.error("Failed to save document:", error)
        showSaveStatus('error')
    }
}

async function getMarkdownContent(): Promise<string> {
    if (!editor) return ''
    
    return new Promise((resolve) => {
        editor!.action((ctx) => {
            const view = ctx.get(editorViewCtx)
            // For now, return the text content
            // TODO: Implement proper markdown serialization
            resolve(view.state.doc.textContent || "")
        })
    })
}

function setupPreview(): void {
    const eventSource = new EventSource("/events");
    const mermaid = (window as any).mermaid;

    eventSource.onmessage = function (event: MessageEvent) {
        const data = decodeURIComponent(event.data);
        
        // Check if this is an operations message
        try {
            const parsed = JSON.parse(data);
            if (parsed.type === "operations") {
                console.log('📨 Received operations from server:', parsed.operations);
                // Operations are now handled directly by the Milkdown editor
                // via the agent integration, so we don't need to apply them here
                return;
            }
        } catch (e) {
            // Not JSON, treat as HTML content
        }
        
        const previewElement = document.getElementById("preview");
        if (previewElement) {
            previewElement.innerHTML = data;
            
            // Re-initialize features in preview
            if (mermaid) {
                mermaid.init(undefined, previewElement.querySelectorAll(".mermaid"));
            }
            
            processGeoJson(previewElement);
            processMath(previewElement);
        }
    };

    // Initial preview load
    fetch("/preview")
        .then((response) => response.text())
        .then((content) => {
            const previewElement = document.getElementById("preview");
            if (previewElement) {
                previewElement.innerHTML = content;
                if (mermaid) {
                    mermaid.init(undefined, previewElement.querySelectorAll(".mermaid"));
                }
                processGeoJson(previewElement);
                processMath(previewElement);
            }
        })
        .catch(error => {
            console.error('Failed to load initial preview:', error);
        });
}

function setupUI(): void {
    // Setup toolbar buttons
    setupToolbarButtons();
    
    // Setup keyboard shortcuts
    setupKeyboardShortcuts();
    
    // Setup theme toggle
    setupThemeToggle();
}

function setupToolbarButtons(): void {
    const saveBtn = document.getElementById('save-btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            saveDocument();
        });
    }
}

function setupKeyboardShortcuts(): void {
    document.addEventListener('keydown', (e) => {
        // Ctrl+S to save
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            saveDocument();
        }
    });
}

function setupThemeToggle(): void {
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            document.body.classList.toggle('dark-theme');
            localStorage.setItem('theme', document.body.classList.contains('dark-theme') ? 'dark' : 'light');
        });
        
        // Load saved theme
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark') {
            document.body.classList.add('dark-theme');
        }
    }
}

function showSaveStatus(status: 'saving' | 'saved' | 'error'): void {
    const statusElement = document.getElementById('save-status');
    if (statusElement) {
        switch (status) {
            case 'saving':
                statusElement.textContent = '💾 Saving...';
                statusElement.className = 'save-status saving';
                break;
            case 'saved':
                statusElement.textContent = '✅ Saved';
                statusElement.className = 'save-status saved';
                setTimeout(() => {
                    statusElement.textContent = '';
                    statusElement.className = 'save-status';
                }, 2000);
                break;
            case 'error':
                statusElement.textContent = '❌ Save failed';
                statusElement.className = 'save-status error';
                setTimeout(() => {
                    statusElement.textContent = '';
                    statusElement.className = 'save-status';
                }, 3000);
                break;
        }
    }
}

function showError(message: string): void {
    console.error(message);
    
    // Create error notification
    const errorElement = document.createElement('div');
    errorElement.className = 'error-notification';
    errorElement.textContent = message;
    
    document.body.appendChild(errorElement);
    
    // Remove after 5 seconds
    setTimeout(() => {
        errorElement.remove();
    }, 5000);
}

function showNotification(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
    console.log(`[${type.toUpperCase()}] ${message}`)
    
    // Create a simple notification element
    const notification = document.createElement('div')
    notification.className = `notification notification-${type}`
    notification.textContent = message
    
    document.body.appendChild(notification)
    
    // Remove after 4 seconds
    setTimeout(() => {
        notification.remove()
    }, 4000)
}

// Keep existing helper functions for preview features
function processGeoJson(contentElement: HTMLElement): void {
    const L = (window as any).L;
    if (!L) return;
    
    const nodes = Array.from(contentElement.querySelectorAll(".geojson"));
    for (const node of nodes) {
        try {
            const element = node as HTMLElement;
            const mapId = element.id;
            const mapContent = element.innerHTML;
            const geojson = JSON.parse(mapContent);
            element.innerHTML = "";

            const map = L.map(mapId).setView(
                [geojson.features[0].geometry.coordinates[1], geojson.features[0].geometry.coordinates[0]],
                10,
            );

            L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
                maxZoom: 19,
                attribution: "© OpenStreetMap",
            }).addTo(map);

            L.geoJSON(geojson).addTo(map);
        } catch (error) {
            console.error("Failed to process GeoJSON:", error);
        }
    }
}

function processMath(contentElement: HTMLElement): void {
    const katex = (window as any).katex;
    if (!katex) return;
    
    const displayMath = contentElement.querySelectorAll(".math-display");
    displayMath.forEach((element: Element) => {
        try {
            const mathElement = element as HTMLElement;
            const mathText = mathElement.textContent || "";
            katex.render(mathText, mathElement, { displayMode: true });
        } catch (error) {
            console.error("Failed to render display math:", error);
        }
    });
    
    const inlineMath = contentElement.querySelectorAll(".math-inline");
    inlineMath.forEach((element: Element) => {
        try {
            const mathElement = element as HTMLElement;
            const mathText = mathElement.textContent || "";
            katex.render(mathText, mathElement, { displayMode: false });
        } catch (error) {
            console.error("Failed to render inline math:", error);
        }
    });
}

// Export for global access (for debugging)
(window as any).editor = editor;
(window as any).executeAgentCommand = executeAgentCommand;
