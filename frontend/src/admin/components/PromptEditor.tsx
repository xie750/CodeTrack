import Editor from '@monaco-editor/react'

interface PromptEditorProps {
  value: string
  onChange?: (v: string) => void
  height?: number
}

// 提示词模板统一维护 —— 保证简报、报告等固定场景的输出口径一致
export default function PromptEditor({ value, onChange, height = 260 }: PromptEditorProps) {
  return (
    <div className="monaco-shell">
      <Editor
        height={height}
        defaultLanguage="markdown"
        value={value}
        onChange={(v) => onChange?.(v || '')}
        options={{
          minimap: { enabled: false },
          fontSize: 13,
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          padding: { top: 12, bottom: 12 },
          renderLineHighlight: 'none',
          lineNumbers: 'on',
        }}
      />
    </div>
  )
}
