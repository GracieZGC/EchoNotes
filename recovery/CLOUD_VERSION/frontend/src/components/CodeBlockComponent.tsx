import React, { useCallback, useEffect, useState } from 'react'
import { NodeViewContent, NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react'

const copyToClipboard = async (text: string) => {
  if (!text) return Promise.resolve()
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text)
  }
  return new Promise<void>((resolve, reject) => {
    const tmp = document.createElement('textarea')
    tmp.value = text
    tmp.setAttribute('readonly', '')
    tmp.style.position = 'absolute'
    tmp.style.left = '-9999px'
    document.body.appendChild(tmp)
    tmp.select()
    tmp.setSelectionRange(0, text.length)
    const successful = document.execCommand('copy')
    document.body.removeChild(tmp)
    if (successful) {
      resolve()
      return
    }
    reject(new Error('复制失败'))
  })
}

const CodeBlockComponent: React.FC<ReactNodeViewProps> = ({ node }) => {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    const text = node.textContent || ''
    copyToClipboard(text)
      .then(() => {
        setCopied(true)
      })
      .catch(() => {
        setCopied(false)
      })
  }, [node])

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 1200)
    return () => window.clearTimeout(timer)
  }, [copied])

  return (
    <NodeViewWrapper className="code-block">
      <div className="actions">
        <button type="button" onClick={handleCopy}>
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <pre className="hljs">
        <NodeViewContent />
      </pre>
    </NodeViewWrapper>
  )
}

export default CodeBlockComponent
