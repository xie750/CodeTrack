export type ImportKind = '教师' | '学生'
export type ImportError = { key: string; line: number; reason: string }

export function importColumns(kind: ImportKind) {
  return kind === '教师'
    ? ['工号', '姓名', '院系', '职称', '邮箱', '手机']
    : ['学号', '姓名', '性别', '年级', '院系', '班级', '课程']
}

// Keep quoted commas, escaped quotes and embedded newlines intact.
export function parseAccountCsv(text: string, kind: ImportKind, existingIds: string[]) {
  const records: { line: number; cells: string[] }[] = []
  let cells: string[] = [], cell = '', quoted = false, closedQuote = false, line = 1, startLine = 1
  const source = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  const endRecord = () => {
    cells.push(cell.trim())
    if (cells.some(Boolean)) records.push({ line: startLine, cells })
    cells = []; cell = ''; closedQuote = false
  }
  for (let i = 0; i < source.length; i++) {
    const char = source[i]
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { cell += '"'; i++ }
      else if (char === '"') { quoted = false; closedQuote = true }
      else { cell += char; if (char === '\n') line++ }
    } else if (char === ',') {
      cells.push(cell.trim()); cell = ''; closedQuote = false
    } else if (char === '\n') {
      endRecord(); line++; startLine = line
    } else if (char === '"' && !cell && !closedQuote) {
      quoted = true
    } else {
      if (char === '"' || (closedQuote && char.trim())) throw new Error(`第 ${line} 行的引号格式不正确`)
      cell += char
    }
  }
  if (quoted) throw new Error('CSV 中存在未闭合的引号，请检查文件')
  endRecord()
  const header = records.shift()?.cells
  const required = kind === '教师' ? ['工号', '姓名'] : ['学号', '姓名', '性别', '年级', '院系', '课程']
  if (!header || required.some((name) => !header.includes(name))) throw new Error(`缺少必填表头：${required.join('、')}`)
  if (new Set(header).size !== header.length || header.some((name) => !name)) throw new Error('表头不能为空或重复')
  const idLabel = required[0]
  const seen = new Set(existingIds)
  const rows: Record<string, string>[] = [], errors: ImportError[] = []
  for (const record of records) {
    const row = Object.fromEntries(header.map((name, index) => [name, record.cells[index] ?? '']))
    let reason = record.cells.length !== header.length ? '列数与表头不一致' : ''
    const missing = required.filter((name) => !row[name])
    if (!reason && missing.length) reason = `必填缺失：${missing.join('、')}`
    if (!reason && seen.has(row[idLabel])) reason = `${idLabel}重复：${row[idLabel]}`
    if (!reason && row.邮箱 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.邮箱)) reason = '邮箱格式错误'
    if (!reason && row.手机 && !/^1\d{10}$/.test(row.手机)) reason = '手机格式错误（需为 11 位手机号）'
    if (!reason && kind === '学生' && !['男', '女'].includes(row.性别)) reason = '性别应填写男或女'
    if (reason) errors.push({ key: String(record.line), line: record.line, reason })
    else { rows.push(row); seen.add(row[idLabel]) }
  }
  if (!records.length) throw new Error('文件只有表头，请填写数据后重新上传')
  return { rows, errors }
}
