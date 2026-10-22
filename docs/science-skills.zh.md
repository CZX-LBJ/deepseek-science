# 内置科研技能

[English](science-skills.md) | 中文

## 概述

DeepSeek Science 0.2.1-alpha.2 携带来自 **19 个来源的 968 项目录条目，以及 11,527 个固定哈希的资源文件**。这是技能指令和参考材料的库存清单；一个目录条目不代表其上游流程和外部工具已在本应用中完成端到端验证。

## 目录

- [来源清单](#source-inventory)
- [自动使用](#automatic-use)
- [可用状态](#readiness)
- [许可](#licenses)
- [核验](#verification)

<a id="source-inventory"></a>

## 来源清单

数量按每项条目的主要来源统计，共享资源和仅允许用户主动调用的指令也可能有目录条目。Nature Skills 包含 22 个可由模型加载的工作流，以及 1 个共享支持条目。数值、符号数学、控制和量子领域的四个项目提供本地编写的知识指南，并保留上游参考文档；它们本身不是上游作者提供的 skill 集合。

| 来源 | 目录条目 | 主要用途 |
| --- | ---: | --- |
| [Academic Research Skills](https://github.com/Imbad0202/academic-research-skills) | 5 | 科研与论文 |
| [Academic Research Skills Codex](https://github.com/Imbad0202/academic-research-skills-codex) | 1 | 科研套件 |
| [AI Research Skills](https://github.com/Orchestra-Research/AI-Research-SKILLs) | 98 | AI 科研与实验 |
| [ARIS](https://github.com/wanshuiyin/Auto-claude-code-research-in-sleep) | 184 | 选题、实验、写作与审阅 |
| [bioSkills](https://github.com/GPTomics/bioSkills) | 44 | 生物与生物信息学 |
| [Claude Scholar](https://github.com/Galaxy-Dawn/claude-scholar) | 45 | 科研规划与论文 |
| [Claude Scientific Writer](https://github.com/K-Dense-AI/claude-scientific-writer) | 22 | 科研写作 |
| [python-control guides](https://github.com/python-control/python-control) | 1 | 控制系统知识参考 |
| [Hugging Face Skills](https://github.com/huggingface/skills) | 24 | 模型、数据集与训练 |
| [KiCad Happy](https://github.com/aklofas/kicad-happy) | 5 | 电子与电路流程 |
| [Lean4 Skills](https://github.com/cameronfreer/lean4-skills) | 1 | 形式化数学 |
| [Matt Pocock Skills](https://github.com/mattpocock/skills) | 21 | 软件开发流程 |
| [Nature Skills](https://github.com/Yuan1z0825/nature-skills) | 23 | 写作、绘图、文献与审阅 |
| [OpenScience](https://github.com/synthetic-sciences/openscience) | 311 | 跨学科科研流程 |
| [QuTiP tutorials](https://github.com/qutip/qutip-tutorials) | 1 | 量子动力学知识参考 |
| [Scientific Agent Skills](https://github.com/K-Dense-AI/scientific-agent-skills) | 164 | 科研领域、数据库与方法 |
| [SciPy guides](https://github.com/scipy/scipy) | 1 | 数值方法知识参考 |
| [Superpowers](https://github.com/obra/superpowers) | 15 | 规划、调试与验证 |
| [SymPy guides](https://github.com/sympy/sympy) | 2 | 符号数学知识参考 |

固定版本、许可文本与归属见 [NOTICE](../packages/skill/skill-science/assets/NOTICE.md)。机器可读的 [manifest](../packages/skill/skill-science/assets/manifest.json) 列出每个保留条目、资源哈希、使用条件和排除的指令。

<a id="automatic-use"></a>

## 自动使用

科研操作规范默认生效。用户用自然语言描述科研任务，不需要记住技能名称。常用发现列表包含 52 个可由模型加载的上游条目，此外还有应用自身的科研工作流；这份较短的列表不等于全部内置库。

内核通过 15 类任务与学科路由规则，以及 Nature 的任务专属资源组合，选择相关指令。即使某个包未出现在常用发现列表中，已接入路由的技能仍可自动选择。agent 也可以通过科研工具检索完整目录并读取获准使用的指令。上下文预算可能让部分指令正文或参考文件按需延后加载；应用不会在每次模型请求中塞入全部 968 项内容。

目录标记 956 项为可由模型加载，其中包含需要显式启用的非商业条目；其他条目保留上游的调用限制。自动加载会将指令交给所选模型，但不会自动安装外部服务，也不代表实验已经执行。

<a id="readiness"></a>

## 可用状态

| 目录状态 | 条目数 | 含义 |
| --- | ---: | --- |
| guidance-only | 57 | 已保留为指导指令，不代表工作流已执行验证。 |
| needs-setup | 910 | 仍需检查或适配上游假设、运行条件。 |
| support | 1 | 共享支持材料。 |

所有上游条目目前均记录 `testedHere: false`。目录哈希、指令读取和路由测试验证的是集成机制，不代表每个科研软件包、外部 API、实验或论文生成效果都已验证。具体任务仍可能需要额外的 Python 库、TeX、GPU、授权数据或服务凭据。材料随应用打包，不等于全部上游项目都已完成可执行适配。

<a id="licenses"></a>

## 许可

两个 Academic Research Skills 资源包采用 CC BY-NC 4.0，单独打包、默认关闭，合计包含 6 项目录条目。显式启用不授予商业使用权。其他来源保留各自许可与嵌套例外。

<a id="verification"></a>

## 核验

在已安装依赖的源码副本中运行以下检查。源码检查会确认每个声明资源均已进入 Git，包括处于本仓库通常忽略的目录中的上游文件。

```powershell
node scripts/verify-science-source.mjs
node scripts/sync-science-skills.mjs --verify-only
```

发布打包还会检查解包后的应用，识别凭据和本机构建、用户目录路径。发行审计会对照这里的源码库存，核验应用携带的目录和资源哈希。
