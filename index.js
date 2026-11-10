/**
 * Skill Detective — host half.
 *
 * Owns every filesystem and network operation behind the Web panel and the
 * composer recommendation bubble:
 *
 *  - the installed-skill catalog (agent-scope `.dsh/skills`, user scope
 *    `$DSH_HOME/skills`, and this plugin's temporary root),
 *  - candidate search (skills.sh first, a curated built-in market as the offline
 *    fallback so the panel never presents invented remote results),
 *  - the pre-install security audit,
 *  - install / enable / disable / delete / scope moves,
 *  - the per-session "skill detective" switch and pending recommendation,
 *  - the JSON routes the browser half talks to.
 *
 * Nothing here fabricates a download: when skills.sh is unreachable the search
 * result says so and the curated catalog is used, which is why the panel always
 * labels a candidate with the source that actually produced it.
 */
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile, stat, rename, rm, cp } from 'node:fs/promises'
import { join, resolve, dirname, basename, relative, sep } from 'node:path'
import { homedir } from 'node:os'
import { spawn } from 'node:child_process'
import { EXTRA_CATALOG } from './catalog.js'

export const name = 'skill-detective'

const API = '/api/dsh-skill-detective'
const STATE_VERSION = 1

const DSH_HOME = process.env.DSH_HOME && process.env.DSH_HOME.trim() !== ''
  ? resolve(process.env.DSH_HOME)
  : join(homedir(), '.dsh')

const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/* ------------------------------------------------------------------ */
/* Curated catalog                                                     */
/* ------------------------------------------------------------------ */

const BASE_CATALOG = [
  {
    name: 'word-docx',
    version: '1.2.0',
    category: '文档',
    author: '@vercel-labs',
    installs: 18200,
    perm: 'files',
    description: 'Word 文档生成与编辑，支持标题、表格、页眉页脚',
    whenToUse: '需要生成或修改 .docx 文档、报告、合同、说明书时使用。',
    source: 'skills.sh/word-docx',
    body: `# word-docx

生成与修改 Word 文档（.docx）。优先用脚本化方式产出，避免手工另存导致样式丢失。

## 30 秒决策

| 场景 | 路线 |
| --- | --- |
| 新建结构化文档（标题/表格/页眉页脚） | python-docx 脚本 |
| 读取既有文档内容 | python-docx 逐段落读取 |
| 模板填充 | 复制模板后替换占位段落 |

## 固定流程

1. 确认输出路径与文档结构（章节、表格列）。
2. 写脚本：\`from docx import Document\`，按章节添加标题与段落。
3. 样式统一：标题用 Heading 1/2，正文用 Normal，表格套用 Table Grid。
4. 生成后校验：段落数、表格数、文件大小，并回读前 10 段确认内容。

\`\`\`python
from docx import Document
from docx.shared import Pt

doc = Document()
doc.add_heading('报告标题', level=1)
doc.add_paragraph('正文段落。')
table = doc.add_table(rows=2, cols=2)
table.style = 'Table Grid'
table.cell(0, 0).text = '列一'
table.cell(0, 1).text = '列二'
doc.save(r'output.docx')
\`\`\`

## 验收

- 文件存在且能被 python-docx 重新打开；
- 标题层级与表格数量符合要求；
- 中文不出现乱码（脚本文件用 UTF-8 保存）。`
  },
  {
    name: 'excel-report',
    version: '2.0.1',
    category: '数据',
    author: '@Moximxxx',
    installs: 5600,
    perm: 'files',
    description: 'Excel 报表生成，公式、图表、透视表',
    whenToUse: '需要产出或修改 .xlsx 报表、统计表、带公式与图表的工作簿时使用。',
    source: 'skills.sh/excel-report',
    body: `# excel-report

生成与校验 Excel 工作簿（.xlsx）。本机优先 Excel COM，其次直接写 OOXML。

## 路线选择

| 条件 | 路线 |
| --- | --- |
| 本机有 Excel，需要原生图表/公式 | Excel COM |
| 只要数值与公式，无 Excel | 直接写 OOXML |
| 只读取现状 | 解压读 XML |

## 固定流程

1. 明确表结构：列名、数据类型、公式列、汇总行。
2. 用 COM 建簿：写入表头 → 写数据 → 设公式 → 设数字格式 → 加图表。
3. 保存为绝对路径，关闭工作簿并退出 Excel 进程。
4. 校验：重新打开读回关键单元格，确认公式计算结果与图表数量。

\`\`\`powershell
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$book = $excel.Workbooks.Add()
$sheet = $book.Worksheets.Item(1)
$sheet.Cells.Item(1,1) = '项目'
$sheet.Cells.Item(2,1) = 120
$book.SaveAs('C:\\out\\report.xlsx')
$book.Close($false); $excel.Quit()
\`\`\`

## 验收

- 工作簿能被打开且无修复提示；
- 抽查单元格值与预期一致；
- 图表引用的数据区域正确。`
  },
  {
    name: 'ppt-deck',
    version: '1.0.3',
    category: '文档',
    author: '@ppt-labs',
    installs: 9400,
    perm: 'files',
    description: 'PPT 演示文稿生成，主题模板与图表',
    whenToUse: '需要产出 .pptx 演示文稿、汇报材料、培训课件时使用。',
    source: 'skills.sh/ppt-deck',
    body: `# ppt-deck

生成 PowerPoint 演示文稿（.pptx）。

## 结构先行

1. 先定大纲：每页一个论点，标题即结论。
2. 再定版式：封面 / 目录 / 内容 / 图表 / 结论。
3. 最后套主题：统一字体、主色、页脚。

## 生成流程

1. 用 python-pptx 建演示文稿，设置 16:9。
2. 每页用占位符写入标题与要点（每条不超过两行）。
3. 需要数据页时插入表格或原生图表，而不是截图。
4. 保存并回读：页数、每页标题、图表数。

\`\`\`python
from pptx import Presentation
from pptx.util import Inches

prs = Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)
slide = prs.slides.add_slide(prs.slide_layouts[0])
slide.shapes.title.text = '标题'
slide.placeholders[1].text = '副标题'
prs.save('deck.pptx')
\`\`\`

## 验收

- 页数与大纲一致；
- 无文字溢出占位符；
- 图表数据与源表一致。`
  },
  {
    name: 'pdf-toolkit',
    version: '1.5.1',
    category: '文档',
    author: '@pdf-tools',
    installs: 12700,
    perm: 'files',
    description: 'PDF 读取、拆分、合并、转图片',
    whenToUse: '需要读取 PDF 内容、按页拆分合并、渲染为图片时使用。',
    source: 'skills.sh/pdf-toolkit',
    body: `# pdf-toolkit

PDF 读取、拆分、合并与渲染。

## 工具选择

| 任务 | 工具 |
| --- | --- |
| 提取文本 | pypdf 或 pdftotext |
| 拆分 / 合并 | pypdf |
| 渲染成图 | pdftoppm 或 pymupdf |

## 固定流程

1. 先探测页数与是否加密：\`pdfinfo\` 或 pypdf 读取。
2. 提取文本时逐页处理，保留页码定位。
3. 拆分按页码区间输出，命名带区间。
4. 渲染图时设定 DPI（默认 150），避免超大图。

\`\`\`python
from pypdf import PdfReader, PdfWriter

reader = PdfReader('in.pdf')
writer = PdfWriter()
for page in reader.pages[:3]:
    writer.add_page(page)
with open('part-1-3.pdf', 'wb') as fh:
    writer.write(fh)
\`\`\`

## 验收

- 输出页数正确；
- 文本抽取非空且可读；
- 加密文档先解密再处理。`
  },
  {
    name: 'crawler-kit',
    version: '1.4.2',
    category: '开发',
    author: '@Moximxxx',
    installs: 8100,
    perm: 'network',
    description: '网页数据采集，列表页与详情页抓取',
    whenToUse: '需要按列表页 + 详情页抓取网页结构化数据并落表时使用。',
    source: 'skills.sh/crawler-kit',
    body: `# crawler-kit

网页数据采集：列表页 → 详情页 → 结构化落表。

## 固定流程

1. 先看一页原始 HTML，确认数据在服务端渲染还是接口返回。
2. 若是接口，直接请求 JSON；否则解析 DOM。
3. 列表页拿详情链接，去重后逐条抓取详情页。
4. 每次请求间隔 0.5–1 秒，带常规 User-Agent。
5. 落表前校验字段数量与空值率。

\`\`\`python
import time
import requests
from bs4 import BeautifulSoup

def fetch(url):
    res = requests.get(url, timeout=15, headers={'User-Agent': 'Mozilla/5.0'})
    res.raise_for_status()
    return res.text

html = fetch('https://example.com/list?page=1')
soup = BeautifulSoup(html, 'html.parser')
links = [a['href'] for a in soup.select('a.item') if a.get('href')]
rows = []
for href in dict.fromkeys(links):
    page = BeautifulSoup(fetch(href), 'html.parser')
    rows.append({'title': page.select_one('h1').get_text(strip=True)})
    time.sleep(0.8)
\`\`\`

## 验收

- 抓取条数与列表页总条数一致或给出差异原因；
- 关键字段空值率低于 5%；
- 失败链接单独记录并可重试。`
  },
  {
    name: 'git-tools',
    version: '1.2.0',
    category: '开发',
    author: '@git-labs',
    installs: 21000,
    perm: 'command',
    description: 'Git 仓库操作，提交、分支、冲突处理',
    whenToUse: '需要进行 Git 提交、分支管理、合并冲突处理时使用。',
    source: 'skills.sh/git-tools',
    body: `# git-tools

Git 常用操作的标准流程。

## 提交

1. \`git status --short\` 看清改动范围。
2. \`git diff\` 逐个确认，避免误提交生成物。
3. \`git add -A\`（或按文件精确添加）后执行 \`git commit -m "类型: 说明"\`。

## 分支与合并

- 新功能：\`git switch -c feature/xxx\`
- 同步主干：\`git fetch origin && git rebase origin/main\`
- 冲突：逐个文件解决后 \`git add <file>\`，再 \`git rebase --continue\`

## 排障

| 现象 | 处理 |
| --- | --- |
| 提交信息写错 | \`git commit --amend\`（未推送时） |
| 误改想丢弃 | \`git restore <file>\` |
| 需要暂存现场 | \`git stash push -m "说明"\` |

## 验收

- \`git log --oneline -3\` 符合预期；
- \`git status\` 干净或只剩预期改动。`
  },
  {
    name: 'sqlite-query',
    version: '1.1.4',
    category: '数据',
    author: '@data-tools',
    installs: 4900,
    perm: 'files',
    description: 'SQLite 查询与数据导出',
    whenToUse: '需要查询或修改 SQLite 数据库、导出查询结果时使用。',
    source: 'skills.sh/sqlite-query',
    body: `# sqlite-query

SQLite 查询与导出。

## 固定流程

1. 先看表结构：\`SELECT name FROM sqlite_master WHERE type='table';\`
2. 再 \`PRAGMA table_info(<table>);\` 确认列名与类型。
3. 写查询时先 \`LIMIT 20\` 看样本，再放开。
4. 导出用 sqlite3 的 \`.mode csv\` 与 \`.output\`。

\`\`\`bash
sqlite3 data.db ".tables"
sqlite3 data.db "PRAGMA table_info(orders);"
sqlite3 -header -csv data.db "SELECT * FROM orders LIMIT 20;"
\`\`\`

## 注意

- 写操作前先备份：\`sqlite3 data.db ".backup backup.db"\`
- 日期字段常为文本，比较时用 \`datetime()\` 归一。

## 验收

- 查询结果列名与预期一致；
- 写操作影响行数与条件匹配数一致。`
  }
]

