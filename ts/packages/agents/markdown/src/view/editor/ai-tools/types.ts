// AI Tools Types and Interfaces

// AI Tools configuration - extended for markdown agent integration
export interface AIToolsConfig {
  apiKey?: string
  apiUrl?: string
  model?: string
  testMode?: boolean
  diagramMode?: boolean
  // NEW: Integration with TypeAgent markdown agent
  useTypeAgent?: boolean
  agentEndpoint?: string
}

// AI user presence for showing AI activity
export interface AIPresence {
  id: string
  name: string
  color: string
  position: number
  isTyping: boolean
}

// Edit operation for document augmentation
export interface EditOperation {
  action: 'insert' | 'replace' | 'delete'
  target: string
  content?: string
  description: string
}

// Document context for AI operations
export interface DocumentContext {
  before?: string
  after?: string
  full: string
  size?: number
  position?: number
}
