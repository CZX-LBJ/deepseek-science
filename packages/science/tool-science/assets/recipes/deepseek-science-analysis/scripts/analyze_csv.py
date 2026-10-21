#!/usr/bin/env python3
"""Summarize finite CSV measurements and retain a reproducible descriptive run."""

import argparse
import csv
import hashlib
import io
import json
import math
import os
import platform
import random
import statistics
import sys
import tempfile
from pathlib import Path


def plotting_dependencies():
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError as error:
        raise ValueError(
            f"needs-setup: matplotlib is unavailable for {sys.executable}; "
            "use a configured interpreter or arrange dependency setup explicitly"
        ) from error
    return matplotlib, plt


def read_observations(raw, group_column, value_column):
    text = raw.decode("utf-8-sig")
    reader = csv.reader(io.StringIO(text, newline=""), strict=True)
    header = next(reader, None)
    if not header or any(not name.strip() for name in header) or len(set(header)) != len(header):
        raise ValueError("CSV must have unique, nonempty headers")
    for column in (group_column, value_column):
        if column not in header:
            raise ValueError(f"CSV has no column {column!r}")
    group_index, value_index = header.index(group_column), header.index(value_column)
    observations = []
    for row_number, row in enumerate(reader, start=2):
        if len(row) != len(header):
            raise ValueError(f"CSV row {row_number} has {len(row)} cells; expected {len(header)}")
        group = row[group_index].strip()
        if not group:
            raise ValueError(f"CSV row {row_number} has an empty group")
        try:
            value = float(row[value_index])
        except ValueError as error:
            raise ValueError(f"CSV row {row_number} has a nonnumeric value") from error
        if not math.isfinite(value):
            raise ValueError(f"CSV row {row_number} has a nonfinite value")
        observations.append((row_number, group, value))
    if not observations:
        raise ValueError("CSV contains no observations")
    return observations


def percentile(values, probability):
    index = (len(values) - 1) * probability
    lower = math.floor(index)
    upper = math.ceil(index)
    return values[lower] + (values[upper] - values[lower]) * (index - lower)


def summarize(observations, seed, resamples):
    groups = {}
    for _, group, value in observations:
        groups.setdefault(group, []).append(value)
    rng = random.Random(seed)
    summaries = []
    for group in sorted(groups):
        values = groups[group]
        count = len(values)
        mean = statistics.mean(values)
        sd = statistics.stdev(values) if count > 1 else None
        low = high = None
        if count > 1:
            means = sorted(statistics.mean(rng.choices(values, k=count)) for _ in range(resamples))
            low, high = percentile(means, 0.025), percentile(means, 0.975)
        if any(value is not None and not math.isfinite(value) for value in (mean, sd, low, high)):
            raise ValueError(f"Numeric range exceeds finite calculations for group {group!r}")
        summaries.append({"group": group, "n": count, "mean": mean, "sd": sd,
                          "ci95_low": low, "ci95_high": high})
    return summaries