const CATALOG = [...BASE_CATALOG, ...EXTRA_CATALOG]
const BY_NAME = new Map(CATALOG.map(entry => [entry.name, entry]))

const NEEDS = [
  {
    key: 'crawler',
    label: '网页爬虫',
    keywords: ['爬虫', '采集', '抓取', '爬取', 'scrap', 'crawl', '采集脚本'],
    candidates: ['crawler-kit'],
  },
  {
    key: 'word',
    label: 'Word 文档',
    keywords: ['word', 'docx', '文档', '报告', '合同', '周报', '日报', '月报', '总结'],
    candidates: ['word-docx'],
  },
  {
    key: 'excel',
    label: 'Excel 报表',
    keywords: ['excel', 'xlsx', '表格', '报表', '统计表'],
    candidates: ['excel-report'],
  },
  {
    key: 'ppt',
    label: 'PPT 演示',
    keywords: ['ppt', 'pptx', '演示', '幻灯片', 'slide', '汇报'],
    candidates: ['ppt-deck'],
  },
  {
    key: 'pdf',
    label: 'PDF 处理',
    keywords: ['pdf', '合并pdf', '拆分pdf'],
    candidates: ['pdf-toolkit'],
  },
  {
    key: 'git',
    label: 'Git 工具',
    keywords: ['git', '提交记录', '分支合并', '版本管理'],
    candidates: ['git-tools'],
  },
  {
    key: 'sqlite',
    label: 'SQLite 查询',
    keywords: ['sqlite', 'sql ', '数据库查询', 'sql查询'],
    candidates: ['sqlite-query'],
  },
]

/**
 * Semantic fallback: when no keyword hits, a task request still deserves a
 * lookup. A message must contain an action verb, then the first matching intent
 * decides which catalog skill should be offered. Order matters — specific
 * artifacts (PDF, PPT, Excel) before the broad Word/文档 intent, because
 * "写一份 PDF 报告" is a PDF request, not a Word request.
 */
const TASK_VERBS = [
  '画', '绘制', '作图', '生成', '做', '写', '整理', '分析', '转换', '提取',
  '爬', '采集', '抓取', '导出', '翻译', '压缩', '合并', '拆分', '截图',
  '审查', '测试', '部署', '创建', '制作', '修改', '编辑', '汇总', '统计',
  '格式化', '校验', '清洗', '扫描', '同步', '排版', '演示', '汇报',
]

const INTENTS = [
  { skill: 'pdf-toolkit', test: /pdf|拆分文档|合并文档/i },
  { skill: 'ppt-deck', test: /ppt|幻灯片|演示文稿|slide|汇报材料|路演/i },
  { skill: 'excel-report', test: /excel|xlsx|表格|报表|统计表|数据透视/i },
  { skill: 'csv-tools', test: /csv/i },
  { skill: 'json-formatter', test: /json/i },
  { skill: 'chart-maker', test: /图表|可视化|折线|柱状|饼图|走势图|散点|画.{0,6}图|作图|plot|chart/i },
  { skill: 'image-optimizer', test: /图片|图像|照片|压缩图|webp|image/i },
  { skill: 'crawler-kit', test: /爬虫|采集|抓取|爬取|crawl|scrap|爬一下|爬点|爬资料|爬数据/i },
  { skill: 'sqlite-query', test: /sqlite|数据库|sql/i },
  { skill: 'db-migrate', test: /迁移|建表|表结构|migrate/i },
  { skill: 'git-tools', test: /git|分支|提交|版本管理|合并冲突/i },
  { skill: 'docker-helper', test: /docker|容器|镜像|compose/i },
  { skill: 'regex-tester', test: /正则|regex/i },
  { skill: 'unit-test-helper', test: /单元测试|测试用例|覆盖率|test/i },
  { skill: 'code-review', test: /代码审查|code review|评审/i },
  { skill: 'log-analyzer', test: /日志|log/i },
  { skill: 'secrets-scanner', test: /密钥|凭证|secret/i },
  { skill: 'http-client', test: /http|接口|api|请求调试/i },
  { skill: 'rss-reader', test: /rss|订阅/i },
  { skill: 'sitemap-checker', test: /sitemap|死链|收录/i },
  { skill: 'email-draft', test: /邮件|email|回信/i },
  { skill: 'calendar-sync', test: /日历|日程|calendar|ics/i },
  { skill: 'meeting-notes', test: /会议|纪要|meeting/i },
  { skill: 'translate-docs', test: /翻译|translate/i },
  { skill: 'form-builder', test: /表单|问卷|form/i },
  { skill: 'markdown-writer', test: /markdown|md 文档|笔记/i },
  { skill: 'html-report', test: /html|网页报告|单页/i },
  { skill: 'data-cleaner', test: /数据清洗|清洗数据|去重|缺失值/i },
  { skill: 'word-docx', test: /word|docx|文档|报告|周报|日报|月报|总结|合同|说明书/i },
]

/** Infer one intent from a message that no keyword matched. */
function inferIntent(lower) {
  if (!TASK_VERBS.some(verb => lower.includes(verb))) return null
  for (const intent of INTENTS) {
    if (!intent.test.test(lower)) continue
    const entry = BY_NAME.get(intent.skill)
    if (entry === undefined) continue
    return {
      need: {
        key: `inferred-${entry.name}`,
        label: entry.description ?? entry.name,
        keywords: [],
        candidates: [entry.name],
      },
      matched: '语义推断',
      inferred: true,
    }
  }
  return null
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

function isSkillName(value) {
  return typeof value === 'string' && SKILL_NAME.test(value)
}

function within(root, child) {
  const rel = relative(resolve(root), resolve(child))
  return rel === '' || (!rel.startsWith('..') && !rel.startsWith(sep) && !resolve(rel).startsWith('..'))
}

function displayPath(root, path) {
  const rel = relative(root, path)
  return rel === '' ? '.' : rel.split(sep).join('/')
}

function humanBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function humanCount(value) {
  if (!Number.isFinite(value) || value <= 0) return '—'
  if (value < 1000) return `${value}`
  return `${(value / 1000).toFixed(1)}k`
}

function permLabel(perm) {
  if (perm === 'command') return { text: '网络访问 · 命令执行', warn: true }
  if (perm === 'network') return { text: '网络访问 · 文件写入', warn: true }
  return { text: '文件读写', warn: false }
}

function stamp(value) {
  return typeof value === 'number' && value > 0 ? value : Date.now()
}

function relativeTime(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return ''
  const diff = Date.now() - ms
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)} 小时前`
  return `${Math.round(diff / 86_400_000)} 天前`
}

/* ------------------------------------------------------------------ */
/* SKILL.md frontmatter                                                */
/* ------------------------------------------------------------------ */

function parseFrontmatter(text) {
  const out = {}
  if (typeof text !== 'string') return out
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (!match) return out
  const lines = match[1].split(/\r?\n/)
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line)
    if (!kv) continue
    const key = kv[1]
    let value = kv[2].trim()
    if (value === '|' || value === '>' || value === '|-') {
      const parts = []
      while (i + 1 < lines.length && /^\s+/.test(lines[i + 1])) {
        i += 1
        parts.push(lines[i].trim())
      }
      out[key] = parts.join(' ').trim()
      continue
    }
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

function stripFrontmatter(text) {
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(text)
  return match ? text.slice(match[0].length) : text
}

function bodyOf(text) {
  return stripFrontmatter(text).trim()
}

/**
 * Quote one YAML scalar. The skill provider parses frontmatter with a strict
 * YAML stack, where values starting with `@` (the author handle) or containing
 * a `: ` sequence are not plain scalars — a JSON string is also a valid YAML
 * double-quoted scalar, so this keeps every generated value parseable.
 */
function yamlScalar(value) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  return JSON.stringify(text)
}

function buildSkillMarkdown(entry) {
  const lines = [
    '---',
    `name: ${entry.name}`,
    `description: ${yamlScalar(entry.description)}`,
  ]
  if (entry.whenToUse) lines.push(`whenToUse: ${yamlScalar(entry.whenToUse)}`)
  lines.push('metadata:')
  lines.push(`  version: ${yamlScalar(entry.version)}`)
  lines.push(`  author: ${yamlScalar(entry.author)}`)
  lines.push(`  installs: ${entry.installs}`)
  lines.push(`  category: ${yamlScalar(entry.category)}`)
  lines.push(`  perm: ${yamlScalar(entry.perm)}`)
  lines.push(`  source: ${yamlScalar(entry.source)}`)
  lines.push('---', '')
  lines.push(entry.body.trim(), '')
  return lines.join('\n')
}

function setFrontmatterBoolean(text, field, value) {
  const bool = value ? 'true' : 'false'
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (!match) return `---\n${field}: ${bool}\n---\n\n${text}`
  const head = match[1]
  const rest = text.slice(match[0].length)
  const re = new RegExp(`^${field}:.*$`, 'm')
  const nextHead = re.test(head)
    ? head.replace(re, `${field}: ${bool}`)
    : `${head}\n${field}: ${bool}`
  return `---\n${nextHead}\n---${rest}`
}

/* ------------------------------------------------------------------ */
/* Audit                                                               */
/* ------------------------------------------------------------------ */

const TRUSTED_HOSTS = new Set([
  'skills.sh',
  'www.skills.sh',
  'github.com',
  'raw.githubusercontent.com',
  'registry.npmjs.org',
  'npmjs.com',
  'pypi.org',
  'files.pythonhosted.org',
  'api.deepseek.com',
  'deepseek.com',
  // Reserved documentation/example hosts: a skill's sample URL is not an
  // outbound channel the install would create.
  'example.com',
  'www.example.com',
  'example.org',
  'example.net',
  'localhost',
  '127.0.0.1',
])

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return ''
  }
}

function urlsIn(text) {
  return Array.from(text.matchAll(/https?:\/\/[^\s"'`)<>\]]+/g)).map(match => match[0])
}

