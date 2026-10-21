---
description: "持久化科研阶段、不可变成果快照与可追溯的论断摘录。"
kind: "package-reference"
---

# @deepseek-ai/dsh-science-project

[English](README.md) | 中文

<a id="summary"></a>
## 概述

在工作区保存科研项目、检查点与真实成果文件，并恢复中断的工作而不重新启动任务。阶段推进要求检查点文件未发生变化；论断阶段要求记录支持证据。摘录必须出现在保存的成果中，支持程度仍由研究者判断。

<a id="table-of-contents"></a>
## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发说明](#dev-note)

<a id="use-this-package"></a>
## 使用本包

`science` 和 `science-headless` profile 将本服务与文件系统、模型工具组合。自定义组合挂载：

```yaml
- name: '@deepseek-ai/dsh-science-project'
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `storageDir` | `.deepseek-science` | 工作区内的相对存储目录 |
| `maxArtifactBytes` | 16777216 | 单个成果文件的最大字节数 |
| `maxCheckpointBytes` | 67108864 | 单次检查点成果的总字节预算 |
| `maxRecordBytes` | 2097152 | 完整状态记录的最大字节数 |
| `lockWaitMs` | 10000 | 跨进程写锁等待时间 |

项目依次经过问题、文献、设计、分析、论断、写作、评审、交付阶段。每次修改必须提供当前 revision。证据记录包括论断、成果文件、定位、摘录、支持程度与阅读深度。跳过阶段必须记录原因；恢复会把运行中的工作标为中断。

<a id="understand-the-implementation"></a>
## 理解实现

[状态验证](src/record.ts)拒绝损坏的持久化数据。[服务](src/index.ts)使用组合的文件系统、原子版本检查写入和主机写锁。文件先被哈希并保存为不可变快照，再发布状态。读写限制在调用工作区内并遵循其文件系统权限。

## Model Experience

通过科研工具间接呈现已提交的项目状态。

#### KV Cache effect

本服务不添加系统文本或工具 schema；使用方追加普通、已记录的工具结果。

## Known Limitations and Deferred Work

- 摘录匹配只证明来源可追溯，不能证明论断的科学真实性或定位信息的正确性。
- 修改要求文件系统路径与当前主机共享；不支持远程文件系统写锁。
- 恢复会验证已保存的成果。文件变化时先用 `reopen` 重新打开最早变化的阶段，再检查并显式建立检查点；本服务不会执行实验、投稿或部署。

<a id="dev-note"></a>
### 开发说明

通过 `dsh` profile 启动应用；本包不提供独立启动程序。
