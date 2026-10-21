---
name: deepseek-science-analysis
description: Analyze a measured CSV with reproducible group summaries, bootstrap intervals, figures, and recorded inputs in DeepSeek Science.
license: MIT
---

# CSV analysis recipe

Use [scripts/analyze_csv.py](scripts/analyze_csv.py) for one numeric measurement grouped by one categorical column. Python 3 and matplotlib are prerequisites. The helper is runtime-tested on a synthetic fixture; that check does not validate a study design or establish scientific expert quality.

1. Inspect the actual CSV and study description. Record the measurement units, sampling unit, missing-value policy and group meanings. This helper treats every row as an independent observation. Confirm that assumption before using its intervals: repeated measurements, subjects appearing in several groups, technical replicates and clustered samples need a design-specific analysis. Keep identifiers in the original data so this can be checked.
2. Resolve the helper relative to this skill directory, and check the selected interpreter without installing anything:

   ```sh
   python scripts/analyze_csv.py --check-dependencies
   ```

   If the check fails, report `needs-setup`, the interpreter and the missing dependency. Use an available configured interpreter or the user's approved setup procedure.
3. Run on actual data into a new output directory. Supply meaningful column names and an explicit seed:

   ```sh
   python scripts/analyze_csv.py --input measurements.csv --group condition --value measurement --output analysis-run --seed 2026
   ```

   UTF-8 CSV requires unique nonempty headers, consistent row widths, nonempty groups and finite numeric values. Invalid rows cause a nonzero exit before an output directory is created; the helper never silently drops them. It refuses an existing output directory. Resolve any failure against the original data and record corrections.
4. Inspect `summary.csv`, `observations.csv`, `figure.svg`, `figure.png`, `metadata.json`, the copied input and helper. Summary fields are row count N, arithmetic mean, sample SD (`ddof=1`) and a 95% percentile bootstrap interval for each group mean. The helper resamples rows within each group 2,000 times by default with the supplied seed, then linearly interpolates the 2.5th and 97.5th percentiles. N=1 has an unavailable SD and interval. Small samples, biased sampling and dependence limit interval interpretation; intervals alone do not establish a group difference, statistical significance or causation. See [references/method.md](references/method.md) before interpreting results.
5. Write an analysis note stating the sampling unit, exclusions or corrections, descriptive observations and limitations. Keep exploratory choices distinct from prespecified hypotheses. When using `science_project`, checkpoint the original input CSV as well as the actual tables, figures, copied input/script, metadata and note in its analysis phase; quote observed rows or metadata text with exact locators. Recording the original input makes a later edit invalidate the recorded phase; retaining a copied input preserves the exact run data. Advance using the current revision only after the checkpoint succeeds.

For a smoke run, replace the input with [examples/synthetic.csv](examples/synthetic.csv), group with `group` and value with `value`. Those rows are invented demonstration data, not experimental evidence. Completion requires a successful execution and inspection of saved outputs; a dependency check alone is not an analysis run.
