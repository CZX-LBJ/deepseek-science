---
description: "Run DeepSeek Science for traceable literature, measured data analysis and evidence-led writing."
---

# DeepSeek Science

English | [中文](science.zh.md)

DeepSeek Science uses the Harness model loop and transport with scientific tools, a research sidebar, a pinned upstream skill library and three locally maintained workflows. Start with a workspace containing your actual papers or data. Scientific packages, database credentials and compute resources still need their own setup; a skill describes how to use them.

## Start the workbench

In the Windows desktop package, double-click **DeepSeek Science.exe**. The application has its own window and carries Electron, Node, Python, Matplotlib and scientific resources. Keep the complete directory together; move the entire folder to relocate it. Configuration, Sessions and credentials live in `.deepseek-science` under your user directory; the application package carries no credentials. LaTeX, GPUs and other tools used by upstream skills are checked per task.

Open **Settings → Models** to edit official DeepSeek, or choose **Add model provider → Custom model API** to configure the protocol, base URL, model IDs, capacities and API key. OpenAI- and Anthropic-compatible endpoints are supported. After saving, select the model in the composer. Provider configuration and credentials are stored separately and survive application restarts. Official DeepSeek uses `https://api.deepseek.com/anthropic`; available models depend on its current catalog and account access. See the [official interface guide](https://api-docs.deepseek.com/guides/anthropic_api/).

For source development, with Node and pnpm dependencies installed:

```sh
pnpm dsh --profile science --no-open
```

Open the local address printed by the launcher. Configure your DeepSeek API Key in the application, select or add a workspace, and use the DeepSeek Science preset. Open **Research** in the right sidebar. It shows recorded project phases, artifacts, papers, reading excerpts, skill requirements and provider-reported usage. You can view the interface before configuring a key; model tasks require a working model route.

The terminal profile uses the same scientific tools:

```sh
pnpm dsh --profile science-headless "Load deepseek-science-literature and review the papers in this workspace. Retain exact source locators and report missing evidence."
```

This model task requires your configured credentials. For a keyless composition check, run `pnpm dsh --profile science-headless --dump-default-config`. The [contributor verification guide](../../cookbook/benchmarking-science.md) describes deterministic replay and live measurements.

## Choose a research task

You can write an ordinary request, or start with one of these explicit workflows:

| Workflow | Example request | Deliverables |
|---|---|---|
| Literature | “Load deepseek-science-literature. Find and read evidence about my specified topic, retain conflicting metadata, and export papers.” | Candidate CSV, verified bibliography, excerpt locators and evidence records |
| Analysis | “Load deepseek-science-analysis. Inspect results.csv, confirm the sampling unit, and summarize score by method with reproducible figures.” | Preserved input, summary table, observations, PNG/SVG, script and parameter/hash record |
| Writing | “Load deepseek-science-writing. Draft from my results and evidence; keep unsupported claims and unknown citations visible.” | Manuscript source, claim table, bibliography, metadata and an inspected PDF when a TeX engine is available |

The analysis helper needs Python 3 and Matplotlib; the writing scaffold needs Python 3, and PDF compilation needs a checked TeX engine. Missing dependencies are reported as `needs-setup`. Helpers refuse to replace an existing output directory. The bundled example CSV is synthetic validation data, not a scientific finding. Analysis intervals assume independent observations; repeated measures, clusters and shared subjects need a design-specific analysis.

Ask “Search scientific skills for novelty checking / Nature polishing / review response / figures” to search the larger library. Instructions load on demand. The source catalog includes OpenScience, Nature Skills, Superpowers, Matt Pocock, both Academic Research Skills editions, K-Dense, Orchestra, Hugging Face, Claude Scholar and ARIS. Details retain source revision, licenses, requirements and copied resource locations. Embedded upstream workflows have not all been executed here; inspect their requirements before running scripts.

## Keep evidence and recover work

Projects follow question, literature, design, analysis, claims, writing, review and delivery. A checkpoint records actual file bytes and their hashes. Evidence includes a claim, checkpointed artifact, locator, exact quote, support assessment and reading depth. The quote must exist in its saved artifact; scientific support and locator validity still require review. DOI verification checks bibliographic metadata, not whether a paper proves a claim. Abstract-only results remain labeled as such.

Use the latest project revision for changes. `resume` verifies retained outputs and marks unfinished running work interrupted without relaunching jobs. If an earlier artifact changed, use `reopen` on that phase with a reason, then recheck it; later phases become pending. Skipping requires an explicit reason and cannot bypass changed completed artifacts.

## Optional academic packs

The two Academic Research Skills packs retain CC-BY-NC-4.0 terms and require explicit activation for their permitted noncommercial use. On PowerShell, set `$env:DSH_SCIENCE_NONCOMMERCIAL='1'` before starting the science profile; on Bash, prefix the launch with `DSH_SCIENCE_NONCOMMERCIAL=1`. This enables both academic packs and does not change their license rights. Other upstream packs remain searchable without advertising every skill to the model. [The packaged notice](../../../packages/skill/skill-science/assets/NOTICE.md) and source manifest own exact terms and exclusions.

## Read performance honestly

The workbench shows settled model attempts, disjoint input/cache/output buckets and observable latency. Missing usage stays unknown. Cache ratio needs all input buckets and a nonzero, consistent total; currency cost is not computed in this release and stays unknown. Stable summaries and on-demand instruction loading preserve the original Harness request path, but do not guarantee a cache hit rate or scientific task quality. The benchmark retains raw observations and has an explicit `unrun` result when no API Key exists.

The first release is a local research workbench. General superiority over OpenScience or Claude Science has not been measured. Evaluate the same tasks, evidence, budgets and deliverable criteria across products before making that comparison; distinguish model quality, tool reliability and operating cost.
