#!/usr/bin/env python3
"""Render retained CSV observations from an explicit JSON figure specification.

Usage: python scientific_figure.py --spec figure.json --output figures --name figure
Requires matplotlib and numpy. Geometry checks are deliberately narrower than
scientific or editorial review; every successful report retains review_required.
"""

from __future__ import annotations

import argparse
from contextlib import contextmanager
import csv
import hashlib
import io
import json
import math
import os
from pathlib import Path
import re
import shutil
import statistics
import sys
import tempfile
import uuid


PALETTE = ("#0072B2", "#D55E00", "#009E73", "#CC79A7", "#E69F00", "#56B4E9", "#333333", "#777777")
MARKERS = ("o", "s", "^", "D", "v", "P", "X", "<")
FIGURE_KEYS = {"schema_version", "data_status", "question", "claim", "width_mm", "height_mm", "font_size_pt", "font_family", "dpi", "columns", "layout", "panels"}
COMMON_KEYS = {"type", "data", "title", "evidence_role", "xlabel", "ylabel", "n_definition", "group", "unit_id", "xlim", "ylim"}
TYPE_KEYS = {
    "line": {"x", "y", "mode", "center", "uncertainty", "n"},
    "scatter": {"x", "y"},
    "distribution": {"y", "center", "uncertainty", "paired_by"},
    "heatmap": {"x", "y", "value", "colorbar_label", "cmap", "vmin", "vmax"},
}


