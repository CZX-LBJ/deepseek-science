---
description: "Compare provider accounting for the baseline and scientific profiles, and replay scientific tool evidence without a key."
---

# Verify scientific profiles

English | [中文](benchmarking-science.zh.md)

This contributor tutorial separates deterministic tool verification from live provider measurements. [Testing policy](../testing.md) defines the test tiers.

## 1. Replay scientific tool evidence

From the repository root, run:

```sh
node node_modules/vitest/vitest.mjs run --config vitest.snapshot.config.ts snapshots/session/headless.snapshot.ts -t science-evidence
```

The [science-evidence scenario](../../snapshots/session/science-evidence/snapshot.yml) launches the shipped `science-headless` profile through `dsh`. Its authored model stream calls the real literature, project and skill tools. A local synthetic paper supplies full-text excerpts, and a seeded interrupted project supplies a quoted, locator-bearing partial claim. The harness checks recorded tool output, presentation metadata, assembled prompt and schemas, and the unchanged workspace. A fixture clock fixes timing metadata, and the harness restores the seeded project identity before replay. This is keyless composition evidence; the authored stream is not a real model result or provider measurement.

## 2. Prepare a provider comparison

Run the [benchmark launcher](../../scripts/benchmark-science.ts):

```sh
node --import tsx/esm scripts/benchmark-science.ts --out artifacts/science-benchmark-unrun
```

The launcher reads `DEEPSEEK_API_KEY` from the environment or root `.env`. Without a key it writes `report.json` with `status: unrun`, an explanation and an empty `samples` list; it sends no provider request. A live comparison requires that key and has not been run in the keyless verification environment.

With a key, the launcher selects `headless` and `science-headless` through `dsh`, repeats the same research task twice per profile, alternates profile order, and keeps a private workspace and Harness home for each profile. The default task reads a synthetic paper and CSV, computes group means, and writes analysis and evidence files. Independent file checks verify numeric results, the exact limitation quote and locator, the required disclosure, and unchanged input files. `--workload probe` selects a tool-free prompt for composition overhead alone. The requested route is fixed to `deepseek-official` / `deepseek-flash`; `--model` selects another model for both profiles. `--samples` changes repetitions from 1 to 20. Source mode uses the CLI's ESM-only tsx hook; `--mode lib` selects built CLI artifacts and requires a current build. Raw Sessions, output artifacts and attempt observations are retained under the output directory.

## Read the report

Each sample retains process wall time, exit and timeout facts, answer and artifact checks, Session paths, and every successful, failed or retried model attempt. Provider-reported input, output and cache counters remain distinct. Missing samples, absent optional buckets, contradictory totals and unsafe aggregate counts remain unavailable. Cache-hit ratio requires all three disjoint input buckets and a positive denominator. Currency cost remains null because token accounting does not establish a billing invoice.

Wall time includes application startup. Logged first-attempt intervals begin at `step/start`; retry intervals begin at the preceding settlement and can include backoff. Embedded chunk timestamps measure stream span. These are client observations, not provider server timing. The provider may reuse a cache populated before this run, so repetition does not establish a cold-cache baseline. Research artifact checks measure this small local task only; they do not establish general research quality. Profile tool schemas and skill guidance differ by design and contribute to the measured input overhead.