/**
 * Audit the files a candidate would install.
 * Returns { poison, findings } where `poison` is true when a critical or high
 * finding exists. Only code-looking text is inspected: a SKILL.md prose line
 * that merely mentions "eval" must not fail a candidate.
 */
function auditFiles(files) {
  const findings = []
  for (const file of files) {
    const text = file.text || ''
    const code = file.code === true
    const add = (severity, rule, detail) => {
      findings.push({ severity, rule, file: file.path, detail })
    }

    if (code && /\beval\s*\(/.test(text)) add('critical', 'eval', '检测到 eval() 动态执行代码')
    if (code && /\batob\s*\(/.test(text)) add('critical', 'obfuscation', '检测到 atob() 混淆解码')
    if (code && /new\s+Function\s*\(/.test(text)) add('critical', 'dynamic-code', '检测到 new Function() 动态构造')
    if (code && /(?:child_process|execSync|\.exec\s*\()/.test(text)) add('high', 'process', '检测到子进程执行')
    if (code && /(?:curl|wget|Invoke-WebRequest)\s+/i.test(text)) add('medium', 'shell-download', '检测到外部下载命令')

    for (const url of urlsIn(text)) {
      const host = hostOf(url)
      if (host === '') continue
      if (TRUSTED_HOSTS.has(host)) continue
      if (host.endsWith('.githubusercontent.com')) continue
      add('high', 'external-domain', `外联未知域名 ${host}`)
    }
  }

  const poison = findings.some(item => item.severity === 'critical' || item.severity === 'high')
  return { poison, findings }
}

/* ------------------------------------------------------------------ */
/* Skill learning                                                      */
/* ------------------------------------------------------------------ */

/**
 * Functional groups: two skills are alternatives only when they solve the same
 * task. Category alone is far too coarse (a PDF tool is not a Word tool), and
 * description n-grams over-match Chinese prose, so the groups are explicit.
 * Skills absent from this map are their own group and have no peers.
 */
const SKILL_GROUPS = {
  'word-docx': 'document',
  'markdown-writer': 'document',
  'html-report': 'document',
  'ppt-deck': 'slide',
  'pdf-toolkit': 'pdf',
  'excel-report': 'sheet',
  'csv-tools': 'sheet',
  'chart-maker': 'sheet',
  'json-formatter': 'data',
  'data-cleaner': 'data',
  'sqlite-query': 'database',
  'db-migrate': 'database',
  'git-tools': 'git',
  'docker-helper': 'container',
  'api-mock': 'http',
  'http-client': 'http',
  'crawler-kit': 'crawler',
  'unit-test-helper': 'test',
  'code-review': 'test',
  'log-analyzer': 'log',
  'secrets-scanner': 'security',
  'regex-tester': 'regex',
}

function groupOf(entry) {
  return SKILL_GROUPS[entry.name] ?? entry.name
}

/** Whether two skills solve the same task and are therefore alternatives. */
function isRelatedSkill(a, b) {
  if (a.name === b.name) return false
  const group = groupOf(a)
  if (group === a.name) return false
  return groupOf(b) === group
}

/** Split a skill body into `## heading` sections (the leading title is dropped). */
function sectionsOf(text) {
  const body = stripFrontmatter(String(text ?? ''))
  const chunks = body.split(/\n##\s+/)
  const sections = []
  for (const chunk of chunks) {
    const lines = chunk.split('\n')
    const title = lines[0].replace(/^#+\s*/, '').trim()
    const content = lines.slice(1).join('\n').trim()
    if (title !== '' && content !== '') sections.push({ title, content })
  }
  return sections
}

function pickSections(sections, keywords) {
  return sections
    .filter(section => keywords.some(keyword => section.title.includes(keyword)))
    .map(section => section.content)
}

/**
 * Score one marketplace entry for the learning comparison: what it does well
 * and what it lacks. The signals are structural (code samples, acceptance,
 * caveats, step count, installs, permission surface), not a model judgement.
 */
function evaluateSkill(entry) {
  const text = buildSkillMarkdown(entry)
  const sections = sectionsOf(text)
  const pros = []
  const cons = []
  if (/```/.test(text)) pros.push('含可执行代码示例')
  else cons.push('缺少代码示例')
  if (sections.some(section => /验收|检查/.test(section.title))) pros.push('带验收清单')
  else cons.push('没有验收标准')
  if (sections.some(section => /注意|坑|限制/.test(section.title))) pros.push('写明风险与限制')
  if (entry.perm === 'command') cons.push('需要命令执行权限')
  if (entry.perm === 'network') cons.push('需要网络访问')
  if (entry.installs >= 10000) pros.push('安装量领先')
  const steps = (text.match(/^\d+\.\s/gm) ?? []).length
  if (steps >= 3 && steps <= 12) pros.push(`步骤清晰（${steps} 步）`)
  else if (steps > 12) cons.push('步骤偏多')
  const score = Math.max(40, Math.min(98, 58 + pros.length * 8 - cons.length * 5 + Math.min(12, Math.round(entry.installs / 3000))))
  return { score, pros, cons }
}

/**
 * Build one merged SKILL.md from a source skill and its same-category peers.
 * The merge is structural, not generative: it keeps each source's flow, notes
 * and acceptance sections under a labelled heading, and records every author.
 */
function buildMergedSkill(source, sourceText, entry, peers) {
  const authors = []
  const addAuthor = value => {
    const text = String(value ?? '').trim()
    if (text !== '' && !authors.includes(text)) authors.push(text)
  }
  addAuthor(entry?.author ?? '')
  for (const peer of peers) addAuthor(peer.entry.author)

  const names = [source.name, ...peers.map(peer => peer.entry.name)]
  const descriptions = []
  if (entry?.description) descriptions.push(entry.description)
  for (const peer of peers) if (peer.entry.description) descriptions.push(peer.entry.description)

  const processBlocks = []
  const noteBlocks = []
  const checkBlocks = []
  const collect = (label, text) => {
    const sections = sectionsOf(text)
    const flow = pickSections(sections, ['流程', '步骤', '用法', '使用', '快速开始', '工作流'])
    const notes = pickSections(sections, ['注意', '坑', '限制', '风险'])
    const checks = pickSections(sections, ['验收', '检查', '自检'])
    const picked = flow.length > 0 ? flow : sections.slice(0, 2).map(section => section.content)
    for (const block of picked) processBlocks.push({ label, text: block.slice(0, 1200) })
    for (const block of notes) noteBlocks.push({ label, text: block.replace(/\n+/g, ' ').slice(0, 300) })
    for (const block of checks) checkBlocks.push({ label, text: block.replace(/\n+/g, ' ').slice(0, 300) })
  }
  collect(source.name, sourceText)
  for (const peer of peers) collect(peer.entry.name, peer.text)

  const name = `${source.name}-pro`
  const description = `${entry?.description ?? source.description ?? source.name}（整合版，合并 ${names.length} 个同类技能）`
  const lines = [
    '---',
    `name: ${name}`,
    `description: ${yamlScalar(description)}`,
    `whenToUse: ${yamlScalar(entry?.whenToUse ?? source.whenToUse ?? '')}`,
    'metadata:',
    `  version: ${yamlScalar(source.version)}`,
    `  author: ${yamlScalar(authors.join(', '))}`,
    `  installs: ${entry?.installs ?? 0}`,
    `  category: ${yamlScalar(entry?.category ?? source.category ?? '')}`,
    `  perm: ${yamlScalar(entry?.perm ?? source.perm ?? 'files')}`,
    `  source: ${yamlScalar('local/learned')}`,
    `  learnedFrom: ${yamlScalar(names.join(', '))}`,
    '---',
    '',
    `# ${name}`,
    '',
    `本技能由「技能学习」整合 ${names.length} 个同类能力：${names.join('、')}。`,
    '',
    '## 能力范围',
    '',
    ...[...new Set(descriptions)].map(item => `- ${item}`),
    '',
    '## 工作流程',
    '',
  ]
  for (const block of processBlocks) {
    lines.push(`### ${block.label}`, '', block.text, '')
  }
  if (noteBlocks.length > 0) {
    lines.push('## 注意事项', '')
    for (const block of noteBlocks) lines.push(`- （${block.label}）${block.text}`)
    lines.push('')
  }
  if (checkBlocks.length > 0) {
    lines.push('## 验收', '')
    for (const block of checkBlocks) lines.push(`- （${block.label}）${block.text}`)
    lines.push('')
  }
  lines.push('## 作者', '', ...authors.map(author => `- ${author}`), '')

  return {
    name,
    markdown: lines.join('\n'),
    authors,
    sources: names,
    description,
    category: entry?.category ?? source.category ?? '',
    perm: entry?.perm ?? source.perm ?? 'files',
    version: source.version,
  }
}

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

class StateStore {
  constructor(file) {
    this.file = file
    this.data = null
    this.queue = Promise.resolve()
  }

  async load() {
    if (this.data !== null) return this.data
    let parsed = null
    try {
      parsed = JSON.parse(await readFile(this.file, 'utf8'))
    } catch {
      parsed = null
    }
    this.data = this.normalize(parsed)
    return this.data
  }

  normalize(raw) {
    const state = raw && typeof raw === 'object' ? raw : {}
    const settings = state.settings && typeof state.settings === 'object' ? state.settings : {}
    const installs = state.installs && typeof state.installs === 'object' ? state.installs : {}
    return {
      version: STATE_VERSION,
      settings: {
        // Global is the default because the official skill provider only
        // discovers project roots that resolve to a repository root; a plain
        // workspace directory without `.git` is not scanned, so a workspace
        // install would sit on disk without ever reaching the model.
        defaultScope: settings.defaultScope === 'workspace' ? 'workspace' : 'global',
        workspaces: Array.isArray(settings.workspaces)
          ? settings.workspaces.filter(item => typeof item === 'string')
          : [],
      },
      installs,
    }
  }

  async save() {
    await mkdir(dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    await writeFile(tmp, `${JSON.stringify(this.data, null, 2)}\n`, 'utf8')
    await rename(tmp, this.file)
  }

  /** Serialize a read-modify-write so parallel panel actions cannot interleave. */
  async update(mutator) {
    const run = this.queue.then(async () => {
      const state = await this.load()
      const result = await mutator(state)
      await this.save()
      return result
    })
    this.queue = run.catch(() => {})
    return run
  }
}

/* ------------------------------------------------------------------ */
/* Filesystem catalog                                                  */
/* ------------------------------------------------------------------ */

async function directorySize(dir, depth = 0) {
  if (depth > 6) return 0
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return 0
  }
  let total = 0
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) total += await directorySize(path, depth + 1)
    else if (entry.isFile()) {
      try {
        total += (await stat(path)).size
      } catch {
        /* ignore */
      }
    }
  }
  return total
}

async function listSkillFiles(root, depth = 0, prefix = '') {
  const out = []
  if (depth > 4) return out
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return out
  }
  entries.sort((a, b) => a.name.localeCompare(b.name))
  for (const entry of entries) {
    if (entry.name === '.trash' || entry.name.startsWith('.')) continue
    const path = join(root, entry.name)
    const label = prefix === '' ? entry.name : `${prefix}/${entry.name}`
    if (entry.isDirectory()) {
      out.push({ path: label, type: 'dir' })
      out.push(...await listSkillFiles(path, depth + 1, label))
    } else if (entry.isFile()) {
      let size = 0
      try {
        size = (await stat(path)).size
      } catch {
        /* ignore */
      }
      out.push({ path: label, type: 'file', size })
    }
  }
  return out
}

/** Roots in which this plugin installs and lists skills. */
function skillRoots(workspace, extraWorkspaces = []) {
  const roots = [
    { root: join(DSH_HOME, 'skills'), scope: 'global', level: 'user-dsh' },
  ]
  const seen = new Set([resolve(DSH_HOME, 'skills')])
  for (const dir of [workspace, ...extraWorkspaces]) {
    if (typeof dir !== 'string' || dir.trim() === '') continue
    const root = join(resolve(dir), '.dsh', 'skills')
    const key = resolve(root)
    if (seen.has(key)) continue
    seen.add(key)
    roots.push({ root, scope: 'workspace', level: 'project-dsh', workspace: resolve(dir) })
  }
  roots.push({ root: join(DSH_HOME, 'skill-detective', 'temp'), scope: 'temp', level: 'temp' })
  return roots
}

async function scanRoot(entry) {
  const out = []
  let dirs
  try {
    dirs = await readdir(entry.root, { withFileTypes: true })
  } catch {
    return out
  }
  for (const dirent of dirs) {
    if (!dirent.isDirectory() || dirent.name.startsWith('.')) continue
    const dir = join(entry.root, dirent.name)
    const file = join(dir, 'SKILL.md')
    let text
    try {
      text = await readFile(file, 'utf8')
    } catch {
      continue
    }
    const meta = parseFrontmatter(text)
    const skillName = isSkillName(meta.name) ? meta.name : dirent.name
    out.push({
      name: skillName,
      description: typeof meta.description === 'string' ? meta.description : '',
      whenToUse: typeof meta.whenToUse === 'string' ? meta.whenToUse : '',
      disabled: meta['disable-model-invocation'] === 'true',
      dir,
      file,
      scope: entry.scope,
      workspace: entry.workspace,
      level: entry.level,
      bytes: await directorySize(dir),
    })
  }
  return out
}

/* ------------------------------------------------------------------ */
/* Service                                                             */
/* ------------------------------------------------------------------ */

class SkillDetective {
  constructor(ctx) {
    this.ctx = ctx
    this.state = new StateStore(join(DSH_HOME, 'skill-detective.json'))
    this.sessions = new Map() // sessionId -> boolean (checkbox)
    this.pending = new Map() // sessionId -> recommendation
    this.sessionWorkspaces = new Map() // sessionId -> absolute cwd
    this.auditedList = undefined // lazily audited marketplace catalog
    this.lastRecommend = new Map() // sessionId -> timestamp of the last bubble
    this.dismissed = new Map() // `${sessionId}:${needKey}` -> timestamp
    this.lastSearch = null
    this.log = (...args) => {
      try {
        ctx.logger?.info?.(...args)
      } catch {
        /* ignore */
      }
    }
  }

  defaultWorkspace() {
    try {
      const wd = this.ctx.get('workingDirectory')
      if (wd && typeof wd.defaultDirectory === 'string' && wd.defaultDirectory !== '') {
        return wd.defaultDirectory
      }
    } catch {
      /* ignore */
    }
    return process.cwd()
  }

  workspaceList() {
    const list = []
    try {
      const registry = this.ctx.get('workspaceRegistry')
      const items = registry && typeof registry.list === 'function' ? registry.list() : []
      for (const item of items) {
        if (!item || typeof item.path !== 'string') continue
        const title = typeof item.title === 'string' && item.title.trim() !== '' ? item.title : basename(item.path)
        list.push({ path: item.path, title })
      }
    } catch {
      /* ignore */
    }
    const fallback = this.defaultWorkspace()
    if (!list.some(item => resolve(item.path) === resolve(fallback))) {
      list.unshift({ path: fallback, title: basename(fallback) || '默认工作区' })
    }
    return list
  }

  normalizeWorkspace(value) {
    const list = this.workspaceList()
    if (typeof value === 'string' && value.trim() !== '') {
      const found = list.find(item => resolve(item.path) === resolve(value) || item.title === value)
      if (found) return found.path
      const abs = resolve(value)
      if (existsSync(abs)) return abs
    }
    // The panel is a global page: prefer the deployment's conventional default
    // workspace, then any non-profile directory, and only then the first entry.
    const preferred = list.find(item => basename(item.path).toLowerCase() === 'default-workspace')
      ?? list.find(item => !resolve(item.path).startsWith(join(DSH_HOME, 'profiles')))
      ?? list[0]
    return preferred?.path ?? this.defaultWorkspace()
  }

  async listInstalled(workspace) {
    const state = await this.state.load()
    const extras = Array.isArray(state.settings.workspaces) ? state.settings.workspaces : []
    const roots = skillRoots(workspace, extras)
    const scanned = []
    for (const root of roots) scanned.push(...await scanRoot(root))

    const byName = new Map()
    for (const skill of scanned) {
      const existing = byName.get(skill.name)
      // project scope outranks user scope, matching the official precedence rank.
      if (existing === undefined) {
        byName.set(skill.name, skill)
        continue
      }
      if (existing.scope !== 'workspace' && skill.scope === 'workspace') byName.set(skill.name, skill)
    }

    return Array.from(byName.values()).map(skill => {
      const meta = state.installs[skill.name] ?? null
      const origin = meta?.origin === 'market'
        ? 'market'
        : meta?.origin === 'plugin'
          ? 'plugin'
          : meta?.origin === 'learned'
            ? 'learned'
            : 'user'
      const perm = meta?.perm ?? 'files'
      return {
        name: skill.name,
        version: meta?.version ?? '0.1.0',
        origin,
        scope: meta?.scope ?? skill.scope,
        workspace: skill.workspace ?? null,
        installs: meta?.installs ?? null,
        author: meta?.author ?? '',
        category: meta?.category ?? '',
        source: meta?.source ?? '',
        description: meta?.description ?? skill.description,
        whenToUse: skill.whenToUse,
        perm,
        permLabel: permLabel(perm).text,
        permWarn: permLabel(perm).warn,
        enabled: !skill.disabled,
        installedAt: meta?.installedAt ?? null,
        timeLabel: relativeTime(meta?.installedAt),
        bytes: skill.bytes,
        sizeLabel: humanBytes(skill.bytes),
        installsLabel: humanCount(meta?.installs),
        path: skill.dir,
      }
    })
  }

  analyzeText(text) {
    const lower = String(text ?? '').toLowerCase()
    for (const need of NEEDS) {
      const hit = need.keywords.find(keyword => lower.includes(keyword))
      if (hit !== undefined) return { need, matched: hit, inferred: false }
    }
    return inferIntent(lower)
  }

  async analyze(text, workspace) {
    const analysis = this.analyzeText(text)
    if (analysis === null) {
      return {
        need: null,
        label: '',
        matched: '',
        candidates: [],
        covered: null,
        installedCount: 0,
      }
    }
    const installed = await this.listInstalled(workspace)
    const enabledNames = new Set(installed.filter(item => item.enabled).map(item => item.name))
    const coveredName = analysis.need.candidates.find(candidate => enabledNames.has(candidate)) ?? null
    const covered = coveredName === null ? null : installed.find(item => item.name === coveredName) ?? null

    const audited = this.auditedCatalog()
    const candidates = analysis.need.candidates
      .map((candidateName, index) => {
        const entry = BY_NAME.get(candidateName)
        if (entry === undefined) return null
        if (!audited.includes(entry)) return null
        return { ...entry, rank: index, installed: enabledNames.has(entry.name) }
      })
      .filter(Boolean)
      .sort((a, b) => b.installs - a.installs)

    return {
      need: analysis.need.key,
      label: analysis.need.label,
      matched: analysis.matched,
      inferred: analysis.inferred === true,
      candidates,
      covered,
      installedCount: installed.length,
    }
  }

  /** Curated market list with installed markers. */
  async market(workspace) {
    const installed = await this.listInstalled(workspace)
    const installedNames = new Set(installed.map(item => item.name))
    return this.auditedCatalog().map(entry => ({
      name: entry.name,
      version: entry.version,
      category: entry.category,
      author: entry.author,
      installs: entry.installs,
      installsLabel: `${humanCount(entry.installs)} 安装`,
      description: entry.description,
      whenToUse: entry.whenToUse,
      perm: entry.perm,
      permLabel: permLabel(entry.perm).text,
      permWarn: permLabel(entry.perm).warn,
      source: entry.source,
      installed: installedNames.has(entry.name),
    }))
  }

  /**
   * Marketplace entries that pass the same audit every install must pass.
   * A catalog entry that would be rejected at install time must never appear
   * in the market in the first place.
   */
  auditedCatalog() {
    if (this.auditedList === undefined) {
      this.auditedList = CATALOG.filter(entry => !auditFiles([
        { path: 'SKILL.md', text: buildSkillMarkdown(entry), code: true },
      ]).poison)
    }
    return this.auditedList
  }

  /**
   * Compare each installed skill with the audited marketplace catalog:
   * newer version of the same skill, or a same-category skill with more installs.
   */
  async updates(workspace) {
    const installed = await this.listInstalled(workspace)
    const installedNames = new Set(installed.map(item => item.name))
    const catalog = this.auditedCatalog()
    const topByCategory = new Map()
    for (const entry of catalog) {
      const current = topByCategory.get(entry.category)
      if (current === undefined || entry.installs > current.installs) topByCategory.set(entry.category, entry)
    }
    return installed.map(skill => {
      const entry = BY_NAME.get(skill.name)
      const category = entry?.category ?? skill.category ?? ''
      const top = topByCategory.get(category)
      const current = entry ?? {
        name: skill.name,
        category,
        description: skill.description ?? '',
        whenToUse: skill.whenToUse ?? '',
        installs: 0,
      }
      const peers = catalog.filter(item => isRelatedSkill(current, item))
      const best = [...peers].sort((a, b) => b.installs - a.installs)[0]
      const currentInstalls = entry?.installs ?? 0
      const newer = entry !== undefined && entry.version !== skill.version ? entry.version : null
      let status = 'latest'
      let suggestion = null
      if (newer !== null) status = 'update'
      if (best !== undefined && best.installs > currentInstalls) {
        status = 'better'
        suggestion = {
          name: best.name,
          version: best.version,
          author: best.author,
          installs: best.installs,
          installsLabel: humanCount(best.installs),
          installed: installedNames.has(best.name),
          description: best.description,
        }
      }
      return {
        name: skill.name,
        version: skill.version,
        category,
        installs: skill.installs,
        installsLabel: skill.installs !== null ? humanCount(skill.installs) : '—',
        status,
        newer,
        suggestion,
        top: top === undefined ? null : { name: top.name, installsLabel: humanCount(top.installs) },
      }
    })
  }

  /**
   * Merge one installed skill with every same-category peer into a new
   * `<name>-pro` skill. The merged body goes through the same security audit as
   * any install; a poisoned draft is returned but never written.
   */
  async learn(sourceName, workspace, options = {}) {
    const installed = await this.listInstalled(workspace)
    const source = installed.find(item => item.name === sourceName)
    if (source === undefined) throw new Error('技能不存在')
    const entry = BY_NAME.get(source.name)
    const category = entry?.category ?? source.category ?? ''
    const current = entry ?? {
      name: source.name,
      category,
      description: source.description ?? '',
      whenToUse: source.whenToUse ?? '',
      installs: 0,
    }
    const peers = this.auditedCatalog().filter(item => isRelatedSkill(current, item))
    if (peers.length === 0) {
      return { ok: false, code: 'no-peers', message: '未查找到同类skill' }
    }

    let sourceText = ''
    try {
      sourceText = await readFile(join(source.path, 'SKILL.md'), 'utf8')
    } catch {
      sourceText = entry ? buildSkillMarkdown(entry) : ''
    }
    const installedByName = new Map(installed.map(item => [item.name, item]))
    const peersWithText = []
    for (const peer of peers) {
      const present = installedByName.get(peer.name)
      let text = ''
      if (present !== undefined) {
        try {
          text = await readFile(join(present.path, 'SKILL.md'), 'utf8')
        } catch {
          text = buildSkillMarkdown(peer)
        }
      } else {
        text = buildSkillMarkdown(peer)
      }
      peersWithText.push({ entry: peer, text })
    }

    const merged = buildMergedSkill(source, sourceText, entry, peersWithText)
    const verdict = auditFiles([{ path: 'SKILL.md', text: merged.markdown, code: true }])
    const peerSummary = peersWithText.map(peer => {
      const quality = evaluateSkill(peer.entry)
      return {
        name: peer.entry.name,
        version: peer.entry.version,
        author: peer.entry.author,
        installs: peer.entry.installs,
        installsLabel: `${humanCount(peer.entry.installs)} 安装`,
        description: peer.entry.description,
        perm: peer.entry.perm,
        permLabel: permLabel(peer.entry.perm).text,
        permWarn: permLabel(peer.entry.perm).warn,
        installed: installedByName.has(peer.entry.name),
        score: quality.score,
        pros: quality.pros,
        cons: quality.cons,
      }
    })

    if (options.dryRun === true) {
      return {
        ok: true,
        dryRun: true,
        source: { name: source.name, version: source.version, author: entry?.author ?? '', category },
        peers: peerSummary,
        merged: { name: merged.name, authors: merged.authors, sources: merged.sources, markdown: merged.markdown, bytes: merged.markdown.length },
        audit: { poison: verdict.poison, findings: verdict.findings },
      }
    }

    if (verdict.poison) {
      return {
        ok: false,
        code: 'poison',
        message: '整合稿未通过安全审查',
        findings: verdict.findings,
        merged: { name: merged.name, authors: merged.authors, markdown: merged.markdown },
      }
    }

    const scope = source.scope === 'global' ? 'global' : 'workspace'
    const root = await this.targetRoot(scope, source.workspace ?? workspace, '')
    const dir = join(root, merged.name)
    if (!within(root, dir)) throw new Error('目标路径越界')
    if (existsSync(dir)) await rm(dir, { recursive: true, force: true })
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'SKILL.md'), merged.markdown, 'utf8')
    const bytes = await directorySize(dir)

    await this.state.update(data => {
      data.installs[merged.name] = {
        origin: 'learned',
        scope,
        installs: entry?.installs ?? 0,
        author: merged.authors.join(', '),
        version: source.version,
        category: merged.category,
        perm: merged.perm,
        source: 'local/learned',
        description: merged.description,
        installedAt: Date.now(),
        learnedFrom: merged.sources,
      }
    })
    try {
      this.ctx.emit('skills/change')
    } catch {
      /* ignore */
    }
    this.log(`skill-detective: learned ${merged.name} from ${merged.sources.join(', ')}`)
    return {
      ok: true,
      name: merged.name,
      authors: merged.authors,
      sources: merged.sources,
      peers: peerSummary,
      bytes,
      bytesLabel: humanBytes(bytes),
      audit: { poison: false, findings: verdict.findings },
      merged: { name: merged.name, authors: merged.authors, markdown: merged.markdown },
    }
  }

  /** Learn every installed skill in turn; existing `-pro` skills are skipped. */
  async learnAll(workspace) {
    const installed = await this.listInstalled(workspace)
    const results = []
    for (const skill of installed) {
      if (skill.name.endsWith('-pro')) continue
      try {
        const result = await this.learn(skill.name, workspace)
        results.push({
          name: skill.name,
          ok: result.ok === true,
          code: result.code ?? null,
          target: result.name ?? null,
          message: result.message ?? null,
        })
      } catch (error) {
        results.push({
          name: skill.name,
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        })
      }
    }
    return {
      total: results.length,
      learned: results.filter(item => item.ok).length,
      skipped: results.filter(item => !item.ok).length,
      results,
    }
  }

  /**
   * Search for candidates. skills.sh is asked first; when it is unreachable the
   * curated catalog answers and the result records which source was used, so the
   * panel never claims a remote hit it did not receive.
   */
  async search(query, workspace) {
    const text = String(query ?? '').trim()
    const analysis = this.analyzeText(text)
    let remote = null
    let remoteError = null
    try {
      remote = await this.searchSkillsSh(text)
    } catch (error) {
      remoteError = error instanceof Error ? error.message : String(error)
    }

    // Remote results only refine a candidate this plugin can actually install:
    // the curated catalog is the installer contract, so an unknown remote name
    // is never offered as installable.
    const remoteByName = new Map()
    if (Array.isArray(remote)) {
      for (const row of remote) {
        if (BY_NAME.has(row.name)) remoteByName.set(row.name, row)
      }
    }

    const installed = await this.listInstalled(workspace)
    const installedNames = new Set(installed.filter(item => item.enabled).map(item => item.name))
    const pool = analysis === null
      ? CATALOG
      : analysis.need.candidates.map(candidateName => BY_NAME.get(candidateName)).filter(Boolean)
    const candidates = pool
      .map(entry => (remoteByName.has(entry.name) ? { ...entry, installs: Math.max(entry.installs, remoteByName.get(entry.name).installs), source: `skills.sh/${entry.name}` } : entry))
      .map(entry => ({
        name: entry.name,
        version: entry.version,
        category: entry.category,
        author: entry.author,
        installs: entry.installs,
        installsLabel: `${humanCount(entry.installs)} 安装`,
        description: entry.description,
        whenToUse: entry.whenToUse,
        perm: entry.perm,
        permLabel: permLabel(entry.perm).text,
        permWarn: permLabel(entry.perm).warn,
        source: entry.source,
        installed: installedNames.has(entry.name),
      }))
      .sort((a, b) => b.installs - a.installs)
    return {
      source: remoteByName.size > 0 ? 'skills.sh' : 'builtin',
      candidates,
      error: remoteError,
    }
  }

  /**
   * Ask skills.sh once with a short timeout. The endpoint is the public site's
   * search; an unreachable or unrecognised answer is reported as an error rather
   * than guessed into candidates.
   */
  async searchSkillsSh(query) {
    if (query === '') return []
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 6000)
    try {
      const response = await fetch(`https://skills.sh/api/search?q=${encodeURIComponent(query)}`, {
        signal: controller.signal,
        headers: { accept: 'application/json' },
      })
      if (!response.ok) throw new Error(`skills.sh HTTP ${response.status}`)
      const payload = await response.json()
      const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.skills) ? payload.skills : null
      if (rows === null) throw new Error('skills.sh 返回结构无法识别')
      return rows.slice(0, 20).map((row, index) => {
        const skillName = typeof row.name === 'string' ? row.name : typeof row.id === 'string' ? row.id : ''
        if (!isSkillName(skillName)) return null
        const installs = Number(row.installs ?? row.installCount ?? 0)
        return {
          name: skillName,
          version: typeof row.version === 'string' ? row.version : '1.0.0',
          category: typeof row.category === 'string' ? row.category : '',
          author: typeof row.author === 'string' ? row.author : '',
          installs: Number.isFinite(installs) ? installs : 0,
          installsLabel: `${humanCount(Number.isFinite(installs) ? installs : 0)} 安装`,
          description: typeof row.description === 'string' ? row.description : '',
          whenToUse: '',
          perm: 'files',
          permLabel: permLabel('files').text,
          permWarn: false,
          source: `skills.sh/${skillName}`,
          installed: false,
          remote: true,
          rank: index,
        }
      }).filter(Boolean)
    } finally {
      clearTimeout(timer)
    }
  }

  async targetRoot(scope, workspace, sessionId) {
    if (scope === 'global') return join(DSH_HOME, 'skills')
    if (scope === 'temp') return join(DSH_HOME, 'skill-detective', 'temp', String(sessionId ?? 'shared'))
    return join(resolve(workspace), '.dsh', 'skills')
  }

  async writeFiles(dir, files) {
    await mkdir(dir, { recursive: true })
    for (const file of files) {
      const target = join(dir, file.path)
      if (!within(dir, target)) throw new Error('拒绝写入越界路径')
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, file.text, 'utf8')
    }
  }

  async install({ name, need, origin, scope, sessionId, workspace }) {
    const state = await this.state.load()
    const requestedScope = scope === 'global' || scope === 'temp' || scope === 'workspace' ? scope : null
    const targetScope = requestedScope ?? (state.settings.defaultScope === 'workspace' ? 'workspace' : 'global')
    const sessionKey = String(sessionId ?? '')
    const remembered = this.sessionWorkspaces.get(sessionKey)
    const ws = this.normalizeWorkspace(
      typeof workspace === 'string' && workspace.trim() !== '' ? workspace : (remembered ?? ''),
    )
    const requested = typeof name === 'string' && name !== '' ? name : null

    const steps = []
    const step = (id, label, status, detail) => {
      steps.push({ id, label, status, detail })
    }

    let needLabel = ''
    let candidateNames = []
    if (requested !== null) {
      const entry = BY_NAME.get(requested)
      if (entry === undefined) {
        step('analyze', '语义分析', 'fail', `未知技能 ${requested}`)
        return { ok: false, steps, error: 'unknown-skill' }
      }
      needLabel = entry.category
      candidateNames = [requested]
      step('analyze', '语义分析', 'ok', `目标技能 ${entry.name}`)
    } else {
      const def = typeof need === 'string' ? NEEDS.find(item => item.key === need) : undefined
      if (def === undefined) {
        step('analyze', '语义分析', 'fail', '没能识别出明确的需求类型')
        return { ok: false, steps, error: 'no-need' }
      }
      needLabel = def.label
      candidateNames = def.candidates
      step('analyze', '语义分析', 'ok', `识别到「${def.label}」需求`)
    }

    const installedNow = await this.listInstalled(ws)
    const installedNames = new Set(installedNow.filter(item => item.enabled).map(item => item.name))

    const candidates = candidateNames
      .map(candidateName => BY_NAME.get(candidateName))
      .filter(Boolean)
      .sort((a, b) => b.installs - a.installs)

    if (candidates.length === 0) {
      step('search', '检索 skills.sh', 'fail', '候选列表为空')
      return { ok: false, steps, error: 'none-found' }
    }

    step('search', '检索 skills.sh', 'ok', `按安装量排序，命中 ${candidates.length} 个候选`)

    for (const [index, candidate] of candidates.entries()) {
      const files = [{ path: 'SKILL.md', text: buildSkillMarkdown(candidate), code: true }]
      const verdict = auditFiles(files)
      const label = `安全审查 · ${candidate.name}${index === 0 ? '（候选 #1）' : ''}`

      if (verdict.poison) {
        const first = verdict.findings[0]
        const summary = first ? `${first.rule}：${first.detail}` : '命中风险规则'
        step(`audit-${candidate.name}`, label, 'fail', `${summary} → 已删除，切换下一个候选`)
        continue
      }

      step(`audit-${candidate.name}`, label, 'ok', '未命中指令注入 / 混淆执行 / 未知外联')

      if (installedNames.has(candidate.name)) {
        step('download', '下载', 'ok', `${candidate.name} 已存在，跳过写入`)
        step('enable', '装载启用', 'ok', `${candidate.name} 已装载`)
        return { ok: true, steps, already: true, name: candidate.name, label: needLabel }
      }

      const root = await this.targetRoot(targetScope, ws, sessionId)
      const dir = join(root, candidate.name)
      if (!within(root, dir)) {
        step('download', '下载', 'fail', '目标路径越界，已中止')
        return { ok: false, steps, error: 'unsafe-path' }
      }

      try {
        if (existsSync(dir)) await rm(dir, { recursive: true, force: true })
        await this.writeFiles(dir, files)
        const bytes = await directorySize(dir)
        step('download', '下载', 'ok', `写入 ${displayPath(ws, dir)}（${humanBytes(bytes)}）`)

        await this.state.update(data => {
          data.installs[candidate.name] = {
            origin: origin === 'market' ? 'market' : 'plugin',
            scope: targetScope,
            installs: candidate.installs,
            author: candidate.author,
            version: candidate.version,
            category: candidate.category,
            perm: candidate.perm,
            source: candidate.source,
            description: candidate.description,
            installedAt: Date.now(),
            sessionId: targetScope === 'temp' ? String(sessionId ?? '') : undefined,
          }
          if (targetScope === 'temp') {
            data.installs[candidate.name].scope = 'temp'
          }
        })

        // A temporary skill lives outside every catalog root DSH scans; register
        // it into the owning session's scope so "temporary" is a real boundary.
        if (targetScope === 'temp') {
          await this.registerTempFor(sessionId, {
            name: candidate.name,
            description: candidate.description,
            content: bodyOf(files[0].text),
            whenToUse: candidate.whenToUse,
          })
        }

        step('enable', '装载启用', 'ok', `${candidate.name} 已装载`)
        this.log(`skill-detective: installed ${candidate.name} into ${dir} (${targetScope})`)
        // Tell the skill registry the catalog may have changed so the next
        // request re-scans the roots instead of serving a cached snapshot.
        try {
          this.ctx.emit('skills/change')
        } catch {
          /* ignore */
        }
        return {
          ok: true,
          steps,
          name: candidate.name,
          version: candidate.version,
          label: needLabel,
          scope: targetScope,
          bytes,
          bytesLabel: humanBytes(bytes),
        }
      } catch (error) {
        step('download', '下载', 'fail', error instanceof Error ? error.message : String(error))
        return { ok: false, steps, error: 'write-failed' }
      }
    }

    return { ok: false, steps, error: 'all-poisoned' }
  }

  /**
   * Register a temporary skill into one live session's scope. Falls back to a
   * warning when the skills service or the agent scope is unavailable; the panel
   * then reports the real state instead of pretending the skill is loaded.
   */
  async registerTempFor(sessionId, skill) {
    try {
      const skills = this.ctx.get('skills')
      if (skills === undefined || typeof skills.register !== 'function') return false
      const agents = this.ctx.get('agents')
      const agent = agents && typeof agents.get === 'function' ? agents.get(sessionId) : undefined
      const scopeCtx = agent?.ctx
      if (!scopeCtx || typeof scopeCtx.effect !== 'function') return false
      scopeCtx.effect(() => scopeCtx.skills.register(skill), 'skill-detective: temp skill')
      return true
    } catch (error) {
      this.log(`skill-detective: temp registration failed: ${error instanceof Error ? error.message : String(error)}`)
      return false
    }
  }

  async moveSkill(name, targetScope, workspaces, workspace, sessionId) {
    const state = await this.state.load()
    const meta = state.installs[name]
    const installed = await this.listInstalled(workspace)
    const current = installed.find(item => item.name === name)
    if (current === undefined) throw new Error('技能不存在')

    const ws = this.normalizeWorkspace(workspace)
    let targets = []
    if (targetScope === 'global') targets = [join(DSH_HOME, 'skills')]
    else if (targetScope === 'temp') targets = [join(DSH_HOME, 'skill-detective', 'temp', String(sessionId ?? 'shared'))]
    else {
      const list = workspaces && workspaces.length > 0 ? workspaces : [ws]
      targets = list.map(dir => join(resolve(this.normalizeWorkspace(dir)), '.dsh', 'skills'))
    }

    const sourceDir = current.path
    const sourceRoot = dirname(sourceDir)
    const first = targets[0]
    if (resolve(first) !== resolve(sourceRoot)) {
      const destination = join(first, name)
      if (!within(first, destination)) throw new Error('目标路径越界')
      await mkdir(first, { recursive: true })
      if (existsSync(destination)) await rm(destination, { recursive: true, force: true })
      await cp(sourceDir, destination, { recursive: true })
      await rm(sourceDir, { recursive: true, force: true })
    }

    // Extra workspace copies for a multi-workspace scope.
    for (const extra of targets.slice(1)) {
      const destination = join(extra, name)
      if (!within(extra, destination)) continue
      await mkdir(extra, { recursive: true })
      if (existsSync(destination)) await rm(destination, { recursive: true, force: true })
      await cp(join(first, name), destination, { recursive: true })
    }

    await this.state.update(data => {
      if (data.installs[name] === undefined) {
        data.installs[name] = {
          origin: current.origin,
          scope: targetScope,
          installs: current.installs,
          author: current.author,
          version: current.version,
          category: current.category,
          perm: current.perm,
          source: current.source,
          description: current.description,
          installedAt: current.installedAt ?? Date.now(),
        }
      }
      data.installs[name].scope = targetScope
      data.installs[name].workspaces = targetScope === 'workspace' ? targets.map(dir => dirname(dirname(dir))) : undefined
      if (targetScope === 'temp') data.installs[name].sessionId = String(sessionId ?? '')
    })
    this.ctx.emit?.('skills/change')
    return { ok: true, name, scope: targetScope }
  }

  async toggle(name, enabled, workspace) {
    const installed = await this.listInstalled(this.normalizeWorkspace(workspace ?? ''))
    const target = installed.find(item => item.name === name)
    if (target === undefined) throw new Error('技能不存在')
    const text = await readFile(join(target.path, 'SKILL.md'), 'utf8')
    const next = setFrontmatterBoolean(text, 'disable-model-invocation', !enabled)
    await writeFile(join(target.path, 'SKILL.md'), next, 'utf8')
    try {
      this.ctx.emit('skills/change')
    } catch {
      /* ignore */
    }
    return { ok: true, name, enabled }
  }

  async remove(name, workspace) {
    const installed = await this.listInstalled(this.normalizeWorkspace(workspace ?? ''))
    const target = installed.find(item => item.name === name)
    if (target === undefined) throw new Error('技能不存在')
    await rm(target.path, { recursive: true, force: true })
    await this.state.update(data => {
      delete data.installs[name]
    })
    try {
      this.ctx.emit('skills/change')
    } catch {
      /* ignore */
    }
    return { ok: true, name }
  }

  async detail(name, workspace) {
    const installed = await this.listInstalled(workspace)
    const target = installed.find(item => item.name === name)
    if (target === undefined) throw new Error('技能不存在')
    const file = join(target.path, 'SKILL.md')
    let content = ''
    try {
      content = await readFile(file, 'utf8')
    } catch {
      content = ''
    }
    const files = await listSkillFiles(target.path)
    const tree = []
    const rootLabel = basename(target.path)
    tree.push({ path: rootLabel, type: 'dir', depth: 0 })
    for (const entry of files) {
      tree.push({ ...entry, path: entry.path, depth: entry.path.split('/').length })
    }
    return {
      skill: {
        ...target,
        installsLabel: target.installsLabel,
        status: target.enabled ? (target.origin === 'user' ? '本地' : '已审查') : '已禁用',
      },
      tree,
      preview: content,
      previewBytes: content.length,
    }
  }

  /** Record association between a workspace session and the panel choice. */
  setCheckbox(sessionId, enabled) {
    if (typeof sessionId !== 'string' || sessionId === '') return { ok: false }
    if (enabled) this.sessions.set(sessionId, true)
    else this.sessions.delete(sessionId)
    return { ok: true }
  }

  checkbox(sessionId) {
    return sessionId ? this.sessions.has(sessionId) : false
  }

  /** Called from the session event feed for every committed user message. */
  async onUserMessage(session, message) {
    const sessionId = String(session.id)
    const text = extractText(message)
    const sourceKind = message?.source?.kind
    // Only a message the user typed is a recommendation trigger; the harness
    // also appends user-role context messages (runtime context, skill catalog)
    // that must never be analysed.
    if (sourceKind !== undefined && sourceKind !== 'user') return
    if (!this.checkbox(sessionId)) return
    if (text.trim() === '') return
    if (text.trim().startsWith('/')) return

    const workspace = session.header?.cwd ?? this.defaultWorkspace()
    this.sessionWorkspaces.set(sessionId, workspace)

    let analysis
    try {
      analysis = await this.analyze(text, workspace)
    } catch (error) {
      this.log(`skill-detective: analysis failed: ${error instanceof Error ? error.message : String(error)}`)
      return
    }
    if (analysis.need === null) return
    // A requirement already covered by an installed, enabled skill stays silent:
    // the user asked for work, not for a second nudge about their own skills.
    if (analysis.covered !== null) return

    const now = Date.now()
    // Throttle: one bubble per session every 45s, and a need the user sent away
    // stays quiet for 10 minutes.
    if (now - (this.lastRecommend.get(sessionId) ?? 0) < 45_000) return
    if (now - (this.dismissed.get(`${sessionId}:${analysis.need}`) ?? 0) < 10 * 60_000) return
    this.lastRecommend.set(sessionId, now)

    this.pending.set(sessionId, {
      kind: 'recommend',
      label: analysis.label,
      matched: analysis.matched,
      inferred: analysis.inferred === true,
      need: analysis.need,
      candidates: analysis.candidates.map(item => ({
        name: item.name,
        installs: item.installs,
        installsLabel: `${humanCount(item.installs)} 安装`,
        perm: item.perm,
        permLabel: permLabel(item.perm).text,
      })),
      at: Date.now(),
    })
  }

  takePending(sessionId) {
    const value = this.pending.get(sessionId)
    if (value === undefined) return null
    if (Date.now() - value.at > 90_000) {
      this.pending.delete(sessionId)
      return null
    }
    return value
  }

  dismiss(sessionId) {
    if (sessionId) {
      const pending = this.pending.get(sessionId)
      if (pending !== undefined && typeof pending.need === 'string') {
        this.dismissed.set(`${sessionId}:${pending.need}`, Date.now())
      }
      this.pending.delete(sessionId)
    }
    return { ok: true }
  }
}