def digest(data):
    """Return a SHA-256 fingerprint of exact bytes or canonical JSON values."""
    if not isinstance(data, bytes):
        data = json.dumps(data, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")
    return hashlib.sha256(data).hexdigest()


def text_required(obj, key):
    value = obj.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{key} must be nonempty text")
    return value


def number(value, label):
    if isinstance(value, bool):
        raise ValueError(f"{label} must be a finite number")
    try:
        result = float(value)
    except (ValueError, TypeError) as error:
        raise ValueError(f"{label} must be a finite number") from error
    if not math.isfinite(result):
        raise ValueError(f"{label} must be finite; no observations are silently dropped")
    return result


def read_table(path):
    """Read all rows without filtering; reject ambiguous headers or missing cells."""
    raw = path.read_bytes()
    reader = csv.DictReader(io.StringIO(raw.decode("utf-8-sig")), strict=True)
    columns = reader.fieldnames
    if not columns or len(columns) != len(set(columns)) or any(not c.strip() for c in columns):
        raise ValueError(f"{path.name}: CSV needs unique nonempty column headers")
    rows = []
    for row_number, row in enumerate(reader, 2):
        if None in row or any(v is None or not v.strip() for v in row.values()):
            raise ValueError(f"{path.name}: missing/extra cell in row {row_number}; exclusions must be resolved explicitly")
        rows.append(row)
    if not rows:
        raise ValueError(f"{path.name}: CSV contains no observations")
    return raw, columns, rows


def validate_spec(spec):
    if not isinstance(spec, dict) or set(spec) - FIGURE_KEYS:
        raise ValueError("Unknown figure option; supported fields: " + ", ".join(sorted(FIGURE_KEYS)))
    if spec.get("schema_version") != 1:
        raise ValueError("schema_version must be 1")
    if spec.get("data_status") not in ("research", "demonstration"):
        raise ValueError("data_status must explicitly be research or demonstration")
    text_required(spec, "question")
    text_required(spec, "claim")
    for key in ("width_mm", "height_mm"):
        if not 50 <= number(spec.get(key), key) <= 300:
            raise ValueError(f"{key} must be between 50 and 300 mm")
    if not 5 <= number(spec.get("font_size_pt", 7), "font_size_pt") <= 14:
        raise ValueError("font_size_pt must be between 5 and 14 at the final export size")
    if spec.get("dpi", 600) not in (300, 600):
        raise ValueError("dpi must be 300 or 600")
    if spec.get("font_family", "sans") not in ("sans", "serif"):
        raise ValueError("font_family must be sans or serif")
    panels = spec.get("panels")
    if not isinstance(panels, list) or not 1 <= len(panels) <= 8:
        raise ValueError("panels must contain 1 to 8 panels")
    columns = spec.get("columns", min(2, len(panels)))
    if type(columns) is not int or not 1 <= columns <= min(4, len(panels)):
        raise ValueError("columns must be an integer between 1 and min(4, panel count)")
    layout = spec.get("layout", "grid")
    if layout not in ("grid", "hero-left", "hero-right"):
        raise ValueError("layout must be grid, hero-left, or hero-right")
    if layout != "grid" and (len(panels) != 3 or columns != 2):
        raise ValueError("hero layouts require exactly three panels and two columns; panel a spans both rows")
    for panel in panels:
        kind = panel.get("type") if isinstance(panel, dict) else None
        if kind not in TYPE_KEYS or set(panel) - COMMON_KEYS - TYPE_KEYS[kind]:
            raise ValueError("Unknown panel type or option")
        for key in ("data", "title", "evidence_role", "xlabel", "ylabel", "n_definition"):
            text_required(panel, key)
        if kind == "heatmap" and ("group" in panel or "unit_id" in panel):
            raise ValueError("heatmap does not aggregate groups or independent units")


def grid_cells(spec):
    """Return bounded row/column spans; arbitrary nested layouts need another tool."""
    columns = spec.get("columns", min(2, len(spec["panels"])))
    if spec.get("layout", "grid") in ("hero-left", "hero-right"):
        hero_col = 0 if spec["layout"] == "hero-left" else 1
        other = 1 - hero_col
        return [(0, 2, hero_col, hero_col + 1), (0, 1, other, other + 1), (1, 2, other, other + 1)]
    return [(i // columns, i // columns + 1, i % columns, i % columns + 1) for i in range(len(spec["panels"]))]


def uncertainty_rule(panel, summary=False):
    rule = panel.get("uncertainty")
    if not isinstance(rule, dict) or set(rule) - {"kind", "column", "lower", "upper", "confidence", "method"}:
        raise ValueError("uncertainty must explicitly define kind and any required columns/method")
    kind = rule.get("kind")
    if kind not in ("none", "sd", "sem", "ci"):
        raise ValueError("uncertainty.kind must be none, sd, sem, or ci")
    if kind == "ci":
        confidence = number(rule.get("confidence"), "CI confidence")
        if not 0 < confidence < 1:
            raise ValueError("CI confidence must be strictly between 0 and 1")
        if not summary and rule.get("method") != "normal":
            raise ValueError("raw CI requires explicit method=normal; this approximation needs scientific review")
        if summary:
            text_required(rule, "method")
            text_required(rule, "lower")
            text_required(rule, "upper")
    if summary and kind in ("sd", "sem"):
        text_required(rule, "column")
    allowed = {"kind"}
    if kind == "ci":
        allowed |= {"confidence", "method"} | ({"lower", "upper"} if summary else set())
    elif summary and kind in ("sd", "sem"):
        allowed.add("column")
    if set(rule) - allowed:
        raise ValueError("Uncertainty options are incompatible with the selected kind/mode")
    return rule


def summarize(values, rule):
    """Calculate only the explicitly requested descriptive interval; never tests."""
    mean = statistics.mean(values)
    if rule["kind"] == "none":
        return mean, mean, mean
    if len(values) < 2:
        raise ValueError("SD, SEM, and normal CI need at least two observations per group/x")
    error = statistics.stdev(values)
    if rule["kind"] in ("sem", "ci"):
        error /= math.sqrt(len(values))
    if rule["kind"] == "ci":
        error *= statistics.NormalDist().inv_cdf((1 + rule["confidence"]) / 2)
    return mean, mean - error, mean + error


def prepare_panel(panel, path):
    """Resolve column references and keep all rows in explicit numeric records."""
    raw, columns, rows = read_table(path)
    used = set()

    def column(key, obj=panel):
        name = text_required(obj, key)
        if name not in columns:
            raise ValueError(f"{path.name}: column {name!r} does not exist")
        used.add(name)
        return name

    def numeric(row, name):
        return number(row[name], f"{path.name}:{name}")

    group = column("group") if "group" in panel else None
    unit = column("unit_id") if "unit_id" in panel else None
    groups = list(dict.fromkeys(row[group] for row in rows)) if group else [""]
    if len(groups) > len(PALETTE):
        raise ValueError("More than eight groups need a discipline-specific encoding")
    kind = panel["type"]
    record = {"type": kind, "title": panel["title"], "evidence_role": panel["evidence_role"],
              "n_definition": panel["n_definition"], "n_rows": len(rows), "groups": groups}
    if kind == "line":
        x, y = column("x"), column("y")
        mode = panel.get("mode")
        if mode not in ("raw", "summary") or panel.get("center") != "mean":
            raise ValueError("line requires explicit mode=raw|summary and center=mean")
        rule = uncertainty_rule(panel, mode == "summary")
        ncol = column("n") if mode == "summary" else None
        if mode == "raw" and "n" in panel:
            raise ValueError("raw mode counts observations; do not supply a summary n column")
        if mode == "summary" and unit:
            raise ValueError("summary rows cannot supply per-observation unit_id")
        error_col = column("column", rule) if mode == "summary" and rule["kind"] in ("sd", "sem") else None
        lo_col = column("lower", rule) if mode == "summary" and rule["kind"] == "ci" else None
        hi_col = column("upper", rule) if lo_col else None
        series = []
        for name in groups:
            selected = [r for r in rows if not group or r[group] == name]
            buckets = {}
            for row in selected:
                buckets.setdefault(numeric(row, x), []).append(row)
            points = []
            for at, values in sorted(buckets.items()):
                if unit and len({r[unit] for r in values}) != len(values):
                    raise ValueError("Duplicate unit_id at a group/x; specify the independent sampling unit")
                if mode == "raw":
                    mean, lower, upper = summarize([numeric(r, y) for r in values], rule)
                    count = len(values)
                else:
                    if len(values) != 1:
                        raise ValueError("Summary line requires one row per group/x")
                    row = values[0]
                    count = numeric(row, ncol)
                    if count < 1 or count != int(count) or (rule["kind"] != "none" and count < 2):
                        raise ValueError("Summary n must be a positive integer, at least 2 for uncertainty")
                    mean = numeric(row, y)
                    if lo_col:
                        lower, upper = numeric(row, lo_col), numeric(row, hi_col)
                    else:
                        error = numeric(row, error_col) if error_col else 0
                        if error < 0:
                            raise ValueError("SD/SEM cannot be negative")
                        lower, upper = mean - error, mean + error
                    if not lower <= mean <= upper:
                        raise ValueError("Supplied interval must contain its center")
                points.append({"x": at, "center": mean, "lower": lower, "upper": upper, "n": int(count)})
            if len(points) < 2:
                raise ValueError("Each line needs at least two distinct x values")
            series.append({"label": name, "points": points})
        record.update(mode=mode, center="mean", uncertainty=rule, series=series,
                      observation_values=[{ "group": r[group] if group else "", "x": numeric(r, x), "y": numeric(r, y), **({"unit_id": r[unit]} if unit else {})} for r in rows])
    elif kind == "scatter":
        x, y = column("x"), column("y")
        record["points"] = [{"group": r[group] if group else "", "x": numeric(r, x), "y": numeric(r, y), **({"unit_id": r[unit]} if unit else {})} for r in rows]
    elif kind == "distribution":
        if not group:
            raise ValueError("distribution requires group and y columns")
        y = column("y")
        if panel.get("center") != "mean":
            raise ValueError("distribution requires explicit center=mean")
        rule = uncertainty_rule(panel)
        paired = column("paired_by") if "paired_by" in panel else None
        paired_rows = {}
        if paired:
            for row in rows:
                values = paired_rows.setdefault(row[paired], {})
                if row[group] in values:
                    raise ValueError("paired_by must identify exactly one observation per group")
                values[row[group]] = numeric(row, y)
            if any(set(values) != set(groups) for values in paired_rows.values()):
                raise ValueError("Paired lines require complete pairs; no incomplete units are silently dropped")
        series = []
        for name in groups:
            selected = [r for r in rows if r[group] == name]
            if unit and len({r[unit] for r in selected}) != len(selected):
                raise ValueError("Duplicate independent unit_id within a distribution group")
            values = [numeric(r, y) for r in selected]
            mean, lower, upper = summarize(values, rule)
            series.append({"label": name, "values": values, "center": mean, "lower": lower, "upper": upper, "n": len(values),
                           "paired_ids": [r[paired] for r in selected] if paired else []})
        record.update(center="mean", uncertainty=rule, series=series, paired_by=paired, pairs=paired_rows)
    else:
        x, y, value = column("x"), column("y"), column("value")
        text_required(panel, "colorbar_label")
        xs, ys = list(dict.fromkeys(r[x] for r in rows)), list(dict.fromkeys(r[y] for r in rows))
        cells = {}
        for row in rows:
            key = (row[x], row[y])
            if key in cells:
                raise ValueError("Heatmap has duplicate cells; precompute an explicitly documented aggregate")
            cells[key] = numeric(row, value)
        if len(cells) != len(xs) * len(ys):
            raise ValueError("Heatmap must contain every cell; missing cells cannot be invented")
        cmap = panel.get("cmap", "cividis")
        if cmap not in ("cividis", "viridis", "magma", "plasma"):
            raise ValueError("Supported heatmaps use perceptually ordered cividis, viridis, magma, or plasma")
        matrix = [[cells[(a, b)] for a in xs] for b in ys]
        vmin = number(panel.get("vmin", min(cells.values())), "vmin")
        vmax = number(panel.get("vmax", max(cells.values())), "vmax")
        if vmin >= vmax or min(cells.values()) < vmin or max(cells.values()) > vmax:
            raise ValueError("Heatmap range must be increasing and contain all values")
        record.update(x_categories=xs, y_categories=ys, matrix=matrix, cmap=cmap, vmin=vmin, vmax=vmax)
    record["columns_used"] = [c for c in columns if c in used]
    record["columns_unused"] = [c for c in columns if c not in used]
    return raw, record


def bbox_points(bbox, dpi):
    return [round(float(v) * 72 / dpi, 5) for v in bbox.extents]


def geometry_audit(fig, axes, headers, labels, legends, colorbars, cells):
    """Measure actual renderer artists. Does not certify scientific meaning."""
    import matplotlib.text as mtext
    # Axis objects retain off-range tick labels whose visible flag is still True.
    # Capture Text.draw calls so undisplayed ticks do not become false collisions.
    drawn_text = []
    original_draw = mtext.Text.draw

    def track_draw(artist, renderer):
        if artist.get_visible() and artist.get_text().strip():
            drawn_text.append(artist)
        return original_draw(artist, renderer)

    mtext.Text.draw = track_draw
    try:
        fig.canvas.draw()
    finally:
        mtext.Text.draw = original_draw
    renderer, dpi = fig.canvas.get_renderer(), fig.dpi
    failures, warnings = [], []
    canvas = fig.bbox
    tolerance = dpi / 72 * 0.4
    entries = []
    seen = set()
    for item in drawn_text:
        if id(item) in seen or not item.get_visible() or not item.get_text().strip():
            continue
        seen.add(id(item))
        bounds = item.get_window_extent(renderer)
        if bounds.width <= 0 or bounds.height <= 0:
            continue
        entry = {"text": item.get_text(), "font_size_pt": item.get_fontsize(), "bbox_pt": bbox_points(bounds, dpi)}
        entries.append((entry, bounds, item))
        if bounds.x0 < canvas.x0 - tolerance or bounds.y0 < canvas.y0 - tolerance or bounds.x1 > canvas.x1 + tolerance or bounds.y1 > canvas.y1 + tolerance:
            failures.append({"check": "text_clipping", "text": item.get_text()})
        if item.get_fontsize() < 5:
            failures.append({"check": "font_floor", "text": item.get_text()})
        if "$" in item.get_text():
            warnings.append({"check": "math_glyph_review", "text": item.get_text(), "reason": "Math scripts may shrink below their parent font; inspect exported vector glyphs"})
    for index, (a, box_a, artist_a) in enumerate(entries):
        for b, box_b, artist_b in entries[index + 1:]:
            overlap_x = min(box_a.x1, box_b.x1) - max(box_a.x0, box_b.x0)
            overlap_y = min(box_a.y1, box_b.y1) - max(box_a.y0, box_b.y0)
            if overlap_x > tolerance and overlap_y > tolerance:
                failures.append({"check": "text_collision", "texts": [a["text"], b["text"]]})
    for index, legend in enumerate(legends):
        box = legend.get_window_extent(renderer)
        for p, ax in enumerate(axes):
            if box.overlaps(ax.get_window_extent(renderer)):
                failures.append({"check": "legend_over_plot_area", "legend": index, "panel": chr(97 + p)})
        if not canvas.contains(box.x0, box.y0) or not canvas.contains(box.x1, box.y1):
            failures.append({"check": "legend_clipping", "legend": index})
    plot_boxes = [ax.get_window_extent(renderer) for ax in axes]
    for entry, bounds, artist in entries:
        for p, plot_box in enumerate(plot_boxes):
            if bounds.overlaps(plot_box):
                failures.append({"check": "text_over_plot_area", "panel": chr(97 + p), "text": entry["text"]})
    for i, a in enumerate(plot_boxes):
        for j, b in enumerate(plot_boxes[i + 1:], i + 1):
            if a.overlaps(b):
                failures.append({"check": "plot_overlap", "panels": [chr(97 + i), chr(97 + j)]})
    alignment = []
    pt_tol = 1.5 * dpi / 72
    # Shared grid boundaries include unequal spans: hero top with upper small
    # panel, hero bottom with lower small panel, and the small column's edges.
    for cell_dimension, box_dimension, check in ((0, 3, "top_edges"), (1, 1, "bottom_edges"), (2, 0, "left_edges"), (3, 2, "right_edges")):
        for boundary in sorted({c[cell_dimension] for c in cells}):
            indexes = [i for i, c in enumerate(cells) if c[cell_dimension] == boundary]
            if len(indexes) < 2:
                continue
            coordinates = [plot_boxes[i].extents[box_dimension] for i in indexes]
            aligned = bool(max(coordinates) - min(coordinates) <= pt_tol)
            alignment.append({"check": check, "panels": [chr(97 + i) for i in indexes], "passed": aligned})
            if not aligned:
                failures.append({"check": check, "panels": [chr(97 + i) for i in indexes]})
            if cell_dimension in (0, 2):
                anchor_dimension = "y1" if cell_dimension == 0 else "x0"
                anchors = [getattr(labels[i].get_window_extent(renderer), anchor_dimension) for i in indexes]
                if max(anchors) - min(anchors) > pt_tol:
                    failures.append({"check": "panel_label_alignment", "panels": [chr(97 + i) for i in indexes]})
    widths = [b.width for b in plot_boxes]
    if max(widths) - min(widths) > pt_tol:
        failures.append({"check": "unequal_equal_span_widths"})
    for row_span in {(c[0], c[1]) for c in cells}:
        row = sorted([plot_boxes[i] for i, c in enumerate(cells) if (c[0], c[1]) == row_span], key=lambda b: b.x0)
        if len(row) > 2:
            gutters = [b.x0 - a.x1 for a, b in zip(row, row[1:])]
            if max(gutters) - min(gutters) > pt_tol:
                failures.append({"check": "unequal_horizontal_gutters", "row_span": list(row_span)})
    for col_span in {(c[2], c[3]) for c in cells}:
        col = sorted([plot_boxes[i] for i, c in enumerate(cells) if (c[2], c[3]) == col_span], key=lambda b: b.y0)
        if len(col) > 2:
            gutters = [b.y0 - a.y1 for a, b in zip(col, col[1:])]
            if max(gutters) - min(gutters) > pt_tol:
                failures.append({"check": "unequal_vertical_gutters", "col_span": list(col_span)})
    return {"status": "failed" if failures else ("review_required" if warnings else "passed"),
            "method": "Matplotlib Agg renderer bounding boxes at final physical size",
            "tolerance_pt": {"text_overlap": 0.4, "panel_alignment": 1.5},
            "failures": failures, "warnings": warnings, "text_artists": [e[0] for e in entries],
            "plot_areas_pt": {chr(97 + i): bbox_points(b, dpi) for i, b in enumerate(plot_boxes)}, "alignment": alignment,
            "legend_boxes_pt": [bbox_points(legend.get_window_extent(renderer), dpi) for legend in legends],
            "panel_labels_pt": {chr(97 + i): bbox_points(label.get_window_extent(renderer), dpi) for i, label in enumerate(labels)},
            "limitations": ["Bounding boxes cannot establish scientific validity, legibility, color accessibility, or salience", "PDF/SVG use different renderers; inspect final vector exports and small math glyphs", "Data glyph overlap is intentional for scatter, uncertainty bands, and paired lines"]}


def numeric_artists(axes):
    """Fingerprint the rendered numerical artists rather than only their inputs."""
    import numpy as np
    values = []
    for ax in axes:
        panel = {"lines": [], "collections": [], "images": [], "xlim": list(ax.get_xlim()), "ylim": list(ax.get_ylim())}
        for line in ax.lines:
            panel["lines"].append(np.asarray(line.get_xydata(), dtype=float).tolist())
        for collection in ax.collections:
            panel["collections"].append({"offsets": np.asarray(collection.get_offsets(), dtype=float).tolist(),
                                         "paths": [np.asarray(path.vertices, dtype=float).tolist() for path in collection.get_paths()]})
        for image in ax.images:
            panel["images"].append(np.asarray(image.get_array(), dtype=float).tolist())
        values.append(panel)
    return {"sha256": digest(values), "panels": values}


def alignment_manifest(fig, axes, labels, cells):
    """Expose measured rectangles for independent backend-neutral alignment QA."""
    renderer = fig.canvas.get_renderer()
    panels = []
    for index, (ax, label) in enumerate(zip(axes, labels)):
        label_box = label.get_window_extent(renderer)
        panels.append({"id": chr(97 + index), "bbox_pt": bbox_points(ax.get_window_extent(renderer), fig.dpi),
                       "grid_id": "figure-grid", "row_start": cells[index][0], "row_stop": cells[index][1],
                       "col_start": cells[index][2], "col_stop": cells[index][3],
                       "panel_label": chr(97 + index), "panel_label_anchor_pt": [float(label_box.x0 * 72 / fig.dpi), float(label_box.y1 * 72 / fig.dpi)]})
    return {"schema_version": 1, "backend": "python-matplotlib", "figure": {"width_pt": float(fig.get_figwidth() * 72), "height_pt": float(fig.get_figheight() * 72)}, "panels": panels, "exemptions": []}


def render(spec_path, output, name="figure"):
    """Create vector/raster files and a source bundle; refuse an existing target.

    A returned status of review_required means geometry may pass, but a human
    must still review the scientific interpretation and all final-size panels.
    A failed geometry audit writes only the report and retained sources.
    """
    spec_path, output = Path(spec_path).resolve(), Path(output).resolve()
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,79}", name):
        raise ValueError("name must contain only letters, digits, underscore, or hyphen")
    spec_bytes = spec_path.read_bytes()
    spec = json.loads(spec_bytes)
    validate_spec(spec)
    targets = [output / f"{name}.{suffix}" for suffix in ("pdf", "svg", "png", "report.json", "caption.txt", "alignment-layout.json", "source")]
    if any(path.exists() for path in targets):
        raise ValueError("Refusing to overwrite figure artifacts; select a fresh name or directory")
    datasets, records = [], []
    for panel in spec["panels"]:
        data_path = (spec_path.parent / panel["data"]).resolve()
        raw, record = prepare_panel(panel, data_path)
        datasets.append((data_path, raw))
        records.append(record)
    group_names = list(dict.fromkeys(g for record in records for g in record["groups"] if g))
    if len(group_names) > len(PALETTE):
        raise ValueError("More than eight categories across the figure need an explicit discipline-specific palette")
    group_colors = {g: PALETTE[i] for i, g in enumerate(group_names)}
    group_markers = {g: MARKERS[i] for i, g in enumerate(group_names)}
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.ticker import MaxNLocator
    import numpy as np
    font = float(spec.get("font_size_pt", 7))
    family = "DejaVu Serif" if spec.get("font_family", "sans") == "serif" else "DejaVu Sans"
    columns = spec.get("columns", min(2, len(records)))
    cells = grid_cells(spec)
    rows = max(c[1] for c in cells)
    settings = {"font.family": family, "font.size": font, "axes.labelsize": font, "axes.titlesize": font,
                "xtick.labelsize": font, "ytick.labelsize": font, "legend.fontsize": font,
                "axes.spines.top": False, "axes.spines.right": False, "axes.linewidth": 0.6,
                "pdf.fonttype": 42, "ps.fonttype": 42, "svg.fonttype": "none", "svg.hashsalt": "science-figure-v1",
                "text.usetex": False, "axes.unicode_minus": True}
    with plt.rc_context(settings):
        fig = plt.figure(figsize=(spec["width_mm"] / 25.4, spec["height_mm"] / 25.4), dpi=150, layout="constrained")
        fig.get_layout_engine().set(w_pad=5 / 72, h_pad=5 / 72, wspace=0.09, hspace=0.08)
        grid = fig.add_gridspec(rows, columns)
        axes, headers, labels, legends, colorbars = [], [], [], [], []
        for index, (panel, record) in enumerate(zip(spec["panels"], records)):
            r0, r1, c0, c1 = cells[index]
            nested = grid[r0:r1, c0:c1].subgridspec(2, 1, height_ratios=[0.24 / (r1 - r0), 1], hspace=0.01)
            header, ax = fig.add_subplot(nested[0]), fig.add_subplot(nested[1])
            header.set_axis_off()
            label = header.text(0, 1, chr(97 + index), weight="bold", fontsize=font + 1, va="top", transform=header.transAxes)
            header.text(0.065, 1, panel["title"], va="top", transform=header.transAxes)
            axes.append(ax); headers.append(header); labels.append(label)
            kind = panel["type"]
            if kind == "line":
                for g, series in enumerate(record["series"]):
                    points = series["points"]
                    xs = [p["x"] for p in points]
                    ys = [p["center"] for p in points]
                    color = group_colors.get(series["label"], PALETTE[0])
                    marker = group_markers.get(series["label"], MARKERS[0])
                    ax.plot(xs, ys, color=color, marker=marker, markersize=3, linewidth=1.0, label=series["label"] or "Mean")
                    if record["uncertainty"]["kind"] != "none":
                        ax.fill_between(xs, [p["lower"] for p in points], [p["upper"] for p in points], color=color, alpha=0.16, linewidth=0)
                ax.margins(x=0.04, y=0.1)
            elif kind == "scatter":
                for g, group in enumerate(record["groups"]):
                    points = [p for p in record["points"] if p["group"] == group]
                    ax.scatter([p["x"] for p in points], [p["y"] for p in points], s=12, color=group_colors.get(group, PALETTE[0]), marker=group_markers.get(group, MARKERS[0]), alpha=0.75, linewidths=0.3, edgecolors="white", label=group or "Observations")
                ax.margins(0.12)
            elif kind == "distribution":
                pair_offsets = dict(zip(record["pairs"], np.linspace(-0.16, 0.16, len(record["pairs"])))) if record["pairs"] else {}
                for unit, pair in record["pairs"].items():
                    ax.plot([g + pair_offsets[unit] for g in range(len(record["groups"]))], [pair[g] for g in record["groups"]], color="#BBBBBB", linewidth=0.5, zorder=1)
                for g, series in enumerate(record["series"]):
                    values = series["values"]
                    # Horizontal offsets keep every observation, without sampling or changing y.
                    offsets = np.array([pair_offsets[unit] for unit in series["paired_ids"]]) if record["pairs"] else (np.linspace(-0.16, 0.16, len(values)) if len(values) > 1 else np.zeros(1))
                    ax.scatter(g + offsets, values, color=group_colors[series["label"]], marker=group_markers[series["label"]], s=11, linewidths=0.3, edgecolors="white", zorder=3)
                    mean = series["center"]
                    ax.errorbar(g, mean, yerr=[[mean - series["lower"]], [series["upper"] - mean]], fmt="_", color="#222222", markersize=10, capsize=3, elinewidth=0.85, zorder=4)
                ax.set_xticks(range(len(record["groups"])), [f"{s['label']}\nn = {s['n']}" for s in record["series"]])
                ax.margins(x=0.25, y=0.14)
            else:
                image = ax.imshow(record["matrix"], cmap=record["cmap"], vmin=record["vmin"], vmax=record["vmax"], aspect="auto", interpolation="nearest")
                ax.set_xticks(range(len(record["x_categories"])), record["x_categories"])
                ax.set_yticks(range(len(record["y_categories"])), record["y_categories"])
                colorbar = fig.colorbar(image, ax=ax, fraction=0.045, pad=0.035)
                colorbar.set_label(panel["colorbar_label"])
                colorbar.ax.tick_params(labelsize=font, length=2)
                colorbars.append(colorbar.ax)
            ax.set_xlabel(panel["xlabel"]); ax.set_ylabel(panel["ylabel"])
            ax.tick_params(direction="out", length=2.5, width=0.6, pad=2)
            if kind != "heatmap":
                ax.yaxis.set_major_locator(MaxNLocator(nbins=4, min_n_ticks=3))
                if kind != "distribution":
                    ax.xaxis.set_major_locator(MaxNLocator(nbins=5, min_n_ticks=3))
            for key in ("xlim", "ylim"):
                if key in panel:
                    bounds = panel[key]
                    if not isinstance(bounds, list) or len(bounds) != 2 or number(bounds[0], key) >= number(bounds[1], key):
                        raise ValueError(f"{key} must contain two increasing numeric bounds")
                    # Fail if manually supplied limits would conceal a measured value or interval.
                    existing = ax.dataLim.intervalx if key == "xlim" else ax.dataLim.intervaly
                    if existing[0] < bounds[0] or existing[1] > bounds[1]:
                        raise ValueError(f"{key} would hide observations or uncertainty")
                    getattr(ax, "set_" + key)(bounds)
            handles, names = ax.get_legend_handles_labels()
            if handles:
                legend = header.legend(handles, names, loc="lower left", bbox_to_anchor=(0, 0), borderaxespad=0, frameon=False, ncols=min(2, len(handles)), handlelength=1.6, handletextpad=0.4, columnspacing=1.0, labelspacing=0.3)
                legends.append(legend)
        if spec["data_status"] == "demonstration":
            fig.suptitle("DEMONSTRATION — invented data; no research evidence", fontsize=font, color="#555555")
        fig.canvas.draw()
        # Heatmap colorbars consume width; synchronize every equal-span data area.
        fig.set_layout_engine(None)
        positions = [ax.get_position() for ax in axes]
        lefts = {c: max(b.x0 for i, b in enumerate(positions) if cells[i][2] == c) for c in range(columns)}
        tops = {r: min(b.y1 for i, b in enumerate(positions) if cells[i][0] == r) for r in {c[0] for c in cells}}
        bottoms = {r: max(b.y0 for i, b in enumerate(positions) if cells[i][1] == r) for r in {c[1] for c in cells}}
        common_width = min(b.x1 - lefts[cells[i][2]] for i, b in enumerate(positions))
        header_height = min(h.get_position().height for h in headers)
        for index, ax in enumerate(axes):
            r0, r1, c0, c1 = cells[index]
            ax.set_position([lefts[c0], bottoms[r1], common_width, tops[r0] - bottoms[r1]])
            headers[index].set_position([lefts[c0], tops[r0] + 5 / (72 * fig.get_figheight()), common_width, header_height])
        before = geometry_audit(fig, axes, headers, labels, legends, colorbars, cells)
        fingerprints = numeric_artists(axes)
        output.mkdir(parents=True, exist_ok=True)
        source = output / f"{name}.source"
        source.mkdir()
        (source / "spec.json").write_bytes(spec_bytes)
        shutil.copyfile(Path(__file__), source / "renderer.py")
        input_records = []
        for index, ((path, raw), record) in enumerate(zip(datasets, records)):
            retained = f"panel-{chr(97 + index)}.csv"
            (source / retained).write_bytes(raw)
            input_records.append({"panel": chr(97 + index), "declared_path": spec["panels"][index]["data"], "retained_file": retained, "sha256": digest(raw), "rows_read": record["n_rows"], "rows_used": record["n_rows"], "rows_excluded": 0, "columns_used": record["columns_used"], "columns_unused": record["columns_unused"]})
        portable = json.loads(spec_bytes)
        for index, panel in enumerate(portable["panels"]):
            panel["data"] = input_records[index]["retained_file"]
        (source / "replay.json").write_text(json.dumps(portable, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        caption = ["DEMONSTRATION: invented data; no research evidence." if spec["data_status"] == "demonstration" else "Author review required: descriptive figure notes."]
        for index, record in enumerate(records):
            note = f"{chr(97 + index)}, {record['title']}. {record['n_definition']}. "
            rule = record.get("uncertainty")
            if rule:
                interval = {"sd": "mean ± sample SD (ddof=1)", "sem": "mean ± SEM (sample SD / sqrt(n))", "none": "mean; no uncertainty interval"}.get(rule["kind"])
                if rule["kind"] == "ci":
                    interval = f"mean with {100 * rule['confidence']:g}% CI; method: {rule['method']}"
                    if record.get("mode") != "summary":
                        interval += "; normal approximation, independent observations assumed"
                note += interval + ". "
                if record["type"] == "line":
                    counts = [f"{s['label'] or 'Series'}: n={','.join(str(p['n']) for p in s['points'])} in increasing x order" for s in record["series"]]
                    note += "; ".join(counts) + ". "
                else:
                    note += "; ".join(f"{s['label']}: n={s['n']}" for s in record["series"]) + ". All observations are shown. "
                    if record["paired_by"]:
                        note += f"Paired lines follow {record['paired_by']}; {len(record['pairs'])} complete units. "
            elif record["type"] == "scatter":
                note += f"All {record['n_rows']} observations are shown; no fitted association or test. "
            else:
                note += f"All {record['n_rows']} supplied cells are shown; no cell aggregation. "
            caption.append(note.strip())
        caption.append("No significance tests or multiplicity corrections were performed. Verify the sampling-unit definitions and all scientific interpretations before use.")
        (output / f"{name}.caption.txt").write_text("\n\n".join(caption) + "\n", encoding="utf-8")
        exports = []
        if before["status"] == "failed":
            fig.savefig(source / "diagnostic.png", dpi=150)
        if before["status"] != "failed":
            for extension in ("pdf", "svg", "png"):
                path = output / f"{name}.{extension}"
                kwargs = {"dpi": spec.get("dpi", 600)} if extension == "png" else {}
                if extension == "pdf":
                    kwargs["metadata"] = {"CreationDate": None, "ModDate": None}
                elif extension == "svg":
                    kwargs["metadata"] = {"Date": None}
                fig.savefig(path, **kwargs)  # Preserve specified physical dimensions; no tight crop.
                exports.append({"file": path.name, "sha256": digest(path.read_bytes()), "bytes": path.stat().st_size})
        after = geometry_audit(fig, axes, headers, labels, legends, colorbars, cells)
        after_fingerprint = numeric_artists(axes)
        (output / f"{name}.alignment-layout.json").write_text(json.dumps(alignment_manifest(fig, axes, labels, cells), indent=2) + "\n", encoding="utf-8")
        if fingerprints["sha256"] != after_fingerprint["sha256"]:
            after["failures"].append({"check": "numeric_artist_mutation_during_export"})
            after["status"] = "failed"
        status = "failed" if "failed" in (before["status"], after["status"]) else "review_required"
        report = {"schema_version": 1, "status": status, "data_status": spec["data_status"], "question": spec["question"], "claim": spec["claim"],
                  "spec_sha256": digest(spec_bytes), "renderer_sha256": digest(Path(__file__).read_bytes()), "matplotlib_version": matplotlib.__version__, "numpy_version": np.__version__,
                  "group_colors": group_colors, "layout": spec.get("layout", "grid"),
                  "dimensions": {"width_mm": spec["width_mm"], "height_mm": spec["height_mm"], "dpi": spec.get("dpi", 600), "png_pixels": [int(spec["width_mm"] / 25.4 * spec.get("dpi", 600)), int(spec["height_mm"] / 25.4 * spec.get("dpi", 600))]},
                  "font": {"family": family, "base_size_pt": font, "minimum_artist_size_pt": min(t["font_size_pt"] for t in after["text_artists"]), "pdf_fonttype": 42, "svg_fonttype": "none"},
                  "inputs": input_records, "panels": records, "numeric_artists": fingerprints, "geometry_before_export": before, "geometry_after_export": after,
                  "exports": exports, "review_required": ["Review every panel at final physical size and inspect exported PDF/SVG text and placement", "Verify n represents independent units, intervals fit the sampling design, and panel roles support the stated claim", "No significance tests, regression fits, causal inference, or missing-data exclusions were performed"]}
        (output / f"{name}.report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False, allow_nan=False) + "\n", encoding="utf-8")
        plt.close(fig)
        return report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--spec", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--name", default="figure")
    args = parser.parse_args(argv)
    try:
        report = render(args.spec, args.output, args.name)
        print(json.dumps({"status": report["status"], "report": str(args.output / f"{args.name}.report.json"), "exports": report["exports"]}))
        return 1 if report["status"] == "failed" else 0
    except (ValueError, OSError, ImportError, TypeError, KeyError, csv.Error) as error:
        print(json.dumps({"status": "failed", "error": str(error)}), file=sys.stderr)
        return 1


@contextmanager
def matplotlib_cache():
    """Keep Windows inherited permissions; POSIX caches remain owner-only."""
    cache = Path(tempfile.gettempdir()) / f"science-figure-matplotlib-{uuid.uuid4().hex}"
    if os.name == "nt":
        cache.mkdir()
    else:
        cache.mkdir(mode=0o700)
    try:
        yield cache
    finally:
        shutil.rmtree(cache)


if __name__ == "__main__":
    with matplotlib_cache() as cache:
        os.environ["MPLCONFIGDIR"] = str(cache)
        raise SystemExit(main())
