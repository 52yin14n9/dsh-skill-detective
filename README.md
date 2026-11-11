# 技能侦探 · Skill Detective

本插件由 CyberMind-labs 的 52yin14n9、Admie、Assomeity、George 联合开发。

给 DeepSeek Harness 用的自动技能管家：在对话里发现缺失的技能，检索候选，安装前做安全审查，安装后统一管理。

## 功能

- **对话内勾选**：输入框工具栏出现 `🐟 技能侦探`，默认关闭；勾选后，用户发消息时 Host 侧做语义分析。
- **大模型判断触发**：每条消息交给 Harness 的 `llm` 服务做一次小请求，判断「是不是任务」「已装技能能不能覆盖」。知识型提问（如「K8s 是什么东西啊」）不弹；`sqlite-query` 不会误判成覆盖「数据看板」；返回稳定的 `needKey` 供「先不用」和节流复用。不再维护关键词表与正则。
- **推荐气泡**：命中未覆盖的需求时浮出 380px 小气泡，提「帮我找」「先不用」。点「先不用」会按 `needKey` 写进**持久名单**，之后不再弹，可在「技能设置 → 不再提示的需求」里恢复。
- **五步执行**：语义分析 → 检索 skills.sh → 安全审查 → 下载 → 装载启用，全程在气泡内，不向对话流插入任何卡片。
- **大模型安全审查**：安装前把候选技能**整个目录**（`SKILL.md`、`scripts/*.py`、`run.sh`、配置与模板）交给模型审查，判断数据外联、凭据读取、破坏性命令、混淆执行、供应链投毒与指令注入；`high` / `critical` 或 `malicious` 直接阻断。不再用单文件正则，也不再把未知域名一刀切降级。审查提示词见 `prompts/security-audit.md`，按内容哈希缓存到 `audit-cache.json`，同样内容秒过。
- **市场准入**：下载内容必须通过同一套大模型审查才会写盘；内置目录是随包发布的本地模板，安装时同样过审查。
- **技能索引文件**：安装/扫描时把每个技能的能力摘要、触发词、作用域、指纹写进 `$DSH_HOME/skill-detective/index.json`。之后每条消息只读这份索引，不再遍历技能根目录、不再解析每个 `SKILL.md`；只有安装、`skills/change`、面板刷新和手动扫描才重新落盘。
- **技能管理页**（左侧栏「技能管理」）：按来源分组（插件安装 / 市场安装 / 技能学习 / 本地扫描 / 用户自建）、搜索、筛选、统计、详情、打开文件位置、启用/禁用、删除。禁用的技能行内会出现「需要同类技能替代」勾选框。
- **同名冲突可选**：安装时遇到同名技能不再直接失败，面板和气泡会给出「覆盖安装 / 改名安装 / 取消」。覆盖会替换原目录；改名会保留原名作为显示名，目录用 `name-2` 之类的唯一名。
- **名称自动转写**：中文、大写或带空格的名称不再被拒绝。内部目录自动转成合法 ASCII slug（中文名优先采用模型建议的英文 slug），原名称保存在 `displayName` 里；面板显示原名并附小号 slug，点详情/操作仍指向真正安装的那个技能。
- **安装即扫描**：插件装载后自动扫描全部已登记工作区的 `<workspace>/.dsh/skills`、`$DSH_HOME/skills`、临时目录，以及 DSH 技能注册表里的**插件自带技能**。插件自带技能标记为「只读」：可查看、可启停，但删除与作用域移动被拒绝。
- **插件技能折叠**：同一个插件包自带 5 个及以上技能时，管理页把它们收成一行，行首小三角展开/收起；搜索时自动展开命中项。
- **技能市场页**：内置 30 个技能（文档 / 数据 / 开发 / 网络 / 办公五类），首屏 12 张卡片，底部「加载更多」每批 12 张；搜索框过滤完整目录，旁边「联网搜索 skills.sh」走远程目录。
- **多源检索**：本地检索 → 内置目录；点「联网搜索」→ skills.sh 公共目录，下载走 GitHub raw，依次尝试 `raw.githubusercontent.com` → `ghproxy.net` → `cdn.jsdelivr.net`，任一可用即完成安装；三个镜像都不通时回退到 `api.github.com/contents`（base64），因此只放行 API、不放行 raw CDN 的网络也能安装。
- **检查更新**、**删除留痕**、**技能学习**、**技能设置**、**Agent 不可见的分层**等能力保持原有行为；学习和整合稿也会先过大模型安全审查。

