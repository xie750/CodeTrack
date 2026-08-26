import { Breadcrumb } from 'antd'
import { Home } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { resolveNav } from './nav'

// 全站统一面包屑：首页 / 模块 / 二级页面，任何业务页都无需自建
export default function AppBreadcrumb() {
  const { pathname } = useLocation()
  const { module, entry } = resolveNav(pathname)

  if (!module) return null

  const items = [
    {
      title: (
        <Link to="/admin/dashboard" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Home size={13} /> 首页
        </Link>
      ),
    },
    { title: module.label },
    ...(entry && entry.key !== module.key ? [{ title: entry.label }] : []),
  ]

  return (
    <div className="app-breadcrumb">
      <Breadcrumb
        items={items}
        separator="/"
        style={{ fontSize: 13 }}
        itemRender={(item, _params, itemsArr) => {
          const last = itemsArr.indexOf(item) === itemsArr.length - 1
          return last ? (
            <span style={{ color: 'var(--n-7)' }}>{item.title}</span>
          ) : (
            item.title
          )
        }}
      />
    </div>
  )
}
