#!/usr/bin/env python3
"""Generate deterministic, explicitly synthetic vector assets for the layout fixture."""

from __future__ import annotations

import argparse
import csv
import math
import os
from pathlib import Path
import tempfile


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--font-family", choices=("serif", "sans"), default="serif")
    args = parser.parse_args()
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.patches import FancyArrowPatch, FancyBboxPatch
    plt.rcParams.update({"font.family": "DejaVu Serif" if args.font_family == "serif" else "DejaVu Sans", "mathtext.fontset": "stix", "font.size": 8, "axes.labelsize": 8,
                         "axes.spines.top": False, "axes.spines.right": False, "axes.linewidth": 0.6,
                         "lines.linewidth": 0.9, "pdf.fonttype": 42, "svg.fonttype": "none",
                         "svg.hashsalt": "science-layout-fixture"})
    args.output.mkdir(parents=True, exist_ok=True)

    def save(fig, name):
        for extension in ("pdf", "svg"):
            path = args.output / f"{name}.{extension}"
            if path.exists():
                raise ValueError(f"Refusing to overwrite layout figure: {path}")
        fig.savefig(args.output / f"{name}.pdf", metadata={"CreationDate": None, "ModDate": None})
        fig.savefig(args.output / f"{name}.svg", metadata={"Date": None})
        plt.close(fig)

    times = [index / 20 for index in range(101)]
    signal_a = [1 - math.exp(-value) for value in times]
    signal_b = [1 - math.exp(-value / 1.8) for value in times]
    with (args.output / "synthetic-curves.csv").open("w", encoding="utf-8", newline="") as output:
        writer = csv.writer(output)
        writer.writerow(("time_s", "response_a", "response_b"))
        writer.writerows(zip(times, signal_a, signal_b))

    fig, ax = plt.subplots(figsize=(84 / 25.4, 51 / 25.4), layout="constrained")
    ax.plot(times, signal_a, color="#0072B2", label="A: unit time constant")
    ax.plot(times, signal_b, "--", color="#D55E00", label="B: slower response")
    ax.set(xlabel="Time (s)", ylabel="Normalized response")
    ax.legend(frameon=False, fontsize=7, loc="lower right")
    ax.text(0.02, 0.98, "LAYOUT-A · synthetic curves", transform=ax.transAxes, va="top", fontsize=7)
    save(fig, "response")

    fig, ax = plt.subplots(figsize=(174 / 25.4, 43 / 25.4), layout="constrained")
    ax.set(xlim=(0, 10), ylim=(0, 2.4))
    ax.axis("off")
    labels = ("Question\nand estimand", "Independent\nunits", "Retained\nanalysis", "Vector plots\nand equations", "Checked\nLaTeX build")
    for index, label in enumerate(labels):
        x = index * 2.02
        ax.add_patch(FancyBboxPatch((x + 0.1, 0.62), 1.65, 1.0, boxstyle="round,pad=0.05", linewidth=0.7,
                                   edgecolor="#0072B2", facecolor="#EAF3F8"))
        ax.text(x + 0.925, 1.12, label, ha="center", va="center", fontsize=8)
        if index < 4:
            ax.add_patch(FancyArrowPatch((x + 1.8, 1.12), (x + 2.05, 1.12), arrowstyle="-|>", mutation_scale=10, linewidth=0.7))
    ax.text(0.1, 2.0, "LAYOUT-B · an illustrative workflow, not a validated research protocol", fontsize=8)
    save(fig, "workflow")

    fig, ax = plt.subplots(figsize=(84 / 25.4, 47 / 25.4), layout="constrained")
    residuals = [0.05 * math.sin(2 * value) for value in times]
    ax.axhline(0, color="#777777", linewidth=0.6)
    ax.plot(times, residuals, color="#009E73")
    ax.set(xlabel="Time (s)", ylabel="Illustrative residual")
    ax.text(0.02, 0.97, "LAYOUT-C · deterministic residual", transform=ax.transAxes, va="top", fontsize=7)
    save(fig, "residual")

    fig, axes = plt.subplots(1, 2, figsize=(174 / 25.4, 58 / 25.4), layout="constrained")
    for index, (ax, values) in enumerate(zip(axes, (signal_a, signal_b))):
        ax.plot(times, values, color=("#0072B2", "#D55E00")[index])
        ax.plot(times[::10], values[::10], linestyle="none", marker=("o", "^")[index], markersize=3,
                color=("#0072B2", "#D55E00")[index])
        ax.set(xlabel="Time (s)", ylabel="Normalized response", ylim=(-0.05, 1.08))
        ax.set_title(("a  LAYOUT-D1 · curve A", "b  LAYOUT-D2 · curve B")[index], loc="left", fontsize=8)
    save(fig, "comparison")

    fig, ax = plt.subplots(figsize=(84 / 25.4, 48 / 25.4), layout="constrained")
    counts = [5, 5, 5, 5]
    ax.bar(("Input", "Parsed", "Plotted", "Retained"), counts, color=("#0072B2", "#56B4E9", "#009E73", "#D55E00"), width=0.6)
    ax.set(ylabel="Illustrative row count", ylim=(0, 6.2))
    for position, count in enumerate(counts):
        ax.text(position, count + 0.12, str(count), ha="center", fontsize=8)
    ax.text(0.02, 0.98, "LAYOUT-E · fixture bookkeeping", transform=ax.transAxes, va="top", fontsize=7)
    save(fig, "retention")
    fig, axes = plt.subplots(1, 3, figsize=(174 / 25.4, 38 / 25.4), layout="constrained")
    for index, ax in enumerate(axes):
        ax.plot(times, signal_a, color="#0072B2")
        ax.plot(times, signal_b, "--", color="#D55E00")
        ax.set(xlabel="Time (s)", ylabel="Response", ylim=(-0.05, 1.1))
        ax.set_title(f"{chr(97 + index)}  LAYOUT-F{index + 1}", loc="left", fontsize=8)
    save(fig, "late-summary")
    return 0


if __name__ == "__main__":
    with tempfile.TemporaryDirectory(prefix="science-layout-matplotlib-") as cache:
        os.environ["MPLCONFIGDIR"] = cache
        raise SystemExit(main())
