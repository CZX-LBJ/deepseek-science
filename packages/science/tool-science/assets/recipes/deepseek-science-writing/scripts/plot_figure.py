#!/usr/bin/env python3
"""Plot independent numeric rows with explicit n, mean and sample SD; retain vectors."""

from __future__ import annotations

import argparse
import csv
import math
import os
from pathlib import Path
import statistics
import sys
import tempfile


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True, help="UTF-8 CSV with group,value columns")
    parser.add_argument("--output", type=Path, required=True, help="Existing output directory")
    parser.add_argument("--width-mm", type=int, choices=range(50, 191), default=90, metavar="50..190")
    parser.add_argument("--unit", default="mV")
    parser.add_argument("--xlabel", default="Group")
    parser.add_argument("--ylabel", help="Full y-axis label; otherwise Measurement (unit)")
    parser.add_argument("--title", help="Optional author-supplied figure heading; captions normally carry the description")
    parser.add_argument("--demo", action="store_true", help="Explicitly label invented demonstration data")
    parser.add_argument("--font-family", choices=("serif", "sans"), default="serif")
    args = parser.parse_args()
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        groups: dict[str, list[float]] = {}
        with args.input.open(encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle, strict=True)
            if reader.fieldnames != ["group", "value"]:
                raise ValueError("CSV must have exactly the headers group,value")
            for index, row in enumerate(reader, start=2):
                if set(row) != {"group", "value"} or not row["group"].strip():
                    raise ValueError(f"Invalid row {index}")
                value = float(row["value"])
                if not math.isfinite(value):
                    raise ValueError(f"Nonfinite value in row {index}")
                groups.setdefault(row["group"], []).append(value)
        if not groups or any(len(values) < 2 for values in groups.values()):
            raise ValueError("Sample SD needs at least two rows in each nonempty group")
        if len(groups) > 8:
            raise ValueError("Use a discipline-specific layout for more than eight groups")
        plt.rcParams.update({"font.family": "DejaVu Serif" if args.font_family == "serif" else "DejaVu Sans", "mathtext.fontset": "stix", "font.size": 8, "axes.labelsize": 8,
                             "axes.spines.top": False, "axes.spines.right": False,
                             "axes.linewidth": 0.6, "lines.linewidth": 0.8, "pdf.fonttype": 42,
                             "ps.fonttype": 42, "svg.fonttype": "none", "svg.hashsalt": "deepseek-science-publication"})
        palette = ("#0072B2", "#D55E00", "#009E73", "#CC79A7", "#E69F00", "#56B4E9", "#000000", "#777777")
        markers = ("o", "^", "v", "D", "P", "X", "<", ">")
        fig, ax = plt.subplots(figsize=(args.width_mm / 25.4, max(55, args.width_mm * 0.7) / 25.4), layout="constrained")
        for index, (group, values) in enumerate(sorted(groups.items())):
            offsets = [(position - (len(values) - 1) / 2) * min(0.045, 0.5 / len(values)) for position in range(len(values))]
            ax.scatter([index + offset for offset in offsets], values, color=palette[index],
                       marker=markers[index], s=18, linewidths=0.5, edgecolor="white", zorder=3)
            ax.errorbar(index, statistics.mean(values), yerr=statistics.stdev(values), fmt="s", markersize=4,
                        color="black", capsize=3, elinewidth=0.8, zorder=4)
        ax.set_xticks(range(len(groups)), [f"{name}\nn = {len(groups[name])}" for name in sorted(groups)])
        ax.set_xlabel("Demonstration group" if args.demo and args.xlabel == "Group" else args.xlabel)
        ax.set_ylabel(args.ylabel or f"Measurement ({args.unit})")
        heading = "Invented data; mean ± sample SD" if args.demo else args.title
        if heading:
            ax.text(0, 1.04, heading, transform=ax.transAxes, fontsize=8)
        ax.margins(x=0.25)
        args.output.mkdir(parents=True, exist_ok=True)
        for extension in ("pdf", "svg"):
            target = args.output / f"demonstration.{extension}"
            if target.exists():
                raise ValueError(f"Refusing to overwrite figure: {target}")
        fig.savefig(args.output / "demonstration.pdf", metadata={"CreationDate": None, "ModDate": None})
        fig.savefig(args.output / "demonstration.svg", metadata={"Date": None})
        plt.close(fig)
        return 0
    except (ImportError, OSError, ValueError, TypeError, csv.Error) as error:
        print(f"figure generation failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    with tempfile.TemporaryDirectory(prefix="science-publication-matplotlib-") as cache:
        os.environ["MPLCONFIGDIR"] = cache
        raise SystemExit(main())
