import { $node, $prose, $remark, $inputRule } from '@milkdown/utils'
import { Plugin, PluginKey } from 'prosemirror-state'
import { InputRule } from 'prosemirror-inputrules'
import { visit } from 'unist-util-visit'
import mermaid from 'mermaid'

// Initialize Mermaid
mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose',
  fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  fontSize: 14,
  flowchart: { useMaxWidth: true, htmlLabels: true, curve: 'basis' }
})

// Remark plugin
const remarkMermaid = $remark('remarkMermaid', () => () => {
  return (tree: any) => {
    visit(tree, 'code', (node: any) => {
      if (node.lang === 'mermaid') {
        node.type = 'mermaid'
        node.data = node.data || {}
        node.data.hName = 'div'
        node.data.hProperties = { 'data-type': 'mermaid', 'data-code': node.value }
      }
    })
  }
})

// Mermaid node definition
const mermaidNode = $node('mermaid', () => ({
  content: 'text*', 
  marks: '', 
  group: 'block', 
  code: true, 
  defining: true, 
  isolating: true,
  attrs: { code: { default: '' } },
  parseDOM: [{
    tag: 'div[data-type="mermaid"]', 
    preserveWhitespace: 'full' as const,
    getAttrs: (dom) => {
      if (typeof dom === 'string') return false
      const element = dom as HTMLElement
      return { code: element.getAttribute('data-code') || element.textContent || '' }
    }
  }],
  toDOM: (node): any => {
    const code = node.textContent || node.attrs.code || ''
    return ['div', { 'data-type': 'mermaid', 'data-code': code, 'class': 'mermaid-container' }, 0]
  },
  parseMarkdown: {
    match: (node) => node.type === 'mermaid',
    runner: (state, node, type) => {
      const code = String(node.value || '')
      state.openNode(type, { code })
      if (code) state.addText(code)
      state.closeNode()
    }
  },
  toMarkdown: {
    match: (node) => node.type.name === 'mermaid',
    runner: (state, node) => {
      const code = node.textContent || node.attrs.code || ''
      // Don't serialize empty mermaid nodes to prevent round-trip issues
      if (!code.trim()) {
        console.log('⏭️ Skipping empty mermaid node in markdown serialization')
        return
      }
      state.addNode('code', undefined, code, { lang: 'mermaid' })
    }
  }
}))

// Enhanced live conversion plugin
const mermaidLiveParser = $prose(() => {
  return new Plugin({
    key: new PluginKey('mermaid-live-parser'),
    
    appendTransaction(transactions: readonly any[], oldState: any, newState: any) {
      if (!transactions.some((tr: any) => tr.docChanged)) return null
      
      let tr: any = null
      let foundChanges = false
      
      // Look for paragraphs containing complete mermaid blocks
      newState.doc.descendants((node: any, pos: any) => {
        if (node.type.name === 'paragraph') {
          const text = node.textContent
          
          // Check if this looks like a complete mermaid block
          const mermaidBlockRegex = /^```mermaid\s*\n([\s\S]*?)\n\s*```\s*$/
          const match = text.match(mermaidBlockRegex)
          
          if (match) {
            const mermaidCode = match[1].trim()
            const mermaidNodeType = newState.schema.nodes.mermaid
            
            if (mermaidNodeType) {
              if (!tr) tr = newState.tr
              
              const newNode = mermaidNodeType.create(
                { code: mermaidCode },
                mermaidCode ? [newState.schema.text(mermaidCode)] : []
              )
              
              tr.replaceWith(pos, pos + node.nodeSize, newNode)
              foundChanges = true
              console.log('🎉 Converting mermaid block:', mermaidCode.substring(0, 50) + '...')
              return false
            }
          }
        }
        // IMPORTANT: Don't process existing mermaid nodes to avoid destroying them
        else if (node.type.name === 'mermaid') {
          console.log('⏭️ Live parser skipping existing mermaid node to prevent destruction')
          return false
        }
      })
      
      return foundChanges ? tr : null
    }
  })
})

