/**
 * Extra marketplace entries.
 *
 * Kept beside the base catalog in `index.js` so the market can grow without
 * turning the host module into one giant literal. Every entry carries a real
 * SKILL.md body: installing one writes that body to disk, and the security
 * audit scans it exactly like the base entries.
 *
 * Bodies avoid inline backticks so they stay plain template strings; command
 * snippets use four-space indented blocks, which Markdown renders as code.
 */
export const EXTRA_CATALOG = [
  {
    name: 'markdown-writer',
    version: '1.3.0',
    category: '文档',
    author: '@docs-lab',
    installs: 15600,
    perm: 'files',
    description: 'Markdown 文档生成、批量转换与目录维护',
    whenToUse: '需要撰写或批量转换 Markdown 文档、生成目录、检查标题层级时使用。',
    source: 'skills.sh/markdown-writer',
    body: `# markdown-writer

Markdown 文档的写作与批处理。

## 固定流程

1. 先定大纲：一级标题只出现一次，二级按章节，层级不跳级。
2. 写正文：段间空一行，列表与表格前后也留空行。
3. 生成目录：按标题层级抓取，链接用锚点形式。
4. 校验：标题层级、空链接、表格列数一致性。

## 批量转换

    pandoc input.docx -t gfm -o output.md
    pandoc notes/*.md -o notes.pdf

## 检查清单

| 项 | 判据 |
| --- | --- |
| 标题 | 无跳级、无重复一级标题 |
| 链接 | 无空链接、相对路径可解析 |
| 表格 | 每行列数一致 |
| 代码块 | 标注语言 |

## 验收

- 渲染后目录层级与正文一致；
- 所有相对链接在仓库内可打开；
- 表格在窄窗口下不破版。`,
  },
  {
    name: 'html-report',
    version: '2.1.0',
    category: '文档',
    author: '@webdocs',
    installs: 11200,
    perm: 'files',
    description: '单文件 HTML 报告，内联样式与图表',
    whenToUse: '需要产出可直接双击打开的单文件 HTML 报告（含表格、图表）时使用。',
    source: 'skills.sh/html-report',
    body: `# html-report

生成不依赖外部资源的单文件 HTML 报告。

## 结构

1. 头部：标题、生成时间、数据来源。
2. 摘要区：3 到 5 条结论，直接给数字。
3. 正文：表格与图表分区，每块带小标题。
4. 附录：原始数据、计算口径。

## 实现要点

- CSS 内联在 style 标签里，不引用 CDN。
- 图表用 canvas 或内联 SVG 绘制，避免外部脚本。
- 中文字体回退链写全，避免方框。

    <style>
    body{font-family:system-ui,"Microsoft YaHei",sans-serif;margin:32px}
    table{border-collapse:collapse}td,th{border:1px solid #ddd;padding:6px 10px}
    </style>

## 验收

- 断网状态下双击可正常显示；
- 打印预览无截断；
- 数字与源数据一致，保留位数写明。`,
  },
  {
    name: 'csv-tools',
    version: '1.0.8',
    category: '数据',
    author: '@data-tools',
    installs: 9700,
    perm: 'files',
    description: 'CSV 读写、编码转换与分隔符处理',
    whenToUse: '需要读取、清洗或合并 CSV，或处理编码与分隔符异常时使用。',
    source: 'skills.sh/csv-tools',
    body: `# csv-tools

CSV 的读写与格式排障。

## 先判三件事

1. 编码：UTF-8、GBK 还是带 BOM。
2. 分隔符：逗号、分号还是制表符。
3. 引号：字段内是否含分隔符或换行。

## 常用操作

    python -c "import pandas as pd;df=pd.read_csv('in.csv',encoding='utf-8-sig');print(df.head())"
    iconv -f GBK -t UTF-8 in.csv > out.csv

## 合并

- 列名先对齐，再纵向拼接；
- 记录来源文件列，方便回溯；
- 合并后统计行数与去重前后差异。

## 验收

- Excel 打开无乱码、无错列；
- 行数与源文件之和一致（或写明过滤条件）；
- 含换行的字段完整保留。`,
  },
  {
    name: 'json-formatter',
    version: '1.2.1',
    category: '数据',
    author: '@data-tools',
    installs: 13400,
    perm: 'files',
    description: 'JSON 校验、格式化与路径提取',
    whenToUse: '需要校验、格式化、压缩 JSON，或按路径提取字段时使用。',
    source: 'skills.sh/json-formatter',
    body: `# json-formatter

JSON 的处理与排错。

## 排错顺序

1. 先用解析器定位行列：错误信息通常给出字符偏移。
2. 常见原因：尾逗号、单引号、未转义换行、注释。
3. 大文件不要整读，按行流式处理。

## 常用命令

    python -m json.tool in.json > pretty.json
    node -e "const d=require('./in.json');console.log(d.items.length)"

## 路径提取

- 点号路径 a.b.c 对应嵌套对象；
- 数组用索引 a.items.0.name；
- 不存在的路径返回 null，不要静默当空字符串。

## 验收

- 格式化后重新解析通过；
- 提取结果条数与预期一致；
- 中文不转义或按需转义，保持一致性。`,
  },
  {
    name: 'data-cleaner',
    version: '1.6.0',
    category: '数据',
    author: '@data-tools',
    installs: 7800,
    perm: 'files',
    description: '缺失值、重复行与类型清洗',
    whenToUse: '拿到脏数据需要统一缺失值、去重、类型转换与异常值处理时使用。',
    source: 'skills.sh/data-cleaner',
    body: `# data-cleaner

数据清洗的标准步骤。

## 顺序

1. 概览：行列数、每列空值率、唯一值数量。
2. 去重：先按完整行，再按业务主键。
3. 类型：数字列去单位、日期列统一格式。
4. 缺失：删除、填充或标记，三选一并写明理由。
5. 异常：按分位数或业务阈值标记，不直接删除。

## 报表

    df.isna().mean().sort_values(ascending=False)
    df.duplicated(subset=['id']).sum()

## 验收

- 清洗前后行数与空值率对照表；
- 类型转换后的样例值打印确认；
- 每条规则有可复现的脚本。`,
  },
  {
    name: 'chart-maker',
    version: '1.1.2',
    category: '数据',
    author: '@data-tools',
    installs: 8900,
    perm: 'files',
    description: '从数据生成柱状图、折线图与饼图',
    whenToUse: '需要把表格数据快速画成柱状图、折线图或饼图并导出图片时使用。',
    source: 'skills.sh/chart-maker',
    body: `# chart-maker

数据可视化的快速产出。

## 选型

| 目的 | 图型 |
| --- | --- |
| 比大小 | 柱状图 |
| 看趋势 | 折线图 |
| 看占比 | 饼图或堆叠条 |
| 看分布 | 直方图 |

## 实现

    import matplotlib.pyplot as plt
    plt.rcParams['font.sans-serif'] = ['Microsoft YaHei']
    plt.bar(labels, values)
    plt.tight_layout()
    plt.savefig('chart.png', dpi=160)

## 规范

- 轴标题与单位必写；
- 颜色不超过五种；
- 数值标签只在关键柱上标。

## 验收

- 图中数字与源表一致；
- 中文标签不出现方框；
- 导出图在 100% 缩放下可读。`,
  },
  {
    name: 'docker-helper',
    version: '1.0.5',
    category: '开发',
    author: '@devops-lab',
    installs: 16300,
    perm: 'command',
    description: 'Dockerfile 优化、镜像瘦身与 compose 编排',
    whenToUse: '需要写或优化 Dockerfile、排查镜像体积、编写 compose 编排时使用。',
    source: 'skills.sh/docker-helper',
    body: `# docker-helper

容器镜像与编排的实操要点。

## Dockerfile 顺序

1. 选基础镜像：优先 slim 或 alpine，标明版本。
2. 先拷贝依赖清单并安装，再拷贝源码，利用层缓存。
3. 合并 RUN，清理缓存目录。
4. 非 root 用户运行，声明 EXPOSE 与 ENTRYPOINT。

## 常见问题

| 现象 | 处理 |
| --- | --- |
| 镜像过大 | 多阶段构建，只拷产物 |
| 构建慢 | 依赖层前置，避免频繁失效 |
| 时区不对 | 安装 tzdata 并设 TZ |

## 排查命令

    docker image history myapp:latest
    docker compose config

## 验收

- 镜像可构建且体积在预期内；
- 容器内进程非 root；
- compose 文件通过 config 校验。`,
  },
  {
    name: 'api-mock',
    version: '1.3.4',
    category: '开发',
    author: '@api-lab',
    installs: 10100,
    perm: 'network',
    description: '快速搭建 Mock HTTP 接口与示例数据',
    whenToUse: '前端联调或缺后端时，需要快速提供 Mock 接口与响应数据时使用。',
    source: 'skills.sh/api-mock',
    body: `# api-mock

为联调提供可预测的 Mock 接口。

## 流程

1. 收集接口清单：路径、方法、请求字段、响应结构。
2. 用静态 JSON 起步，每个路径一个文件。
3. 需要分页与筛选时，用简单脚本按查询参数裁剪数据。
4. 固定延迟 200 毫秒，模拟真实网络。

## 组织方式

    mocks/
      users.json
      orders.json
      server.js

## 约定

- 错误分支也要有：400、404、500 各准备一个样例；
- 响应字段名与真实接口一致，避免联调后改名；
- 时间字段用 ISO 8601 字符串。

## 验收

- 每个接口可用命令行请求通；
- 分页与筛选结果正确；
- 错误分支返回结构一致。`,
  },
  {
    name: 'regex-tester',
    version: '1.0.2',
    category: '开发',
    author: '@devtools',
    installs: 6400,
    perm: 'files',
    description: '正则调试、批量替换与安全回溯检查',
    whenToUse: '需要编写或调试正则、批量替换文本、评估回溯风险时使用。',
    source: 'skills.sh/regex-tester',
    body: `# regex-tester

正则的编写、验证与批量替换。

## 步骤

1. 先写最小匹配样例，确认命中。
2. 再补边界：行首行尾、前后断言。
3. 用反例验证不误伤。
4. 批量替换前先在副本上跑一遍。

## 风险点

- 嵌套量词容易回溯爆炸，用具体字符集替代点星；
- 多行文本记得开启多行模式；
- 替换串里的特殊字符要转义。

## 命令

    python -c "import re;print(re.findall(r'\\d{4}-\\d{2}-\\d{2}', open('a.txt',encoding='utf-8').read()))"

## 验收

- 正例全命中，反例全不命中；
- 大文本下耗时在可接受范围；
- 替换前备份，替换后抽查差异。`,
  },
  {
    name: 'code-review',
    version: '2.0.0',
    category: '开发',
    author: '@devtools',
    installs: 19800,
    perm: 'files',
    description: '代码审查清单与 diff 风险分析',
    whenToUse: '需要审查一段改动、给出问题清单、判断回归风险时使用。',
    source: 'skills.sh/code-review',
    body: `# code-review

按清单审查改动，先看风险再看风格。

## 审查顺序

1. 看 diff 范围：是否包含无关文件与生成物。
2. 看行为变化：异常分支、边界值、并发与空值。
3. 看资源：连接、文件句柄、定时器是否释放。
4. 看测试：新增行为是否有对应用例。
5. 最后才是命名与格式。

## 输出格式

| 级别 | 说明 | 位置 |
| --- | --- | --- |
| 阻塞 | 会导致错误或数据损坏 | 文件:行 |
| 建议 | 可维护性问题 | 文件:行 |
| 提问 | 需要作者确认 | 文件:行 |

## 验收

- 每条问题能指到具体行；
- 阻塞项给出可执行修复方向；
- 不把风格偏好列为阻塞。`,
  },
  {
    name: 'unit-test-helper',
    version: '1.2.3',
    category: '开发',
    author: '@devtools',
    installs: 12600,
    perm: 'command',
    description: '单元测试骨架、断言与覆盖率补全',
    whenToUse: '需要为新函数补单元测试、搭测试骨架或提升覆盖率时使用。',
    source: 'skills.sh/unit-test-helper',
    body: `# unit-test-helper

补测试的标准流程。

## 流程

1. 列出公开行为：输入、输出、副作用。
2. 每个行为至少一个正例和一个反例。
3. 边界：空值、零、最大值、重复键。
4. 外部依赖用桩替代，测试不访问网络与真实数据库。
5. 跑覆盖率，只补有分支未覆盖的用例。

## 结构

    describe('parseRange', () => {
      it('accepts a closed range', () => {
        expect(parseRange('1-3')).toEqual([1, 2, 3])
      })
      it('rejects an inverted range', () => {
        expect(() => parseRange('3-1')).toThrow()
      })
    })

## 验收

- 断言具体到值，不用只判断真假；
- 测试互不依赖，可单独运行；
- 失败信息能定位到行为。`,
  },
  {
    name: 'log-analyzer',
    version: '1.1.0',
    category: '开发',
    author: '@devtools',
    installs: 5900,
    perm: 'files',
    description: '日志解析、错误聚合与故障时间线',
    whenToUse: '需要从大量日志中定位异常、聚合错误、还原故障时间线时使用。',
    source: 'skills.sh/log-analyzer',
    body: `# log-analyzer

日志排障的固定套路。

## 步骤

1. 先看时间范围与日志级别分布。
2. 按错误码或异常类型聚合计数，找出现最多的。
3. 抽一条完整堆栈，往上找触发点。
4. 用时间线把相关模块的日志串起来。

## 命令

    grep -c "ERROR" app.log
    awk '{print $3}' app.log | sort | uniq -c | sort -rn | head -20

## 注意

- 先确认时区一致，否则时间线错位；
- 采样日志只能看趋势，不能当完整证据；
- 敏感字段（token、手机号）在报告里脱敏。

## 验收

- 能给出首个异常时间点；
- 聚合结果可复现；
- 结论对应到具体日志行。`,
  },
  {
    name: 'db-migrate',
    version: '1.4.1',
    category: '开发',
    author: '@data-tools',
    installs: 7200,
    perm: 'command',
    description: '数据库迁移脚本编写与回滚',
    whenToUse: '需要为表结构变更编写迁移与回滚脚本、评估锁表风险时使用。',
    source: 'skills.sh/db-migrate',
    body: `# db-migrate

结构变更的迁移与回滚。

## 原则

1. 每次迁移只做一件事，可独立回滚。
2. 先加列后写数据，最后才加约束。
3. 大表改结构先评估锁表时间，必要时分批。
4. 迁移脚本与回滚脚本成对提交。

## 模板

    -- up
    ALTER TABLE orders ADD COLUMN channel VARCHAR(32);
    -- down
    ALTER TABLE orders DROP COLUMN channel;

## 上线顺序

- 备份；
- 执行迁移；
- 校验结构与数据量；
- 应用发布；
- 观察错误率后再清理旧字段。

## 验收

- 在副本库跑通 up 与 down；
- 数据量前后一致；
- 锁表时长在维护窗口内。`,
  },
  {
    name: 'secrets-scanner',
    version: '1.0.9',
    category: '开发',
    author: '@security-lab',
    installs: 14500,
    perm: 'files',
    description: '仓库密钥与凭证模式扫描',
    whenToUse: '需要在提交前扫描仓库中的密钥、令牌、私钥等敏感内容时使用。',
    source: 'skills.sh/secrets-scanner',
    body: `# secrets-scanner

提交前扫一遍敏感信息。

## 扫描范围

- 配置文件与环境变量样例；
- 脚本中的硬编码令牌；
- 私钥与证书文件；
- 日志与测试夹具里的真实凭证。

## 常见模式

| 类型 | 特征 |
| --- | --- |
| API Key | 长串字母数字，前后有 key、token 字样 |
| 私钥 | BEGIN 与 PRIVATE 与 KEY 组合的块 |
| 连接串 | 含用户名密码的 URL |

## 命令

    grep -rInE "(api[_-]?key|secret|token)\\s*[:=]" . --include=*.js --include=*.py

## 处理

- 命中后先轮换凭证，再改代码；
- 历史提交里的凭证同样视为泄露；
- 用环境变量或密钥管理服务替代硬编码。

## 验收

- 扫描结果逐条确认；
- 轮换后旧凭证失效；
- 新增提交不再命中。`,
  },
  {
    name: 'http-client',
    version: '1.2.0',
    category: '网络',
    author: '@api-lab',
    installs: 11900,
    perm: 'network',
    description: 'HTTP 请求调试、头与状态码排查',
    whenToUse: '需要调试接口请求、排查状态码与响应头、复现请求时使用。',
    source: 'skills.sh/http-client',
    body: `# http-client

接口请求的调试方法。

## 排查顺序

1. 看状态码：4xx 是请求问题，5xx 是服务问题。
2. 看响应头：内容类型、缓存、跨域。
3. 看请求体：字段名、类型、编码。
4. 对比成功请求，逐项替换定位差异。

## 命令

    curl -i -X POST https://example.com/api/login -H "content-type: application/json" -d '{"user":"a"}'

## 常见坑

- 中文请求体没声明 UTF-8；
- 重定向后方法变成 GET；
- 网关默认超时短于业务处理时间。

## 验收

- 复现命令可直接粘贴运行；
- 状态码与响应体都记录；
- 定位到具体差异项。`,
  },
  {
    name: 'rss-reader',
    version: '1.0.4',
    category: '网络',
    author: '@feeds-lab',
    installs: 4600,
    perm: 'network',
    description: 'RSS 与 Atom 订阅抓取与解析',
    whenToUse: '需要订阅博客或新闻源、抓取最新条目并汇总时使用。',
    source: 'skills.sh/rss-reader',
    body: `# rss-reader

RSS 与 Atom 的抓取与整理。

## 流程

1. 确认源地址返回 XML，而不是登录页或脚本挑战。
2. 解析条目：标题、链接、发布时间、摘要。
3. 按发布时间倒序，去重按链接。
4. 落表或生成摘要。

## 解析要点

- Atom 用 entry 与 updated，RSS 用 item 与 pubDate；
- 时间统一转 ISO 8601；
- 摘要去 HTML 标签后再截断。

## 命令

    curl -s https://example.com/feed.xml -o feed.xml
    python -c "import xml.etree.ElementTree as ET;print(len(ET.parse('feed.xml').getroot().findall('.//item')))"

## 验收

- 条目数与源站一致；
- 时间排序正确；
- 重复抓取不产生重复行。`,
  },
  {
    name: 'sitemap-checker',
    version: '1.1.1',
    category: '网络',
    author: '@seo-lab',
    installs: 5300,
    perm: 'network',
    description: 'sitemap 校验、死链与重定向检查',
    whenToUse: '需要检查站点 sitemap 完整性、批量验证链接状态码时使用。',
    source: 'skills.sh/sitemap-checker',
    body: `# sitemap-checker

站点地图与链接健康检查。

## 步骤

1. 拉取 sitemap 与索引文件，展开全部条目。
2. 抽样或全量请求，记录状态码与最终地址。
3. 列出：404、5xx、重定向链、超时。
4. 对照站点导航，找未收录的重要页面。

## 命令

    curl -s https://example.com/sitemap.xml -o sitemap.xml
    xmllint --xpath "//*[local-name()='loc']/text()" sitemap.xml

## 注意

- 请求加延迟，避免压垮站点；
- 重定向链超过两跳要修；
- robots 禁止的地址不应出现在待检列表。

## 验收

- 每条链接有状态码记录；
- 死链数量与抽样复核一致；
- 报告可直接交给站点负责人。`,
  },
  {
    name: 'calendar-sync',
    version: '1.0.6',
    category: '办公',
    author: '@office-lab',
    installs: 8300,
    perm: 'network',
    description: '日程生成、ICS 导入导出与冲突检查',
    whenToUse: '需要生成 ICS 日程、批量导入日历或检查时间冲突时使用。',
    source: 'skills.sh/calendar-sync',
    body: `# calendar-sync

日程文件的生成与校验。

## ICS 关键字段

| 字段 | 说明 |
| --- | --- |
| DTSTART | 开始时间，带时区 |
| DTEND | 结束时间 |
| SUMMARY | 标题 |
| UID | 全局唯一 |

## 生成流程

1. 时区统一写 TZID，不要用浮动时间。
2. 每个事件一个 VEVENT，UID 用稳定标识。
3. 折叠长行，避免解析失败。
4. 导入前先在一个空日历验证。

## 冲突检查

- 同一天事件按开始时间排序；
- 相邻事件间隔小于 10 分钟标记提醒；
- 跨时区事件统一换算后比较。

## 验收

- 日历客户端导入无报错；
- 时间与原文一致；
- 冲突清单逐条确认。`,
  },
  {
    name: 'email-draft',
    version: '1.2.2',
    category: '办公',
    author: '@office-lab',
    installs: 9100,
    perm: 'files',
    description: '商务邮件草稿与模板化回复',
    whenToUse: '需要写商务邮件、回复客户、批量套用模板时使用。',
    source: 'skills.sh/email-draft',
    body: `# email-draft

邮件草稿的结构化写法。

## 结构

1. 主题：一句话说清事由与需要的动作。
2. 首段：结论先行，一句背景。
3. 正文：编号列出要点与时间节点。
4. 结尾：明确下一步与截止时间。

## 语气

- 对客户：具体、可执行，不写空泛客套；
- 对内：直接给判断与依据；
- 拒绝：说明原因与替代方案。

## 模板变量

    尊敬的 [称呼]：
    [一句话结论]。
    1. [要点与时间]
    2. [需要对方确认的事项]
    顺祝商祺。

## 验收

- 主题能在收件箱里区分；
- 收件人明确知道要做什么；
- 附件名称含日期与版本。`,
  },
  {
    name: 'meeting-notes',
    version: '1.3.0',
    category: '办公',
    author: '@office-lab',
    installs: 7700,
    perm: 'files',
    description: '会议纪要整理与行动项跟踪',
    whenToUse: '需要把会议记录整理成纪要、提取行动项与责任人时使用。',
    source: 'skills.sh/meeting-notes',
    body: `# meeting-notes

会议纪要的固定结构。

## 结构

1. 基本信息：时间、参会人、议题。
2. 结论：已决定的事项，逐条写。
3. 待定：未决问题与卡点。
4. 行动项：任务、责任人、截止时间。

## 行动项格式

| 任务 | 责任人 | 截止 |
| --- | --- | --- |
| 输出接口文档 | 张三 | 周三 18:00 |

## 注意

- 结论与讨论分开，讨论不写成结论；
- 行动项必须有责任人和时间，缺一不算；
- 会后 24 小时内发出。

## 验收

- 每条结论可追溯到议题；
- 行动项数量与会上确认一致；
- 下次会议可以直接按此复盘。`,
  },
  {
    name: 'translate-docs',
    version: '1.1.4',
    category: '办公',
    author: '@office-lab',
    installs: 10800,
    perm: 'network',
    description: '文档翻译流程与术语表维护',
    whenToUse: '需要翻译技术文档、保持术语一致、做双语对照时使用。',
    source: 'skills.sh/translate-docs',
    body: `# translate-docs

技术文档翻译的流程。

## 流程

1. 抽取术语：产品名、接口名、字段名，先定译法。
2. 分段翻译，保持原文结构（标题层级、列表、表格）。
3. 回译抽查：关键段落反向翻译核对含义。
4. 统一样式：标点、数字、单位、代码不译。

## 术语表

| 原文 | 译法 | 备注 |
| --- | --- | --- |
| token | 令牌 | 首次出现括注原文 |
| endpoint | 端点 | 不译作接口 |

## 注意

- 代码块、命令、路径一律不译；
- 中英文之间加空格；
- 同一术语全文只用一个译法。

## 验收

- 术语表覆盖高频词；
- 结构与原文一一对应；
- 抽查段落无语义偏差。`,
  },
  {
    name: 'form-builder',
    version: '1.0.3',
    category: '办公',
    author: '@office-lab',
    installs: 6100,
    perm: 'files',
    description: '表单设计、校验规则与提交数据结构',
    whenToUse: '需要设计收集表单、定义字段校验与提交结构时使用。',
    source: 'skills.sh/form-builder',
    body: `# form-builder

表单设计与校验。

## 字段设计

1. 先列必填与选填，必填不超过 8 项。
2. 每个字段写清类型、长度、格式。
3. 选择项给出默认值与空选项。
4. 附件字段限制类型与大小。

## 校验分层

| 层 | 内容 |
| --- | --- |
| 前端 | 必填、格式、长度 |
| 后端 | 唯一性、权限、业务规则 |

## 提交结构

    {"name":"张三","phone":"13800000000","consent":true}

## 验收

- 空表单提交有逐字段提示；
- 边界值（超长、特殊字符）有处理；
- 提交后数据可回查。`,
  },
  {
    name: 'image-optimizer',
    version: '1.2.0',
    category: '办公',
    author: '@media-lab',
    installs: 8600,
    perm: 'files',
    description: '图片压缩、格式转换与批量改尺寸',
    whenToUse: '需要批量压缩图片、转 WebP、统一尺寸或减小文档体积时使用。',
    source: 'skills.sh/image-optimizer',
    body: `# image-optimizer

图片的批量处理。

## 决策

| 场景 | 处理 |
| --- | --- |
| 网页配图 | 转 WebP，宽 1200 以内 |
| 文档插图 | PNG 保留透明，压到 200KB 内 |
| 截图存档 | 保持原格式，仅裁切 |

## 命令

    magick mogrify -path out -resize 1200x -quality 82 -format webp *.png

## 注意

- 先备份原图；
- 压缩后逐张抽查清晰度；
- 透明背景不要转 JPEG；
- 保留 EXIF 与否要按场景决定。

## 验收

- 输出目录文件数量一致；
- 体积下降比例记录；
- 关键图放大后无可见色块。`,
  },
]
