---
description: "有界文献检索、版本化全文阅读、引用元信息核验与证据文件。"
kind: "package-reference"
---

# @deepseek-ai/dsh-science-literature

[English](README.md) | 中文

## 概述

`ctx.scienceLiterature` 检索 arXiv 和 OpenAlex，阅读本地或已识别的开放获取论文，并通过 Crossref 核验 DOI 元信息。结果保留来源故障、论文版本、阅读深度、内容哈希与证据定位。用户文件始终通过 Harness 文件系统读取； 网络请求使用有界公共 HTTP 能力，PDF 原生文本由内嵌 PDF.js 依赖提取。

## 使用

在已加载文件系统提供方的组合中加载：

```yaml
- name: '@deepseek-ai/dsh-science-literature'
```

默认导出 `LiteratureService`，声明 `static inject = ['fs']`。提供以下操作：

- `search(query, options?, signal?)`：通过 `sources`、`limit`、`since`、`until` 与可选 `cache` 控制检索。 返回 `status`、`papers`、逐来源 `sources`、`truncated` 与可选 `cachePath`。
- `read(ref, options, signal?)`：`options.cwd` 为调用会话的工作区；`pages`、`query`、`maxChars` 选择阅读片段。 接受 DOI、arXiv ID 或 URL、本地路径，或本服务此前识别的精确 OA URL。 返回 `status`、`depth`、`ref`、`sha256`、`excerpts`、来源报告与可选缓存路径。
- `verify(doi, options?, signal?)`：将可选的 `title`、`year` 与 Crossref 比较。 核验范围固定为 `bibliographic-metadata`；`verified` 不表示论文支持稿件中的科学主张。
- 命名导出 `toBibTeX(papers)`、`toCSV(papers)` 返回确定性的字符串。调用方通过原有授权文件操作写入。

默认检索 OpenAlex 和 arXiv。成功的空结果为 `completed`；丢弃不完整记录或部分来源失败时为 `partial`。 全部指定来源失败时抛出 `SCIENCE_SOURCES_FAILED`。仅依据 DOI、精确带版本 arXiv ID 或 OpenAlex ID 合并； 相似标题不触发合并，元信息冲突保留在结果中。

### 上限与凭据

| 配置 | 默认值 | 含义 |
| --- | ---: | --- |
| `requestTimeoutMs` | 30000 | 单次 HTTP 请求期限 |
| `maxBytes` | 20971520 | 完整本地或下载文档字节上限 |
| `maxPages` | 100 | PDF 提取页数上限，从第一页开始 |
| `maxChars` | 12000 | 返回片段文字上限，单次调用可缩小 |
| `maxDocumentChars` | 2000000 | 保留的原生文档文字上限 |
| `maxResults` | 25 | 检索条目上限 |
| `maxRequests` | 6 | 单次操作允许的 HTTP 请求数 |

元信息请求另有 2 MiB 字节上限。完整操作期限覆盖请求预算与 arXiv 请求间隔；取消及插件卸载会停止并等待活动操作。 按 origin 遵守 `Retry-After`，没有无限自动重试。同一服务实例的 arXiv API 请求至少间隔三秒。

`openalexApiKey`、`openalexMailto`、`crossrefMailto` 可由配置提供，或读取 `OPENALEX_API_KEY`、`OPENALEX_MAILTO`、 `CROSSREF_MAILTO`。缺少或被拒绝的访问资格作为来源失败报告。来源诊断与保存的 endpoint 删除 API key； 带 key 请求拒绝所有重定向。

### 阅读与证据

`depth` 分为 `full-text`、`abstract-only`、`unavailable`。PDF 片段包含真实页码与 `page:N` 定位；HTML 使用可识别 的科学文章正文及 `section:article`，普通落地页不算全文。只跟随已知开放位置，优先尝试用户选定的精确 URL，排除 非 OA 的 primary PDF。来源内容始终作为数据处理，不能授权执行。

PDF 原生文字层为空时返回 `needs-setup` 并说明 OCR 缺项。损坏 PDF 抛出 `SCIENCE_PDF_EXTRACTION`，带密码 PDF 抛出 `SCIENCE_PDF_PASSWORD`。阅读 PDF 不依赖 Python 或 Poppler。提取与返回片段均有上限；`truncated` 表示完整来源 或选定文字没有全部返回。

### 可选缓存

传入 `cache: { cwd, sandboxPolicy }`，在该工作区 `.deepseek-science/literature/` 保存证据。策略由调用会话提供。 即使挂载裸文件系统，只读写入或工作区外路径也会被拒绝。不传 `cache` 时不写文件。

以 no-replace 守卫创建不可变、按哈希寻址的 JSON。检索与核验记录保留来源证据；阅读的 `cachePath` 指向提取文字， `evidencePath` 指向原始引用、工作区、来源报告与实际返回的片段。复用提取文字前重新读取并计算源字节哈希，检查缓存 大小与文字完整性；只有提交成功才返回路径。

## 实现

`src/index.ts` 管理操作及其生命周期；`metadata.ts` 适配有界 API 数据并合并身份；`pdf.ts` 管理原生文字提取和清理； `reading.ts` 选择定位与片段；`cache.ts` 通过 `ctx.fs` 提交不可变记录；`exports.ts` 导出引用元信息。

## 模型体验

通过科研工具使用方间接呈现来源报告和选定证据。

#### KV Cache effect

本服务不重写系统前缀；调用方通过已有工具循环记录结果与文件路径。

## 已知限制与后续工作

OCR、机构认证下载和科学主张支持度核验由其他能力负责。直接 URL 的认可只在当前服务实例有效，重启后重新解析 DOI 或 arXiv ID。缓存复用已提取文字，不用过期离线元信息替代不可用来源。PDF 提取受页数、字数限制；复杂分栏仍可能 需要视觉检查。

### 验证

测试覆盖来源故障、不完整元信息、版本保留、冲突、原生 PDF 和 OA 正文阅读、取消、队列期限、缓存守卫与引用导出。 子进程测试通过 app-boot 和真实 Cordis YAML 组合阅读双页 PDF。公共 HTTP 测试覆盖代理路由、私有地址、重定向、 完整字节上限与取消清理。
