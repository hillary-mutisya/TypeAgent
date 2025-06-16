import { Editor, editorViewCtx } from '@milkdown/core'
import { Crepe, CrepeFeature } from '@milkdown/crepe'
import { commonmark } from '@milkdown/preset-commonmark'
import { gfm } from '@milkdown/preset-gfm'
import { history } from '@milkdown/plugin-history'
import { collab, collabServiceCtx } from '@milkdown/plugin-collab'
import { WebsocketProvider } from 'y-websocket'
import { Doc } from 'yjs'

// Import Crepe CSS
import '@milkdown/crepe/theme/common/style.css'
import '@milkdown/crepe/theme/frame.css'

// Import custom styles
import './styles/milkdown-integration.css'
import './styles.css'
import './mermaid-styles.css'

// Import our custom plugins
import { mermaidPlugin } from './mermaid-plugin'
import { slashCommandHandler } from './slash-commands'

// Types for operations
interface DocumentOperation {
  type: string;
  position?: number;
  content?: any;
  description?: string;
}

let editor: Editor | null = null;
let yjsDoc: Doc | null = null;
let websocketProvider: WebsocketProvider | null = null;

document.addEventListener("DOMContentLoaded", async () => {
    await initializeEditor();
    setupUI();
    restoreRawMarkdownPanelState();
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
        
        // Always use full editor with all features
        await initializeFullEditor(editorElement, initialContent);
        
    } catch (error) {
        console.error('❌ Failed to initialize editor:', error);
        showError('Failed to initialize editor. Please refresh the page.');
    }
}

