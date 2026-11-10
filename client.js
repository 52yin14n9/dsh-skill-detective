/**
 * Skill Detective — browser half.
 *
 * Three seats, one package:
 *
 *  - `conversation.input.left` — the `🐟 技能侦探` switch beside the composer's
 *    permission control. Its state is per Session and is mirrored to the host so
 *    the host knows whether a committed user message should be analysed.
 *  - `conversation.input.dock` — the recommendation bubble above the composer,
 *    the five-step progress view, the "already covered" toast and the
 *    "nothing good found" state. Nothing here enters the chat flow.
 *  - `sidebar.panellist` + `main` — the skill manager page (grouped list,
 *    search, filters, details, delete, disable, settings) and the marketplace
 *    view inside it.
 *
 * All data comes from the host half's JSON routes; the browser never scans or
 * writes skill files itself.
 */
window.__ModuleLoader__.load({
  id: 'dsh-skill-detective',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useRef, useMemo, useCallback } = React

    const API = '/api/dsh-skill-detective'
    const PANEL_ID = 'skill-detective'
    const PANEL_ORDER = 15
    const NS = 'dsh-skill-detective'
    /** Marketplace cards rendered per batch. */
    const MARKET_PAGE_SIZE = 12
    /** A scanned provider with at least this many skills is folded into one row. */
    const BUNDLE_THRESHOLD = 5

    /* ---------------------------------------------------------------- */
    /* Locale                                                            */
    /* ---------------------------------------------------------------- */

    const zh = {
      nav: '技能管理',
      panelTitle: '技能管理',
      panelHint: '已安装',
      market: '技能市场',
      settings: '设置',
      openDir: '打开目录',
      search: '搜索技能名称…',
      all: '全部',
      plugin: '插件安装',
      marketOrigin: '市场安装',
      user: '用户自建',
      reviewed: '已审查',
      local: '本地',
      disabled: '已禁用',
      installedN: '已安装 {n} 个',
      statPlugin: '插件安装 {n}',
      statMarket: '市场安装 {n}',
      statLearned: '技能学习 {n}',
      statUser: '用户自建 {n}',
      statRoot: '本地目录 .dsh/skills',
      groupPlugin: '插件安装',
      groupMarket: '市场安装',
      groupUser: '用户自建',
      emptyTitle: '还没有技能',
      emptyHint: '在「技能市场」安装，或在对话里勾选「技能侦探」让本鱼自动找。',
      openMarket: '去技能市场',
      detail: '详情',
      openFolder: '打开文件位置',
      disable: '禁用',
      enable: '启用',
      del: '删除',
      delConfirm: '删除 {name}？删除后不可恢复',
      cancel: '取消',
      confirmDel: '确认删除',
      source: '来源',
      installs: '安装量',
      size: '体积',
      scope: '作用域',
      installedAt: '安装时间',
      status: '状态',
      perm: '最高权限',
      fileTree: '文件结构',
      preview: 'SKILL.md 预览',
      scopeTemp: '临时（仅当前会话）',
      scopeWorkspace: '工作区',
      scopeGlobal: '全局',
      scopeHintTemp: '只对当前会话注册，换会话即不可见',
      scopeHintWorkspace: '只对选中的工作区生效',
      scopeHintGlobal: '对所有工作区和会话生效',
      settingsTitle: '技能设置',
      defaultScope: '默认下载作用域',
      defaultScopeHint: '新下载的技能按此处选择写入',
      workspaceCard: '工作区',
      workspaceHint: '只对当前工作区生效（需项目根含 .git）',
      globalCard: '全局',
      globalHint: '对所有工作区和会话生效',
      scopeRows: '已安装技能的作用域',
      scopeRowsHint: '保存后立即生效：文件位置、列表与自动匹配同时更新',
      workspacesChips: '生效工作区',
      save: '保存',
      saving: '保存中…',
      saved: '已保存',
      noWorkspaces: '默认工作区',
      marketTitle: '技能市场',
      marketSource: '来源 skills.sh · 安装前自动安全审查',
      back: '返回',
      install: '安装',
      installing: '安装中…',
      auditing: '审查中…',
      installed: '已安装',
      marketEmpty: '没找到匹配的技能',
      marketSearch: '搜索市场技能…',
      remoteSearch: '联网搜索 skills.sh',
      searching: '搜索中…',
      remoteResults: '在线结果',
      remoteError: '在线搜索失败：',
      remoteInstalled: '已安装 {name}',
      loadMore: '加载更多（已显示 {shown} / {total}）',
      allLoaded: '已全部加载（共 {n} 个）',
      learned: '技能学习',
      groupLearned: '技能学习',
      learnTitle: '技能学习',
      learnHint: '选一个技能，本鱼找同类技能、对比优缺点并整合成一份新技能。整合稿先过安全审查，未通过不写盘。',
      learnPick: '选择要学习的技能',
      analyzePeers: '分析同类',
      analyzing: '分析中…',
      peersTitle: '同类技能',
      mergedTitle: '整合稿预览',
      authorsTitle: '作者',
      authorsMore: '+{n} 位作者',
      authorDetail: '作者详情',
      generateMerged: '生成整合版并安装',
      generating: '生成中…',
      noPeers: '未查找到同类skill',
      learnAll: '一键学习已有技能',
      learnAllRunning: '批量学习中…',
      learnAllDone: '完成：学习 {n} 个，跳过 {m} 个',
      updatesTitle: '检查更新',
      updatesHint: '对比市场目录的安装量与版本，判断是否有同类上位替代',
      checking: '检查中…',
      updateLatest: '已是最优',
      updateNewer: '可更新到 {v}',
      updateBetter: '有上位替代：{name}',
      installAlt: '安装替代',
      noUpdates: '没有可检查的技能',
      learnedOk: '已生成 {name}',
      matchScore: '匹配度',
      sourceAuthors: '来源作者',
      auditFailed: '整合稿未通过安全审查，已阻止安装',
      suppressedTitle: '不再提示的需求',
      suppressedHint: '点过「先不用」的需求不会再弹窗，可在这里恢复',
      suppressedEmpty: '暂无',
      restore: '恢复',
      replaceAsk: '需要同类技能替代',
      replaceHint: '点击后自动查找同功能、安装量最高且尚未安装的同类技能并安装',
      replaceSearching: '正在查找同类技能…',
      replacing: '查找中…',
      replaceInstalled: '已安装同类技能 {name}',
      replaceNone: '未找到同类技能',
      deletedTitle: '已删除的技能',
      deletedAt: '删除于',
      addOther: '增加其他 skill',
      removeRecord: '移除记录',
      recordRemoved: '已移除删除记录',
      deletedHint: '记录保留期间，同类需求不再自动推荐',
      reviewPass: '审查通过',
      deleted: '已删除 {name}',
      toastDisabled: '已禁用 {name}',
      toastEnabled: '已启用 {name}',
      toastScope: '作用域已更新',
      failTitle: '操作失败',
      loadFail: '读取技能列表失败',
      close: '关闭',
      toggleOn: '技能侦探',
      toggleHint: '勾选后，发送消息时本鱼会判断你缺什么技能',
      bubbleAsk: '本鱼发现你好像需要「{label}」的技能，需要我帮你自动找用得最多的 skill 吗？',
      find: '帮我找',
      notNow: '先不用',
      stepAnalyze: '语义分析',
      stepSearch: '检索 skills.sh',
      stepAudit: '安全审查',
      stepDownload: '下载',
      stepEnable: '装载启用',
      progressKicker: '技能侦探 · 正在处理',
      doneLine: '下载与检测完成 · {name} 已装载',
      coveredLine: '已匹配已安装技能 {name}，直接使用',
      noneLine: '本鱼没发现好用的技能呢',
      retry: '再找一次',
      algorithm: '按安装量排序',
      marketInstalling: '正在安装 {name}',
      scanOrigin: '本地扫描',
      groupScan: '本地扫描',
      statScan: '本地扫描 {n}',
      scanNow: '重新扫描',
      scanning: '正在扫描技能目录…',
      scanDone: '扫描完成：共 {n} 个技能，新增 {m} 个',
      scanFailed: '扫描失败：',
      scanNever: '尚未扫描',
      scanInfo: '上次扫描 {time} · 共 {n} 个',
      scanHint: '启动时自动扫描全部工作区、$DSH_HOME/skills 与插件自带的 skills 目录',
      scopeBundled: '插件自带',
      bundledBadge: '只读',
      bundledHint: '插件自带的技能：可查看与启停，删除和作用域移动已禁用',
      scanPath: '扫描位置',
      bundleTitle: '{provider} 插件内 skill',
      bundleReadonly: '只读 · 插件自带',
      bundleCount: '{n} 个',
    }

    const en = {
      nav: 'Skills',
      panelTitle: 'Skills',
      panelHint: 'Installed',
      market: 'Marketplace',
      settings: 'Settings',
      openDir: 'Open folder',
      search: 'Search skills…',
      all: 'All',
      plugin: 'Plugin',
      marketOrigin: 'Marketplace',
      user: 'User',
      reviewed: 'Audited',
      local: 'Local',
      disabled: 'Disabled',
      installedN: '{n} installed',
      statPlugin: 'plugin {n}',
      statMarket: 'market {n}',
      statLearned: 'learned {n}',
      statUser: 'user {n}',
      statRoot: 'local .dsh/skills',
      groupPlugin: 'Plugin installs',
      groupMarket: 'Marketplace installs',
      groupUser: 'User skills',
      emptyTitle: 'No skills yet',
      emptyHint: 'Install one from the marketplace, or tick Skill Detective in a conversation.',
      openMarket: 'Open marketplace',
      detail: 'Details',
      openFolder: 'Open file location',
      disable: 'Disable',
      enable: 'Enable',
      del: 'Delete',
      delConfirm: 'Delete {name}? This cannot be undone',
      cancel: 'Cancel',
      confirmDel: 'Delete',
      source: 'Source',
      installs: 'Installs',
      size: 'Size',
      scope: 'Scope',
      installedAt: 'Installed',
      status: 'Status',
      perm: 'Max permission',
      fileTree: 'Files',
      preview: 'SKILL.md preview',
      scopeTemp: 'Temporary (this session)',
      scopeWorkspace: 'Workspace',
      scopeGlobal: 'Global',
      scopeHintTemp: 'Registered for this session only',
      scopeHintWorkspace: 'Applies to the selected workspaces',
      scopeHintGlobal: 'Applies to every workspace and session',
      settingsTitle: 'Skill settings',
      defaultScope: 'Default download scope',
      defaultScopeHint: 'New downloads are written where this points',
      workspaceCard: 'Workspace',
      workspaceHint: 'Applies to this workspace (its root must contain .git)',
      globalCard: 'Global',
      globalHint: 'Applies to every workspace and session',
      scopeRows: 'Installed skill scopes',
      scopeRowsHint: 'Changes apply immediately: files, list and matching all update',
      workspacesChips: 'Workspaces',
      save: 'Save',
      saving: 'Saving…',
      saved: 'Saved',
      noWorkspaces: 'Default workspace',
      marketTitle: 'Marketplace',
      marketSource: 'Source skills.sh · audited before install',
      back: 'Back',
      install: 'Install',
      installing: 'Installing…',
      auditing: 'Auditing…',
      installed: 'Installed',
      marketEmpty: 'No matching skill',
      marketSearch: 'Search the marketplace…',
      remoteSearch: 'Search skills.sh',
      searching: 'Searching…',
      remoteResults: 'Online results',
      remoteError: 'Online search failed: ',
      remoteInstalled: 'Installed {name}',
      loadMore: 'Load more ({shown} / {total} shown)',
      allLoaded: 'All loaded ({n} skills)',
      learned: 'Learned',
      groupLearned: 'Learned skills',
      learnTitle: 'Skill learning',
      learnHint: 'Pick one skill; the host finds same-category peers, compares them and merges them into a new skill. The merged draft is audited before it is written.',
      learnPick: 'Choose a skill to learn from',
      analyzePeers: 'Analyze peers',
      analyzing: 'Analyzing…',
      peersTitle: 'Same-category skills',
      mergedTitle: 'Merged draft',
      authorsTitle: 'Authors',
      authorsMore: '+{n} more',
      authorDetail: 'All authors',
      generateMerged: 'Build and install',
      generating: 'Building…',
      noPeers: 'No same-category skill found',
      learnAll: 'Learn all installed skills',
      learnAllRunning: 'Learning…',
      learnAllDone: 'Done: {n} learned, {m} skipped',
      updatesTitle: 'Check updates',
      updatesHint: 'Compare installed skills with the marketplace catalog for newer versions or stronger alternatives',
      checking: 'Checking…',
      updateLatest: 'Up to date',
      updateNewer: 'Update to {v}',
      updateBetter: 'Stronger peer: {name}',
      installAlt: 'Install',
      noUpdates: 'No skills to check',
      learnedOk: 'Created {name}',
      matchScore: 'match',
      sourceAuthors: 'Source authors',
      auditFailed: 'Merged draft failed the security audit; install blocked',
      suppressedTitle: 'Suppressed needs',
      suppressedHint: 'Needs dismissed with "Not now" never ask again. Restore them here.',
      suppressedEmpty: 'None',
      restore: 'Restore',
      replaceAsk: 'Replace with a peer',
      replaceHint: 'Finds the most installed peer of the same task that is not installed yet',
      replaceSearching: 'Searching peers…',
      replacing: 'Searching…',
      replaceInstalled: 'Installed peer {name}',
      replaceNone: 'No peer found',
      deletedTitle: 'Deleted skills',
      deletedAt: 'deleted',
      addOther: 'Add another skill',
      removeRecord: 'Remove record',
      recordRemoved: 'Record removed',
      deletedHint: 'While the record exists, this need is no longer suggested',
      reviewPass: 'Audit passed',
      deleted: 'Deleted {name}',
      toastDisabled: 'Disabled {name}',
      toastEnabled: 'Enabled {name}',
      toastScope: 'Scope updated',
      failTitle: 'Operation failed',
      loadFail: 'Failed to read the skill list',
      close: 'Close',
      toggleOn: 'Skill Detective',
      toggleHint: 'When ticked, the host analyses your next message',
      bubbleAsk: 'You seem to need a “{label}” skill. Want me to find the most-installed one for you?',
      find: 'Find it',
      notNow: 'Not now',
      stepAnalyze: 'Semantic analysis',
      stepSearch: 'Search skills.sh',
      stepAudit: 'Audit',
      stepDownload: 'Download',
      stepEnable: 'Load and enable',
      progressKicker: 'Skill Detective · working',
      doneLine: 'Download and audit complete · {name} loaded',
      coveredLine: 'Already covered by {name} — use it directly',
      noneLine: 'No good skill found this time',
      retry: 'Search again',
      algorithm: 'sorted by installs',
      marketInstalling: 'Installing {name}',
      scanOrigin: 'Scanned',
      groupScan: 'Scanned locally',
      statScan: 'scanned {n}',
      scanNow: 'Rescan',
      scanning: 'Scanning skill roots…',
      scanDone: 'Scan complete: {n} skills, {m} new',
      scanFailed: 'Scan failed: ',
      scanNever: 'Not scanned yet',
      scanInfo: 'Scanned {time} · {n} skills',
      scanHint: 'Scans every workspace, $DSH_HOME/skills and bundled plugin skill folders on load',
      scopeBundled: 'Bundled',
      bundledBadge: 'Read-only',
      bundledHint: 'Bundled with a plugin: view and toggle are allowed, delete and scope moves are disabled',
      scanPath: 'Scan locations',
      bundleTitle: '{provider} plugin skills',
      bundleReadonly: 'read-only · bundled',
      bundleCount: '{n}',
    }

    function interpolate(text, vars) {
      if (!vars) return text
      return String(text).replace(/\{(\w+)\}/g, (_, key) => (vars[key] === undefined ? `{${key}}` : String(vars[key])))
    }

    function translate(dict) {
      return (key, vars) => interpolate(dict[key] ?? key, vars)
    }

    /* ---------------------------------------------------------------- */
    /* Styles                                                            */
    /* ---------------------------------------------------------------- */

    const CSS = `
.sd-root { color: #e8e8ea; font-size: 14px; line-height: 1.6; }
.sd-page { width: 100%; height: 100%; min-height: 0; flex: 1 1 auto; box-sizing: border-box; overflow-y: auto; background: transparent; }
.sd-page-inner { max-width: 1080px; margin: 0 auto; padding: 22px 32px 60px; }
.sd-topbar { display: flex; align-items: center; gap: 10px; padding: 4px 0 20px; }
.sd-back { width: 30px; height: 30px; display: inline-flex; align-items: center; justify-content: center; border-radius: 8px; border: 1px solid transparent; background: transparent; color: #8b8f98; cursor: pointer; }
.sd-back:hover { background: rgba(255,255,255,.06); color: #e8e8ea; }
.sd-title { font-size: 19px; font-weight: 600; letter-spacing: .2px; text-shadow: 0 1px 4px rgba(0,0,0,.7); }
.sd-sub { color: #a9adb5; font-size: 13px; margin-left: 2px; text-shadow: 0 1px 3px rgba(0,0,0,.7); }
.sd-spacer { flex: 1; }
.sd-toplink { display: inline-flex; align-items: center; gap: 7px; height: 34px; padding: 0 14px; border-radius: 9px; border: 1px solid rgba(255,255,255,.1); background: rgba(12,13,16,.42); color: #cfd2d8; font-size: 13px; cursor: pointer; backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }
.sd-toplink:hover { background: rgba(255,255,255,.12); color: #ffffff; }
.sd-stats { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; color: #cfd2d8; font-size: 12.5px; padding: 8px 12px; margin: 0 0 16px; border-radius: 9px; background: rgba(8,9,12,.42); border: 1px solid rgba(255,255,255,.06); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }
.sd-stats b { color: #e8e8ea; font-weight: 600; }
.sd-stats .sep { color: #3a3d44; }
.sd-search { width: 100%; height: 40px; border-radius: 10px; background: rgba(18,19,22,.58); border: 1px solid rgba(255,255,255,.09); color: #e8e8ea; padding: 0 14px; font-size: 13.5px; outline: none; box-sizing: border-box; backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); }
.sd-search::placeholder { color: #5d6169; }
.sd-search:focus { border-color: rgba(53,224,210,.5); }
.sd-chips { display: flex; gap: 8px; padding: 14px 0 18px; flex-wrap: wrap; }
.sd-chip { height: 30px; padding: 0 14px; border-radius: 999px; border: 1px solid rgba(255,255,255,.14); background: rgba(8,9,12,.34); color: #cfd2d8; font-size: 12.5px; cursor: pointer; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }
.sd-chip:hover { color: #ffffff; border-color: rgba(255,255,255,.28); }
.sd-chip.on { background: rgba(255,255,255,.16); color: #ffffff; border-color: rgba(255,255,255,.3); }
.sd-group { padding-top: 6px; }
.sd-group-title { color: #a9adb5; font-size: 12.5px; letter-spacing: .3px; padding: 10px 2px 10px; text-shadow: 0 1px 3px rgba(0,0,0,.75); }
.sd-bundle { margin-bottom: 12px; }
.sd-bundle-head { display: flex; align-items: center; gap: 9px; width: 100%; box-sizing: border-box; padding: 11px 14px; border-radius: 11px; border: 1px dashed rgba(255,255,255,.14); background: rgba(12,13,16,.38); color: #cfd2d8; font-size: 13px; cursor: pointer; text-align: left; backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }
.sd-bundle-head:hover { background: rgba(255,255,255,.09); color: #ffffff; }
.sd-caret { display: inline-block; width: 12px; flex: 0 0 12px; color: #7a7f88; transition: transform .15s ease; font-size: 11px; }
.sd-caret.open { transform: rotate(90deg); color: #7aaaff; }
.sd-bundle-title { font-weight: 600; }
.sd-bundle-hint { color: #6d727b; font-size: 11.5px; margin-left: auto; }
.sd-bundle-items { padding-top: 10px; }
.sd-row { display: flex; align-items: center; gap: 16px; background: rgba(20,20,23,.72); border: 1px solid rgba(255,255,255,.09); border-radius: 12px; padding: 14px 16px; margin-bottom: 12px; backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); box-shadow: 0 2px 14px rgba(0,0,0,.18); }
.sd-row.off { opacity: .55; }
.sd-icon { width: 42px; height: 42px; flex: 0 0 42px; border-radius: 11px; border: 1.5px solid rgba(255,255,255,.82); background: transparent; display: flex; align-items: center; justify-content: center; font-size: 21px; }
.sd-main { min-width: 0; flex: 1; }
.sd-name-line { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.sd-name { font-weight: 600; font-size: 15px; color: #e8e8ea; }
.sd-ver { font-size: 11px; color: #7a7f88; }
.sd-badge { font-size: 11px; padding: 1px 7px; border-radius: 4px; background: #1c2230; color: #7aaaff; }
.sd-badge.grey { background: #23252a; color: #8b8f98; }
.sd-meta { color: #9a9fa8; font-size: 12.5px; margin-top: 4px; }
.sd-subline { color: #7a7f88; font-size: 12px; margin-top: 3px; }
.sd-subline.warn { color: #c9a96a; }
.sd-actions { display: flex; align-items: center; gap: 5px; flex: 0 0 auto; }
.sd-iconbtn { width: 30px; height: 30px; display: inline-flex; align-items: center; justify-content: center; border: none; background: transparent; color: #7a7f88; border-radius: 8px; cursor: pointer; padding: 0; }
.sd-iconbtn:hover { background: rgba(255,255,255,.08); color: #e8e8ea; }
.sd-iconbtn.danger:hover { color: #ff6b6b; background: rgba(255,107,107,.1); }
.sd-delbar { display: flex; align-items: center; gap: 10px; background: rgba(255,80,80,.08); border: 1px solid rgba(255,80,80,.28); border-radius: 10px; padding: 11px 13px; margin: -2px 0 12px; color: #ff9a9a; font-size: 12.5px; }
.sd-btn { height: 32px; padding: 0 14px; border-radius: 8px; border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.03); color: #cfd2d8; font-size: 12.5px; cursor: pointer; white-space: nowrap; flex: 0 0 auto; }
.sd-btn:hover { background: rgba(255,255,255,.1); }
.sd-btn.primary { border: none; background: linear-gradient(135deg, #35e0d2, #7aaaff); color: #06121a; font-weight: 600; }
.sd-btn.danger { border-color: rgba(255,80,80,.4); color: #ff8080; }
.sd-empty { text-align: center; padding: 64px 0; color: #7a7f88; }
.sd-empty b { display: block; color: #a9adb5; font-size: 15px; margin-bottom: 8px; }
.sd-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.6); z-index: 60; display: flex; align-items: center; justify-content: center; padding: 24px; }
.sd-modal { width: 680px; max-width: 100%; max-height: 84vh; overflow-y: auto; background: rgba(18,18,21,.9); border: 1px solid rgba(255,255,255,.1); border-radius: 14px; padding: 22px 24px; box-shadow: 0 24px 80px rgba(0,0,0,.6); backdrop-filter: blur(22px); -webkit-backdrop-filter: blur(22px); }
.sd-modal h3 { margin: 0 0 4px; font-size: 16.5px; font-weight: 600; }
.sd-modal .sd-muted { color: #7a7f88; font-size: 12.5px; }
.sd-kv { display: grid; grid-template-columns: 96px 1fr; gap: 9px 12px; padding: 14px 0; border-top: 1px solid rgba(255,255,255,.055); margin-top: 12px; font-size: 12.5px; }
.sd-kv dt { color: #7a7f88; margin: 0; }
.sd-kv dd { margin: 0; color: #cfd2d8; word-break: break-all; }
.sd-h4 { font-size: 12.5px; color: #a9adb5; margin: 18px 0 8px; }
.sd-tree { background: rgba(10,10,13,.55); border: 1px solid rgba(255,255,255,.07); border-radius: 9px; padding: 11px 13px; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 12px; color: #9a9fa8; }
.sd-tree div { white-space: pre; }
.sd-pre { background: rgba(10,10,13,.55); border: 1px solid rgba(255,255,255,.07); border-radius: 9px; padding: 12px; max-height: 300px; overflow: auto; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 12px; color: #a9adb5; white-space: pre-wrap; }
.sd-modal-foot { display: flex; gap: 8px; justify-content: flex-end; padding-top: 18px; }
.sd-radios { display: flex; gap: 10px; }
.sd-radio { flex: 1; text-align: left; background: rgba(12,13,16,.5); border: 1px solid rgba(255,255,255,.09); border-radius: 10px; padding: 11px 13px; cursor: pointer; color: #cfd2d8; }
.sd-radio.on { border-color: rgba(53,224,210,.55); background: rgba(53,224,210,.06); }
.sd-radio b { display: block; font-size: 13px; margin-bottom: 3px; }
.sd-radio span { color: #7a7f88; font-size: 11.5px; }
.sd-srow { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,.045); }
.sd-srow .nm { flex: 1; font-size: 13px; }
.sd-select { height: 30px; border-radius: 7px; background: rgba(12,13,16,.62); border: 1px solid rgba(255,255,255,.11); color: #cfd2d8; font-size: 12px; padding: 0 6px; }
.sd-wschips { display: flex; gap: 6px; flex-wrap: wrap; padding: 8px 0 2px 0; }
.sd-wschip { font-size: 11.5px; padding: 3px 10px; border-radius: 999px; border: 1px solid rgba(255,255,255,.09); background: transparent; color: #8b8f98; cursor: pointer; }
.sd-wschip.on { background: #1c2230; color: #7aaaff; border-color: rgba(122,170,255,.3); }
.sd-wschip.dim { opacity: .4; pointer-events: none; }
.sd-toast { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); background: rgba(24,25,29,.9); border: 1px solid rgba(255,255,255,.12); color: #e8e8ea; border-radius: 10px; padding: 10px 18px; font-size: 12.5px; z-index: 80; box-shadow: 0 10px 30px rgba(0,0,0,.5); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); }
.sd-markets { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
.sd-market-search-row { display: flex; gap: 10px; margin: 0 0 16px; align-items: center; }
.sd-market-search-row .sd-search { flex: 1; }
.sd-market-search-row .sd-btn { height: 40px; }
.sd-more-wrap { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 22px 0 12px; }
.sd-more-done { color: #a9adb5; font-size: 12.5px; text-shadow: 0 1px 3px rgba(0,0,0,.75); }
.sd-card { background: rgba(20,20,23,.72); border: 1px solid rgba(255,255,255,.09); border-radius: 12px; padding: 15px; display: flex; flex-direction: column; gap: 9px; backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); box-shadow: 0 2px 14px rgba(0,0,0,.18); }
.sd-card-head { display: flex; align-items: center; gap: 10px; }
.sd-card-name { font-weight: 600; font-size: 14.5px; }
.sd-card-desc { color: #9a9fa8; font-size: 12.5px; min-height: 38px; }
.sd-card-foot { display: flex; align-items: center; gap: 8px; color: #7a7f88; font-size: 12px; }
.sd-card-foot .sd-btn { margin-left: auto; }
.sd-cat { font-size: 11px; color: #9a9fa8; border: 1px solid rgba(255,255,255,.1); border-radius: 4px; padding: 0 6px; }
.sd-toggle { display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 9px; border-radius: 7px; border: 1px solid rgba(255,255,255,.07); background: transparent; color: #8b8f98; font-size: 12.5px; cursor: pointer; user-select: none; }
.sd-toggle:hover { border-color: rgba(255,255,255,.14); color: #cfd2d8; }
.sd-toggle.on { color: #35e0d2; border-color: rgba(53,224,210,.35); background: rgba(53,224,210,.07); }
.sd-toggle .box { width: 13px; height: 13px; border-radius: 3px; border: 1px solid currentColor; display: inline-flex; align-items: center; justify-content: center; font-size: 10px; line-height: 1; }
.sd-toggle .fish { font-size: 13px; filter: grayscale(1); opacity: .75; }
.sd-toggle.on .fish { filter: none; opacity: 1; }
.sd-dock { position: fixed; right: 148px; bottom: 132px; z-index: 9999; display: flex; justify-content: flex-end; pointer-events: none; }
.sd-dock .sd-bubble { pointer-events: auto; }
.sd-bubble { width: 380px; max-width: calc(100vw - 44px); background: rgba(20,20,23,.92); border: 1px solid rgba(255,255,255,.11); border-radius: 12px; box-shadow: 0 16px 48px rgba(0,0,0,.55); padding: 13px 15px; position: relative; animation: sd-in .18s ease-out; backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px); }
@keyframes sd-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
.sd-bubble:after { content: ''; position: absolute; right: 34px; bottom: -6px; width: 10px; height: 10px; background: rgba(20,20,23,.92); border-right: 1px solid rgba(255,255,255,.11); border-bottom: 1px solid rgba(255,255,255,.11); transform: rotate(45deg); }
.sd-bubble-text { font-size: 13px; color: #cfd2d8; line-height: 1.65; }
.sd-bubble-text em { font-style: normal; color: #35e0d2; }
.sd-bubble-actions { display: flex; gap: 8px; margin-top: 11px; }
.sd-pbtn { height: 28px; padding: 0 13px; border-radius: 7px; font-size: 12.5px; cursor: pointer; border: 1px solid rgba(255,255,255,.1); background: transparent; color: #cfd2d8; }
.sd-pbtn.main { border: none; background: linear-gradient(135deg, #35e0d2, #7aaaff); color: #06121a; font-weight: 600; }
.sd-steps { display: flex; flex-direction: column; gap: 8px; }
.sd-step { display: flex; gap: 8px; align-items: flex-start; font-size: 12.5px; color: #8b8f98; }
.sd-step .dot { width: 15px; height: 15px; flex: 0 0 15px; border-radius: 50%; border: 1px solid #3a3d44; display: inline-flex; align-items: center; justify-content: center; font-size: 9px; margin-top: 1px; }
.sd-step.ok .dot { border-color: rgba(53,224,210,.6); color: #35e0d2; background: rgba(53,224,210,.1); }
.sd-step.fail .dot { border-color: rgba(255,90,90,.6); color: #ff8080; background: rgba(255,90,90,.1); }
.sd-step.run .dot { border-color: rgba(122,170,255,.6); color: #7aaaff; }
.sd-step .lab { color: #cfd2d8; }
.sd-step .det { color: #7a7f88; font-size: 11.5px; }
.sd-step.fail .lab { color: #ff9a9a; }
.sd-done { font-size: 13px; color: #35e0d2; display: flex; align-items: center; gap: 6px; }
.sd-replace { display: inline-flex; align-items: center; gap: 8px; margin-top: 8px; padding: 5px 11px; border-radius: 8px; border: 1px solid rgba(201,169,106,.35); background: rgba(201,169,106,.06); color: #c9a96a; font-size: 12px; cursor: pointer; }
.sd-replace:hover { border-color: rgba(201,169,106,.6); background: rgba(201,169,106,.1); }
.sd-replace:disabled { opacity: .6; cursor: default; }
.sd-checkbox { width: 14px; height: 14px; border-radius: 3px; border: 1.5px solid currentColor; display: inline-flex; align-items: center; justify-content: center; font-size: 10px; line-height: 1; flex: 0 0 14px; }
.sd-status-wrap { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; z-index: 95; pointer-events: none; }
.sd-status { display: flex; align-items: center; gap: 12px; min-width: 280px; padding: 18px 28px; border-radius: 12px; background: rgba(20,20,23,.94); border: 1px solid rgba(255,255,255,.13); box-shadow: 0 18px 52px rgba(0,0,0,.55); color: #e8e8ea; font-size: 15px; backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); animation: sd-in .16s ease-out; }
.sd-status.none { color: #c9a96a; border-color: rgba(201,169,106,.34); }
.sd-status.ok { color: #35e0d2; border-color: rgba(53,224,210,.34); }
.sd-status-icon { font-size: 17px; line-height: 1; }
.sd-spin { width: 17px; height: 17px; flex: 0 0 17px; border-radius: 50%; border: 2px solid rgba(201,169,106,.25); border-top-color: #c9a96a; animation: sd-spin .7s linear infinite; }
@keyframes sd-spin { to { transform: rotate(360deg); } }
.sd-dim { opacity: .45; }
.sd-learn-grid { display: grid; grid-template-columns: 320px minmax(0, 1fr); gap: 16px; align-items: start; }
.sd-learn-list { display: flex; flex-direction: column; gap: 8px; max-height: 62vh; overflow-y: auto; padding-right: 4px; }
.sd-pick { text-align: left; background: rgba(20,20,23,.66); border: 1px solid rgba(255,255,255,.09); border-radius: 10px; padding: 10px 12px; cursor: pointer; color: #cfd2d8; display: flex; align-items: center; gap: 10px; }
.sd-pick:hover { border-color: rgba(255,255,255,.2); }
.sd-pick.on { border-color: rgba(53,224,210,.5); background: rgba(53,224,210,.07); }
.sd-pick .nm { font-size: 13px; font-weight: 600; }
.sd-pick .meta { color: #7a7f88; font-size: 11.5px; }
.sd-learn-main { min-width: 0; display: flex; flex-direction: column; gap: 12px; }
.sd-panel { background: rgba(20,20,23,.66); border: 1px solid rgba(255,255,255,.09); border-radius: 12px; padding: 14px 16px; }
.sd-panel h4 { margin: 0 0 10px; font-size: 13.5px; font-weight: 600; color: #e8e8ea; }
.sd-peer { display: flex; align-items: flex-start; gap: 10px; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,.05); }
.sd-peer:last-child { border-bottom: none; }
.sd-peer .nm { font-weight: 600; font-size: 13px; }
.sd-peer .meta { color: #7a7f88; font-size: 11.5px; }
.sd-score { margin-left: auto; font-size: 12px; color: #35e0d2; white-space: nowrap; }
.sd-authors { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.sd-author { font-size: 11.5px; padding: 2px 9px; border-radius: 999px; background: rgba(122,170,255,.1); color: #7aaaff; border: 1px solid rgba(122,170,255,.25); }
.sd-learn-actions { display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap; }
.sd-hint { color: #7a7f88; font-size: 12px; line-height: 1.6; }
.sd-upd-row { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,.05); }
.sd-upd-row:last-child { border-bottom: none; }
.sd-upd-row .nm { font-weight: 600; font-size: 13px; }
.sd-upd-row .meta { color: #7a7f88; font-size: 11.5px; }
.sd-tag { font-size: 11px; padding: 1px 7px; border-radius: 4px; white-space: nowrap; }
.sd-tag.ok { background: rgba(53,224,210,.12); color: #35e0d2; }
.sd-tag.warn { background: rgba(201,169,106,.14); color: #c9a96a; }
.sd-tag.info { background: #1c2230; color: #7aaaff; }
@media (max-width: 980px) { .sd-markets { grid-template-columns: repeat(2, minmax(0,1fr)); } .sd-learn-grid { grid-template-columns: 1fr; } }
@media (max-width: 640px) { .sd-markets { grid-template-columns: 1fr; } .sd-page-inner { padding: 14px 16px 48px; } }
`

    /* ---------------------------------------------------------------- */
    /* Icons                                                             */
    /* ---------------------------------------------------------------- */

    const svg = (children, size = 15, extra) => h('svg', {
      width: size,
      height: size,
      viewBox: '0 0 16 16',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.4,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': true,
      style: { display: 'block', ...(extra?.style ?? {}) },
      ...extra,
    }, children)

    const iconInfo = size => svg([
      h('circle', { key: 'c', cx: 8, cy: 8, r: 6.2 }),
      h('path', { key: 'p', d: 'M8 7.2v3.4' }),
      h('circle', { key: 'd', cx: 8, cy: 4.9, r: .6, fill: 'currentColor', stroke: 'none' }),
    ], size)

    const iconFolder = size => svg([
      h('path', { key: 'p', d: 'M2.2 4.4c0-.7.6-1.2 1.2-1.2h2.4l1.2 1.5h5.6c.7 0 1.2.6 1.2 1.2v5.4c0 .7-.6 1.2-1.2 1.2H3.4c-.7 0-1.2-.6-1.2-1.2z' }),
    ], size)

    const iconMinus = size => svg([h('path', { key: 'p', d: 'M3.6 8h8.8' })], size)
    const iconPlus = size => svg([h('path', { key: 'p', d: 'M3.6 8h8.8M8 3.6v8.8' })], size)

    const iconTrash = size => svg([
      h('path', { key: 'a', d: 'M3.2 5h9.6M6.4 5V3.6h3.2V5M4.6 5l.5 7.2h5.8L11.4 5' }),
    ], size)

    const iconGear = size => svg([
      h('path', { key: 'a', d: 'M6.6 1.8h2.8l.35 1.8 1.15.66 1.75-.62 1.4 2.42-1.45 1.15v1.34l1.45 1.15-1.4 2.42-1.75-.62-1.15.66-.35 1.8H6.6l-.35-1.8-1.15-.66-1.75.62-1.4-2.42 1.45-1.15V6.41L1.95 5.26l1.4-2.42 1.75.62 1.15-.66z' }),
      h('circle', { key: 'c', cx: 8, cy: 8, r: 1.7 }),
    ], size)

    const iconDownload = size => svg([
      h('path', { key: 'a', d: 'M8 2.6v7.1' }),
      h('path', { key: 'b', d: 'M4.9 6.6 8 9.9l3.1-3.3' }),
      h('path', { key: 'c', d: 'M3.4 12.6h9.2' }),
    ], size)

    const iconLearn = size => svg([
      h('path', { key: 'a', d: 'M2.6 3.4h5.2v10.2H2.6z' }),
      h('path', { key: 'b', d: 'M8.2 3.4h5.2v10.2H8.2' }),
      h('path', { key: 'c', d: 'M4.4 6.2h2M4.4 8.8h2.6M9.8 6.2h2M9.8 8.8h2' }),
    ], size)

    const iconRefresh = size => svg([
      h('path', { key: 'a', d: 'M13.2 8A5.2 5.2 0 1 1 11.4 4' }),
      h('path', { key: 'b', d: 'M13.2 2.4v2.8h-2.8' }),
    ], size)

    const iconMarket = size => svg([
      h('path', { key: 'a', d: 'M2.6 5.6V13h10.8V5.6' }),
      h('path', { key: 'b', d: 'M1.8 5.6 3.2 2.6h9.6l1.4 3z' }),
      h('path', { key: 'c', d: 'M6 8.2a2 2 0 0 0 4 0' }),
    ], size)

    const iconBack = size => svg([h('path', { key: 'p', d: 'M9.6 3.2 4.8 8l4.8 4.8' })], size)
    const iconArrow = size => svg([h('path', { key: 'p', d: 'M3 8h9M8.4 4.2 12.2 8l-3.8 3.8' })], size)

    const ICONS = {
      'word-docx': '📘',
      'excel-report': '📊',
      'ppt-deck': '📽️',
      'pdf-toolkit': '📕',
      'crawler-kit': '🕸️',
      'web-crawler-pro': '🕷️',
      'git-tools': '🌿',
      'sqlite-query': '🗄️',
      'markdown-writer': '📝',
      'html-report': '🌐',
      'csv-tools': '📑',
      'json-formatter': '🧾',
      'data-cleaner': '🧹',
      'chart-maker': '📈',
      'docker-helper': '🐳',
      'api-mock': '🔌',
      'regex-tester': '🎯',
      'code-review': '🔍',
      'unit-test-helper': '🧪',
      'log-analyzer': '📜',
      'db-migrate': '🧱',
      'secrets-scanner': '🔐',
      'http-client': '📡',
      'rss-reader': '📰',
      'sitemap-checker': '🗺️',
      'calendar-sync': '📅',
      'email-draft': '✉️',
      'meeting-notes': '🗒️',
      'translate-docs': '🌏',
      'form-builder': '📋',
      'image-optimizer': '🖼️',
    }

    function skillEmoji(name) {
      return ICONS[name] ?? '🐟'
    }

    /* ---------------------------------------------------------------- */
    /* Host bridge                                                       */
    /* ---------------------------------------------------------------- */

    async function api(route, options) {
      const response = await fetch(`${API}${route}`, {
        method: options?.method ?? (options?.body === undefined ? 'GET' : 'POST'),
        headers: options?.body === undefined ? undefined : { 'content-type': 'application/json' },
        body: options?.body === undefined ? undefined : JSON.stringify(options.body),
        credentials: 'same-origin',
      })
      let payload = null
      try {
        payload = await response.json()
      } catch {
        payload = null
      }
      if (payload === null) throw new Error(`HTTP ${response.status}`)
      if (payload.ok === false) {
        const failed = Array.isArray(payload.steps)
          ? [...payload.steps].reverse().find(step => step.status === 'fail')
          : undefined
        const message = typeof payload.error === 'string'
          ? (failed?.detail ?? payload.error)
          : (payload.error?.message ?? payload.message ?? `HTTP ${response.status}`)
        throw new Error(message)
      }
      return payload
    }

    function useToasts() {
      const [toasts, setToasts] = useState([])
      const push = useCallback((text, tone) => {
        const id = Math.random().toString(36).slice(2)
        setToasts(current => [...current, { id, text, tone }])
        setTimeout(() => setToasts(current => current.filter(item => item.id !== id)), 2600)
      }, [])
      return [toasts, push]
    }

    /* ---------------------------------------------------------------- */
    /* Composer switch                                                   */
    /* ---------------------------------------------------------------- */

    function storageKey(sessionId) {
      return `skill-detective:on:${sessionId ?? 'global'}`
    }

    function DetectiveToggle(props) {
      const { sessionId, t } = props
      const [on, setOn] = useState(false)

      useEffect(() => {
        let saved = false
        try {
          saved = window.localStorage.getItem(storageKey(sessionId)) === '1'
        } catch {
          saved = false
        }
        setOn(saved)
        let alive = true
        if (sessionId) {
          api(`/checkbox?sessionId=${encodeURIComponent(String(sessionId))}`)
            .then(payload => {
              if (!alive) return
              if (payload.known === true) {
                setOn(payload.enabled === true)
                try {
                  window.localStorage.setItem(storageKey(sessionId), payload.enabled === true ? '1' : '0')
                } catch {
                  /* ignore */
                }
              } else {
                api('/checkbox', { body: { sessionId, enabled: saved } }).catch(() => {})
              }
            })
            .catch(() => {})
        }
        return () => {
          alive = false
        }
      }, [sessionId])

      const toggle = () => {
        const next = !on
        setOn(next)
        try {
          window.localStorage.setItem(storageKey(sessionId), next ? '1' : '0')
        } catch {
          /* ignore */
        }
        if (sessionId) {
          api('/checkbox', { body: { sessionId, enabled: next } }).catch(() => {})
        }
      }

      return React.createElement(React.Fragment, null,
        h('style', { key: 'sd-css' }, CSS),
        h('button', {
          key: 'sd-toggle',
          type: 'button',
          className: `sd-toggle${on ? ' on' : ''}`,
          title: t('toggleHint'),
          'aria-pressed': on ? 'true' : 'false',
          onClick: toggle,
          style: { marginLeft: 2 },
        },
          h('span', { className: 'box' }, on ? '✓' : ''),
          h('span', { className: 'fish' }, '🐟'),
          h('span', null, t('toggleOn')),
        ),
      )
    }

    /* ---------------------------------------------------------------- */
    /* Recommendation bubble                                             */
    /* ---------------------------------------------------------------- */

    const FALLBACK_STEPS = [
      { id: 'analyze', labelKey: 'stepAnalyze' },
      { id: 'search', labelKey: 'stepSearch' },
      { id: 'audit', labelKey: 'stepAudit' },
      { id: 'download', labelKey: 'stepDownload' },
      { id: 'enable', labelKey: 'stepEnable' },
    ]

    function DetectiveDock(props) {
      const { t } = props
      const [view, setView] = useState(null)
      const [steps, setSteps] = useState([])
      const [fade, setFade] = useState(false)
      const timerRef = useRef(null)
      const doneRef = useRef(false)
      const sessionRef = useRef('')
      const viewRef = useRef(null)
      viewRef.current = view

      const clearTimers = () => {
        if (timerRef.current !== null) {
          clearTimeout(timerRef.current)
          timerRef.current = null
        }
      }

      const schedule = (fn, ms) => {
        clearTimers()
        timerRef.current = setTimeout(fn, ms)
      }

      // Poll the host for a recommendation produced by a committed user message.
      // The host picks the newest pending across Sessions because this seat is
      // frame-wide: it must keep showing while a question composer replaces the
      // conversation composer.
      useEffect(() => {
        let alive = true
        const tick = async () => {
          try {
            const payload = await api('/pending/latest')
            if (!alive || !payload.pending) return
            if (doneRef.current) return
            if (viewRef.current !== null) return
            const pending = payload.pending
            sessionRef.current = payload.sessionId ?? ''
            if (pending.kind === 'covered') {
              setView({ kind: 'covered', name: pending.name })
              if (sessionRef.current) api('/dismiss', { body: { sessionId: sessionRef.current } }).catch(() => {})
              schedule(() => setView(null), 3200)
              return
            }
            if (pending.kind === 'recommend') {
              setView({ kind: 'recommend', label: pending.label, need: pending.need, candidates: pending.candidates, searchText: pending.searchText })
            }
          } catch {
            /* the host may still be booting */
          }
        }
        tick()
        const handle = setInterval(tick, 1800)
        return () => {
          alive = false
          clearInterval(handle)
          clearTimers()
        }
      }, [])

      const dismiss = async () => {
        setView(null)
        clearTimers()
        if (sessionRef.current) await api('/dismiss', { body: { sessionId: sessionRef.current } }).catch(() => {})
      }

      const start = async (needArg, labelArg) => {
        const need = needArg ?? view?.need
        const label = labelArg ?? view?.label
        const searchText = view?.searchText ?? ''
        if (need === undefined || label === undefined) return
        doneRef.current = false
        setFade(false)
        setSteps(FALLBACK_STEPS.map(step => ({
          id: step.id,
          label: t(step.labelKey),
          detail: step.id === 'analyze' ? `识别到「${label}」需求` : '',
          status: 'pending',
        })))
        setView({ kind: 'progress' })

        // Light up the visual steps while the host works.
        let cursor = 0
        const advance = () => {
          cursor += 1
          setSteps(current => current.map((step, index) => {
            if (index < cursor) return { ...step, status: step.status === 'fail' ? 'fail' : 'ok' }
            if (index === cursor) return { ...step, status: 'run' }
            return step
          }))
          if (cursor < FALLBACK_STEPS.length) {
            timerRef.current = setTimeout(advance, 420)
          }
        }
        timerRef.current = setTimeout(advance, 380)

        try {
          const result = await api('/install', {
            body: { need, sessionId: sessionRef.current, text: searchText },
          })
          clearTimers()
          const real = Array.isArray(result.steps) ? result.steps : []
          if (real.length > 0) {
            // Reveal the host's real steps in order so the progress view shows
            // what actually happened instead of a single instant jump.
            const mapped = real.map(step => ({
              id: step.id,
              label: step.label,
              detail: step.detail,
              status: step.status === 'fail' ? 'fail' : step.status === 'skip' ? 'skip' : 'ok',
            }))
            for (let index = 1; index <= mapped.length; index += 1) {
              setSteps(mapped.slice(0, index))
              await new Promise(resolve => setTimeout(resolve, 400))
            }
          }
          if (result.ok) {
            doneRef.current = true
            setView({ kind: 'done', name: result.name })
            if (sessionRef.current) api('/dismiss', { body: { sessionId: sessionRef.current } }).catch(() => {})
            schedule(() => {
              setFade(true)
              schedule(() => setView(null), 420)
            }, 4200)
          } else {
            setView({ kind: 'none', need, label })
          }
        } catch (error) {
          clearTimers()
          setSteps(current => current.map((step, index) => (index === 0 && step.status === 'pending' ? { ...step, status: 'fail', detail: String(error.message ?? error) } : step)))
          setView({ kind: 'none', need, label })
        }
      }

      if (view === null) return null

      let body = null
      if (view.kind === 'recommend') {
        body = h(React.Fragment, null,
          h('div', { className: 'sd-bubble-text' }, '🐟 ', h('em', null, t('bubbleAsk', { label: view.label }))),
          h('div', { className: 'sd-bubble-actions' },
            h('button', { className: 'sd-pbtn main', type: 'button', onClick: () => start() }, t('find')),
            h('button', { className: 'sd-pbtn', type: 'button', onClick: dismiss }, t('notNow')),
          ),
        )
      } else if (view.kind === 'progress') {
        body = h('div', null,
          h('div', { className: 'sd-sub', style: { marginBottom: 8 } }, t('progressKicker')),
          h('div', { className: 'sd-steps' }, steps.map(step => h('div', { key: step.id, className: `sd-step ${step.status}` },
            h('span', { className: 'dot' }, step.status === 'ok' ? '✓' : step.status === 'fail' ? '×' : step.status === 'run' ? '·' : ''),
            h('div', null,
              h('div', { className: 'lab' }, step.label),
              step.detail ? h('div', { className: 'det' }, step.detail) : null,
            ),
          ))),
        )
      } else if (view.kind === 'done') {
        body = h('div', { className: 'sd-done' }, '✓ ', t('doneLine', { name: view.name }))
      } else if (view.kind === 'covered') {
        body = h('div', { className: 'sd-bubble-text' }, '✓ ', t('coveredLine', { name: view.name }))
      } else if (view.kind === 'none') {
        body = h(React.Fragment, null,
          h('div', { className: 'sd-bubble-text' }, '🐟 ', t('noneLine')),
          h('div', { className: 'sd-bubble-actions' },
            h('button', { className: 'sd-pbtn main', type: 'button', onClick: () => start(view.need, view.label) }, t('retry')),
            h('button', { className: 'sd-pbtn', type: 'button', onClick: () => setView(null) }, t('close')),
          ),
        )
      }

      return h('div', { className: `sd-dock${fade ? ' sd-dim' : ''}` },
        h('style', { key: 'sd-css' }, CSS),
        h('div', { className: 'sd-bubble', role: 'status' }, body),
      )
    }

    /* ---------------------------------------------------------------- */
    /* Manager page                                                      */
    /* ---------------------------------------------------------------- */

    const ORIGIN_META = {
      plugin: { labelKey: 'plugin', badge: '', groupKey: 'groupPlugin' },
      market: { labelKey: 'marketOrigin', badge: '', groupKey: 'groupMarket' },
      learned: { labelKey: 'learned', badge: '', groupKey: 'groupLearned' },
      scan: { labelKey: 'scanOrigin', badge: 'grey', groupKey: 'groupScan' },
      user: { labelKey: 'user', badge: 'grey', groupKey: 'groupUser' },
    }

    function scopeLabel(scope, t) {
      if (scope === 'global') return t('scopeGlobal')
      if (scope === 'temp') return t('scopeTemp')
      if (scope === 'bundled') return t('scopeBundled')
      return t('scopeWorkspace')
    }

    function Row(props) {
      const { skill, t, onDetail, onOpen, onToggle, onAskDelete, onReplace, replacing, deleting, busy } = props
      const meta = ORIGIN_META[skill.origin] ?? ORIGIN_META.user
      const managed = skill.managed !== false
      const status = !skill.enabled
        ? { text: t('disabled'), cls: 'grey' }
        : !managed
          ? { text: t('bundledBadge'), cls: 'grey' }
          : skill.origin === 'user'
            ? { text: t('local'), cls: 'grey' }
            : { text: t('reviewed'), cls: '' }
      const authorText = String(skill.author ?? '')
      const pluginLabel = skill.packageName || skill.provider || ''
      const sourceLine = skill.origin === 'user'
        ? null
        : skill.origin === 'learned'
          ? `整合自本地同类技能${authorText ? ` · 作者 ${authorText.length > 60 ? `${authorText.slice(0, 60)}…` : authorText}` : ''}`
          : skill.origin === 'scan'
            ? `${pluginLabel ? `插件 ${pluginLabel}` : t('scanOrigin')}${skill.path ? ` · ${skill.path}` : ''}`
            : `${skill.source || `skills.sh/${skill.name}`}${authorText ? ` · 作者 ${authorText}` : ''}`
      const metaParts = [
        skill.origin === 'user' ? '本地' : skill.origin === 'scan' ? t('scanOrigin') : skill.origin === 'learned' ? '本地学习' : skill.source ? 'skills.sh' : '',
        skill.installs !== null ? `${skill.installsLabel} 安装` : '',
        skill.sizeLabel,
        scopeLabel(skill.scope, t),
        skill.timeLabel,
      ].filter(part => part !== '' && part !== undefined)

      if (deleting) {
        return h('div', { className: 'sd-delbar' },
          h('span', null, t('delConfirm', { name: skill.name })),
          h('span', { className: 'sd-spacer' }),
          h('button', { className: 'sd-btn danger', type: 'button', onClick: () => onAskDelete(skill, 'confirm') }, t('confirmDel')),
          h('button', { className: 'sd-btn', type: 'button', onClick: () => onAskDelete(skill, 'cancel') }, t('cancel')),
        )
      }

      return h('div', { className: `sd-row${skill.enabled ? '' : ' off'}` },
        h('div', { className: 'sd-icon' }, skillEmoji(skill.name)),
        h('div', { className: 'sd-main' },
          h('div', { className: 'sd-name-line' },
            h('span', { className: 'sd-name' }, skill.name),
            h('span', { className: 'sd-ver' }, `v${skill.version}`),
            h('span', { className: `sd-badge${meta.badge ? ` ${meta.badge}` : ''}` }, t(meta.labelKey)),
          ),
          h('div', { className: 'sd-meta' }, metaParts.join(' · ')),
          sourceLine ? h('div', { className: 'sd-subline' }, sourceLine) : null,
          h('div', { className: `sd-subline${skill.permWarn ? ' warn' : ''}` }, `最高权限：${skill.permLabel}`),
          !skill.enabled && managed
            ? h('button', {
              className: 'sd-replace',
              type: 'button',
              title: t('replaceHint'),
              disabled: busy || replacing === skill.name,
              onClick: () => onReplace(skill),
            },
              h('span', { className: 'sd-checkbox' }, replacing === skill.name ? '…' : ''),
              h('span', null, replacing === skill.name ? t('replacing') : t('replaceAsk')),
            )
            : null,
        ),
        h('div', { className: 'sd-actions' },
          h('span', { className: `sd-badge${status.cls ? ` ${status.cls}` : ''}` }, status.text),
          h('button', { className: 'sd-iconbtn', type: 'button', title: t('detail'), onClick: () => onDetail(skill) }, iconInfo(15)),
          skill.path
            ? h('button', { className: 'sd-iconbtn', type: 'button', title: t('openFolder'), onClick: () => onOpen(skill) }, iconFolder(15))
            : null,
          skill.path
            ? h('button', {
              className: 'sd-iconbtn', type: 'button', title: skill.enabled ? t('disable') : t('enable'),
              disabled: busy, onClick: () => onToggle(skill),
            }, skill.enabled ? iconMinus(15) : iconPlus(15))
            : null,
          managed
            ? h('button', { className: 'sd-iconbtn danger', type: 'button', title: t('del'), onClick: () => onAskDelete(skill, 'ask') }, iconTrash(15))
            : h('span', { className: 'sd-badge grey', title: t('bundledHint') }, t('bundledBadge')),
        ),
      )
    }

    function DetailModal(props) {
      const { name, workspace, t, onClose, onOpen, onToggle, onDelete } = props
      const [data, setData] = useState(null)
      const [error, setError] = useState('')

      useEffect(() => {
        const onKey = event => {
          if (event.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [onClose])

      useEffect(() => {
        let alive = true
        api(`/detail?name=${encodeURIComponent(name)}&workspace=${encodeURIComponent(workspace ?? '')}`)
          .then(payload => {
            if (alive) setData(payload)
          })
          .catch(err => {
            if (alive) setError(err.message)
          })
        return () => {
          alive = false
        }
      }, [name, workspace])

      const skill = data?.skill
      return h('div', { className: 'sd-overlay', onMouseDown: event => { if (event.target === event.currentTarget) onClose() } },
        h('div', { className: 'sd-modal', role: 'dialog', 'aria-modal': 'true' },
          h('h3', null, name),
          skill ? h('div', { className: 'sd-muted' }, `v${skill.version} · ${skill.origin === 'user' ? t('user') : skill.origin === 'market' ? t('marketOrigin') : skill.origin === 'learned' ? t('learned') : skill.origin === 'scan' ? t('scanOrigin') : t('plugin')} · ${scopeLabel(skill.scope, t)}`) : h('div', { className: 'sd-muted' }, '…'),
          error ? h('div', { style: { color: '#ff8080', fontSize: 12, marginTop: 8 } }, error) : null,
          skill && skill.managed === false ? h('div', { className: 'sd-hint' }, t('bundledHint')) : null,
          skill ? h('dl', { className: 'sd-kv' },
            h('dt', null, t('source')), h('dd', null, skill.source || '本地'),
            h('dt', null, t('installs')), h('dd', null, skill.installs !== null ? `${skill.installsLabel} 安装` : '—'),
            h('dt', null, t('size')), h('dd', null, skill.sizeLabel),
            h('dt', null, t('scope')), h('dd', null, scopeLabel(skill.scope, t)),
            h('dt', null, t('installedAt')), h('dd', null, skill.installedAt ? new Date(skill.installedAt).toLocaleString() : '—'),
            h('dt', null, t('scanPath')), h('dd', null, skill.path ?? '—'),
            h('dt', null, t('status')), h('dd', null, skill.status),
            h('dt', null, t('perm')), h('dd', { style: skill.permWarn ? { color: '#c9a96a' } : undefined }, skill.permLabel),
          ) : null,
          data ? h('div', null,
            h('div', { className: 'sd-h4' }, t('fileTree')),
            h('div', { className: 'sd-tree' }, data.tree.map((item, index) => h('div', { key: index }, `${'  '.repeat(Math.max(0, item.depth))}${item.type === 'dir' ? '▸ ' : '· '}${item.path.split('/').pop()}${item.size !== undefined ? `  (${item.size} B)` : ''}`))),
            h('div', { className: 'sd-h4' }, `${t('preview')} · ${data.previewBytes} B`),
            h('pre', { className: 'sd-pre' }, data.preview.slice(0, 20000)),
          ) : null,
          h('div', { className: 'sd-modal-foot' },
            skill && skill.path ? h('button', { className: 'sd-btn', type: 'button', onClick: () => { onOpen(skill) } }, t('openFolder')) : null,
            skill && skill.path ? h('button', { className: 'sd-btn', type: 'button', onClick: () => { onToggle(skill); onClose() } }, skill.enabled ? t('disable') : t('enable')) : null,
            skill && skill.managed !== false ? h('button', { className: 'sd-btn danger', type: 'button', onClick: () => { onDelete(skill); onClose() } }, t('del')) : null,
            h('button', { className: 'sd-btn primary', type: 'button', onClick: onClose }, t('close')),
          ),
        ),
      )
    }

    function SettingsModal(props) {
      const { data, t, onClose, onSaved } = props
      const workspaces = data.workspaces ?? []
      const [defaultScope, setDefaultScope] = useState(data.settings.defaultScope ?? 'workspace')
      const [rows, setRows] = useState(() => {
        const map = {}
        for (const skill of data.installed) {
          // Read-only (bundled / inline) skills have no movable directory.
          if (skill.managed === false) continue
          map[skill.name] = { scope: skill.scope === 'global' ? 'global' : skill.scope === 'temp' ? 'temp' : 'workspace', workspaces: [data.workspace] }
        }
        return map
      })
      const [saving, setSaving] = useState(false)
      const [error, setError] = useState('')

      useEffect(() => {
        const onKey = event => {
          if (event.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [onClose])

      const setRow = (name, patch) => setRows(current => ({ ...current, [name]: { ...current[name], ...patch } }))

      const restore = async need => {
        try {
          await api('/restore-suppressed', { body: { need } })
          onSaved?.()
        } catch (err) {
          setError(err.message)
        }
      }

      const save = async () => {
        setSaving(true)
        setError('')
        try {
          await api('/settings', { body: { defaultScope } })
          for (const skill of data.installed) {
            if (skill.managed === false) continue
            const row = rows[skill.name]
            if (row === undefined) continue
            const changed = row.scope !== (skill.scope === 'global' ? 'global' : skill.scope === 'temp' ? 'temp' : 'workspace')
            if (!changed) continue
            await api('/scope', {
              body: { name: skill.name, scope: row.scope, workspaces: row.workspaces, workspace: data.workspace },
            })
          }
          onSaved()
          onClose()
        } catch (err) {
          setError(err.message)
        } finally {
          setSaving(false)
        }
      }

      return h('div', { className: 'sd-overlay', onMouseDown: event => { if (event.target === event.currentTarget) onClose() } },
        h('div', { className: 'sd-modal', role: 'dialog', 'aria-modal': 'true' },
          h('h3', null, t('settingsTitle')),
          h('div', { className: 'sd-muted' }, t('defaultScopeHint')),
          h('div', { className: 'sd-h4' }, t('defaultScope')),
          h('div', { className: 'sd-radios' },
            h('button', {
              type: 'button', className: `sd-radio${defaultScope === 'workspace' ? ' on' : ''}`,
              onClick: () => setDefaultScope('workspace'),
            }, h('b', null, t('workspaceCard')), h('span', null, t('workspaceHint'))),
            h('button', {
              type: 'button', className: `sd-radio${defaultScope === 'global' ? ' on' : ''}`,
              onClick: () => setDefaultScope('global'),
            }, h('b', null, t('globalCard')), h('span', null, t('globalHint'))),
          ),
          h('div', { className: 'sd-h4' }, t('scopeRows')),
          h('div', { className: 'sd-muted', style: { marginBottom: 6 } }, t('scopeRowsHint')),
          data.installed.filter(skill => skill.managed !== false).map(skill => {
            const row = rows[skill.name]
            return h('div', { key: skill.name },
              h('div', { className: 'sd-srow' },
                h('span', { className: 'nm' }, skill.name),
                h('select', {
                  className: 'sd-select',
                  value: row?.scope ?? 'workspace',
                  onChange: event => setRow(skill.name, { scope: event.target.value }),
                },
                  h('option', { value: 'temp' }, t('scopeTemp')),
                  h('option', { value: 'workspace' }, t('scopeWorkspace')),
                  h('option', { value: 'global' }, t('scopeGlobal')),
                ),
              ),
              row?.scope === 'workspace'
                ? h('div', { className: 'sd-wschips' }, workspaces.map(item => {
                  const active = (row.workspaces ?? []).includes(item.path)
                  return h('button', {
                    key: item.path,
                    type: 'button',
                    className: `sd-wschip${active ? ' on' : ''}`,
                    onClick: () => setRow(skill.name, {
                      workspaces: active
                        ? (row.workspaces ?? []).filter(path => path !== item.path)
                        : [...(row.workspaces ?? []), item.path],
                    }),
                  }, item.title)
                }))
                : null,
            )
          }),
          h('div', { className: 'sd-h4' }, t('suppressedTitle')),
          h('div', { className: 'sd-muted', style: { marginBottom: 6 } }, t('suppressedHint')),
          (data.suppressed ?? []).length === 0
            ? h('div', { className: 'sd-hint', style: { padding: '6px 0 2px' } }, t('suppressedEmpty'))
            : h('div', null, (data.suppressed ?? []).map(item => h('div', { key: item.need, className: 'sd-srow' },
              h('span', { className: 'nm' }, `${item.label}${item.skill ? ` · ${item.skill}` : ''}`),
              h('span', { className: 'sd-muted', style: { marginRight: 8 } }, item.timeLabel),
              h('button', {
                className: 'sd-btn', type: 'button',
                onClick: () => restore(item.need),
              }, t('restore')),
            ))),
          error ? h('div', { style: { color: '#ff8080', fontSize: 12, marginTop: 10 } }, error) : null,
          h('div', { className: 'sd-modal-foot' },
            h('button', { className: 'sd-btn', type: 'button', onClick: onClose }, t('cancel')),
            h('button', { className: 'sd-btn primary', type: 'button', disabled: saving, onClick: save }, saving ? t('saving') : t('save')),
          ),
        ),
      )
    }

    function UpdatesModal(props) {
      const { t, workspace, onClose, onInstalled, pushToast } = props
      const [items, setItems] = useState(null)
      const [error, setError] = useState('')
      const [busy, setBusy] = useState({})

      useEffect(() => {
        let alive = true
        api(`/updates?workspace=${encodeURIComponent(workspace ?? '')}`)
          .then(payload => {
            if (!alive) return
            setItems(payload.updates)
            setError('')
          })
          .catch(err => {
            if (alive) setError(err.message)
          })
        return () => {
          alive = false
        }
      }, [workspace])

      useEffect(() => {
        const onKey = event => {
          if (event.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [onClose])

      const install = async name => {
        setBusy(current => ({ ...current, [name]: true }))
        try {
          const result = await api('/install', { body: { name, origin: 'market', workspace } })
          if (result.ok) {
            pushToast(`${t('learnedOk', { name: result.name })} ✓`)
            onInstalled?.()
          } else {
            pushToast(t('noneLine'))
          }
        } catch (err) {
          pushToast(err.message)
        } finally {
          setBusy(current => ({ ...current, [name]: false }))
        }
      }

      return h('div', { className: 'sd-overlay', onMouseDown: event => { if (event.target === event.currentTarget) onClose() } },
        h('div', { className: 'sd-modal', role: 'dialog', 'aria-modal': 'true' },
          h('h3', null, t('updatesTitle')),
          h('div', { className: 'sd-muted' }, t('updatesHint')),
          error ? h('div', { style: { color: '#ff8080', fontSize: 12.5, marginTop: 10 } }, error) : null,
          items === null ? h('div', { className: 'sd-hint', style: { padding: '22px 0' } }, t('checking')) : null,
          items !== null && items.length === 0 ? h('div', { className: 'sd-hint', style: { padding: '22px 0' } }, t('noUpdates')) : null,
          items !== null && items.length > 0 ? h('div', { style: { marginTop: 12 } }, items.map(item => h('div', { key: item.name, className: 'sd-upd-row' },
            h('div', { style: { minWidth: 0, flex: 1 } },
              h('div', { className: 'sd-name-line' },
                h('span', { className: 'nm' }, item.name),
                h('span', { className: 'sd-ver' }, `v${item.version}`),
                h('span', { style: { color: '#7a7f88', fontSize: 11.5 } }, item.category),
              ),
              h('div', { className: 'meta' }, [
                item.installsLabel !== '—' ? `${item.installsLabel} 安装` : '',
                item.status === 'update' ? t('updateNewer', { v: item.newer }) : '',
                item.suggestion ? t('updateBetter', { name: item.suggestion.name }) : '',
              ].filter(Boolean).join(' · ')),
            ),
            item.status === 'latest'
              ? h('span', { className: 'sd-tag ok' }, t('updateLatest'))
              : item.status === 'update'
                ? h('span', { className: 'sd-tag warn' }, t('updateNewer', { v: item.newer }))
                : h('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
                  h('span', { className: 'sd-tag info' }, t('updateBetter', { name: item.suggestion.name })),
                  item.suggestion && !item.suggestion.installed
                    ? h('button', {
                      className: 'sd-btn primary', type: 'button', disabled: busy[item.suggestion.name] === true,
                      onClick: () => install(item.suggestion.name),
                    }, busy[item.suggestion.name] === true ? t('installing') : t('installAlt'))
                    : null,
                ),
          ))) : null,
          h('div', { className: 'sd-modal-foot' },
            h('button', { className: 'sd-btn primary', type: 'button', onClick: onClose }, t('close')),
          ),
        ),
      )
    }

    function LearnView(props) {
      const { t, workspace, installed, onBack, onInstalled, pushToast } = props
      const [selected, setSelected] = useState('')
      const [analysis, setAnalysis] = useState(null)
      const [loading, setLoading] = useState(false)
      const [error, setError] = useState('')
      const [building, setBuilding] = useState(false)
      const [batch, setBatch] = useState(null)
      const [batchRunning, setBatchRunning] = useState(false)
      const [authorModal, setAuthorModal] = useState(null)
      const [showDraft, setShowDraft] = useState(false)

      const analyze = async name => {
        setSelected(name)
        setAnalysis(null)
        setError('')
        setShowDraft(false)
        setLoading(true)
        try {
          const result = await api('/learn', { body: { name, workspace, dryRun: true } })
          setAnalysis(result)
        } catch (err) {
          setError(err.message)
        } finally {
          setLoading(false)
        }
      }

      const build = async () => {
        if (selected === '') return
        setBuilding(true)
        try {
          const result = await api('/learn', { body: { name: selected, workspace } })
          pushToast(t('learnedOk', { name: result.name }))
          onInstalled?.()
          setAnalysis(null)
          setSelected('')
        } catch (err) {
          pushToast(err.message)
        } finally {
          setBuilding(false)
        }
      }

      const learnAll = async () => {
        setBatchRunning(true)
        setBatch(null)
        try {
          const result = await api('/learn-all', { body: { workspace } })
          setBatch(result)
          onInstalled?.()
          pushToast(t('learnAllDone', { n: result.learned, m: result.skipped }))
        } catch (err) {
          pushToast(err.message)
        } finally {
          setBatchRunning(false)
        }
      }

      const authors = analysis?.merged?.authors ?? []
      const visibleAuthors = authors.slice(0, 3)

      return h('div', { className: 'sd-page-inner' },
        h('div', { className: 'sd-topbar' },
          h('button', { className: 'sd-back', type: 'button', title: t('back'), onClick: onBack }, iconBack(16)),
          h('span', { className: 'sd-title' }, t('learnTitle')),
          h('span', { className: 'sd-sub' }, t('learnHint')),
          h('span', { className: 'sd-spacer' }),
          h('button', { className: 'sd-toplink', type: 'button', disabled: batchRunning, onClick: learnAll },
            iconMarket(15), batchRunning ? t('learnAllRunning') : t('learnAll')),
        ),
        h('div', { className: 'sd-learn-grid' },
          h('div', null,
            h('div', { className: 'sd-group-title' }, t('learnPick')),
            h('div', { className: 'sd-learn-list' },
              installed.map(skill => h('button', {
                key: skill.name,
                type: 'button',
                className: `sd-pick${selected === skill.name ? ' on' : ''}`,
                onClick: () => analyze(skill.name),
              },
                h('span', { className: 'sd-icon', style: { width: 30, height: 30, flex: '0 0 30px', fontSize: 15, borderRadius: 8 } }, skillEmoji(skill.name)),
                h('span', { style: { minWidth: 0, textAlign: 'left' } },
                  h('span', { className: 'nm', style: { display: 'block' } }, skill.name),
                  h('span', { className: 'meta', style: { display: 'block' } }, `v${skill.version} · ${skill.category || '未分类'}`),
                ),
              )),
              installed.length === 0 ? h('div', { className: 'sd-hint' }, t('emptyHint')) : null,
            ),
          ),
          h('div', { className: 'sd-learn-main' },
            h('div', { className: 'sd-group-title' }, analysis !== null
              ? `${t('peersTitle')} · ${analysis.peers.length + 1}`
              : '\u00a0'),
            error !== '' ? h('div', { className: 'sd-panel' }, h('div', { style: { color: '#ff9a9a', fontSize: 13 } }, error)) : null,
            loading ? h('div', { className: 'sd-panel' }, h('div', { className: 'sd-hint' }, t('analyzing'))) : null,
            analysis !== null ? h(React.Fragment, null,
              h('div', { className: 'sd-panel' },
                h('div', { className: 'sd-hint', style: { marginBottom: 8 } }, `${analysis.source.name} · ${analysis.source.author || '—'} · ${analysis.source.category || ''}`),
                h('div', null, analysis.peers.map(peer => h('div', { key: peer.name, className: 'sd-peer' },
                  h('div', { style: { minWidth: 0, flex: 1 } },
                    h('div', { className: 'sd-name-line' },
                      h('span', { className: 'nm' }, peer.name),
                      h('span', { className: 'sd-ver' }, `v${peer.version}`),
                      h('span', { className: `sd-badge${peer.installed ? '' : ' grey'}` }, peer.installed ? t('installed') : peer.author),
                    ),
                    h('div', { className: 'meta' }, `${peer.installsLabel} · ${peer.permLabel}${peer.installed ? ' · 已安装' : ''}`),
                    h('div', { className: 'sd-hint', style: { marginTop: 4 } }, [...peer.pros.map(x => `＋${x}`), ...peer.cons.map(x => `－${x}`)].join('  ')),
                  ),
                  h('span', { className: 'sd-score' }, `${t('matchScore')} ${peer.score}`),
                ))),
              ),
              h('div', { className: 'sd-panel' },
                h('h4', null, t('authorsTitle')),
                h('div', { className: 'sd-authors' },
                  visibleAuthors.map(author => h('span', { key: author, className: 'sd-author' }, author)),
                  authors.length > 3
                    ? h('button', { className: 'sd-btn', type: 'button', onClick: () => setAuthorModal(authors) }, t('authorsMore', { n: authors.length - 3 }))
                    : null,
                ),
                h('div', { className: 'sd-learn-actions' },
                  h('button', { className: 'sd-btn', type: 'button', onClick: () => setShowDraft(current => !current) }, showDraft ? t('mergedTitle') + ' ▴' : t('mergedTitle') + ' ▾'),
                  h('button', {
                    className: 'sd-btn primary', type: 'button', disabled: building || (analysis.audit && analysis.audit.poison),
                    onClick: build,
                  }, building ? t('generating') : t('generateMerged')),
                ),
                analysis.audit && analysis.audit.poison
                  ? h('div', { style: { color: '#ff9a9a', fontSize: 12, marginTop: 8 } }, t('auditFailed'))
                  : null,
                showDraft ? h('pre', { className: 'sd-pre', style: { marginTop: 10 } }, analysis.merged.markdown) : null,
              ),
            ) : null,
            batch !== null ? h('div', { className: 'sd-panel' },
              h('h4', null, t('learnAllDone', { n: batch.learned, m: batch.skipped })),
              h('div', null, batch.results.map(item => h('div', { key: item.name, className: 'sd-peer' },
                h('div', { style: { minWidth: 0, flex: 1 } },
                  h('div', { className: 'sd-name-line' },
                    h('span', { className: 'nm' }, item.name),
                    h('span', { className: `sd-tag ${item.ok ? 'ok' : 'warn'}` }, item.ok ? '✓' : '—'),
                  ),
                  h('div', { className: 'sd-hint' }, item.ok ? item.target : (item.message || item.code || '')),
                ),
              ))),
            ) : null,
          ),
        ),
        authorModal !== null ? h('div', { className: 'sd-overlay', onMouseDown: event => { if (event.target === event.currentTarget) setAuthorModal(null) } },
          h('div', { className: 'sd-modal', role: 'dialog', 'aria-modal': 'true', style: { width: 420 } },
            h('h3', null, t('authorsTitle')),
            h('div', { className: 'sd-authors', style: { marginTop: 10 } },
              authorModal.map(author => h('span', { key: author, className: 'sd-author' }, author))),
            h('div', { className: 'sd-modal-foot' },
              h('button', { className: 'sd-btn primary', type: 'button', onClick: () => setAuthorModal(null) }, t('close')),
            ),
          ),
        ) : null,
      )
    }

    function MarketView(props) {
      const { t, workspace, onBack, onInstalled, pushToast } = props
      const [skills, setSkills] = useState([])
      const [error, setError] = useState('')
      const [busy, setBusy] = useState({})
      const [phase, setPhase] = useState({})
      const [failures, setFailures] = useState({})
      const [query, setQuery] = useState('')
      const [visibleCount, setVisibleCount] = useState(MARKET_PAGE_SIZE)
      const [remoteSkills, setRemoteSkills] = useState([])
      const [remoteState, setRemoteState] = useState('idle')
      const [remoteError, setRemoteError] = useState('')
      const [remoteBusy, setRemoteBusy] = useState({})

      const load = useCallback(() => {
        api(`/market?workspace=${encodeURIComponent(workspace ?? '')}`)
          .then(payload => {
            setSkills(payload.skills)
            setError('')
          })
          .catch(err => setError(err.message))
      }, [workspace])

      useEffect(() => {
        load()
      }, [load])

      const install = async skill => {
        if (busy[skill.name]) return
        setBusy(current => ({ ...current, [skill.name]: true }))
        setPhase(current => ({ ...current, [skill.name]: 'auditing' }))
        const timer = setTimeout(() => setPhase(current => ({ ...current, [skill.name]: 'installing' })), 700)
        try {
          const result = await api('/install', { body: { name: skill.name, origin: 'market', workspace } })
          clearTimeout(timer)
          if (result.ok) {
            setPhase(current => ({ ...current, [skill.name]: 'done' }))
            setFailures(current => ({ ...current, [skill.name]: '' }))
            setSkills(current => current.map(item => (item.name === skill.name ? { ...item, installed: true } : item)))
            onInstalled?.()
            pushToast(`${t('marketInstalling', { name: skill.name })} ✓`)
          } else {
            setPhase(current => ({ ...current, [skill.name]: '' }))
            const failedStep = Array.isArray(result.steps)
              ? [...result.steps].reverse().find(step => step.status === 'fail')
              : undefined
            const message = failedStep?.detail ?? t('noneLine')
            setFailures(current => ({ ...current, [skill.name]: message }))
            pushToast(`${skill.name} · ${message}`)
          }
        } catch (err) {
          clearTimeout(timer)
          setPhase(current => ({ ...current, [skill.name]: '' }))
          setFailures(current => ({ ...current, [skill.name]: err.message }))
          pushToast(err.message)
        } finally {
          setBusy(current => ({ ...current, [skill.name]: false }))
        }
      }

      const filtered = useMemo(() => {
        const needle = query.trim().toLowerCase()
        if (needle === '') return skills
        return skills.filter(skill =>
          String(skill.name).toLowerCase().includes(needle) ||
          String(skill.description ?? '').toLowerCase().includes(needle))
      }, [skills, query])

      const visible = filtered.slice(0, visibleCount)
      const hasMore = filtered.length > visibleCount

      // A new query always restarts from the first batch.
      useEffect(() => {
        setVisibleCount(MARKET_PAGE_SIZE)
      }, [query])

      /** Online lookup against skills.sh, kept separate from the bundled catalog. */
      const searchRemote = async () => {
        const keyword = query.trim()
        if (keyword === '') return
        setRemoteState('loading')
        setRemoteError('')
        try {
          const result = await api('/remote/search', { body: { query: keyword } })
          setRemoteSkills(Array.isArray(result.skills) ? result.skills : [])
          setRemoteState('ok')
        } catch (err) {
          setRemoteSkills([])
          setRemoteError(err.message)
          setRemoteState('error')
        }
      }

      const installRemoteSkill = async item => {
        if (remoteBusy[item.id] === true) return
        setRemoteBusy(current => ({ ...current, [item.id]: true }))
        try {
          const result = await api('/remote/install', { body: { id: item.id, workspace } })
          pushToast(`${t('remoteInstalled', { name: result.name })} ✓`)
          onInstalled?.()
          setRemoteSkills(current => current.filter(entry => entry.id !== item.id))
        } catch (err) {
          pushToast(err.message)
        } finally {
          setRemoteBusy(current => ({ ...current, [item.id]: false }))
        }
      }

      return h('div', { className: 'sd-page-inner' },
        h('div', { className: 'sd-topbar' },
          h('button', { className: 'sd-back', type: 'button', title: t('back'), onClick: onBack }, iconBack(16)),
          h('span', { className: 'sd-title' }, t('marketTitle')),
          h('span', { className: 'sd-sub' }, t('marketSource')),
          h('span', { className: 'sd-spacer' }),
        ),
        error ? h('div', { className: 'sd-sub', style: { color: '#c9a96a', paddingBottom: 10 } }, error) : null,
        h('div', { className: 'sd-market-search-row' },
          h('input', {
            className: 'sd-search',
            placeholder: t('marketSearch'),
            value: query,
            onChange: event => setQuery(event.target.value),
            'aria-label': t('marketSearch'),
          }),
          h('button', {
            className: 'sd-btn', type: 'button',
            disabled: remoteState === 'loading' || query.trim() === '',
            onClick: searchRemote,
          }, remoteState === 'loading' ? t('searching') : t('remoteSearch')),
        ),
        remoteState === 'error' ? h('div', { className: 'sd-hint', style: { marginBottom: 12 } }, `${t('remoteError')}${remoteError}`) : null,
        remoteSkills.length > 0 ? h('div', { className: 'sd-group' },
          h('div', { className: 'sd-group-title' }, `${t('remoteResults')} (${remoteSkills.length})`),
          remoteSkills.map(item => h('div', { key: item.id, className: 'sd-row' },
            h('div', { className: 'sd-icon' }, '🌐'),
            h('div', { className: 'sd-main' },
              h('div', { className: 'sd-name-line' },
                h('span', { className: 'sd-name' }, item.name),
                h('span', { className: 'sd-ver' }, item.repo),
              ),
              h('div', { className: 'sd-meta' }, `${item.installsLabel} · skills.sh`),
            ),
            h('div', { className: 'sd-actions' },
              h('button', {
                className: 'sd-btn primary', type: 'button',
                disabled: remoteBusy[item.id] === true,
                onClick: () => installRemoteSkill(item),
              }, remoteBusy[item.id] === true ? t('installing') : t('install')),
            ),
          )),
        ) : null,
        h('div', { className: 'sd-markets' },
          visible.map(skill => {
            const state = phase[skill.name]
            const installed = skill.installed || state === 'done'
            return h('div', { key: skill.name, className: 'sd-card' },
              h('div', { className: 'sd-card-head' },
                h('div', { className: 'sd-icon' }, skillEmoji(skill.name)),
                h('div', null,
                  h('div', { className: 'sd-card-name' }, skill.name),
                  h('div', { style: { color: '#5d6169', fontSize: 11 } }, `v${skill.version} · ${skill.category}`),
                ),
              ),
              h('div', { className: 'sd-card-desc' }, skill.description),
              failures[skill.name] ? h('div', { style: { color: '#ff8080', fontSize: 11, lineHeight: 1.5 } }, failures[skill.name]) : null,
              h('div', { className: 'sd-card-foot' },
                h('span', null, `${skill.installsLabel} · ${skill.author}`),
                installed
                  ? h('span', { style: { color: '#35e0d2', marginLeft: 'auto', fontSize: 12 } }, `✓ ${t('installed')}`)
                  : h('button', {
                    className: 'sd-btn primary', type: 'button', disabled: busy[skill.name],
                    onClick: () => install(skill),
                  }, state === 'auditing' ? t('auditing') : state === 'installing' ? t('installing') : t('install')),
              ),
            )
          }),
        ),
        filtered.length === 0
          ? h('div', { className: 'sd-empty' }, t('marketEmpty'))
          : h('div', { className: 'sd-more-wrap' },
            hasMore
              ? h('button', {
                className: 'sd-btn',
                type: 'button',
                onClick: () => setVisibleCount(current => current + MARKET_PAGE_SIZE),
              }, t('loadMore', { shown: visible.length, total: filtered.length }))
              : h('div', { className: 'sd-more-done' }, t('allLoaded', { n: filtered.length })),
          ),
      )
    }

    function ManagerPanel(props) {
      const { t, layout } = props
      const [data, setData] = useState(null)
      const [error, setError] = useState('')
      const [query, setQuery] = useState('')
      const [filter, setFilter] = useState('all')
      const [view, setView] = useState('list')
      const [deleting, setDeleting] = useState(null)
      const [detail, setDetail] = useState(null)
      const [settingsOpen, setSettingsOpen] = useState(false)
      const [updatesOpen, setUpdatesOpen] = useState(false)
      const [busy, setBusy] = useState(false)
      const [replacing, setReplacing] = useState('')
      const [overlayStatus, setOverlayStatus] = useState(null)
      const [scanning, setScanning] = useState(false)
      const [openBundles, setOpenBundles] = useState({})
      const [toasts, pushToast] = useToasts()

      const load = useCallback(() => {
        api('/state')
          .then(payload => {
            setData(payload)
            setError('')
            try {
              document.body.dataset.sdWorkspace = payload.workspace
            } catch {
              /* ignore */
            }
          })
          .catch(err => setError(err.message))
      }, [])

      useEffect(() => {
        load()
      }, [load])

      const workspace = data?.workspace ?? ''

      const installed = useMemo(() => data?.installed ?? [], [data])
      const counts = useMemo(() => {
        const out = { plugin: 0, market: 0, learned: 0, scan: 0, user: 0 }
        for (const skill of installed) out[skill.origin] = (out[skill.origin] ?? 0) + 1
        return out
      }, [installed])

      const visible = useMemo(() => {
        const needle = query.trim().toLowerCase()
        return installed.filter(skill => {
          if (filter !== 'all' && skill.origin !== filter) return false
          if (needle === '') return true
          return skill.name.toLowerCase().includes(needle) || (skill.description ?? '').toLowerCase().includes(needle)
        })
      }, [installed, filter, query])

      const groups = useMemo(() => {
        const order = ['plugin', 'market', 'learned', 'scan', 'user']
        return order.map(origin => ({
          origin,
          items: visible.filter(skill => skill.origin === origin),
        })).filter(group => group.items.length > 0)
      }, [visible])

      // Bundled skills come from plugins: fold a provider with many skills into
      // one collapsible row so dsh-aris does not push everything else off screen.
      const scanGroups = useMemo(() => {
        const byProvider = new Map()
        for (const skill of visible) {
          if (skill.origin !== 'scan') continue
          const key = skill.packageName || skill.provider || '其他插件'
          if (!byProvider.has(key)) byProvider.set(key, [])
          byProvider.get(key).push(skill)
        }
        const bundles = []
        const loose = []
        for (const [provider, items] of byProvider) {
          if (items.length >= BUNDLE_THRESHOLD) bundles.push({ provider, items })
          else loose.push(...items)
        }
        bundles.sort((a, b) => a.provider.localeCompare(b.provider))
        loose.sort((a, b) => a.name.localeCompare(b.name))
        return { bundles, loose }
      }, [visible])

      const rescan = async () => {
        if (scanning) return
        setScanning(true)
        setOverlayStatus({ kind: 'loading', text: t('scanning') })
        const started = Date.now()
        try {
          const result = await api('/scan', { body: {} })
          const rest = 400 - (Date.now() - started)
          if (rest > 0) await new Promise(resolve => setTimeout(resolve, rest))
          setOverlayStatus({ kind: 'ok', text: t('scanDone', { n: result.total ?? 0, m: result.added ?? 0 }) })
          load()
        } catch (err) {
          setOverlayStatus({ kind: 'none', text: `${t('scanFailed')}${err.message}` })
        } finally {
          setScanning(false)
          setTimeout(() => setOverlayStatus(null), 3200)
        }
      }

      const openFolder = async skill => {
        try {
          await api('/open', { body: { name: skill.name, workspace } })
          pushToast(t('openFolder'))
        } catch (err) {
          pushToast(err.message)
        }
      }

      const toggle = async skill => {
        if (busy) return
        setBusy(true)
        try {
          await api('/toggle', { body: { name: skill.name, enabled: !skill.enabled, workspace } })
          pushToast(skill.enabled ? t('toastDisabled', { name: skill.name }) : t('toastEnabled', { name: skill.name }))
          load()
        } catch (err) {
          pushToast(err.message)
        } finally {
          setBusy(false)
        }
      }

      const askDelete = (skill, action) => {
        if (action === 'ask') setDeleting(skill.name)
        else if (action === 'cancel') setDeleting(null)
        else {
          api('/delete', { body: { name: skill.name, workspace } })
            .then(() => {
              setDeleting(null)
              pushToast(t('deleted', { name: skill.name }))
              load()
            })
            .catch(err => pushToast(err.message))
        }
      }

      const replaceSkill = async skill => {
        if (replacing !== '') return
        setReplacing(skill.name)
        setOverlayStatus({ kind: 'loading', text: t('replaceSearching') })
        const started = Date.now()
        // Always keep the spinner visible for at least 300ms so the result never
        // flashes in before the user reads the loading state.
        const settle = async () => {
          const rest = 300 - (Date.now() - started)
          if (rest > 0) await new Promise(resolve => setTimeout(resolve, rest))
        }
        try {
          const result = await api('/replace', { body: { name: skill.name, workspace } })
          await settle()
          setOverlayStatus({ kind: 'ok', text: t('replaceInstalled', { name: result.name }) })
          load()
        } catch (err) {
          await settle()
          setOverlayStatus({ kind: 'none', text: err.message || t('replaceNone') })
        } finally {
          setReplacing('')
          setTimeout(() => setOverlayStatus(null), 1900)
        }
      }

      const removeRecord = async name => {
        try {
          await api('/delete-record', { body: { name } })
          pushToast(t('recordRemoved'))
          load()
        } catch (err) {
          pushToast(err.message)
        }
      }

      const renderRow = skill => h(Row, {
        key: skill.name,
        skill,
        t,
        busy,
        replacing,
        deleting: deleting === skill.name,
        onDetail: setDetail,
        onOpen: openFolder,
        onToggle: toggle,
        onAskDelete: askDelete,
        onReplace: replaceSkill,
      })

      const openRoot = async () => {
        try {
          await api('/open-root', { body: { workspace } })
        } catch (err) {
          pushToast(err.message)
        }
      }

      if (error !== '' && data === null) {
        return h('div', { className: 'sd-page' }, h('style', { key: 'sd-css' }, CSS), h('div', { className: 'sd-page-inner' },
          h('div', { className: 'sd-empty' }, h('b', null, t('loadFail')), error),
        ))
      }

      if (view === 'market') {
        return h('div', { className: 'sd-page' },
          h('style', { key: 'sd-css' }, CSS),
          h(MarketView, {
            t,
            workspace,
            pushToast,
            onBack: () => setView('list'),
            onInstalled: load,
          }),
          toasts.map(item => h('div', { key: item.id, className: 'sd-toast' }, item.text)),
        )
      }

      if (view === 'learn') {
        return h('div', { className: 'sd-page' },
          h('style', { key: 'sd-css' }, CSS),
          h(LearnView, {
            t,
            workspace,
            installed,
            pushToast,
            onBack: () => setView('list'),
            onInstalled: load,
          }),
          toasts.map(item => h('div', { key: item.id, className: 'sd-toast' }, item.text)),
        )
      }

      return h('div', { className: 'sd-page' },
        h('style', { key: 'sd-css' }, CSS),
        h('div', { className: 'sd-page-inner' },
          h('div', { className: 'sd-topbar' },
            h('span', { className: 'sd-title' }, t('panelTitle')),
            h('span', { className: 'sd-sub' }, t('installedN', { n: installed.length })),
            h('span', { className: 'sd-spacer' }),
            h('button', { className: 'sd-toplink', type: 'button', onClick: () => setView('market') }, iconMarket(15), t('market')),
            h('button', { className: 'sd-toplink', type: 'button', onClick: () => setView('learn') }, iconLearn(15), t('learnTitle')),
            h('button', {
              className: 'sd-toplink', type: 'button', onClick: rescan, disabled: scanning,
              title: t('scanHint'),
            }, iconRefresh(15), scanning ? t('scanning') : t('scanNow')),
            h('button', { className: 'sd-toplink', type: 'button', onClick: () => setUpdatesOpen(true) }, iconDownload(15), t('updatesTitle')),
            h('button', { className: 'sd-toplink', type: 'button', onClick: () => setSettingsOpen(true) }, iconGear(15), t('settings')),
            h('button', { className: 'sd-toplink', type: 'button', onClick: openRoot }, iconFolder(15), t('openDir')),
          ),
          h('div', { className: 'sd-stats' },
            h('span', null, h('b', null, installed.length), ' 个已安装'),
            h('span', { className: 'sep' }, '·'),
            h('span', null, t('statPlugin', { n: counts.plugin })),
            h('span', { className: 'sep' }, '·'),
            h('span', null, t('statMarket', { n: counts.market })),
            h('span', { className: 'sep' }, '·'),
            h('span', null, t('statLearned', { n: counts.learned })),
            h('span', { className: 'sep' }, '·'),
            h('span', null, t('statScan', { n: counts.scan })),
            h('span', { className: 'sep' }, '·'),
            h('span', null, t('statUser', { n: counts.user })),
            h('span', { className: 'sep' }, '·'),
            h('span', null, t('statRoot')),
          ),
          h('div', { className: 'sd-hint', id: 'sd-scan-info' },
            data?.scan?.at
              ? t('scanInfo', { time: data.scan.timeLabel, n: data.scan.total })
              : t('scanNever'),
            ' · ',
            t('scanHint'),
          ),
          h('input', {
            className: 'sd-search',
            placeholder: t('search'),
            value: query,
            onChange: event => setQuery(event.target.value),
            'aria-label': t('search'),
          }),
          h('div', { className: 'sd-chips' },
            ['all', 'plugin', 'market', 'learned', 'scan', 'user'].map(key => h('button', {
              key,
              type: 'button',
              className: `sd-chip${filter === key ? ' on' : ''}`,
              onClick: () => setFilter(key),
            }, key === 'all'
              ? t('all')
              : key === 'plugin'
                ? t('plugin')
                : key === 'market'
                  ? t('marketOrigin')
                  : key === 'learned'
                    ? t('learned')
                    : key === 'scan' ? t('scanOrigin') : t('user'))),
          ),
          (data?.deleted ?? []).length > 0 ? h('div', { className: 'sd-group' },
            h('div', { className: 'sd-group-title' }, `${t('deletedTitle')} (${(data?.deleted ?? []).length})`),
            h('div', { className: 'sd-hint', style: { margin: '0 2px 10px' } }, t('deletedHint')),
            (data?.deleted ?? []).map(item => h('div', { key: item.name, className: 'sd-row' },
              h('div', { className: 'sd-icon' }, '🗑️'),
              h('div', { className: 'sd-main' },
                h('div', { className: 'sd-name-line' },
                  h('span', { className: 'sd-name' }, item.name),
                  item.category ? h('span', { className: 'sd-ver' }, item.category) : null,
                ),
                h('div', { className: 'sd-meta' }, `${t('deletedAt')} ${item.timeLabel}`),
              ),
              h('div', { className: 'sd-actions' },
                h('button', {
                  className: 'sd-iconbtn', type: 'button', title: t('addOther'),
                  onClick: () => replaceSkill(item),
                }, iconPlus(15)),
                h('button', {
                  className: 'sd-iconbtn danger sd-remove-record', type: 'button', title: t('removeRecord'),
                  onClick: () => removeRecord(item.name),
                }, iconTrash(15)),
              ),
            )),
          ) : null,
          installed.length === 0
            ? h('div', { className: 'sd-empty' },
              h('b', null, t('emptyTitle')),
              h('div', null, t('emptyHint')),
              h('div', { style: { marginTop: 14 } },
                h('button', { className: 'sd-btn primary', type: 'button', onClick: () => setView('market') }, t('openMarket')),
              ),
            )
            : h(React.Fragment, null,
              groups.map(group => {
                const title = filter === 'all'
                  ? h('div', { className: 'sd-group-title' }, `${t(ORIGIN_META[group.origin].groupKey)} (${group.items.length})`)
                  : null
                if (group.origin !== 'scan') {
                  return h('div', { key: group.origin, className: 'sd-group' }, title, group.items.map(renderRow))
                }
                return h('div', { key: group.origin, className: 'sd-group' },
                  title,
                  scanGroups.bundles.map(bundle => {
                    // Searching inside the page always reveals matches; otherwise a
                    // folded bundle stays closed until the user opens it.
                    const open = query.trim() !== '' || openBundles[bundle.provider] === true
                    return h('div', { key: `bundle-${bundle.provider}`, className: 'sd-bundle' },
                      h('button', {
                        className: 'sd-bundle-head',
                        type: 'button',
                        'aria-expanded': open,
                        onClick: () => setOpenBundles(current => ({
                          ...current,
                          [bundle.provider]: !current[bundle.provider],
                        })),
                      },
                        h('span', { className: `sd-caret${open ? ' open' : ''}` }, '▸'),
                        h('span', { className: 'sd-bundle-title' }, t('bundleTitle', { provider: bundle.provider })),
                        h('span', { className: 'sd-badge grey' }, t('bundleCount', { n: bundle.items.length })),
                        h('span', { className: 'sd-bundle-hint' }, t('bundleReadonly')),
                      ),
                      open ? h('div', { className: 'sd-bundle-items' }, bundle.items.map(renderRow)) : null,
                    )
                  }),
                  scanGroups.loose.map(renderRow),
                )
              }),
            ),
        ),
        detail ? h(DetailModal, {
          name: detail.name,
          workspace,
          t,
          onClose: () => setDetail(null),
          onOpen: openFolder,
          onToggle: toggle,
          onDelete: skill => askDelete(skill, 'confirm'),
        }) : null,
        settingsOpen && data ? h(SettingsModal, {
          data,
          t,
          onClose: () => setSettingsOpen(false),
          onSaved: () => {
            pushToast(t('toastScope'))
            load()
          },
        }) : null,
        updatesOpen ? h(UpdatesModal, {
          t,
          workspace,
          pushToast,
          onClose: () => setUpdatesOpen(false),
          onInstalled: load,
        }) : null,
        overlayStatus ? h('div', { className: 'sd-status-wrap' },
          h('div', { className: `sd-status ${overlayStatus.kind}` },
            overlayStatus.kind === 'loading'
              ? h('span', { className: 'sd-spin' })
              : h('span', { className: 'sd-status-icon' }, overlayStatus.kind === 'ok' ? '✓' : '🐟'),
            h('span', null, overlayStatus.text),
          ),
        ) : null,
        toasts.map(item => h('div', { key: item.id, className: 'sd-toast' }, item.text)),
      )
    }

    /* ---------------------------------------------------------------- */
    /* Sidebar icon                                                      */
    /* ---------------------------------------------------------------- */

    function PanelIcon(props) {
      const size = typeof props?.size === 'number' ? props.size : 18
      return h('svg', {
        width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': true, style: { display: 'block' },
      },
        h('path', { d: 'M15.4 4.6c2.6 0 4.6 2 4.6 4.6 0 4.2-4 8.2-8.2 9.6-1.4.5-2.9.3-4-.5-.7-.5-.9-1.4-.5-2.1.4-.7 1.3-.9 2-.5' }),
        h('path', { d: 'M15.4 4.6c-2.1 1.1-3.6 2.9-4.3 5-.5 1.5-.4 3.1.2 4.5' }),
        h('circle', { cx: 15.6, cy: 9.2, r: .9, fill: 'currentColor', stroke: 'none' }),
        h('path', { d: 'M7 19.6c1.2-.2 2.1-.7 2.8-1.4' }),
      )
    }

    /* ---------------------------------------------------------------- */
    /* Plugin                                                           */
    /* ---------------------------------------------------------------- */

    const inject = ['slots', 'locale']

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'skill-detective: dictionaries')
      const t = ctx.locale.bind(NS)

      ctx.effect(() => {
        const offToggle = ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
          name: 'conversation.input.left',
          id: 'skill-detective-toggle',
          order: 40,
          label: () => t('toggleOn'),
          inject: () => ({ t }),
        }, DetectiveToggle))

        const offDock = ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'skill-detective-bubble',
          order: 40,
          inject: () => ({ t }),
        }, DetectiveDock))

        const offRow = ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: PANEL_ORDER,
          label: () => t('nav'),
        }, PanelIcon))

        const offPanel = ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: PANEL_ID,
          inject: () => ({ t, layout: ctx.get('layout') }),
        }, ManagerPanel))

        return () => {
          offPanel()
          offRow()
          offDock()
          offToggle()
        }
      }, 'skill-detective: seats')
    }

    return { inject, apply }
  },
})
