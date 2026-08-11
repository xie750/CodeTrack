import Editor from '@monaco-editor/react'

interface CodePreviewProps {
  code: string
  language?: string
  height?: number
}

// 代码类资源只读预览 —— 复用既有 Monaco，不创建专用执行器
export default function CodePreview({ code, language = 'python', height = 320 }: CodePreviewProps) {
  return (
    <div className="monaco-shell">
      <Editor
        height={height}
        defaultLanguage={language}
        value={code}
        options={{
          readOnly: true,
          minimap: { enabled: false },
          fontSize: 13,
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          padding: { top: 12, bottom: 12 },
          renderLineHighlight: 'none',
        }}
      />
    </div>
  )
}
