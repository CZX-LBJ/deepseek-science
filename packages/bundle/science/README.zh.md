---
description: "为 dsh profile 提供科研技能、文献、项目流程和侧栏。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-science

[English](README.md) | 中文

<a id="summary"></a>
## 概述

science 与 science-headless profile 包含此层，提供内嵌科研指南、学术文献操作和可恢复项目检查点，并使用原 Harness 模型循环与传输。Web profile 还显示科研侧栏。

<a id="table-of-contents"></a>
## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发说明](#dev-note)

<a id="use-this-package"></a>
## 使用本包

提供的 science 与 science-headless profile 已选择本 bundle。查看解析后的组合：

```sh
pnpm dsh --profile science-headless --dump-default-config
```

在许可允许的非商业用途下，通过 `DSH_SCIENCE_NONCOMMERCIAL=1` 显式启用两个 academic 非商业包。其他科研扩展包均可检索和加载，无需展示全部条目。

<a id="understand-the-implementation"></a>
## 理解实现

[配置补丁](cordis.patch.yml)添加技能、文献、项目、工具提供方及已有侧栏的科研页面。在 science-headless 中禁用浏览器页面。各包默认配置负责操作上限。

## Model Experience

通过科研角色与挂载的技能、工具使用方间接影响模型。

#### KV Cache effect

组合保留已有请求循环、传输与历史。稳定的技能包选择避免在每次提示中展示完整库。

## Known Limitations and Deferred Work

- 上游技能指南属于内嵌资源，不表示科研软件已安装或实验已验证。
- 实际模型性能和缓存节省需要真实 API 基准测量；本 bundle 的存在不能保证命中率。

<a id="dev-note"></a>
### 开发说明

通过 `dsh` profile 启动应用；本包不提供独立启动程序。
