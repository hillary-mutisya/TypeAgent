import { Editor, editorViewCtx } from '@milkdown/core'
import { Crepe, CrepeFeature } from '@milkdown/crepe'
import { commonmark } from '@milkdown/preset-commonmark'
import { gfm } from '@milkdown/preset-gfm'
import { history } from '@milkdown/plugin-history'
import { mermaidPlugin } from './plugins/mermaid-plugin.js'
import { agentCommandsPlugin, aiToolsConfigCtx } from './ai-tools/index.js'

// Import Crepe CSS
import '@milkdown/crepe/theme/common/style.css'
import '@milkdown/crepe/theme/frame.css'

export interface EditorOptions {
  initialContent?: string
  onContentChange?: (content: string) => void
  agentEndpoint?: string
}

export class MarkdownMilkdownEditor {
  private crepe: Crepe
  private editor: Editor
  private options: EditorOptions
  
  constructor(container: HTMLElement, options: EditorOptions = {}) {
    this.options = options
    this.initializeEditor(container)
  }
  
  private async initializeEditor(container: HTMLElement): Promise<void> {
    console.log('🚀 Initializing Milkdown editor with AI integration...')
    
    // AI Tools configuration
    const aiConfig = {
      useTypeAgent: true,
      agentEndpoint: this.options.agentEndpoint || '/agent/execute',
      testMode: false // Can be controlled via environment or options
    }
    
    // Create Crepe editor with BlockEdit configuration
    this.crepe = new Crepe({
      root: container,
      defaultValue: this.options.initialContent || "# Welcome\n\nStart editing your markdown document here...",
      features: {
        [CrepeFeature.BlockEdit]: true,
        [CrepeFeature.LinkTooltip]: true,
        [CrepeFeature.TableTooltip]: true
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
                  await this.executeAgentCommand('continue', { position: from })
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
                    await this.executeAgentCommand('diagram', { 
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
                    await this.executeAgentCommand('augment', { 
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
                  await this.executeAgentCommand('continue', { position: from, testMode: true })
                },
              })
              .addItem('test-diagram', {
                label: 'Test: Diagram',
                icon: '🧪',
                onRun: async (ctx: any) => {
                  const view = ctx.get(editorViewCtx)
                  const { from } = view.state.selection
                  const description = prompt('Test diagram description:') || 'test flowchart'
                  await this.executeAgentCommand('diagram', { 
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
                  await this.executeAgentCommand('augment', { 
                    instruction, 
                    position: from, 
                    testMode: true 
                  })
                },
              })
          }
        } as any
      }
    })
    
    // Configure editor with plugins
    await this.crepe.editor
      .use(aiToolsConfigCtx)          // Inject AI config context first
      .config((ctx) => {
        ctx.set(aiToolsConfigCtx.key, aiConfig)
      })
      .use(commonmark)                // Basic markdown support
      .use(gfm)                       // GitHub flavored markdown
      .use(mermaidPlugin)             // Mermaid diagram support
      .use(history)                   // Undo/redo
      .use(agentCommandsPlugin)       // AI commands (/continue, /diagram, /augment)
      .create()
    
    this.editor = this.crepe.editor
    
    // Setup content change listener
    this.setupContentChangeListener()
    
    // Setup agent operations listener
    this.setupAgentOperationsListener()
    
    console.log('✅ Milkdown editor initialized successfully')
    console.log('🤖 AI Tools available:')
    console.log('   • Type "/" to open block edit menu')
    console.log('   • Use "/continue" for AI content generation')
    console.log('   • Use "/diagram <description>" for diagrams')
    console.log('   • Use "/augment <instruction>" for document improvement')
    console.log('   • Add "/test:" prefix for test mode (no API calls)')
  }
  
  private setupContentChangeListener(): void {
    if (!this.options.onContentChange) return
    
    let changeTimeout: number | null = null
    
    this.editor.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      
      // Override dispatchTransaction to detect changes
      const originalDispatch = view.dispatch
      view.dispatch = (tr) => {
        originalDispatch.call(view, tr)
        
        // Debounce content change notifications
        if (tr.docChanged) {
          if (changeTimeout) {
            clearTimeout(changeTimeout)
          }
          changeTimeout = window.setTimeout(() => {
            this.notifyContentChange()
          }, 500)
        }
      }
    })
  }
  
  private notifyContentChange(): void {
    if (this.options.onContentChange) {
      const content = this.getMarkdownContent()
      this.options.onContentChange(content)
    }
  }
  
  private setupAgentOperationsListener(): void {
    // Listen for agent operations events
    window.addEventListener('agent-operations', ((event: CustomEvent) => {
      if (event.detail?.operations) {
        this.applyOperations(event.detail.operations)
      }
    }) as EventListener)
  }
  
  /**
   * Execute agent commands programmatically
   */
  private async executeAgentCommand(command: string, params: any): Promise<void> {
    try {
      console.log(`🤖 Executing agent command: ${command}`, params)
      
      // Get document context
      const context = this.getDocumentContext(params.position || 0)
      
      // Prepare the request
      const request = this.buildAgentRequest(command, params, context)
      
      // Call the agent
      const response = await fetch(this.options.agentEndpoint || '/agent/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request)
      })
      
      if (!response.ok) {
        throw new Error(`Agent call failed: ${response.status}`)
      }
      
      const result = await response.json()
      
      if (result.operations && result.operations.length > 0) {
        this.applyOperations(result.operations)
      }
      
      console.log('✅ Agent command completed successfully')
      
    } catch (error) {
      console.error(`❌ Agent command failed:`, error)
      this.showError(`Failed to execute ${command} command. Please try again.`)
    }
  }
  
  private buildAgentRequest(command: string, params: any, context: any): any {
    let originalRequest = ''
    
    switch (command) {
      case 'continue':
        originalRequest = params.testMode ? '/test:continue' : '/continue'
        break
      case 'diagram':
        originalRequest = params.testMode 
          ? `/test:diagram ${params.description}` 
          : `/diagram ${params.description}`
        break
      case 'augment':
        originalRequest = params.testMode 
          ? `/test:augment ${params.instruction}` 
          : `/augment ${params.instruction}`
        break
    }
    
    return {
      action: 'updateDocument',
      parameters: {
        originalRequest,
        context
      }
    }
  }
  
  private getDocumentContext(position: number): any {
    return this.editor.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      const doc = view.state.doc
      
      const beforeContext = doc.textBetween(Math.max(0, position - 1000), position)
      const afterContext = doc.textBetween(position, Math.min(doc.content.size, position + 1000))
      
      return {
        before: beforeContext,
        after: afterContext,
        full: doc.textBetween(0, doc.content.size),
        size: doc.content.size,
        position: position
      }
    })
  }
  
  private applyOperations(operations: any[]): void {
    console.log('📝 Applying operations from agent:', operations)
    
    this.editor.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      let tr = view.state.tr
      
      for (const operation of operations) {
        switch (operation.type) {
          case 'continue':
            tr = this.applyContinueOperation(tr, operation, view)
            break
          case 'diagram':
            tr = this.applyDiagramOperation(tr, operation, view)
            break
          case 'insert':
            tr = this.applyInsertOperation(tr, operation, view)
            break
          // TODO: Add more operation types as needed
        }
      }
      
      if (tr.docChanged) {
        view.dispatch(tr)
      }
    })
  }
  
  private applyContinueOperation(tr: any, operation: any, view: any): any {
    const content = operation.content || ''
    const textNode = view.state.schema.text(content)
    const paragraphNode = view.state.schema.nodes.paragraph.create(null, [textNode])
    
    const position = operation.position || tr.selection.head
    return tr.insert(position, paragraphNode)
  }
  
  private applyDiagramOperation(tr: any, operation: any, view: any): any {
    const mermaidCode = operation.content || ''
    const mermaidNodeType = view.state.schema.nodes.mermaid
    
    if (mermaidNodeType) {
      const mermaidNode = mermaidNodeType.create(
        { code: mermaidCode },
        mermaidCode ? [view.state.schema.text(mermaidCode)] : []
      )
      
      const position = operation.position || tr.selection.head
      return tr.insert(position, mermaidNode)
    }
    
    return tr
  }
  
  private applyInsertOperation(tr: any, operation: any, view: any): any {
    const content = operation.content || []
    const position = operation.position || tr.selection.head
    
    if (Array.isArray(content)) {
      for (const item of content) {
        const textNode = view.state.schema.text(item)
        const paragraphNode = view.state.schema.nodes.paragraph.create(null, [textNode])
        tr = tr.insert(position, paragraphNode)
      }
    } else {
      const textNode = view.state.schema.text(content)
      const paragraphNode = view.state.schema.nodes.paragraph.create(null, [textNode])
      tr = tr.insert(position, paragraphNode)
    }
    
    return tr
  }
  
  private showError(message: string): void {
    console.error(message)
    // TODO: Implement user-visible error notifications
    alert(message) // Temporary solution
  }
  
  /**
   * Get the current markdown content
   */
  getMarkdownContent(): string {
    return this.editor.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      return view.state.doc.textContent || ""
    })
  }
  
  /**
   * Set the markdown content
   */
  setMarkdownContent(content: string): void {
    // TODO: Implement proper markdown parsing and setting
    console.log('Setting markdown content:', content)
  }
  
  /**
   * Destroy the editor
   */
  destroy(): void {
    if (this.editor) {
      this.editor.destroy()
    }
  }
}
