---
description: "内置科研技能目录，提供精选发现、来源元数据与离线资源完整性检查。"
kind: "package-reference"
---

# @deepseek-ai/dsh-skill-science

[English](README.md) | 中文

## 使用此包

挂载技能注册表与此提供方，即可展示精选的 `core`、`ai`、`nature` 包。完整内置技能库仍可通过导出的目录辅助函数搜索，无需把每项摘要加入模型提示。注册项使用标准内置优先级 600，插件卸载后自动移除。

```yaml
- name: '@deepseek-ai/dsh-skill'
- name: '@deepseek-ai/dsh-skill-science'
  config:
    enabledPacks: [core, ai, nature]
```

`assetRoot` 选择包含 `manifest.json` 与资源树的绝对目录，支持空格与中文路径。`enabledPacks` 替换展示的包集合；未知包导致激活失败。空数组不展示技能。可选包包含工程支持、科学软件库、Hugging Face 工作流，以及额外 AI、Nature 和 OpenScience 指令。`scholar` 包含 Galaxy Dawn 的 Claude Scholar 技能；`aris` 包含 ARIS 技能及其 Codex、Claude 审查、Gemini 审查变体。两者均为可选包；默认包仍为 `core`、`ai`、`nature`。可用包名称以[生成的清单](assets/manifest.json)为准。

`academic-noncommercial` 和 `academic-codex-noncommercial` 包隔离于 `assets/noncommercial/`，默认关闭，采用 CC-BY-NC-4.0 许可。后者包含 academic-research-skills 的 Codex 适配器及内置工作流资源。注册表展示与直接加载均需分别显式启用对应包；启用一个不会启用另一个。启用不授予商业使用权。提供方代码采用 MIT；复制资源保留声明及嵌套许可，详见 [NOTICE](assets/NOTICE.md) 与清单。Anthropic 限制使用的 `docx`、`pdf`、`pptx`、`xlsx` 技能均被排除，即使所在仓库的根许可允许再分发。

可选 `biology` 包包含经过筛选的 BioSkills 实验设计、组学、化学和生物统计工作流。`electronics` 提供 KiCad、SPICE、EMC、数据手册和 BOM 审查资源。`mathematics` 包含 Lean 4 证明指引与 SymPy 参考适配器；`physics`、`numerical`、`control` 通过本地指引适配器提供选定的 QuTiP、SciPy 和 python-control 官方文档。适配器明确标注本地编写身份，并在 `assets/knowledge/` 保留未修改的上游文档；不安装科学软件库，也不声称上游编写了这些技能。BioSkills 上游已归档，执行固定版本指令前需要核对当前 API。

## 目录 API

`readScienceCatalog(assetRoot?)` 解析可复用目录并检查资源存在。`searchScienceCatalog(catalog, query, { packs?, limit? })` 在所有内置包中搜索名称、描述、作者、来源标识及路径和前置条件。例如，`aris skills-codex-gemini-review/research-review` 可选中相应 ARIS 审查变体。`inspectScienceSkill(catalog, name)` 返回一项完整元数据。条目保留来源 URL、固定版本、原路径、作者、版本、相同内容的其他来源、许可文本、调用标志、适配状态、配置需求、依赖与哈希。

`loadScienceSkill(catalog, name, { enabledPacks?, invocation?, signal? })` 显式加载选定条目，包括未展示包中的技能。默认按模型调用检查，执行模型/用户调用标志与非商业包启用要求，并在返回标准 `SkillDefinition` 前检查指令和资源哈希。`loadScienceSkillResource(catalog, name, relative, options?)` 在检查相同调用策略及 SHA-256 后，读取一份完整且已声明的 UTF-8 资源，也支持已声明的共享依赖。`nature-shared` 支持条目禁止模型和用户调用；请求它的 Nature 技能通过资源目录读取相应文件。不存在的名称返回 `undefined`；策略或资源无效时抛出错误。`verifyScienceCatalog(catalog)` 离线检查每个资源哈希。

## 内置资源与同步

默认 `nature` 包包含 Nature Skills 全部 22 个可调用流程（`nature-academic-search`、`nature-citation`、`nature-data`、`nature-downloader`、`nature-experiment-log`、`nature-figure`、`nature-image2ppt`、`nature-literature-pipeline`、`nature-paper-card`、`nature-paper-to-patent`、`nature-paper-trans`、`nature-paper-xray`、`nature-paper2ppt`、`nature-polishing`、`nature-reader`、`nature-ref-verifier`、`nature-response`、`nature-reviewer`、`nature-social-science`、`nature-statistics`、`nature-writing` 和 `researchwrite`），以及不可调用的 `nature-shared` 支持资源。科研内核会根据普通语言自动选择模块并提供适用任务的完整指令；目录保留固定版本 Nature 资源树中的全部参考文件。

默认 `nature` 包包含 Nature Skills 全部 22 个可调用流程（`nature-academic-search`、`nature-citation`、`nature-data`、`nature-downloader`、`nature-experiment-log`、`nature-figure`、`nature-image2ppt`、`nature-literature-pipeline`、`nature-paper-card`、`nature-paper-to-patent`、`nature-paper-trans`、`nature-paper-xray`、`nature-paper2ppt`、`nature-polishing`、`nature-reader`、`nature-ref-verifier`、`nature-response`、`nature-reviewer`、`nature-social-science`、`nature-statistics`、`nature-writing` 和 `researchwrite`），以及不可调用的 `nature-shared` 支持资源。科研内核会根据普通语言自动选择模块并提供适用任务的完整指令；目录保留固定版本 Nature 资源树中的全部参考文件。

