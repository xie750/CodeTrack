import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: ReactNode
  desc?: ReactNode
  extra?: ReactNode
}

export default function PageHeader({ title, desc, extra }: PageHeaderProps) {
  return (
    <div className="page-header flex-between">
      <div>
        <div className="page-title">{title}</div>
        {desc && <div className="page-desc">{desc}</div>}
      </div>
      {extra && <div>{extra}</div>}
    </div>
  )
}