async function initializeFullEditor(container: HTMLElement, initialContent: string): Promise<void> {
    console.log('🔄 Initializing Full Editor...');
    
    // Clean up any existing editor
    if (editor) {
        editor.destroy();
        editor = null;
    }
    
    // Clear container
    container.innerHTML = '';
    
    // Initialize Yjs collaboration
    await initializeCollaboration();
        
    // Create Crepe editor with AI integration, collaboration, and live preview
    const crepe = new Crepe({
        root: container,
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
        
        // Configure editor with plugins including collaboration and custom plugins
        await crepe.editor
            .use(commonmark)                // Basic markdown support
            .use(mermaidPlugin)             // Mermaid diagram support - BEFORE GFM to handle mermaid code blocks
            .use(gfm)                       // GitHub flavored markdown
            .use(history)                   // Undo/redo
            .use(collab)                    // Yjs collaboration - plugin loaded but not bound yet
            .use(slashCommandHandler)       // Enhanced slash command handling
            .create()
        
        editor = crepe.editor
        
        // Setup collaboration after editor is created
        if (yjsDoc && websocketProvider) {
            editor.action((ctx) => {
                const collabService = ctx.get(collabServiceCtx)
                collabService.bindDoc(yjsDoc!).setAwareness(websocketProvider!.awareness).connect()
                console.log('🔄 Collaboration connected (no auto-save conflicts)')
            })
        }
        
        // setupAutoSave(crepe);
        
        console.log('✅ Full Editor with AI integration, Mermaid support and collaboration initialized successfully');
        console.log('🤖 Available AI commands:');
        console.log('   • Type "/" to open block edit menu with AI tools');
        console.log('   • Type slash commands directly: /test:continue, /test:diagram, /test:augment');
        console.log('   • Mermaid diagrams: Type ```mermaid code ``` or click diagrams to edit');
        console.log('   • Available: Continue Writing, Generate Diagram, Augment Document');
        console.log('   • Test versions available for testing without API calls');
        console.log('🔄 Real-time collaboration enabled');
}

async function initializeCollaboration(): Promise<void> {
    try {
        // Try to get collaboration info from server
        let collabInfo;
        try {
            const response = await fetch('/collaboration/info');
            if (response.ok) {
                collabInfo = await response.json();
                console.log('🔄 Initializing collaboration:', collabInfo);
            } else {
                throw new Error(`Server returned ${response.status}`);
            }
        } catch (fetchError) {
            console.warn('⚠️ Could not get collaboration info from server, using defaults:', fetchError);
            // Use default configuration if server endpoint is not available
            collabInfo = {
                websocketServerUrl: 'ws://localhost:1234',
                currentDocument: 'live',
                documents: 0,
                totalClients: 0
            };
        }
        
        // Create Yjs document
        yjsDoc = new Doc();
        
        // Determine document ID (use current document name or default)
        const documentId = collabInfo.currentDocument ? 
            collabInfo.currentDocument.replace('.md', '') : 
            'live';
        
        // Create WebSocket provider
        websocketProvider = new WebsocketProvider(
            collabInfo.websocketServerUrl || 'ws://localhost:1234',
            documentId,
            yjsDoc
        );
        
        // Setup connection status monitoring
        setupCollaborationStatus(websocketProvider);
        
        console.log('✅ Collaboration initialized for document:', documentId);
        
    } catch (error) {
        console.error('❌ Failed to initialize collaboration:', error);
        console.log('⚠️ Continuing without collaboration features');
        
        // Create a local-only Yjs document as fallback
        yjsDoc = new Doc();
    }
}

function setupCollaborationStatus(provider: WebsocketProvider): void {
    const statusElement = document.getElementById('collaboration-status') || createCollaborationStatusElement();
    
    provider.on('status', ({ status }: { status: string }) => {
        console.log('Collaboration status:', status);
        
        statusElement.className = `collaboration-status ${status}`;
        
        switch (status) {
            case 'connected':
                statusElement.textContent = '🔄 Connected to collaboration server';
                statusElement.style.display = 'block';
                setTimeout(() => {
                    statusElement.style.display = 'none';
                }, 3000);
                break;
            case 'disconnected':
                statusElement.textContent = '❌ Disconnected from collaboration server';
                statusElement.style.display = 'block';
                break;
            case 'connecting':
                statusElement.textContent = '🔄 Connecting to collaboration server...';
                statusElement.style.display = 'block';
                break;
        }
    });

    provider.on('sync', (isSynced: boolean) => {
        if (isSynced) {
            console.log('📄 Document synchronized');
        }
    });
}

function createCollaborationStatusElement(): HTMLElement {
    const statusElement = document.createElement('div');
    statusElement.id = 'collaboration-status';
    statusElement.className = 'collaboration-status';
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
        
        // Always use streaming for better UX
        await executeStreamingAgentCommand(command, params);
        
    } catch (error) {
        console.error(`❌ Agent command failed:`, error)
        showNotification(`Failed to execute ${command} command. Please try again.`, 'error')
    }
}

async function executeStreamingAgentCommand(command: string, params: any): Promise<void> {
    const request = buildAgentRequest(command, params);
    
    // Show AI presence cursor
    showAIPresence(params.position || 0, true);
    
    try {
        // Call streaming endpoint
        const response = await fetch('/agent/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request)
        });
        
        if (!response.ok) {
            throw new Error(`Streaming failed: ${response.status}`);
        }
        
        const reader = response.body?.getReader();
        if (!reader) {
            throw new Error('No response stream available');
        }
        
        const decoder = new TextDecoder();
        let buffer = '';
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            
            // Process complete lines
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep incomplete line in buffer
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6));
                        await handleStreamEvent(data, params.position || 0);
                    } catch (e) {
                        console.warn('Failed to parse stream data:', line);
                    }
                }
            }
        }
        
        console.log('✅ Streaming command completed successfully');
        showNotification(`✅ ${command} completed successfully!`, 'success');
        
    } finally {
        // Hide AI presence cursor
        showAIPresence(params.position || 0, false);
    }
}

async function handleStreamEvent(data: any, position: number): Promise<void> {
    switch (data.type) {
        case 'start':
            console.log('🎬 Stream started:', data.message);
            break;
            
        case 'typing':
            updateAIPresenceMessage(data.message || 'AI is thinking...');
            break;
            
        case 'content':
            // Insert content chunk at position
            await insertContentChunk(data.chunk, data.position || position);
            break;
            
        case 'operation':
            // Apply operation to document
            if (data.operation) {
                applyAgentOperations([data.operation]);
            }
            break;
            
        case 'complete':
            console.log('✅ Stream completed');
            break;
            
        case 'error':
            console.error('❌ Stream error:', data.error);
            showNotification(`Stream error: ${data.error}`, 'error');
            break;
    }
}