def write_csv(path, fields, rows):
    with path.open("w", encoding="utf-8", newline="") as output:
        writer = csv.DictWriter(output, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def save_figure(plt, observations, summaries, output, seed, group_column, value_column):
    jitter = random.Random(seed)
    plt.rcParams["svg.hashsalt"] = "deepseek-science-analysis"
    fig, ax = plt.subplots(figsize=(max(5, len(summaries) * 1.1), 4), layout="constrained")
    for position, summary in enumerate(summaries):
        values = [value for _, group, value in observations if group == summary["group"]]
        x = [position + jitter.uniform(-0.12, 0.12) for _ in values]
        ax.scatter(x, values, s=20, alpha=0.6, color="#377eb8", label="Observed rows" if position == 0 else None)
        ax.scatter([position], [summary["mean"]], s=45, marker="s", color="#a5332f", zorder=3,
                   label="Mean" if position == 0 else None)
        if summary["ci95_low"] is not None:
            ax.vlines(position, summary["ci95_low"], summary["ci95_high"], color="#a5332f", linewidth=2)
        ax.annotate(f"N={summary['n']}", (position, 1), xycoords=("data", "axes fraction"),
                    xytext=(0, 3), textcoords="offset points", ha="center", fontsize=9)
    ax.set_xticks(range(len(summaries)), [summary["group"] for summary in summaries])
    ax.set_xlabel(group_column)
    ax.set_ylabel(value_column)
    ax.set_title("Observed values and means; lines: 95% bootstrap intervals", pad=24, fontsize=10)
    ax.grid(axis="y", alpha=0.2)
    ax.legend(loc="best", fontsize=8)
    fig.savefig(output / "figure.svg", metadata={"Date": None})
    fig.savefig(output / "figure.png", dpi=180, metadata={"Software": "DeepSeek Science CSV analysis"})
    plt.close(fig)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, help="Actual UTF-8 CSV")
    parser.add_argument("--group", help="Categorical group column")
    parser.add_argument("--value", help="Numeric measurement column")
    parser.add_argument("--output", type=Path, help="New output directory")
    parser.add_argument("--seed", type=int, help="Explicit bootstrap and plotting seed")
    parser.add_argument("--bootstrap-resamples", type=int, default=2000)
    parser.add_argument("--check-dependencies", action="store_true")
    args = parser.parse_args()
    try:
        if args.check_dependencies:
            matplotlib, _ = plotting_dependencies()
            print(json.dumps({"status": "ready", "python": sys.executable, "matplotlib": matplotlib.__version__}))
            return 0
        for name in ("input", "group", "value", "output", "seed"):
            if getattr(args, name) is None:
                parser.error(f"--{name} is required for an analysis run")
        if args.bootstrap_resamples < 100:
            raise ValueError("--bootstrap-resamples must be at least 100")
        if args.output.exists():
            raise ValueError(f"Output directory already exists: {args.output}")
        raw = args.input.read_bytes()
        observations = read_observations(raw, args.group, args.value)
        summaries = summarize(observations, args.seed, args.bootstrap_resamples)
        matplotlib, plt = plotting_dependencies()
        script = Path(__file__).read_bytes()
        metadata = {
            "status": "descriptive-analysis", "input": str(args.input.resolve()),
            "input_sha256": hashlib.sha256(raw).hexdigest(),
            "script_sha256": hashlib.sha256(script).hexdigest(),
            "parameters": {"group": args.group, "value": args.value, "seed": args.seed,
                           "bootstrap_resamples": args.bootstrap_resamples},
            "runtime": {"python": platform.python_version(), "matplotlib": matplotlib.__version__},
            "method": {"sd": "sample SD, ddof=1", "confidence_level": 0.95,
                       "ci": "within-group row bootstrap of the mean; percentile, linear interpolation",
                       "singleton": "SD and interval unavailable"},
            "scope": "Each row must be an independent sampling unit within its group. Repeated measures, "
                     "shared subjects and clusters require a design-specific analysis. No hypothesis tests "
                     "or causal conclusions are produced.",
            "summaries": summaries,
        }
        args.output.mkdir(parents=True, exist_ok=False)
        (args.output / "input.csv").write_bytes(raw)
        (args.output / "analyze_csv.py").write_bytes(script)
        write_csv(args.output / "summary.csv", ["group", "n", "mean", "sd", "ci95_low", "ci95_high"], summaries)
        write_csv(args.output / "observations.csv", ["source_row", "group", "value"],
                  ({"source_row": row, "group": group, "value": value} for row, group, value in observations))
        save_figure(plt, observations, summaries, args.output, args.seed, args.group, args.value)
        (args.output / "metadata.json").write_text(json.dumps(metadata, indent=2, allow_nan=False) + "\n", encoding="utf-8")
        print(json.dumps({"status": "completed", "output": str(args.output.resolve()), "groups": len(summaries),
                          "observations": len(observations)}))
        return 0
    except (OSError, UnicodeError, csv.Error, ValueError, OverflowError) as error:
        print(f"analysis failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    with tempfile.TemporaryDirectory(prefix="deepseek-science-plot-cache-") as cache:
        os.environ.setdefault("MPLCONFIGDIR", cache)
        raise SystemExit(main())