// Enhanced input rule for detecting complete mermaid blocks
const mermaidBlockInputRule = $inputRule(() => {
  return new InputRule(
    /```mermaid\s*\n([\s\S]*?)\n\s*```\s*$/,
    (state: any, match: any, start: any, end: any) => {
      console.log('📝 Mermaid block input rule triggered')
      const mermaidCode = match[1]?.trim() || ''
      const $start = state.doc.resolve(start)
      const nodeType = state.schema.nodes.mermaid
      
      if (!nodeType || !$start.node(-1).canReplaceWith($start.index(-1), $start.indexAfter(-1), nodeType)) {
        return null
      }
      
      const node = nodeType.create(
        { code: mermaidCode },
        mermaidCode ? [state.schema.text(mermaidCode)] : []
      )
      return state.tr.replaceRangeWith(start, end, node)
    }
  )
})

// Input rule for creating empty mermaid blocks with triple backticks
const mermaidEmptyInputRule = $inputRule(() => {
  return new InputRule(
    /^```mermaid$/,
    (state: any, match: any, start: any, end: any) => {
      console.log('📝 Empty mermaid input rule triggered', { match, start, end })
      const $start = state.doc.resolve(start)
      const nodeType = state.schema.nodes.mermaid
      
      if (!nodeType) {
        console.log('❌ No mermaid node type found')
        return null
      }
      
      if (!$start.node(-1).canReplaceWith($start.index(-1), $start.indexAfter(-1), nodeType)) {
        console.log('❌ Cannot replace with mermaid node at this position')
        return null
      }
      
      // Create mermaid node with minimal placeholder to prevent destruction
      const placeholderCode = 'graph TD\n    A[Start] --> B[End]'
      const node = nodeType.create(
        { code: placeholderCode }, 
        [state.schema.text(placeholderCode)]
      )
      
      console.log('✅ Creating stable mermaid node with placeholder')
      const transaction = state.tr.replaceRangeWith(start, end, node)
      console.log('📝 Transaction will be dispatched...')
      
      return transaction
    }
  )
})

// Mermaid renderer with enhanced node views
const mermaidRenderer = $prose(() => {
  return new Plugin({
    key: new PluginKey('mermaid-renderer'),
    props: {
      nodeViews: {
        mermaid: (node: any, view: any, getPos: () => number | undefined) => {
          const wrapper = document.createElement('div')
          wrapper.className = 'mermaid-wrapper'
          
          const diagramContainer = document.createElement('div')
          diagramContainer.className = 'mermaid-diagram'
          
          const sourceContainer = document.createElement('div')
          sourceContainer.className = 'mermaid-source'
          sourceContainer.style.display = 'none'
          
          const errorContainer = document.createElement('div')
          errorContainer.className = 'mermaid-error'
          errorContainer.style.display = 'none'
          
          wrapper.appendChild(diagramContainer)
          wrapper.appendChild(sourceContainer)
          wrapper.appendChild(errorContainer)
          
          let isEditing = false
          let lastCode = ''
          
          const renderDiagram = async (code: string) => {
            console.log('🎨 renderDiagram called with code:', JSON.stringify(code))
            if (!code.trim()) {
              diagramContainer.innerHTML = '<div class="mermaid-empty">Click to add Mermaid diagram</div>'
              console.log('📝 Rendered empty mermaid placeholder')
              return
            }
            
            if (code === lastCode) {
              console.log('⏭️ Code unchanged, skipping render')
              return
            }
            lastCode = code            
            
            try {
              diagramContainer.innerHTML = '<div class="mermaid-loading">Rendering diagram...</div>'
              const diagramId = `mermaid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
              
              const isValid = await mermaid.parse(code)
              if (!isValid) throw new Error('Invalid Mermaid syntax')
              
              const { svg } = await mermaid.render(diagramId, code)
              diagramContainer.innerHTML = ''
              const svgContainer = document.createElement('div')
              svgContainer.innerHTML = svg
              diagramContainer.appendChild(svgContainer)
              errorContainer.style.display = 'none'
              console.log('✅ Mermaid diagram rendered successfully')
              
            } catch (error) {
              console.error('Mermaid rendering error:', error)
              const errorMessage = error instanceof Error ? error.message : 'Unknown error'
              errorContainer.innerHTML = `<div class="mermaid-error-content"><strong>⚠️ Mermaid Error:</strong><p>${errorMessage}</p></div>`
              errorContainer.style.display = 'block'
              diagramContainer.innerHTML = ''
            }
          }
          
          const startEditing = () => {
            if (isEditing) return
            isEditing = true
            
            const code = node.textContent || node.attrs.code || ''
            console.log('📝 Starting edit with code:', code)
            
            sourceContainer.innerHTML = `
              <textarea class="mermaid-textarea" placeholder="Enter Mermaid diagram code..."></textarea>
              <div class="mermaid-controls">
                <button class="mermaid-save">✓ Save</button>
                <button class="mermaid-cancel">✕ Cancel</button>
              </div>
            `
            
            diagramContainer.style.display = 'none'
            sourceContainer.style.display = 'block'
            
            const textarea = sourceContainer.querySelector('.mermaid-textarea') as HTMLTextAreaElement
            const saveBtn = sourceContainer.querySelector('.mermaid-save') as HTMLButtonElement
            const cancelBtn = sourceContainer.querySelector('.mermaid-cancel') as HTMLButtonElement
            
            textarea.value = code
            
            setTimeout(() => {
              textarea.focus()
              textarea.select()
            }, 10)
            
            const finishEditing = () => {
              isEditing = false
              sourceContainer.style.display = 'none'
              diagramContainer.style.display = 'block'
            }
            
            saveBtn.onclick = (e) => {
              e.preventDefault()
              e.stopPropagation()
              
              const newCode = textarea.value.trim()
              const originalCode = node.textContent || node.attrs.code || ''
              
              if (newCode !== originalCode) {
                const pos = getPos()
                if (pos !== undefined) {
                  const tr = view.state.tr
                  const newNode = node.type.create(
                    { code: newCode },
                    newCode ? [view.state.schema.text(newCode)] : []
                  )
                  
                  tr.replaceWith(pos, pos + node.nodeSize, newNode)
                  view.dispatch(tr)
                  
                  setTimeout(() => {
                    renderDiagram(newCode)
                  }, 50)
                }
              }
              finishEditing()
            }
            
            cancelBtn.onclick = (e) => {
              e.preventDefault()
              e.stopPropagation()
              finishEditing()
            }
            
            textarea.onkeydown = (e) => {
              e.stopPropagation()
              
              if (e.key === 'Escape') {
                e.preventDefault()
                finishEditing()
              } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault()
                saveBtn.click()
              }
            }
            
            textarea.onclick = (e) => {
              e.stopPropagation()
            }
          }
          
          wrapper.onclick = (e) => {
            if (!isEditing && (e.target === diagramContainer || diagramContainer.contains(e.target as Node))) {
              e.preventDefault()
              e.stopPropagation()
              startEditing()
            }
          }
          
          const initialCode = node.textContent || node.attrs.code || ''
          console.log('🎬 Mermaid node view created with initial code:', JSON.stringify(initialCode))
          renderDiagram(initialCode)
          
          return {
            dom: wrapper,
            update: (updatedNode: any) => {
              if (updatedNode.type.name !== 'mermaid') {
                console.log('❌ Node type mismatch, rejecting update')
                return false
              }
              
              node = updatedNode
              const newCode = updatedNode.textContent || updatedNode.attrs.code || ''
              console.log('🔄 Mermaid node updated with new code:', JSON.stringify(newCode))
              
              if (!isEditing) {
                renderDiagram(newCode)
              }
              return true
            },
            destroy: () => {
              console.log('🗑️ Mermaid node view destroyed - node info:', {
                type: node.type.name,
                code: node.textContent || node.attrs.code,
                isEditing
              })
            }
          }
        }
      }
    }
  })
})

// Export the complete mermaid plugin
export const mermaidPlugin = [
  remarkMermaid,
  mermaidNode, 
  mermaidLiveParser,
  mermaidRenderer,
  mermaidBlockInputRule,
  mermaidEmptyInputRule
].flat()