async function insertContentChunk(chunk: string, position: number): Promise<void> {
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

function showAIPresence(position: number, show: boolean): void {
    // Create or update AI presence indicator
    let indicator = document.getElementById('ai-presence-indicator');
    
    if (show) {
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'ai-presence-indicator';
            indicator.className = 'ai-presence-indicator';
            indicator.innerHTML = `
                <div class="ai-avatar">🤖</div>
                <div class="ai-message">AI is thinking...</div>
                <div class="ai-typing-dots">
                    <span></span><span></span><span></span>
                </div>
            `;
            document.body.appendChild(indicator);
        }
        indicator.style.display = 'block';
    } else {
        if (indicator) {
            indicator.style.display = 'none';
        }
    }
}

function updateAIPresenceMessage(message: string): void {
    const indicator = document.getElementById('ai-presence-indicator');
    if (indicator) {
        const messageEl = indicator.querySelector('.ai-message');
        if (messageEl) {
            messageEl.textContent = message;
        }
    }
}

function buildAgentRequest(command: string, params: any): any {
    let originalRequest = ''
    
    // Add test prefix if in test mode
    const prefix = params.testMode ? '/test:' : '/'
    
    switch (command) {
        case 'continue':
            originalRequest = `${prefix}continue`
            break
        case 'diagram':
            originalRequest = `${prefix}diagram ${params.description || ''}`
            break
        case 'augment':
            originalRequest = `${prefix}augment ${params.instruction || ''}`
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
                case 'insertMarkdown':
                    tr = applyInsertMarkdownOperation(tr, operation, view)
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

function applyInsertMarkdownOperation(tr: any, operation: any, view: any): any {
    try {
        const position = operation.position || tr.selection.head
        const markdown = operation.markdown || ''
        
        console.log('📝 Parsing and inserting markdown content properly')
        
        // Parse markdown content and create proper nodes
        setTimeout(() => {
            insertMarkdownContentAsParsedNodes(position, markdown, view)
        }, 100)
        
        // Return original transaction to avoid immediate text insertion
        return tr
        
    } catch (error) {
        console.error('Failed to apply insert markdown operation:', error)
        const position = operation.position || tr.selection.head
        const markdown = operation.markdown || ''
        return tr.insertText(markdown, position)
    }
}

async function insertMarkdownContentAsParsedNodes(pos: number, content: string, view: any): Promise<void> {
    const schema = view.state.schema
    const lines = content.split('\n')
    let currentPos = pos
    
    for (const line of lines) {
        if (!line.trim()) {
            // Empty line - just add a line break
            const tr = view.state.tr
            tr.insertText('\n', currentPos)
            view.dispatch(tr)
            currentPos += 1
            await new Promise(resolve => setTimeout(resolve, 100))
            continue
        }
        
        // Parse different markdown elements
        if (line.startsWith('##')) {
            // Heading level 2
            await insertHeading(view, currentPos, line.replace(/^##\s*/, ''), 2)
            currentPos += line.length + 1
        } else if (line.startsWith('###')) {
            // Heading level 3
            await insertHeading(view, currentPos, line.replace(/^###\s*/, ''), 3)
            currentPos += line.length + 1
        } else if (line.startsWith('![')) {
            // Image
            await insertImageNode(view, currentPos, line)
            currentPos += line.length + 1
        } else if (line.startsWith('$$') && line.endsWith('$$')) {
            // Math block
            await insertMathBlock(view, currentPos, line.slice(2, -2))
            currentPos += line.length + 1
        } else if (line.includes('$$')) {
            // Inline math in paragraph
            await insertParagraphWithMath(view, currentPos, line)
            currentPos += line.length + 1
        } else if (line.startsWith('**') && line.endsWith('**')) {
            // Bold text as paragraph
            await insertBoldParagraph(view, currentPos, line.slice(2, -2))
            currentPos += line.length + 1
        } else if (line.startsWith('- ')) {
            // List item
            await insertParagraph(view, currentPos, line)
            currentPos += line.length + 1
        } else if (line.startsWith('> ')) {
            // Blockquote
            await insertParagraph(view, currentPos, line)
            currentPos += line.length + 1
        } else {
            // Regular paragraph
            await insertParagraph(view, currentPos, line)
            currentPos += line.length + 1
        }
        
        await new Promise(resolve => setTimeout(resolve, 150))
    }
}

async function insertHeading(view: any, pos: number, text: string, level: number): Promise<void> {
    const schema = view.state.schema
    const headingType = schema.nodes.heading
    
    if (headingType) {
        const tr = view.state.tr
        tr.insertText('\n', pos)
        tr.insertText('#'.repeat(level) + ' ' + text + '\n', pos + 1)
        view.dispatch(tr)
    } else {
        const tr = view.state.tr
        tr.insertText('\n' + '#'.repeat(level) + ' ' + text + '\n', pos)
        view.dispatch(tr)
    }
}

async function insertMathBlock(view: any, pos: number, mathContent: string): Promise<void> {
    const tr = view.state.tr
    tr.insertText('\n$$' + mathContent + '$$\n', pos)
    view.dispatch(tr)
}

async function insertParagraphWithMath(view: any, pos: number, content: string): Promise<void> {
    const tr = view.state.tr
    tr.insertText('\n' + content + '\n', pos)
    view.dispatch(tr)
}

async function insertImageNode(view: any, pos: number, imageMarkdown: string): Promise<void> {
    const tr = view.state.tr
    tr.insertText('\n' + imageMarkdown + '\n', pos)
    view.dispatch(tr)
}

async function insertBoldParagraph(view: any, pos: number, text: string): Promise<void> {
    const tr = view.state.tr
    tr.insertText('\n**' + text + '**\n', pos)
    view.dispatch(tr)
}

async function insertParagraph(view: any, pos: number, text: string): Promise<void> {
    const tr = view.state.tr
    tr.insertText('\n' + text + '\n', pos)
    view.dispatch(tr)
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
    if (!editor) return '';
    
    try {
        // First try to get content from server (most accurate)
        const response = await fetch('/document');
        if (response.ok) {
            return await response.text();
        }
    } catch (error) {
        console.warn('Failed to fetch document from server:', error);
    }
    
    // Fallback to editor content
    return new Promise((resolve) => {
        editor!.action((ctx) => {
            const view = ctx.get(editorViewCtx);
            resolve(view.state.doc.textContent || "");
        });
    });
}

function setupUI(): void {
    // Setup toolbar buttons
    setupToolbarButtons();
    
    // Setup keyboard shortcuts
    setupKeyboardShortcuts();
    
    // Setup theme toggle
    setupThemeToggle();
    
    // Setup raw markdown panel
    setupRawMarkdownPanel();
}

function setupToolbarButtons(): void {
    const saveBtn = document.getElementById('save-btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            saveDocument();
        });
    }
    
    const rawMarkdownToggle = document.getElementById('raw-markdown-toggle');
    if (rawMarkdownToggle) {
        rawMarkdownToggle.addEventListener('click', () => {
            toggleRawMarkdownPanel();
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
        
        // Handle Enter key for slash commands
        if (e.key === 'Enter' && editor) {
            handleEnterKeyForCommands(e);
        }
    });
}

function handleEnterKeyForCommands(e: KeyboardEvent): void {
    if (!editor) return;
    
    editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const { from } = view.state.selection;
        
        // Get the current line content
        const line = view.state.doc.cut(
            view.state.doc.resolve(from).before(),
            view.state.doc.resolve(from).after()
        );
        const lineText = line.textContent.trim();
        
        // Check if this is a slash command
        if (lineText.startsWith('/test:') || lineText.startsWith('/')) {
            const command = lineText.trim();
            console.log('🎯 Detected slash command:', command);
            
            // Prevent default Enter behavior
            e.preventDefault();
            
            // Handle the command
            handleSlashCommand(command, from);
        }
    });
}

async function handleSlashCommand(command: string, position: number): Promise<void> {
    console.log(`⚡ Executing slash command: ${command} at position ${position}`);
    
    try {
        // Parse command
        if (command.startsWith('/test:continue')) {
            await executeAgentCommand('continue', { position, testMode: true });
        } else if (command.startsWith('/continue')) {
            await executeAgentCommand('continue', { position, testMode: false });
        } else if (command.startsWith('/test:diagram')) {
            const description = command.replace('/test:diagram', '').trim() || 'test process';
            await executeAgentCommand('diagram', { description, position, testMode: true });
        } else if (command.startsWith('/diagram')) {
            const description = command.replace('/diagram', '').trim() || 'diagram';
            await executeAgentCommand('diagram', { description, position, testMode: false });
        } else if (command.startsWith('/test:augment')) {
            const instruction = command.replace('/test:augment', '').trim() || 'improve formatting';
            await executeAgentCommand('augment', { instruction, position, testMode: true });
        } else if (command.startsWith('/augment')) {
            const instruction = command.replace('/augment', '').trim() || 'improve formatting';
            await executeAgentCommand('augment', { instruction, position, testMode: false });
        } else {
            console.warn('⚠️ Unknown slash command:', command);
            showNotification(`Unknown command: ${command}`, 'error');
        }
    } catch (error) {
        console.error('❌ Slash command execution failed:', error);
        showNotification(`Failed to execute command: ${command}`, 'error');
    }
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

function setupRawMarkdownPanel(): void {
    const closeButton = document.getElementById('close-raw-panel');
    if (closeButton) {
        closeButton.addEventListener('click', () => {
            hideRawMarkdownPanel();
        });
    }
    
    // Update panel content when editor changes
    if (editor) {
        updateRawMarkdownContent();
        
        // Listen for editor changes to update raw markdown
        // DISABLED - No dispatch override 
        /*
        editor.action((ctx) => {
            const view = ctx.get(editorViewCtx);
            
            // Override dispatchTransaction to detect changes
            const originalDispatch = view.dispatch;
            view.dispatch = (tr) => {
                originalDispatch.call(view, tr);
                
                // Update raw markdown panel if visible
                if (tr.docChanged && isRawMarkdownPanelVisible()) {
                    setTimeout(() => updateRawMarkdownContent(), 100);
                }
            };
        });
        */
        console.log('ℹ️ Raw markdown panel dispatch override disabled for debugging')
    }
}

function toggleRawMarkdownPanel(): void {
    const panel = document.getElementById('raw-markdown-panel');
    const button = document.getElementById('raw-markdown-toggle');
    const container = document.getElementById('editor-container');
    
    if (panel && button && container) {
        const isVisible = panel.classList.contains('visible');
        
        if (isVisible) {
            hideRawMarkdownPanel();
        } else {
            showRawMarkdownPanel();
        }
    }
}

function showRawMarkdownPanel(): void {
    const panel = document.getElementById('raw-markdown-panel');
    const button = document.getElementById('raw-markdown-toggle');
    const container = document.getElementById('editor-container');
    
    if (panel && button && container) {
        panel.classList.add('visible');
        button.classList.add('active');
        container.classList.add('panel-visible');
        
        // Update content when showing
        updateRawMarkdownContent();
        
        // Store state
        localStorage.setItem('rawMarkdownPanelVisible', 'true');
    }
}

function hideRawMarkdownPanel(): void {
    const panel = document.getElementById('raw-markdown-panel');
    const button = document.getElementById('raw-markdown-toggle');
    const container = document.getElementById('editor-container');
    
    if (panel && button && container) {
        panel.classList.remove('visible');
        button.classList.remove('active');
        container.classList.remove('panel-visible');
        
        // Store state
        localStorage.setItem('rawMarkdownPanelVisible', 'false');
    }
}

function isRawMarkdownPanelVisible(): boolean {
    const panel = document.getElementById('raw-markdown-panel');
    return panel ? panel.classList.contains('visible') : false;
}

async function updateRawMarkdownContent(): Promise<void> {
    const textElement = document.getElementById('raw-markdown-text');
    if (textElement && editor) {
        try {
            const content = await getMarkdownContent();
            textElement.textContent = content || '# Empty Document\n\nStart typing to see content here...';
        } catch (error) {
            console.error('Failed to get markdown content:', error);
            textElement.textContent = '// Error loading content\n// Please try refreshing the page';
        }
    }
}

// Restore panel state on page load
function restoreRawMarkdownPanelState(): void {
    const savedState = localStorage.getItem('rawMarkdownPanelVisible');
    if (savedState === 'true') {
        setTimeout(() => showRawMarkdownPanel(), 500); // Delay to ensure editor is ready
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

// Export for global access (for debugging and slash commands)
(window as any).editor = editor;
(window as any).executeAgentCommand = executeAgentCommand;
