---
description: "提供科研项目、学术文献和内嵌技能工具及可重放科研状态。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-science

[English](README.md) | 中文

<a id="summary"></a>
## 概述

通过三个工具保留项目进度、检索和阅读论文、加载内嵌科研指南。科研侧栏跟随成功记录的工具结果更新。模型用量和响应延迟来自已结束的模型请求；无法获得的记账信息显示为未知。

<a id="table-of-contents"></a>
## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发说明](#dev-note)

<a id="use-this-package"></a>
## 使用本包

使用提供的科研 profile。自定义组合需要 agents、tools、文件系统、skills、sandbox policy、system prompt、session projections、scienceProjects 和 scienceLiterature。

| 字段 | 默认值 | 含义 |
|---|---|---|
| `enabledPacks` | core, ai, nature | 展示的技能包和非商业包显式启用 |
| `assetRoot` | 包内资源 | 指定时使用外部技能目录 |
| `workspaceRoot` | session cwd | 无 agent 调用时必需 |
| `maxResultChars` | 24000 | 非技能结果的显示预算 |
| `maxSkillChars` | 200000 | 完整技能内容上限 |
| `maxExportBytes` | 4194304 | 检索记录输入预算 |
| `maxSearchSkills` | 40 | 技能检索最大条数 |
| `maxRetainedBytes` | 8388608 | 完整结构化结果、内容与元数据预算 |
| `enableNativeRecipes` | true | 注册三条本项目维护的科研流程 |
| `enableAutomaticGuidance` | true | 在首次模型请求前，从普通用户需求自动选择科研指南 |
| `maxAutoSkills` | 8 | 每条自动消息包含的完整指令正文数上限 |
| `maxAutoChars` | 200000 | 包含候选列表与来源的整条自动消息字符预算 |

`science_project` 用于创建、查看、保存检查点、推进、跳过、恢复与重新打开变化的阶段。`science_literature` 用于检索、阅读、核验与导出，导出从保存的检索 JSON 写出 BibTeX 或 CSV。`science_skills` 用于检索、查看、检查与加载。doctor 报告当前 Harness 工具和声明的依赖，不表示可选依赖已安装。

本项目维护的 `deepseek-science-literature`、`deepseek-science-analysis` 和 `deepseek-science-writing` 流程与锁定版本的上游目录分别管理。它们通过普通技能工具或 `science_skills` 加载；检索时使用 `native` 包可选择这些流程。内嵌脚本生成可复现分析成果或保留证据的稿件骨架，并拒绝覆盖已有输出目录。指南保留依赖检查和科学评审要求。

[科研内核](assets/kernel/policy.md)始终存在于系统提示中。[自动路由](src/kernel.ts)理解用户直接提出的科研需求，在推理前将完整本地流程和学科指南作为有日志的 `science-routing` 消息追加。用户无需点名技能。22 个可调用 Nature Skills 模块及其共享参考都在默认 `nature` 包中。匹配任务会加载相应完整技能正文、静态流程片段，并把条件式参考文件及触发条件交给模型按需读取；所有其他源文件也保留在校验过的资源库里。生物、医学、化学、物理、数学、工程、电子、地球与环境科学及计算机均有中英路由规则。概念问答不会启动科研项目。预算暂未加载的指南仍列出名称且可继续加载，不截断技能正文。已提交且仍可见的指引会去重；压缩移除的指引可再次提供。

完整论文请求要求可编辑 LaTeX、参考文献、插图及真实编译的 PDF。写作流程的 `publication.py` 提供 init/doctor/compile/check/render 命令，以及通用、非官方 Nature 风格、IEEE 和中文布局。检查报告当前文件溯源、未解析引用、缺失资源、占位内容和版面溢出。实际渲染检查与科学评审仍然必要，编译通过不代表期刊录用。模板不冒充出版社排版，也不保证符合所有期刊的最新作者指南。

完整论文默认采用双栏期刊版式：标题跨栏，普通图表位于栏顶或栏底，跨栏图表位于页顶或页底，不默认使用正文中的 `[h]`/`[H]` 放置。长公式需要通过对齐推导适配实际栏宽。明确指定期刊的稿件规则可以覆盖默认布局。应检查真实多页输出的栏流、浮动位置和可避免的大块留白，短骨架不能证明这些属性。

<a id="understand-the-implementation"></a>
## 理解实现

[工具](src/index.ts)复用已有执行、文件系统权限与结果日志。[投影](src/projection.ts)重放成功科研元数据和已结束的模型请求。缓存比率为缓存读取量除以未缓存输入、缓存读取、缓存写入之和。失败请求也会计入；缺失用量和零分母均为未知。此版本尚未计算货币费用，该字段保持未知。

## Model Experience

### 科研工具与结果

#### What the model sees

[工具定义](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-science)提供三个科研操作。结果包含已提交项目记录、选定证据、来源报告或加载的技能指南。稳定内核要求证据、学科严谨性、LaTeX 与插图规范。自动指引记录选定、完整加载及延后加载的名称与内容摘要，不把自动选择冒充成用户显式调用技能。

#### Token effect

只有选定的完整技能内容与有预算的工具结果进入上下文。自动指引默认最多八份正文、200000 字符，预算包含候选列表；按具体任务通常远低于上限。关闭自动路由仍保留稳定内核规则。大记录保留在工作区文件中，完整库可检索而无需展示全部摘要。

#### KV Cache effect

工具 schema 与流程指引在一次组合期间保持稳定。结果追加至已有历史；本包不重新排序消息，也不替换 DeepSeek 传输。

## Known Limitations and Deferred Work

- 文献核验只检查书目信息；论断支持仍需科研评审。
- 技能保留上游假设与可选依赖，查看和加载不会运行安装程序。
- 内嵌知识指南保留并标识原始文档，不会安装科研库，也不代表专家验证。自动需求匹配采用启发式规则，模型仍可继续检索目录。
- 指标描述模型请求，不表示整个项目的墙钟时间或账单。调整完整结果上限可能导致结果无法返回，即使文件已提交。

<a id="dev-note"></a>
### 开发说明

通过 `dsh` profile 启动应用；本包不提供独立启动程序。
