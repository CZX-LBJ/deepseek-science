---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-10-18-science-routing

[English](2026-10-18-science-routing.md) | 中文

## 概述

新增 science-routing 消息来源，记录自动选择的完整科研指令正文及已加载、延后加载的来源信息。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-10-18-science-routing
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-09-21-user-question-reply"
    after: "43488d8fe7fe371f7593a6023ea3eade46477a9f388e01a6f72e53cfe69f7f52"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-09-21-user-question-reply"
    after: "d758b5b5e73714540e49656cc2d727d065066a6433132fa5e0d594a4e545c303"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-09-21-user-question-reply"
    after: "5e330687ee52d89593bb076128eef65ad8342e7d04d10e5e4e7906f7ca517cd2"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-09-21-user-question-reply"
    after: "bfbe9933af226d7c7a2e3e49fc3163946a596e44c660f796dd5d1ab6ad955415"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

仅新增归因型来源种类。用户和开发者消息的读取方无需科研插件即可保留完整日志内容。只有生产者通过自己的 route key 对仍可见的消息去重；元数据不改变重放权限，也不重建缺失指令。已有消息保持有效，固定分类器不要求改变 Session 写入版本。

<a id="verification"></a>
## 验证

直接运行 Vitest：kernel.spec.ts 与 kernel-composition.spec.ts 的 19 项检查通过，涵盖真实 Loader/AgentLoop 接纳、首次请求内容、取消、可见消息去重、压缩与卸载。tool-science.spec.ts 的 4 项真实组合检查通过，包含默认 LaTeX 指引下的中文生物论文请求和路由快照。kernel-assets.spec.ts 的 16 项内嵌资源检查通过。Host TypeScript 通过。

<a id="dev-note"></a>
## 开发备注

无。
