---
description: "保留标准 Harness 工具的科研 Web agent preset。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-science-web

[English](README.md) | 中文

<a id="summary"></a>
## 概述

科研 Web profile 使用此层选择 DeepSeek Science agent preset。它保留标准 Web 工具集，并在 preset 作用域内提供科研角色指引。

<a id="table-of-contents"></a>
## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发说明](#dev-note)

<a id="use-this-package"></a>
## 使用本包

提供的 science profile 已选择本 bundle。查看解析后的组合：

```sh
pnpm dsh --profile science --dump-default-config
```

Web 组合中 science-web 层位于 science 之后。science-headless 不包含本层。

<a id="understand-the-implementation"></a>
## 理解实现

[配置补丁](cordis.patch.yml)选择由标准 Web 组合派生的科研 preset，并保留作用域内工具提供方。[源码入口](src/index.ts)不提供应用启动程序。

## Model Experience

通过选定科研角色和工具所属包间接影响模型。

#### KV Cache effect

组合保留已有请求循环、传输与历史。稳定的技能包选择避免在每次提示中展示完整库。

## Known Limitations and Deferred Work

- 此 preset 复用标准 Web 工具组合；维护者须检查上游工具集的相关变化。
- 实际模型性能和缓存节省需要真实 API 基准测量；本 bundle 的存在不能保证命中率。

<a id="dev-note"></a>
### 开发说明

通过 `dsh` profile 启动应用；本包不提供独立启动程序。