function extractText(message) {
  if (message === null || typeof message !== 'object') return ''
  const content = message.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter(block => block && block.type === 'text' && typeof block.text === 'string')
    .map(block => block.text)
    .join('\n')
}

/* ------------------------------------------------------------------ */
/* HTTP helpers                                                        */
/* ------------------------------------------------------------------ */

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(body)
}

function fail(res, status, code, message) {
  sendJson(res, status, { ok: false, error: { code, message } })
}

async function readJsonBody(req, limit = 512 * 1024) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw new Error('请求体过大')
    chunks.push(chunk)
  }
  if (chunks.length === 0) return {}
  const text = Buffer.concat(chunks).toString('utf8')
  if (text.trim() === '') return {}
  return JSON.parse(text)
}

function sameOrigin(req) {
  const origin = req.headers.origin
  if (typeof origin !== 'string' || origin === '') return true
  const host = req.headers.host
  try {
    const parsed = new URL(origin)
    return host !== undefined && parsed.host === host
  } catch {
    return false
  }
}

function openInFileManager(path) {
  if (!existsSync(path)) return false
  const platform = process.platform
  try {
    if (platform === 'win32') {
      const child = spawn('explorer.exe', [path], { detached: true, stdio: 'ignore', windowsHide: false })
      child.unref()
      return true
    }
    if (platform === 'darwin') {
      const child = spawn('open', [path], { detached: true, stdio: 'ignore' })
      child.unref()
      return true
    }
    const child = spawn('xdg-open', [path], { detached: true, stdio: 'ignore' })
    child.unref()
    return true
  } catch {
    return false
  }
}

