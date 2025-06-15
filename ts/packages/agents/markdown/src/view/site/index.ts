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
});

async function initializeEditor(): Promise<void> {
    const editorElement = document.getElementById("editor");
    if (!editorElement) {
        console.error("Editor element not found");
        return;
    }
    
    try {
        // Initialize Yjs collaboration
        await initializeCollaboration();
        
        // Load initial content
        const initialContent = await loadInitialContent();
        
        // Create Crepe editor with AI integration, collaboration, and live preview
        const crepe = new Crepe({
            root: editorElement,
            defaultValue: initialContent,
            features: {
                [CrepeFeature.BlockEdit]: true,
                [CrepeFeature.LinkTooltip]: true,
            },            featureConfigs: {
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