import { $inputRule, $prose } from '@milkdown/utils'
import { editorViewCtx } from '@milkdown/core'
import { Plugin, PluginKey } from '@milkdown/prose/state'
import { InputRule } from '@milkdown/prose/inputrules'
import { aiToolsConfigCtx } from './config'
import { TypeAgentService } from './agent-service'
import { DocumentContext } from './types'

/**
 * Agent Commands Plugin - Integrates slash commands with TypeAgent markdown agent
 */

// Base class for handling agent commands
class AgentCommandHandler {
  private agentService: TypeAgentService
  private view: any
  
  constructor(view: any, config: any) {
    this.view = view
    this.agentService = new TypeAgentService(config)
  }
  
  getDocumentContext(position: number): DocumentContext {
    const doc = this.view.state.doc
    const beforeContext = doc.textBetween(Math.max(0, position - 1000), position)
    const afterContext = doc.textBetween(position, Math.min(doc.content.size, position + 1000))
    
    return {
      before: beforeContext,
      after: afterContext,
      full: doc.textBetween(0, doc.content.size),
      size: doc.content.size,
      position: position
    }
  }
  
  async executeContinue(position: number): Promise<void> {
    try {
      console.log('🤖 Executing continue command via TypeAgent...')
      
      const context = this.getDocumentContext(position)
      const result = await this.agentService.callAIForContinuation(context)
      
      if (result.operations && result.operations.length > 0) {
        this.applyOperations(result.operations, position)
      }
    } catch (error) {
      console.error('Continue command failed:', error)
      this.showError('Failed to generate continuation. Please try again.')
    }
  }
  
  async executeDiagram(description: string, position: number): Promise<void> {
    try {
      console.log(`📊 Executing diagram command via TypeAgent: ${description}`)
      
      const context = this.getDocumentContext(position)
      const result = await this.agentService.callAIForDiagram(description, context)
      
      if (result.operations && result.operations.length > 0) {
        this.applyOperations(result.operations, position)
      }
    } catch (error) {
      console.error('Diagram command failed:', error)
      this.showError('Failed to generate diagram. Please try again.')
    }
  }
  
  async executeAugment(instruction: string, position: number): Promise<void> {
    try {
      console.log(`✨ Executing augment command via TypeAgent: ${instruction}`)
      
      const context = this.getDocumentContext(position)
      const result = await this.agentService.callAIForAugmentation(instruction, context)
      
      if (result.operations && result.operations.length > 0) {
        this.applyOperations(result.operations, position)
      }
    } catch (error) {
      console.error('Augment command failed:', error)
      this.showError('Failed to augment document. Please try again.')
    }
  }
  
  private applyOperations(operations: any[], position: number): void {
    console.log('Applying operations from TypeAgent:', operations)
    
    // Create a transaction to apply all operations
    let tr = this.view.state.tr
    
    for (const operation of operations) {
      switch (operation.type) {
        case 'continue':
          tr = this.applyContinueOperation(tr, operation, position)
          break
        case 'diagram':
          tr = this.applyDiagramOperation(tr, operation, position)
          break
        case 'insert':
          tr = this.applyInsertOperation(tr, operation, position)
          break
        case 'replace':
          tr = this.applyReplaceOperation(tr, operation)
          break
        case 'delete':
          tr = this.applyDeleteOperation(tr, operation)
          break
      }
    }
    
    // Dispatch the transaction if changes were made
    if (tr.docChanged) {
      this.view.dispatch(tr)
    }
  }
  
  private applyContinueOperation(tr: any, operation: any, position: number): any {
    const content = operation.content || ''
    const textNode = this.view.state.schema.text(content)
    
    // Insert as paragraph
    const paragraphNode = this.view.state.schema.nodes.paragraph.create(null, [textNode])
    tr = tr.insert(position, paragraphNode)
    
    return tr
  }
  
  private applyDiagramOperation(tr: any, operation: any, position: number): any {
    const mermaidCode = operation.content || ''
    const mermaidNodeType = this.view.state.schema.nodes.mermaid
    
    if (mermaidNodeType) {
      const mermaidNode = mermaidNodeType.create(
        { code: mermaidCode },
        mermaidCode ? [this.view.state.schema.text(mermaidCode)] : []
      )
      tr = tr.insert(position, mermaidNode)
    }
    
    return tr
  }
  
  private applyInsertOperation(tr: any, operation: any, position: number): any {
    const content = operation.content || ''
    if (Array.isArray(content)) {
      // Handle array of content items
      for (const item of content) {
        const textNode = this.view.state.schema.text(item)
        const paragraphNode = this.view.state.schema.nodes.paragraph.create(null, [textNode])
        tr = tr.insert(position, paragraphNode)
      }
    } else {
      // Handle string content
      const textNode = this.view.state.schema.text(content)
      const paragraphNode = this.view.state.schema.nodes.paragraph.create(null, [textNode])
      tr = tr.insert(position, paragraphNode)
    }
    
    return tr
  }
  
  private applyReplaceOperation(tr: any, operation: any): any {
    // TODO: Implement replace operation
    console.log('Replace operation not yet implemented:', operation)
    return tr
  }
  
  private applyDeleteOperation(tr: any, operation: any): any {
    // TODO: Implement delete operation
    console.log('Delete operation not yet implemented:', operation)
    return tr
  }
  
  private showError(message: string): void {
    console.error(message)
    // TODO: Implement user-visible error notifications
  }
}

