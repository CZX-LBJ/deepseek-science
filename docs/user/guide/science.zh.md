---
description: "使用 DeepSeek Science 完成可追溯文献、实测数据分析和基于证据的写作。"
---

# DeepSeek Science

[English](science.md) | 中文

DeepSeek Science 以 Harness 的模型循环和传输为底座，组合科研工具、科研侧栏、锁定版本的上游技能库以及三条本项目维护的流程。先准备含有真实论文或数据的工作区。科研软件、数据库凭据和计算资源仍需分别配置；技能提供其使用方法。

## 启动工作台

Windows 桌面包中双击 **DeepSeek Science.exe**。应用有独立窗口，携带 Electron、Node、Python、Matplotlib 和科研资源；保持整个应用目录完整，可搬移整个文件夹。用户配置、会话和密钥位于用户目录的 `.deepseek-science`；应用包不包含密钥。LaTeX、GPU 和上游技能使用的其他外部工具仍按任务检查。

在**设置 → 模型**中修改官方 DeepSeek 配置，或点击**添加模型提供商 → 自定义模型 API**，设置接口协议、API 地址、模型 ID、容量及密钥。支持 OpenAI 和 Anthropic 兼容接口；保存后从对话输入区选择模型。每个提供商单独保存配置和凭据，重新打开应用后保留。官方 DeepSeek 使用 `https://api.deepseek.com/anthropic`；可用模型以官方目录和账户权限为准。详见[官方接口说明](https://api-docs.deepseek.com/guides/anthropic_api/)。

源码开发时，在已安装 Node 和 pnpm 依赖的目录中运行：

```sh
pnpm dsh --profile science --no-open
```

打开启动器输出的本地地址。在应用中配置 DeepSeek API Key，选择或添加工作区，使用 DeepSeek Science 预设。打开右侧边栏的**科研**页面，可查看已记录的项目阶段、成果、论文、阅读摘录、技能依赖和提供商用量。配置密钥前也能查看界面；模型任务需要有效的模型配置。

终端 profile 使用相同的科研工具：

```sh
pnpm dsh --profile science-headless "Load deepseek-science-literature and review the papers in this workspace. Retain exact source locators and report missing evidence."
```

该模型任务需要配置凭据。无密钥检查组合时运行 `pnpm dsh --profile science-headless --dump-default-config`。[开发者验证指南](../../cookbook/benchmarking-science.zh.md)说明了确定性回放和真实测量方式。

## 选择科研任务

可以直接描述任务，也可以从以下显式流程开始：

| 流程 | 请求示例 | 交付成果 |
|---|---|---|
| 文献 | “加载 deepseek-science-literature。围绕指定主题检索并阅读证据，保留元数据冲突并导出论文。” | 候选 CSV、核验后的书目、摘录定位和证据记录 |
| 分析 | “加载 deepseek-science-analysis。检查 results.csv，确认采样单位，按 method 汇总 score 并生成可复现图。” | 保留的输入、摘要表、观测记录、PNG/SVG、脚本和参数/哈希记录 |
| 写作 | “加载 deepseek-science-writing。从我的结果和证据撰写，保留未获支持的论断和未知引用。” | 稿件源码、论断表、书目、元数据，以及 TeX 引擎可用时检查过的 PDF |

分析助手需要 Python 3 和 Matplotlib；写作骨架需要 Python 3，编译 PDF 需要检查可用的 TeX 引擎。缺少依赖时报告 `needs-setup`。助手拒绝覆盖已有输出目录。内置示例 CSV 是合成验证数据，不是科研发现。分析区间假设观测独立；重复测量、聚类和共享受试者需要针对研究设计分析。

输入“检索科研技能：查新 / Nature 润色 / 审稿回复 / 绘图”可搜索更大的库，指南按需加载。来源包括 OpenScience、Nature Skills、Superpowers、Matt Pocock、两个 Academic Research Skills 版本、K-Dense、Orchestra、Hugging Face、Claude Scholar 和 ARIS。详情保留来源版本、许可证、依赖和资源位置。上游流程并未全部在此执行验证；运行脚本前须检查依赖。

## 保留证据并恢复工作

项目依次经过问题、文献、设计、分析、论断、写作、评审和交付。检查点保存真实文件字节与哈希。证据包含论断、检查点成果、定位、精确摘录、支持程度和阅读深度。摘录必须出现在保存的成果中；科学支持和定位有效性仍须评审。DOI 核验检查书目信息，不判断论文是否证明论断。仅摘要结果会保持明确标记。

修改时使用最新的项目 revision。`resume` 验证已有输出，将未结束的运行工作标为中断，不会重新启动任务。早期成果发生变化时，通过 `reopen` 指定该阶段与原因，再重新核验；后续阶段变为待完成。跳过阶段须明确记录原因，不能绕过已完成成果变化的检查。

## 可选 Academic 技能包

两个 Academic Research Skills 包保留 CC-BY-NC-4.0 条款，许可允许的非商业使用须显式启用。PowerShell 中先设置 `$env:DSH_SCIENCE_NONCOMMERCIAL='1'` 再启动科研 profile；Bash 中在启动命令前添加 `DSH_SCIENCE_NONCOMMERCIAL=1`。这会启用两个 Academic 包，不改变其许可权利。其他上游包无需将全部技能展示给模型也可检索。[内嵌许可说明](../../../packages/skill/skill-science/assets/NOTICE.md)和来源清单定义确切条款与排除项。

## 正确理解性能

工作台显示已结束的模型请求、互不重叠的输入/缓存/输出用量与可观察延迟。缺失用量保持未知。缓存比率需要完整输入分桶以及非零、一致的总数；此版本尚未计算货币费用，该字段保持未知。稳定摘要和按需加载保留原 Harness 请求路径，但不保证缓存命中率或科研任务质量。基准测试保留原始观测；没有 API Key 时明确返回 `unrun`。

首版是本地科研工作台，尚未测量证明其全面优于 OpenScience 或 Claude Science。对比前应使用相同任务、证据、预算与成果标准，并区分模型质量、工具可靠性和运行成本。
