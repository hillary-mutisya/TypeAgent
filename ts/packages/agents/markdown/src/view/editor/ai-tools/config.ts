import { $ctx } from '@milkdown/utils'
import { AIToolsConfig } from './types'

// AI Tools configuration context - enhanced for TypeAgent integration
export const aiToolsConfigCtx = $ctx<AIToolsConfig, 'aiToolsConfig'>({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY || '',
  apiUrl: import.meta.env.VITE_AI_API_URL || 'https://api.openai.com/v1/chat/completions',
  model: import.meta.env.VITE_AI_MODEL || 'gpt-4',
  testMode: false,
  // NEW: TypeAgent integration settings
  useTypeAgent: true, // Default to using TypeAgent instead of direct API
  agentEndpoint: '/agent/execute'
}, 'aiToolsConfig')