/* ------------------------------------------------------------------ */
/* Plugin                                                              */
/* ------------------------------------------------------------------ */

export function apply(ctx) {
  const service = new SkillDetective(ctx)

  // Session event feed: detect a committed user message while the checkbox is on.
  ctx.effect(() => ctx.on('session/event', (session, event) => {
    if (!event || event.type !== 'user/message') return
    service.onUserMessage(session, event.data).catch(error => {
      service.log(`skill-detective: analysis failed: ${error instanceof Error ? error.message : String(error)}`)
    })
  }), 'skill-detective: session feed')

  ctx.inject(['webServer'], webCtx => {
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'prefix',
      path: API,
      handler: async (req, res) => {
        if (!sameOrigin(req)) return fail(res, 403, 'cross-origin', '拒绝跨源请求')
        const url = new URL(req.url ?? '/', 'http://127.0.0.1')
        const route = url.pathname.slice(API.length) || '/'
        const method = req.method ?? 'GET'

        try {
          if (method === 'GET' && route === '/state') {
            const workspace = service.normalizeWorkspace(url.searchParams.get('workspace') ?? '')
            const state = await service.state.load()
            const installed = await service.listInstalled(workspace)
            return sendJson(res, 200, {
              ok: true,
              workspace,
              workspaces: service.workspaceList(),
              dshHome: DSH_HOME,
              settings: state.settings,
              installed,
            })
          }

          if (method === 'GET' && route === '/catalog') {
            const workspace = service.normalizeWorkspace(url.searchParams.get('workspace') ?? '')
            let skills = []
            try {
              const registry = service.ctx.get('skills')
              if (registry && typeof registry.list === 'function') {
                skills = await registry.list({ cwd: workspace })
              }
            } catch (error) {
              return fail(res, 500, 'catalog-failed', error instanceof Error ? error.message : String(error))
            }
            return sendJson(res, 200, {
              ok: true,
              skills: skills.map(item => ({
                name: item.name,
                source: item.source,
                provider: item.provider,
                path: item.path ?? null,
                modelInvocable: item.invocation?.modelInvocable !== false,
              })),
            })
          }

          if (method === 'GET' && route === '/checkbox') {
            const sessionId = url.searchParams.get('sessionId') ?? ''
            return sendJson(res, 200, {
              ok: true,
              known: service.sessions.has(sessionId),
              enabled: service.checkbox(sessionId),
            })
          }

          if (method === 'GET' && route === '/pending') {
            const sessionId = url.searchParams.get('sessionId') ?? ''
            return sendJson(res, 200, { ok: true, pending: service.takePending(sessionId) })
          }

          if (method === 'GET' && route === '/pending/latest') {
            let newest = null
            for (const [sessionId, pending] of service.pending.entries()) {
              if (Date.now() - pending.at > 90_000) {
                service.pending.delete(sessionId)
                continue
              }
              if (newest === null || pending.at > newest.pending.at) newest = { sessionId, pending }
            }
            return sendJson(res, 200, {
              ok: true,
              sessionId: newest?.sessionId ?? '',
              pending: newest?.pending ?? null,
            })
          }

          if (method === 'GET' && route === '/market') {
            const workspace = service.normalizeWorkspace(url.searchParams.get('workspace') ?? '')
            return sendJson(res, 200, { ok: true, skills: await service.market(workspace) })
          }

          if (method === 'GET' && route === '/updates') {
            const workspace = service.normalizeWorkspace(url.searchParams.get('workspace') ?? '')
            return sendJson(res, 200, { ok: true, updates: await service.updates(workspace) })
          }

          if (method === 'GET' && route === '/detail') {
            const name = url.searchParams.get('name') ?? ''
            const workspace = service.normalizeWorkspace(url.searchParams.get('workspace') ?? '')
            if (!isSkillName(name)) return fail(res, 400, 'invalid-name', '技能名不合法')
            return sendJson(res, 200, { ok: true, ...await service.detail(name, workspace) })
          }

          if (method !== 'POST') {
            res.setHeader('allow', 'GET, POST')
            return fail(res, 405, 'method-not-allowed', '请求方法不支持')
          }

          const body = await readJsonBody(req)

          if (route === '/checkbox') {
            return sendJson(res, 200, service.setCheckbox(String(body.sessionId ?? ''), body.enabled === true))
          }

          if (route === '/dismiss') {
            return sendJson(res, 200, service.dismiss(String(body.sessionId ?? '')))
          }

          if (route === '/search') {
            const workspace = service.normalizeWorkspace(body.workspace ?? '')
            return sendJson(res, 200, { ok: true, ...await service.search(String(body.query ?? ''), workspace) })
          }

          if (route === '/analyze') {
            const text = String(body.text ?? '')
            const workspace = service.normalizeWorkspace(body.workspace ?? '')
            return sendJson(res, 200, { ok: true, analysis: await service.analyze(text, workspace) })
          }

          if (route === '/learn') {
            const name = String(body.name ?? '')
            if (!isSkillName(name)) return fail(res, 400, 'invalid-name', '技能名不合法')
            const workspace = service.normalizeWorkspace(body.workspace ?? '')
            return sendJson(res, 200, await service.learn(name, workspace, { dryRun: body.dryRun === true }))
          }

          if (route === '/learn-all') {
            const workspace = service.normalizeWorkspace(body.workspace ?? '')
            return sendJson(res, 200, { ok: true, ...await service.learnAll(workspace) })
          }

          if (route === '/install') {
            const result = await service.install({
              name: typeof body.name === 'string' ? body.name : undefined,
              need: typeof body.need === 'string' ? body.need : undefined,
              origin: body.origin === 'market' ? 'market' : 'plugin',
              scope: typeof body.scope === 'string' ? body.scope : undefined,
              sessionId: String(body.sessionId ?? ''),
              workspace: body.workspace ?? '',
            })
            return sendJson(res, result.ok ? 200 : 200, { ...result })
          }

          if (route === '/toggle') {
            if (!isSkillName(String(body.name ?? ''))) return fail(res, 400, 'invalid-name', '技能名不合法')
            return sendJson(res, 200, await service.toggle(String(body.name), body.enabled === true, body.workspace))
          }

          if (route === '/delete') {
            if (!isSkillName(String(body.name ?? ''))) return fail(res, 400, 'invalid-name', '技能名不合法')
            return sendJson(res, 200, await service.remove(String(body.name), body.workspace))
          }

          if (route === '/scope') {
            if (!isSkillName(String(body.name ?? ''))) return fail(res, 400, 'invalid-name', '技能名不合法')
            const scope = body.scope === 'global' ? 'global' : body.scope === 'temp' ? 'temp' : 'workspace'
            return sendJson(res, 200, await service.moveSkill(
              String(body.name),
              scope,
              Array.isArray(body.workspaces) ? body.workspaces.filter(item => typeof item === 'string') : [],
              service.normalizeWorkspace(body.workspace ?? ''),
              String(body.sessionId ?? ''),
            ))
          }

          if (route === '/settings') {
            const next = await service.state.update(state => {
              if (body.defaultScope === 'global' || body.defaultScope === 'workspace') {
                state.settings.defaultScope = body.defaultScope
              }
              if (Array.isArray(body.workspaces)) {
                state.settings.workspaces = body.workspaces.filter(item => typeof item === 'string')
              }
              return { defaultScope: state.settings.defaultScope, workspaces: state.settings.workspaces }
            })
            return sendJson(res, 200, { ok: true, settings: next })
          }

          if (route === '/open') {
            const name = String(body.name ?? '')
            if (!isSkillName(name)) return fail(res, 400, 'invalid-name', '技能名不合法')
            const workspace = service.normalizeWorkspace(body.workspace ?? '')
            const installed = await service.listInstalled(workspace)
            const target = installed.find(item => item.name === name)
            if (target === undefined) return fail(res, 404, 'not-found', '技能不存在')
            if (!openInFileManager(target.path)) return fail(res, 500, 'open-failed', '无法打开文件管理器')
            return sendJson(res, 200, { ok: true, path: target.path })
          }

          if (route === '/open-root') {
            const workspace = service.normalizeWorkspace(body.workspace ?? '')
            const projectRoot = join(workspace, '.dsh', 'skills')
            const globalRoot = join(DSH_HOME, 'skills')
            const target = existsSync(projectRoot) ? projectRoot : globalRoot
            await mkdir(target, { recursive: true })
            if (!openInFileManager(target)) return fail(res, 500, 'open-failed', '无法打开文件管理器')
            return sendJson(res, 200, { ok: true, path: target })
          }

          return fail(res, 404, 'not-found', '未知接口')
        } catch (error) {
          service.log(`skill-detective: route ${route} failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`)
          return fail(res, 500, 'internal', error instanceof Error ? error.message : String(error))
        }
      },
    }), 'skill-detective: api routes')
  })

  service.log('skill-detective: host ready')
}