## 目录约定

| 作用域 | 真实位置 |
| --- | --- |
| 全局 | `$DSH_HOME/skills/<name>/SKILL.md`（默认 `~/.dsh`） |
| 工作区 | `<workspace>/.dsh/skills/<name>/SKILL.md` |
| 临时 | `$DSH_HOME/skill-detective/temp/<sessionId>/<name>/SKILL.md` |
| 插件自带 | `<插件包>/skills/<name>/SKILL.md`（扫描可见，只读，不参与安装/删除） |

默认作用域是**全局**：DSH 的 `skill-filesystem` provider 通过「最近的 `.git` 祖先」解析项目根，没有 `.git` 的工作区不会扫描 `<workspace>/.dsh/skills`，工作区作用域只对真正的仓库目录生效；全局目录对每个会话都生效，所以作为默认值更可靠。

禁用写入 SKILL.md frontmatter 的 `disable-model-invocation: true`，官方 skill provider 会据此不再让模型自动调用。

生成的 frontmatter 对 `@作者名`、含中文冒号的值统一加双引号，避免 YAML 把这些标量解析成映射或标签而导致整个技能被跳过。

## 数据与接口

- 状态文件：`$DSH_HOME/skill-detective.json`（来源、版本、安装量、作用域、安装时间、`displayName`、不再提示的需求名单、删除墓碑、会话勾选）。
- 索引文件：`$DSH_HOME/skill-detective/index.json`（每个技能的能力摘要、触发词、作用域、路径、内容指纹、首次/最近出现时间）。每条消息的触发判断只读这里。
- 审查缓存：`$DSH_HOME/skill-detective/audit-cache.json`（内容哈希 → 模型结论，最多 120 条、保留 180 天）。
- 浏览器半通过 `/api/dsh-skill-detective/*` 读写，路由仅接受同源请求；面板不做任何文件操作。
- 扫描接口：`POST /api/dsh-skill-detective/scan` 手动重扫（返回 `total` / `added` / `roots` / `workspaces`），`GET /api/dsh-skill-detective/state` 返回索引快照与合并后的 `installed` 列表。
- 安装接口的 `conflict` 可选 `overwrite` / `rename` / `cancel`；返回 `name-conflict` 时携带 `conflict.name`、`conflict.scope`、`conflict.suggestedName`，由面板给出选择。
- 调试接口：`POST /probe`、`POST /analyze` 返回当前大模型的触发判断（`actionable`、`needKey`、`coveredBy`、`suggestedSkill`）。

## 状态清理策略

状态文件的所有集合都有保留上限，写入时统一裁剪（`pruneState`）：

| 集合 | 保留策略 |
| --- | --- |
| `sessions` | 30 天未使用删除，最多 300 条 |
| `suppressed` | 用户显式选择，保留 365 天，最多 300 条 |
| `deleted` | 删除墓碑保留 30 天，最多 100 条 |
| `installs` | 最多 500 条，按安装时间淘汰最旧 |
| `discovered` | v1 旧快照一次性迁入索引后删除，不再写回状态文件 |
| `index.skills` | 30 天未再出现的本地记录删除，最多 2000 条 |

索引和审查缓存替换了原先只增不减的 `discovered` 快照，状态文件只保留小型偏好与元数据。

## 模型与速度

- 复用 Harness 已配置的 `llm` 服务，不需要额外 API Key；优先使用当前会话的默认模型，未配置时再选 `flash` / `lite` / `mini` / `chat` 这类非推理轻量型号。
- 触发判断约 200-400 输出 token，审查约 700 token，均带超时；超时或模型不可用时**不弹推荐**，审查则**拒绝安装**（安全优先）。
- 审查按技能目录内容哈希缓存，同一份内容只审一次；技能索引让每条消息的热路径只读一个小 JSON，不再扫盘。

## 检索说明

有网时先请求 skills.sh 搜索接口，命中结果只用于给候选补全安装量；接口不可用时如实标记来源为内置目录，不伪造远程结果。安装内容来自本插件的精选目录（30 个技能的真实 SKILL.md 模板，新增条目在 `catalog.js`）。

## 卸载

插件管理器卸载 bundle 后，已安装的技能目录仍在 `.dsh/skills` 下，可在「技能管理」页删除，或直接删除对应目录。

## License

MIT © 2026 CyberMind-labs（52yin14n9、Admie、Assomeity、George）
