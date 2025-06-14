// Mermaid Plugin for Milkdown Editor
// Provides Mermaid diagram support with visual rendering

import { $node, $remark } from '@milkdown/utils'
import { wrappingInputRule } from '@milkdown/prose/inputrules'

declare global {
  interface Window {
    mermaid: any;
  }
}

/**
 * Mermaid Node Schema
 * Defines how mermaid diagrams are represented in the editor
 */
export const mermaidNode = $node('mermaid', () => ({
  content: 'text*',
  group: 'block',
  marks: '',
  atom: true,
  code: true,
  defining: true,
  isolating: true,
  attrs: {
    code: { default: '' }
  },
  parseDOM: [
    {
      tag: 'div[data-type="mermaid"]',
      preserveWhitespace: 'full',
      getAttrs: (node: HTMLElement) => ({
        code: node.textContent || ''
      })
    }
  ],
  toDOM: (node) => {
    const code = node.attrs.code || node.textContent || ''
    
    // Create container for mermaid diagram
    const container = document.createElement('div')
    container.setAttribute('data-type', 'mermaid')
    container.setAttribute('class', 'mermaid-container')
    
    // Create mermaid element
    const mermaidEl = document.createElement('div')
    mermaidEl.setAttribute('class', 'mermaid')
    mermaidEl.textContent = code
    
    // Create code editor (hidden by default)
    const codeEl = document.createElement('pre')
    codeEl.setAttribute('class', 'mermaid-code')
    codeEl.setAttribute('style', 'display: none;')
    codeEl.textContent = code
    
    // Create toggle button
    const toggleBtn = document.createElement('button')
    toggleBtn.setAttribute('class', 'mermaid-toggle')
    toggleBtn.textContent = '📝 Edit'
    toggleBtn.onclick = () => toggleMermaidEdit(container)
    
    container.appendChild(toggleBtn)
    container.appendChild(mermaidEl)
    container.appendChild(codeEl)
    
    // Render mermaid diagram
    renderMermaidDiagram(mermaidEl, code)
    
    return container
  }
}))

/**
 * Input rule for creating mermaid blocks
 */
export const mermaidInputRule = wrappingInputRule(
  /^```mermaid\s+$/,
  mermaidNode.type,
  () => ({ code: '' })
)

/**
 * Remark plugin for parsing mermaid code blocks
 */
export const remarkMermaidPlugin = $remark('remarkMermaid', () => {
  return function (tree: any) {
    const { visit } = require('unist-util-visit')
    
    visit(tree, 'code', (node: any) => {
      if (node.lang === 'mermaid') {
        node.type = 'mermaid'
        node.code = node.value
        delete node.lang
        delete node.value
      }
    })
  }
})

/**
 * Main mermaid plugin
 */
export const mermaidPlugin = [
  mermaidNode,
  remarkMermaidPlugin,
  mermaidInputRule
]

/**
 * Render mermaid diagram
 */
async function renderMermaidDiagram(element: HTMLElement, code: string): Promise<void> {
  try {
    // Ensure mermaid is loaded
    if (!window.mermaid) {
      console.warn('Mermaid not loaded, skipping diagram render')
      element.textContent = code
      return
    }
    
    // Initialize mermaid if needed
    if (!window.mermaid.mermaidAPI) {
      window.mermaid.initialize({
        startOnLoad: false,
        theme: 'default',
        securityLevel: 'strict'
      })
    }
    
    // Generate unique ID
    const id = 'mermaid-' + Math.random().toString(36).substr(2, 9)
    
    // Render diagram
    const renderResult = await window.mermaid.render(id, code)
    element.innerHTML = renderResult.svg || renderResult
    
  } catch (error) {
    console.error('Failed to render mermaid diagram:', error)
    element.innerHTML = `<div class="mermaid-error">
      <p>⚠️ Failed to render diagram</p>
      <pre>${code}</pre>
    </div>`
  }
}

/**
 * Toggle between diagram view and code edit view
 */
function toggleMermaidEdit(container: HTMLElement): void {
  const mermaidEl = container.querySelector('.mermaid') as HTMLElement
  const codeEl = container.querySelector('.mermaid-code') as HTMLElement
  const toggleBtn = container.querySelector('.mermaid-toggle') as HTMLElement
  
  if (!mermaidEl || !codeEl || !toggleBtn) return
  
  const isEditMode = codeEl.style.display !== 'none'
  
  if (isEditMode) {
    // Switch to view mode
    const newCode = codeEl.textContent || ''
    codeEl.style.display = 'none'
    mermaidEl.style.display = 'block'
    toggleBtn.textContent = '📝 Edit'
    
    // Re-render diagram with new code
    renderMermaidDiagram(mermaidEl, newCode)
    
  } else {
    // Switch to edit mode
    codeEl.style.display = 'block'
    mermaidEl.style.display = 'none'
    toggleBtn.textContent = '👁️ View'
    
    // Make code editable
    codeEl.contentEditable = 'true'
    codeEl.focus()
  }
}

export default mermaidPlugin
