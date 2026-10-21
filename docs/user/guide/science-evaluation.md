---
description: "Evaluate DeepSeek Science against OpenScience and Claude Science using observable research outcomes."
---

# Evaluate scientific task quality

English | [中文](science-evaluation.zh.md)

The goal is to improve general research and AI/computing workflows. No superiority claim is established by embedded skill count, an offline replay or a synthetic plot. [Claude Science's official product description](https://www.anthropic.com/news/claude-science-ai-workbench) is a feature reference, not a measured baseline for this checkout.

## Prepare a fair comparison

Use identical task statements, source papers, data, output requirements, access permissions and stopping budgets. Freeze inputs with hashes and retain the exact model/version, tool configuration, prompts, raw outputs, failures and human interventions. Where both open systems support the same model and tools, compare those settings to examine the harness contribution. A closed product may prevent this control; label that comparison as a product comparison, with model and tool differences recorded.

## Check observable deliverables

| Task | Required result | Reject or penalize |
|---|---|---|
| Literature review | Relevant paper list, real bibliographic identities, reading depth and evidence locators | Invented references, abstract presented as full reading, source failure presented as no papers |
| Topic and novelty | Prior-work comparison and a testable plan with bounded claims | Unsupported novelty, untestable hypothesis, omitted comparable work |
| Analysis and figures | Correct computed values, sampling units, labeled uncertainty, preserved input and executable figure code | Changed raw data, misleading error bars, causal claims beyond design |
| Writing and revision | Quantitative claims linked to actual results, verified citation keys and inspected output | Unsupported numbers, fabricated citations, unresolved gaps presented as completed work |
| Changed inputs | Changed inputs invalidate dependent results and can be rechecked | Stale completed stages, reuse of old figures as new results |
| Interrupted work | Inspectable recovery that preserves completed work and avoids repeated external actions | Lost state, duplicate submitted jobs, unreported partial failure |

Use independent domain reviewers for relevance, novelty and scientific support; blind the product identity when practical. Mechanical checks establish file existence, arithmetic, citation metadata and reproducibility, while semantic scientific judgment remains separate. Include failed runs and missing dependencies in completion rates.

## Compare efficiency after quality

Report task completion, material error rate, reproducibility, required human interventions, wall time and available total cost across repeated trials. Keep successful, failed and retried attempts. Distinguish API usage from subscription and compute costs; do not turn unknown pricing into zero. Cache shares require the provider's actual accounting and consistent input buckets. [The benchmark guide](../../cookbook/benchmarking-science.md) owns the executable local baseline comparison; its small synthetic workload does not establish broad scientific quality.

Live evaluation needs configured DeepSeek credentials and access to the comparison products. The closed-product comparison has not been executed here. Until results exist, treat lower cost, better recovery and higher task quality as targets to verify.
