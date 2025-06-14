// AI Tools Integration for Milkdown Editor
// This module provides the main AI tools context and command plugins

import { createSlice } from '@milkdown/utils'
import { $inputRule } from '@milkdown/utils'
import { InputRule } from '@milkdown/prose/inputrules'

// Configuration context for AI tools
export const aiToolsConfigCtx = createSlice({}, 'aiToolsConfig')

// AI Integration configuration
export interface AIToolsConfig {
  useTypeAgent: boolean
  agentEndpoint: string
  testMode: boolean
}

// Default configuration
export const defaultAIConfig: AIToolsConfig = {
  useTypeAgent: true,
  agentEndpoint: '/agent/execute',
  testMode: false
}

/**
 * Agent Commands Plugin
 * Handles slash commands for AI interactions
 */
export const agentCommandsPlugin = [
  // /continue command
  $inputRule(() => new InputRule(/\/continue$/, async (state, match, start, end) => {
    // Remove command text
    const tr = state.tr.delete(start, end)
    
    // Execute continue command
    await executeAgentCommand('continue', { position: start })
    
    return tr
  })),
  
  // /test:continue command
  $inputRule(() => new InputRule(/\/test:continue$/, async (state, match, start, end) => {
    const tr = state.tr.delete(start, end)
    await executeAgentCommand('continue', { position: start, testMode: true })
    return tr
  })),
  
  // /diagram <description> command  
  $inputRule(() => new InputRule(/\/diagram\s+(.+)$/, async (state, match, start, end) => {
    const description = match[1]
    const tr = state.tr.delete(start, end)
    await executeAgentCommand('diagram', { description, position: start })
    return tr
  })),
  
  // /test:diagram <description> command
  $inputRule(() => new InputRule(/\/test:diagram\s+(.+)$/, async (state, match, start, end) => {
    const description = match[1]
    const tr = state.tr.delete(start, end)
    await executeAgentCommand('diagram', { description, position: start, testMode: true })
    return tr
  })),
  
  // /augment <instruction> command
  $inputRule(() => new InputRule(/\/augment\s+(.+)$/, async (state, match, start, end) => {
    const instruction = match[1]
    const tr = state.tr.delete(start, end)
    await executeAgentCommand('augment', { instruction, position: start })
    return tr
  })),
  
  // /test:augment <instruction> command
  $inputRule(() => new InputRule(/\/test:augment\s+(.+)$/, async (state, match, start, end) => {
    const instruction = match[1]
    const tr = state.tr.delete(start, end)
    await executeAgentCommand('augment', { instruction, position: start, testMode: true })
    return tr
  }))
]

/**
 * Execute agent command
 * This integrates with the TypeAgent infrastructure
 */
async function executeAgentCommand(command: string, params: any): Promise<void> {
  try {
    console.log(`🤖 Executing agent command: ${command}`, params)
    
    // Get configuration
    const config = getAIConfig()
    
    if (params.testMode || config.testMode) {
      // Test mode - simulate response without API call
      await simulateAgentResponse(command, params)
      return
    }
    
    // Build request for the markdown agent
    const request = buildAgentRequest(command, params)
    
    // Call the agent via TypeAgent infrastructure
    const response = await fetch(config.agentEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    })
    
    if (!response.ok) {
      throw new Error(`Agent call failed: ${response.status}`)
    }
    
    const result = await response.json()
    
    if (result.operations && result.operations.length > 0) {
      // Apply operations received from agent
      await applyAgentOperations(result.operations)
    }
    
    console.log('✅ Agent command completed successfully')
    
  } catch (error) {
    console.error(`❌ Agent command failed:`, error)
    showNotification(`Failed to execute ${command} command. Please try again.`, 'error')
  }
}

function getAIConfig(): AIToolsConfig {
  // This would get the config from the Milkdown context
  // For now, return default config
  return defaultAIConfig
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
  
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 1000))
  
  let operations = []
  
  switch (command) {
    case 'continue':
      operations = [{
        type: 'continue',
        position: params.position,
        content: 'This is simulated AI-generated content for testing purposes. The actual AI would generate contextually relevant content based on the document.',
        style: 'paragraph',
        description: 'Test continuation'
      }]
      break
      
    case 'diagram':
      operations = [{
        type: 'diagram',
        position: params.position,
        diagramType: 'mermaid',
        content: `graph TD
    A[${params.description}] --> B[Test Node 1]
    B --> C[Test Node 2]
    C --> D[Result]`,
        description: `Test diagram for: ${params.description}`
      }]
      break
      
    case 'augment':
      operations = [{
        type: 'augment',
        edits: [{
          type: 'insert',
          position: params.position,
          content: [`\n**Test Augmentation**: ${params.instruction}\n`],
          description: `Test augmentation: ${params.instruction}`
        }],
        summary: 'Added test augmentation content',
        description: `Test augmentation for: ${params.instruction}`
      }]
      break
  }
  
  // Apply simulated operations
  await applyAgentOperations(operations)
  showNotification(`✅ Test ${command} completed`, 'success')
}

/**
 * Apply operations from agent to the editor
 */
async function applyAgentOperations(operations: any[]): Promise<void> {
  console.log('📝 Applying operations from agent:', operations)
  
  // This would typically be handled by the main editor instance
  // For now, we'll dispatch a custom event that the editor can listen to
  window.dispatchEvent(new CustomEvent('agent-operations', {
    detail: { operations }
  }))
}

/**
 * Show notification to user
 */
function showNotification(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
  console.log(`[${type.toUpperCase()}] ${message}`)
  
  // Create a simple notification element
  const notification = document.createElement('div')
  notification.className = `notification notification-${type}`
  notification.textContent = message
  
  // Style the notification
  Object.assign(notification.style, {
    position: 'fixed',
    top: '20px',
    right: '20px',
    padding: '12px 16px',
    borderRadius: '6px',
    color: 'white',
    fontSize: '14px',
    zIndex: '9999',
    maxWidth: '300px',
    backgroundColor: type === 'error' ? '#dc3545' : type === 'success' ? '#28a745' : '#007bff'
  })
  
  document.body.appendChild(notification)
  
  // Remove after 4 seconds
  setTimeout(() => {
    notification.remove()
  }, 4000)
}

export {
  executeAgentCommand,
  simulateAgentResponse,
  applyAgentOperations,
  showNotification
}
