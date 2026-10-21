# CSV figure example

All 45 rows are invented, deterministic rendering fixtures. They demonstrate the renderer and never support a research claim. The figure and retained notes explicitly label this status.

```sh
python ../../scripts/scientific_figure.py --spec figure.json --output figures
```

The JSON fixes the question, claim, physical size, data status, panel roles, actual columns, sampling-unit definitions and uncertainty. Change these deliberately for a real study. Every observation is retained; incomplete pairs, missing/nonfinite values, duplicate heatmap cells and limits hiding values fail instead of triggering silent exclusion.

The CLI produces PDF with embedded TrueType text, SVG with editable text, PNG at 300 or 600 dpi, descriptive caption notes, a JSON report and a retained source folder. Replay with `python figure.source/renderer.py --spec figure.source/replay.json --output replay`. The report stores exact source hashes, every plotted numeric value, sample counts, statistical settings, numeric-artist fingerprints and before/after export renderer geometry. Existing output names are never overwritten.

Supported panel types are `line`, `scatter`, `distribution` and `heatmap`. Lines require explicit `mode: raw` or `summary` and `center: mean`. Distribution panels show all observations, a mean and the requested uncertainty; `paired_by` requires one observation in every group for each ID. Raw uncertainty supports `none`, sample `sd`, `sem`, or `ci` with explicit `method: normal` and `confidence`. Normal intervals assume independent units within each group/x and need scientific review. Summary lines require an `n` column; `sd`/`sem` require an uncertainty `column`, while `ci` requires supplied `lower`/`upper` columns, confidence and method text. No significance testing or automatic model fitting is performed.

Geometric failures block submission exports and retain a diagnostic PNG. A successful render still returns `review_required`: Matplotlib renderer rectangles cannot certify scientific validity, color accessibility, visual salience, or final PDF/SVG glyph geometry. Inspect every panel and the exported vectors at the stated physical size. This is an original bounded implementation informed by Nature-style figure design; it is not journal submission certification.