// Input rule for /continue command
export const continueInputRule = $inputRule((ctx) => {
  return new InputRule(/\/continue$/, (state, match, start, end) => {
    console.log('🤖 Continue slash command triggered!')
    
    const view = ctx.get(editorViewCtx)
    const config = ctx.get(aiToolsConfigCtx.key)
    const handler = new AgentCommandHandler(view, { ...config, testMode: false })
    
    // Remove the slash command text
    const tr = state.tr.delete(start, end)
    
    // Get cursor position after deletion
    const { from } = tr.selection
    
    // Trigger AI continuation
    setTimeout(() => {
      handler.executeContinue(from)
    }, 100)
    
    return tr
  })
})

// Input rule for /test:continue command  
export const testContinueInputRule = $inputRule((ctx) => {
  return new InputRule(/\/test:continue$/, (state, match, start, end) => {
    console.log('🧪 Test continue slash command triggered!')
    
    const view = ctx.get(editorViewCtx)
    const config = ctx.get(aiToolsConfigCtx.key)
    const handler = new AgentCommandHandler(view, { ...config, testMode: true })
    
    // Remove the slash command text
    const tr = state.tr.delete(start, end)
    
    // Get cursor position after deletion
    const { from } = tr.selection
    
    // Trigger AI continuation  
    setTimeout(() => {
      handler.executeContinue(from)
    }, 100)
    
    return tr
  })
})

// Input rule for /diagram command (with description)
export const diagramInputRule = $inputRule((ctx) => {
  return new InputRule(/\/diagram\s+(.+)$/, (state, match, start, end) => {
    const description = match[1]
    console.log('📊 Diagram slash command triggered with description:', description)
    
    const view = ctx.get(editorViewCtx)
    const config = ctx.get(aiToolsConfigCtx.key)
    const handler = new AgentCommandHandler(view, { ...config, testMode: false })
    
    // Remove the slash command text
    const tr = state.tr.delete(start, end)
    
    // Get cursor position after deletion
    const { from } = tr.selection
    
    // Trigger AI diagram generation
    setTimeout(() => {
      handler.executeDiagram(description, from)
    }, 100)
    
    return tr
  })
})

// Input rule for /test:diagram command
export const testDiagramInputRule = $inputRule((ctx) => {
  return new InputRule(/\/test:diagram(?:\s+(.+))?$/, (state, match, start, end) => {
    const description = match[1] || 'test diagram'
    console.log('🧪 Test diagram slash command triggered with description:', description)
    
    const view = ctx.get(editorViewCtx)
    const config = ctx.get(aiToolsConfigCtx.key)
    const handler = new AgentCommandHandler(view, { ...config, testMode: true })
    
    // Remove the slash command text
    const tr = state.tr.delete(start, end)
    
    // Get cursor position after deletion
    const { from } = tr.selection
    
    // Trigger test diagram generation
    setTimeout(() => {
      handler.executeDiagram(description, from)
    }, 100)
    
    return tr
  })
})

// Input rule for /augment command
export const augmentInputRule = $prose((ctx) => {
  return new Plugin({
    key: new PluginKey('augment-input'),
    
    props: {
      handleKeyDown(view, event) {
        // Only handle Enter key
        if (event.key !== 'Enter') {
          return false
        }
        
        const { state } = view
        const { selection } = state
        const { $from } = selection
        
        // Get the current line content
        const lineStart = $from.start($from.depth)
        const lineEnd = $from.end($from.depth)
        const lineText = state.doc.textBetween(lineStart, lineEnd)
        
        // Check if the line starts with /augment (but not /test:augment)
        const match = lineText.match(/^\/augment\s+(.+)$/)
        if (!match) {
          return false
        }
        
        // Prevent default Enter behavior
        event.preventDefault()
        
        const instruction = match[1]
        console.log('✨ Augment command triggered on Enter with instruction:', instruction)
        
        const config = ctx.get(aiToolsConfigCtx.key)
        const handler = new AgentCommandHandler(view, { ...config, testMode: false })
        
        // Remove the command line
        const tr = state.tr.delete(lineStart, lineEnd)
        view.dispatch(tr)
        
        // Get cursor position after deletion
        const newPos = lineStart
        
        // Trigger augmentation
        setTimeout(() => {
          handler.executeAugment(instruction, newPos)
        }, 100)
        
        return true
      }
    }
  })
})

// Input rule for /test:augment command
export const testAugmentInputRule = $prose((ctx) => {
  return new Plugin({
    key: new PluginKey('test-augment-input'),
    
    props: {
      handleKeyDown(view, event) {
        // Only handle Enter key
        if (event.key !== 'Enter') {
          return false
        }
        
        const { state } = view
        const { selection } = state
        const { $from } = selection
        
        // Get the current line content
        const lineStart = $from.start($from.depth)
        const lineEnd = $from.end($from.depth)
        const lineText = state.doc.textBetween(lineStart, lineEnd)
        
        // Check if the line starts with /test:augment
        const match = lineText.match(/^\/test:augment(?:\s+(.+))?$/)
        if (!match) {
          return false
        }
        
        // Prevent default Enter behavior
        event.preventDefault()
        
        const instruction = match[1] || 'improve formatting'
        console.log('🧪 Test augment command triggered on Enter with instruction:', instruction)
        
        const config = ctx.get(aiToolsConfigCtx.key)
        const handler = new AgentCommandHandler(view, { ...config, testMode: true })
        
        // Remove the command line
        const tr = state.tr.delete(lineStart, lineEnd)
        view.dispatch(tr)
        
        // Get cursor position after deletion
        const newPos = lineStart
        
        // Trigger test augmentation
        setTimeout(() => {
          handler.executeAugment(instruction, newPos)
        }, 100)
        
        return true
      }
    }
  })
})

// Export all input rules
export const agentCommandsPlugin = [
  continueInputRule,
  testContinueInputRule,
  diagramInputRule,
  testDiagramInputRule,
  augmentInputRule,
  testAugmentInputRule
].flat()
