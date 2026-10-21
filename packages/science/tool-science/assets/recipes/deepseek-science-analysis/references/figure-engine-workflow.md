# Built-in scientific figure renderer

Use this data-driven renderer automatically when a quantitative paper figure can be expressed as line, scatter, distribution, or heatmap panels. Respect an explicit R/Rscript choice and its exclusive backend instructions; do not switch that task to Python. The renderer is the packaged `deepseek-science-writing/scripts/scientific_figure.py`; resolve that path relative to the `deepseek-science-writing` skill directory, check the configured Python interpreter already has Matplotlib and NumPy, and do not install dependencies to make the renderer run. The matching Nature figure workflow and its complete QA references remain the authority for panel story, journal-specific requirements, and final scientific review.

The renderer preserves the supplied CSV bytes, validates every row and numeric value, and will not silently drop observations, aggregate heatmap cells, or overwrite existing output. Make one JSON specification beside its input CSV files. For one scatter panel:

```json
{
  "schema_version": 1,
  "data_status": "research",
  "question": "What is the measured association between dose and response?",
  "claim": "The observed values vary across the measured dose range",
  "width_mm": 180,
  "height_mm": 110,
  "font_size_pt": 7,
  "dpi": 600,
  "columns": 1,
  "panels": [{
    "type": "scatter",
    "data": "observations.csv",
    "title": "Measured response",
    "evidence_role": "observed relationship",
    "xlabel": "Dose (unit)",
    "ylabel": "Response (unit)",
    "n_definition": "Each point is one independently sampled specimen",
    "x": "dose",
    "y": "response",
    "group": "condition",
    "unit_id": "specimen_id"
  }]
}
```

Set `data_status` to `research` only when the CSV contains the actual retained study observations; use `demonstration` for invented examples. State the experimental unit in `n_definition`; check `unit_id` against the design before interpreting n. Add up to eight panels. `line` accepts raw observations or author-supplied summary rows; name the center statistic and explicitly define `none`, sample `sd`, `sem`, or `ci`. A raw normal-approximation CI requires a declared confidence level and method. Summary CIs preserve their supplied lower and upper columns. `distribution` shows every observation and can connect complete matched units with `paired_by`. `heatmap` requires exactly one observed value for every cell and never fills or averages cells. Use a specialist plotting workflow for survival curves, violin/box plots, forest plots, fitted models, maps, molecular structures, circuit diagrams, or any other unsupported form; never force these into a superficially similar panel.

Run from the directory containing the specification:

```sh
python <deepseek-science-writing>/scripts/scientific_figure.py --spec figure.json --output figures --name figure-1
```

Choose physical dimensions and final-size text from the target journal's current guide; the example dimensions are not a publisher template. `grid` is the default layout. For exactly three panels, `hero-left` or `hero-right` gives panel a a two-row span and aligns measured plot areas. Keep a coherent visual hierarchy, restrained colour-safe palette, consistent units and scales, short panel titles, and meaningful evidence roles. The renderer checks actual text and panel geometry before and after export and records numeric artists and input hashes. Read `report.json`, `caption.txt`, `alignment-layout.json`, the replayable `*.source/` bundle, and every exported panel at final physical size. PDF and SVG are vector outputs; PNG defaults to 600 dpi.

A successful renderer report remains `review_required`. Geometry passing does not establish that the chart type, sampling unit, statistics, interpretation, panel sequence, journal dimensions, or evidence claim is scientifically correct. Check all of those against the study and the selected Nature figure QA instructions before inserting a figure into LaTeX. Update the manuscript's figure caption and LaTeX source from the verified report; the helper does not infer causality or run hypothesis tests.
