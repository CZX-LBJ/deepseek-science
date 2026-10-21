---
description: "比较基础与科学配置的服务商用量，并在无密钥时回放科学工具证据。"
---

# 验证科学配置

[English](benchmarking-science.md) | 中文

本贡献者教程区分确定性工具验证与真实服务商测量。[测试政策](../testing.zh.md)定义各测试层级。

## 1. 回放科学工具证据

在仓库根目录运行：

```sh
node node_modules/vitest/vitest.mjs run --config vitest.snapshot.config.ts snapshots/session/headless.snapshot.ts -t science-evidence
```

[science-evidence 场景](../../snapshots/session/science-evidence/snapshot.yml)通过 `dsh` 启动随附的 `science-headless` 配置。人工编写的模型流调用真实的文献、项目和技能工具。本地合成论文提供全文摘录，预置的中断项目提供含引文与定位信息、支持程度为部分支持的主张。测试框架比较记录的工具输出、展示元数据、组装后的提示与工具模式，并确认工作区未改变。场景时钟固定时间元数据，框架在回放前还原预置项目标识。这是无密钥的组合验证；人工编写的模型流不是真实模型结果或服务商测量。

## 2. 准备服务商比较

运行[基准启动器](../../scripts/benchmark-science.ts)：

```sh
node --import tsx/esm scripts/benchmark-science.ts --out artifacts/science-benchmark-unrun
```

启动器从环境变量或根目录 `.env` 读取 `DEEPSEEK_API_KEY`。没有密钥时，它写入 `report.json`，其中 `status` 为 `unrun`，包含原因，`samples` 为空；不会发送服务商请求。真实比较需要该密钥，尚未在无密钥的验证环境执行。

有密钥时，启动器通过 `dsh` 选择 `headless` 和 `science-headless`，每个配置重复相同的研究任务两次，交替配置执行顺序，并为每个配置保留独立工作区与 Harness 主目录。默认任务读取合成论文与 CSV，计算各组均值，写入分析与证据文件。独立文件检查验证数值结果、准确的限制性引文及定位、要求的声明，以及输入文件未改变。`--workload probe` 选择无工具提示，仅测量组合开销。请求路由固定为 `deepseek-official` / `deepseek-flash`；`--model` 为两个配置选择另一个模型。`--samples` 将重复次数设为 1 至 20。源码模式使用 CLI 的仅 ESM tsx 钩子；`--mode lib` 选择构建后的 CLI 产物，需要最新构建。原始 Session、输出产物与尝试级观测保存在输出目录中。

## 阅读报告

每个样本保留进程耗时、退出与超时情况、回答与产物检查结果、Session 路径，以及每次成功、失败或重试的模型尝试。服务商报告的输入、输出与缓存计数相互独立。缺失样本、缺失的可选计数、矛盾的总量与不安全的汇总计数保持不可用。缓存命中比需要全部三个互斥输入计数和正分母。金额保持 null，因为 token 计数不能确定账单金额。

进程耗时包含应用启动。记录中的首次尝试区间从 `step/start` 开始；重试区间从前一次完成事件开始，可能包含退避等待。嵌入的块时间戳用于计算流跨度。这些是客户端观测，不是服务商服务器计时。服务商可能复用运行前已有的缓存，因此重复请求不能确定冷缓存基线。研究产物检查只衡量这个小型本地任务，不能确定一般研究质量。两个配置的工具模式与技能指导有意不同，也构成所测量的输入开销。
