import { useState } from 'react'

// 顶栏全局搜索 —— 原型中聚焦到跳转链接，简单实现全局关键字存储
export function useQuery() {
  const [search, setSearch] = useState('')
  return { search, setSearch }
}
