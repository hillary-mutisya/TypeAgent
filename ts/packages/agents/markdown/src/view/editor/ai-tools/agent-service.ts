import { AIToolsConfig, DocumentContext } from './types'

/**
 * TypeAgent service for integrating with the markdown agent
 * This replaces direct OpenAI API calls with calls to the TypeAgent markdown agent
 */
export class TypeAgentService {
  constructor(private config: AIToolsConfig) {}
  
  /**
   * Call the markdown agent for content continuation
   */
  async callAIForContinuation(context: DocumentContext): Promise<any> {
    if (this.config.testMode) {
      return this.simulateResponse('continue')
    }
    
    const response = await fetch(this.config.agentEndpoint || '/agent/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'updateDocument',
        parameters: {
          originalRequest: '/continue',
          context: context
        }
      })
    })
    
    if (!response.ok) {
      throw new Error(`Agent call failed: ${response.status}`)
    }
    
    return response.json()
  }
  
  /**
   * Call the markdown agent for diagram generation
   */
  async callAIForDiagram(description: string, context: DocumentContext): Promise<any> {
    if (this.config.testMode) {
      return this.simulateResponse('diagram', description)
    }
    
    const response = await fetch(this.config.agentEndpoint || '/agent/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'updateDocument',
        parameters: {
          originalRequest: `/diagram ${description}`,
          context: context
        }
      })
    })
    
    if (!response.ok) {
      throw new Error(`Agent call failed: ${response.status}`)
    }
    
    return response.json()
  }
  
  /**
   * Call the markdown agent for document augmentation
   */
  async callAIForAugmentation(instruction: string, context: DocumentContext): Promise<any> {
    if (this.config.testMode) {
      return this.simulateResponse('augment', instruction)
    }
    
    const response = await fetch(this.config.agentEndpoint || '/agent/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'updateDocument',
        parameters: {
          originalRequest: `/augment ${instruction}`,
          context: context
        }
      })
    })
    
    if (!response.ok) {
      throw new Error(`Agent call failed: ${response.status}`)
    }
    
    return response.json()
  }
  
  /**
   * Simulate responses for test mode
   */
  private simulateResponse(type: string, description?: string): Promise<any> {
    return new Promise((resolve) => {
      setTimeout(() => {
        switch (type) {
          case 'continue':
            resolve({
              operations: [{
                type: 'continue',
                position: 0,
                content: 'This is a test continuation of the document content. The AI would normally generate contextual content here.',
                style: 'paragraph',
                description: 'Added test continuation'
              }],
              summary: 'Added continuation content (test mode)'
            })
            break
            
          case 'diagram':
            resolve({
              operations: [{
                type: 'diagram',
                position: 0,
                diagramType: 'mermaid',
                content: `graph TD\n    A[${description || 'Start'}] --> B{Process}\n    B --> C[End]`,
                description: `Generated test diagram for: ${description}`
              }],
              summary: `Generated test diagram (test mode)`
            })
            break
            
          case 'augment':
            resolve({
              operations: [{
                type: 'insert',
                position: 0,
                content: [`## Enhancement: ${description}\n\nThis is a test enhancement of the document based on the instruction: "${description}".`],
                description: `Applied test augmentation: ${description}`
              }],
              summary: `Applied test augmentation (test mode)`
            })
            break
            
          default:
            resolve({
              operations: [],
              summary: 'Test operation completed'
            })
        }
      }, 1000) // Simulate network delay
    })
  }
}