资源保留来源目录布局，包含 Nature 共用引用、学术包的共用角色与脚本、ARIS 的 MCP/工具/模板资源，以及 Scholar 的 agent（智能体）、命令、钩子、规则、脚本、模板和实用工具资源。目录外被链接且存在的文档按传递依赖复制，并保留有效许可与哈希；上游已缺失的链接记录于 `metadata.resourceAudit`。审计覆盖代码示例以外的字面 Markdown 文件链接，不覆盖脚本中每个动态构造的路径。清单把完全相同的技能树合并成一个条目，同时保留其他指令所需的相对资源位置。[names.lock.json](names.lock.json) 确保新增来源引起重名时已有公开名称保持稳定。新重名条目使用稳定的来源前缀；同一来源中内容不同的变体还添加内容哈希后缀，来源路径标识具体变体。Nature 技能保留 `nature-` 标识。上游 `disable-model-invocation` 与 `user-invocable` 标志继续生效。

在仓库中运行 `node scripts/sync-science-skills.mjs --source-root <review-clones>`，按 [sources.json](sources.json) 的固定版本重新生成资源。缺少克隆时失败，除非显式传入 `--fetch`。`--verify-only` 无需 Git 或网络即可检查现有资源。`--complete-resources` 仅修复已验证资源树中的传递文档资源与审计元数据。脚本不执行上游安装器或资源脚本；排除仓库测试、构建产物、数据目录与专有文档技能，保留适用许可和声明文件，并且只能替换此包目录内部的目标。

声明 `Complete terms in LICENSE.txt` 仅从已存在的技能本地 `LICENSE.txt` 解析；原声明与复制的许可条款均保留于目录。条款缺失或无法识别时仍排除条目。说明性声明文件继承已审查的仓库条款，不覆盖再分发限制。

同步直接复制固定版本 Git blob 字节，不经过检出换行转换。官方知识子集使用 `sources.json` 中的显式文件选择；选定文件缺失、根许可缺失、条款不受支持或资源不是普通文件时，同步失败。ARIS 的根技能与 Codex 共用参考树被显式保留，包括用普通反引号引用的写作原则、期刊检查表和引用规范；这些文件属于每个 ARIS 条目的已验证依赖。资源审计还跟踪 reStructuredText 的字面 include、image、figure 和 plot 指令；不构建 Sphinx 站点，也不解析所有交叉引用。生成指引的元数据分别标识原始来源文档和本地 `SKILL.md` 适配器，两者均受完整性检查保护。

## 模型体验

### 技能发现与加载

#### 模型看到的内容

技能消费方展示已启用包的摘要，并加载一个选定指令及其文件系统资源目录。目录消费方可针对显式搜索或检查返回完整来源与就绪元数据。每个加载条目均说明来源 URL、固定版本与 Harness 就绪状态。非商业条目和带仓库级依赖的条目还指明原仓库目录，以便资源迁移后解析共用角色、工具与脚本。标为 guidance-adapted 的条目添加资源/工具指引，其余正文来自上游并去除 frontmatter。

##### 工作流验证范围

```markdown
Workflow and script execution have not been tested in this Harness.
```

##### 资源与工具指引

```markdown
## DeepSeek Science resource and tool guidance

Resolve relative files against the resource directory supplied with this skill. Use available Harness tools for the capabilities described by upstream tool names. Do not assume optional MCP servers, credentials, packages, GPUs, or provider-specific agent APIs are installed. Check prerequisites before running a resource script; upstream scripts and workflows have not been executed in this Harness. Preserve the evidence limits and citation requirements in the upstream instructions.
```

#### Token 影响

发现阶段仅通过技能消费方加入已启用摘要。加载阶段加入一个正文与资源提示；资源文件保留在磁盘，直到明确需要。搜索或检查完整清单不会自动注入整库。

#### KV Cache 影响

此包不发起模型请求或拥有缓存。已启用摘要在一个插件生命周期中保持稳定。修改包配置会替换发现贡献；显式加载的正文通过记录结果的消费方增加上下文。

## 已知限制与延后工作

- 复制技能是指令，不代表已安装科学软件包、凭据、MCP 服务、GPU 资源或经过测试的科研工作流。`guidance-adapted` 记录本地资源/工具前言；`guidance-only` 表示可用指引，不认证脚本执行。其余条目需要审查上游配置要求。所有条目均记录 `testedHere: false`。
- 固定副本中的期刊政策与软件建议可能过时。来源版本与哈希标识内置内容；准确性依赖时，用户仍需核实当前投稿要求与软件文档。
- 目录条目去重保留相对引用所需的来源资源树，因此相同资源文件可能保留于不同逻辑路径。未适配技能仍可能提及上游专用工具与动态构造的路径，尤其是可选包。上游缺失的指令资源保留为配置需求，不编造文件。
- 文件级许可声明未知、专有、受限制或指向缺失条款时，条目仍在清单中排除。固定版本的 Hugging Face LLM trainer 指向不存在的 `LICENSE.txt`，仓库根许可无法解决此例外。
