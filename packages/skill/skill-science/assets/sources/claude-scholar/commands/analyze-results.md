---
name: analyze-results
description: Run a blocker-first post-experiment workflow: validate evidence, produce strict statistical analysis when possible, and generate a decision-oriented results report only when the analysis bundle is sufficient. Uses results-analysis + results-report as a gated two-stage workflow.
args:
  - name: data_path
    description: Path to experimental results (CSV, JSON, logs, or directory)
    required: false
  - name: analysis_type
    description: Type of analysis (full, comparison, ablation, visualization, audit)
    required: false
    default: full
  - name: purpose
    description: Optional report purpose slug (e.g. transfer-summary, ablation-report)
    required: false
    default: auto
  - name: round
    description: Optional experiment round number for report naming
    required: false
  - name: experiment_line
    description: Optional experiment line slug for report naming
    required: false
tags: [Research, Analysis, Statistics, Visualization, Reporting]
---

# Analyze Results Command

执行 **blocker-first 实验后分析 + 报告工作流**。

这是用户默认应该使用的入口，但它不是无条件“一键成稿”。它必须先判断证据是否足够，再决定进入 strict analysis、read-only audit、figure generation 或 results report。

如果你只是想“跑严格统计和科研图，不写总结报告”，才单独走 `results-analysis`。

## 目标

此命令负责把一次实验结果处理成两层产物：

### Phase 1: strict analysis bundle
- 严格统计分析
- 真实科研图
- figure interpretation checklist
- 可追溯的统计附录

### Phase 2: complete results report
- 完整实验总结报告
- 逐图解释与结论串联
- 面向决策的 next actions
- 如已绑定 Obsidian，则自动写回知识库

换句话说，`/analyze-results` 不只是“分析”，而是：

> **先做 evidence-first analysis，再基于证据生成完整实验报告。**

## 默认编排

命令默认按以下顺序执行：

0. **Blocker-first gate**
   - 锁定 primary question、primary metric、unit of analysis、seed/run/fold/subject 数、raw provenance、comparison family
   - 如果现有 stats table 的 p-value、interpretation、test method、unit of analysis 或 comparison family 互相矛盾，先 quarantine 该统计文件
   - 如果这些信息不足，先输出 blocker summary 或 read-only audit，不生成完整报告
1. **定位输入**
   - 找到实验目录、CSV/JSON、日志、图表原料与比较对象
2. **Phase 1 严格分析**
   - 使用 `results-analysis`
   - 当用户要求 no-write / audit，或输入不足以生成分析产物时，只输出 valid/invalid statistics、claim candidates 和 blockers
3. **Phase 2 完整报告**
   - 使用 `results-report`
   - 只在 Phase 1 产物包含 `analysis-report.md`、`stats-appendix.md`、`figure-catalog.md` 和必要 provenance 时生成完整实验总结报告
4. **知识库回写**
   - 如果当前 repo 已绑定 Obsidian project memory，则写回 `Results/Reports/`、相关 `Experiments/`、`Daily/` 和 project memory
5. **显式报告 blocker**
   - 若统计输入不足、无法画图或命名信息缺失，必须说明阻塞点，不能伪造结论

## 使用方法

### 基本用法

```bash
/analyze-results
```

### 指定实验目录

```bash
/analyze-results path/to/experiment_dir
```

### 指定分析类型

```bash
/analyze-results path/to/results comparison
```

### 指定报告用途与轮次

```bash
/analyze-results path/to/results full transfer-summary 3 freezing
```

## 参数说明

| 参数 | 说明 |
|------|------|
| `data_path` | 实验结果路径，可为目录、CSV、JSON 或日志 |
| `analysis_type` | `full` / `comparison` / `ablation` / `visualization` / `audit` |
| `purpose` | 报告用途 slug；默认自动推断，无法推断时需显式说明 |
| `round` | 实验轮次；用于报告命名，未知时允许暂用 `r00` 并注明 |
| `experiment_line` | 实验线 slug，如 `freezing`、`contrastive-adversarial` |

## 分析类型

| 类型 | 说明 | Phase 1 重点 | Phase 2 重点 |
|------|------|--------------|--------------|
| `full` | 完整严格分析（默认） | 完整统计 + 主图 + supporting figure | 完整实验总结报告 |
| `comparison` | 模型对比 | 显著性检验 + effect size + 主对比图 | 哪个方案更值得继续 |
| `ablation` | 消融实验 | 组件贡献分析 + 稳定性分析 | 哪个组件真正改变了结果 |
| `visualization` | 图表优先 | 高质量科研图 + 图表解释 | 图驱动的结果复盘 |
| `audit` | 只审查证据是否足够 | valid/invalid statistics、claim candidates、blockers | 不生成完整报告 |

## 输出产物

### Phase 1 输出

```text
analysis-output/
├── analysis-report.md
├── stats-appendix.md
├── figure-catalog.md
└── figures/
```

### Phase 2 输出

```text
Results/Reports/
└── YYYY-MM-DD--{experiment-line}--r{round}--{purpose}.md
```

If the blocker-first gate fails, the valid output is a blocker summary or audit note instead of a report:

```text
analysis-output/
└── blocker-summary.md
```

报告标题默认遵循：

```text
{Experiment Line} / Round {N} / {Purpose} / {YYYY-MM-DD}
```

## 执行规则

### 统计与图表
- 必须优先生成真实科研图，而不是只写 visualization specs
- 必须报告样本单位、seed/run 数、`95% CI`、effect size、multiple-comparison handling
- 假设不满足时必须改用 non-parametric fallback 或显式说明不能做强推断
- 如果 unit of analysis、primary metric、seed/fold/raw provenance 不清楚，不能生成显著性 claim 或 winner claim
- 如果统计表内部解释和数值矛盾，必须 quarantine；不能把矛盾统计写进报告或图注
- 当用户明确要求 audit/no-write，只做 read-only audit，不生成图和报告文件

### 报告生成
- 报告必须基于 Phase 1 的真实证据，而不是凭印象总结
- 报告必须覆盖：main findings、statistical validation、figure-by-figure interpretation、negative results、next actions
- 报告默认是**内部实验总结报告**，不是论文 `Results` section
- 如果缺少完整 analysis bundle，只能写 blocker summary；不能用 polished prose 替代缺失统计

### Obsidian 写回
如果 repo 已绑定 Obsidian knowledge base，则至少执行：
- 新建/更新 `Results/Reports/{report-name}.md`
- 回链对应 `Experiments/` note
- 若结论已稳定，更新 canonical `Results/` note
- 追加当天 `Daily/YYYY-MM-DD.md`
- 更新 `.claude/project-memory/<project_id>.md`

## 何时不用这个命令

以下场景不必默认使用 `/analyze-results`：

1. **你只要统计和图，不要实验总结报告**
   - 直接用 `results-analysis` 生成 Phase 1 strict analysis bundle
2. **你已经有 analysis bundle，只差最终报告**
   - 直接用 `results-report`
3. **你要写论文 Results section**
   - 不应由本命令直接替代 manuscript writing workflow

## 集成关系

- **Primary user entrypoint**: `/analyze-results`
- **Phase 1 skill**: `results-analysis`
- **Phase 2 skill**: `results-report`

## 成功标准

完成后至少应满足：
- blocker-first gate 已完成，并明确说明是否可以进入报告阶段
- 若证据充足，有 strict analysis bundle 和命名规范正确的 results report
- 若证据不足，有 blocker summary / audit note，且没有伪造图表、统计或结论
- 图表与文字解释一致
- blocker 与限制被明确写出
- 若 repo 绑定 Obsidian，只有在证据足够时才完成最小写回
