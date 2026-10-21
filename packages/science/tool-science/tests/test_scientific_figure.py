"""CSV integrity, explicit statistics, and real-renderer figure regression checks.

Run with the bundled Python: python -m unittest discover -s
packages/science/tool-science/tests -p test_scientific_figure.py
"""

import csv
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import unittest


sys.dont_write_bytecode = True
SCRIPT = Path(__file__).resolve().parents[1] / "assets/recipes/deepseek-science-writing/scripts/scientific_figure.py"
LOADER = importlib.util.spec_from_file_location("scientific_figure", SCRIPT)
FIGURE = importlib.util.module_from_spec(LOADER)
LOADER.loader.exec_module(FIGURE)


class FigureTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="science-figure-test-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def csv(self, name, headers, rows):
        path = self.root / name
        with path.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.writer(handle)
            writer.writerow(headers)
            writer.writerows(rows)
        return path

    def panel(self, kind="line", **kwargs):
        return {"type": kind, "data": "values.csv", "title": "Response", "evidence_role": "comparison",
                "xlabel": "Time (s)", "ylabel": "Response (mV)", "n_definition": "Independent samples per group/time",
                **kwargs}

    def spec(self, panels, **kwargs):
        value = {"schema_version": 1, "data_status": "demonstration", "question": "How do the illustrative measurements vary?",
                 "claim": "These invented values exercise rendering only", "width_mm": 180, "height_mm": 140,
                 "font_size_pt": 7, "panels": panels, **kwargs}
        path = self.root / "figure.json"
        path.write_text(json.dumps(value), encoding="utf-8")
        return path

    def cli(self, spec, name="figure"):
        return subprocess.run([sys.executable, "-B", str(SCRIPT), "--spec", str(spec), "--output", str(self.root / "out"), "--name", name],
                              capture_output=True, text=True, encoding="utf-8", timeout=90)

    def test_raw_sd_uses_all_samples_and_sample_denominator(self):
        path = self.csv("values.csv", ["time", "response", "subject", "unplotted"],
                        [(0, 1, "a", "keep"), (0, 3, "b", "keep"), (1, 5, "a", "keep"), (1, 9, "b", "keep")])
        panel = self.panel(x="time", y="response", mode="raw", center="mean", unit_id="subject", uncertainty={"kind": "sd"})
        raw, record = FIGURE.prepare_panel(panel, path)
        first, second = record["series"][0]["points"]
        self.assertEqual(first["center"], 2)
        self.assertAlmostEqual(first["upper"] - 2, math.sqrt(2))
        self.assertEqual(second["center"], 7)
        self.assertEqual([p["n"] for p in (first, second)], [2, 2])
        self.assertEqual(len(record["observation_values"]), 4)
        self.assertEqual(record["columns_unused"], ["unplotted"])
        self.assertEqual(raw, path.read_bytes())

    def test_normal_ci_requires_method_and_records_confidence(self):
        with self.assertRaisesRegex(ValueError, "explicit method"):
            FIGURE.uncertainty_rule({"uncertainty": {"kind": "ci", "confidence": 0.95}})
        mean, low, high = FIGURE.summarize([1, 3], {"kind": "ci", "confidence": 0.95, "method": "normal"})
        self.assertAlmostEqual(mean, 2)
        self.assertAlmostEqual(low, 2 - 1.959963984540054)
        self.assertAlmostEqual(high, 2 + 1.959963984540054)

    def test_summary_ci_preserves_asymmetric_bounds_without_recalculating(self):
        path = self.csv("values.csv", ["x", "mean", "lo", "hi", "count"], [(0, 10, 8, 15, 20), (1, 15, 14, 20, 20)])
        panel = self.panel(x="x", y="mean", mode="summary", center="mean", n="count",
                           uncertainty={"kind": "ci", "lower": "lo", "upper": "hi", "confidence": 0.95, "method": "author-supplied bootstrap"})
        record = FIGURE.prepare_panel(panel, path)[1]
        self.assertEqual(record["series"][0]["points"][0], {"x": 0.0, "center": 10.0, "lower": 8.0, "upper": 15.0, "n": 20})
        self.assertIn("author-supplied", record["uncertainty"]["method"])

    def test_duplicate_unit_and_nonfinite_measurements_fail_instead_of_filtering(self):
        panel = self.panel(x="x", y="y", mode="raw", center="mean", unit_id="id", uncertainty={"kind": "none"})
        path = self.csv("values.csv", ["x", "y", "id"], [(0, 1, "a"), (0, 2, "a"), (1, 3, "b")])
        with self.assertRaisesRegex(ValueError, "Duplicate unit_id"):
            FIGURE.prepare_panel(panel, path)
        path = self.csv("values.csv", ["x", "y", "id"], [(0, 1, "a"), (1, "nan", "b")])
        with self.assertRaisesRegex(ValueError, "finite"):
            FIGURE.prepare_panel(panel, path)

    def test_paired_distribution_requires_complete_unique_ids(self):
        panel = self.panel("distribution", group="condition", y="value", center="mean", uncertainty={"kind": "none"}, paired_by="subject")
        path = self.csv("values.csv", ["condition", "value", "subject"], [("A", 1, "p"), ("B", 2, "p"), ("A", 3, "q")])
        with self.assertRaisesRegex(ValueError, "complete pairs"):
            FIGURE.prepare_panel(panel, path)
        path = self.csv("values.csv", ["condition", "value", "subject"], [("A", 1, "p"), ("B", 2, "p"), ("A", 3, "p")])
        with self.assertRaisesRegex(ValueError, "exactly one observation"):
            FIGURE.prepare_panel(panel, path)

    def test_heatmap_rejects_invented_missing_or_aggregated_cells(self):
        panel = self.panel("heatmap", x="column", y="row", value="value", colorbar_label="Signal")
        path = self.csv("values.csv", ["column", "row", "value"], [("x", "a", 1), ("y", "a", 2), ("x", "b", 3)])
        with self.assertRaisesRegex(ValueError, "every cell"):
            FIGURE.prepare_panel(panel, path)
        path = self.csv("values.csv", ["column", "row", "value"], [("x", "a", 1), ("x", "a", 2)])
        with self.assertRaisesRegex(ValueError, "duplicate cells"):
            FIGURE.prepare_panel(panel, path)

    def test_unsupported_statistics_and_small_font_fail_loud(self):
        panel = self.panel("scatter", x="x", y="y", significance="auto")
        path = self.spec([panel])
        with self.assertRaisesRegex(ValueError, "Unknown panel"):
            FIGURE.validate_spec(json.loads(path.read_text()))
        path = self.spec([self.panel("scatter", x="x", y="y")], font_size_pt=4)
        with self.assertRaisesRegex(ValueError, "font_size_pt"):
            FIGURE.validate_spec(json.loads(path.read_text()))

    def test_real_four_panel_exports_are_editable_retained_and_physically_sized(self):
        self.csv("line.csv", ["time", "value", "method", "id"],
                 [(t, 1 + t + g * 0.5 + r * 0.2, name, f"s{r}") for name, g in (("A", 0), ("B", 1)) for t in (0, 1, 2) for r in (0, 1, 2)])
        self.csv("scatter.csv", ["x", "y", "method"], [(i, i * 0.5 + g, name) for name, g in (("A", 0), ("B", 1)) for i in (1, 2, 3, 4)])
        self.csv("distribution.csv", ["condition", "value", "subject"], [(name, 1 + g + r * 0.15, f"p{r}") for name, g in (("A", 0), ("B", 1)) for r in range(5)])
        self.csv("heat.csv", ["x", "y", "value"], [(x, y, 1 + i + j) for i, x in enumerate(("X", "Y", "Z")) for j, y in enumerate(("I", "II", "III"))])
        panels = [self.panel(data="line.csv", title="Response over time", x="time", y="value", group="method", unit_id="id", mode="raw", center="mean", uncertainty={"kind": "sd"}),
                  self.panel("scatter", data="scatter.csv", title="Individual observations", x="x", y="y", group="method"),
                  self.panel("distribution", data="distribution.csv", title="Paired observations", group="condition", y="value", center="mean", uncertainty={"kind": "sd"}, paired_by="subject"),
                  self.panel("heatmap", data="heat.csv", title="Response map", x="x", y="y", value="value", colorbar_label="Signal", xlabel="Setting", ylabel="Region")]
        result = self.cli(self.spec(panels))
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        output = self.root / "out"
        report = json.loads((output / "figure.report.json").read_text(encoding="utf-8"))
        self.assertEqual(report["status"], "review_required")
        self.assertEqual(report["geometry_before_export"]["failures"], [])
        self.assertEqual(report["geometry_after_export"]["failures"], [])
        self.assertEqual(report["font"]["minimum_artist_size_pt"], 7)
        for entry in report["inputs"]:
            retained = output / "figure.source" / entry["retained_file"]
            self.assertEqual(hashlib.sha256(retained.read_bytes()).hexdigest(), entry["sha256"])
            self.assertEqual(entry["rows_read"], entry["rows_used"])
        self.assertIn("<text", (output / "figure.svg").read_text(encoding="utf-8"))
        self.assertIn(b"/FontFile2", (output / "figure.pdf").read_bytes())
        png = (output / "figure.png").read_bytes()
        self.assertEqual(struct.unpack(">II", png[16:24]), tuple(report["dimensions"]["png_pixels"]))
        replay = json.loads((output / "figure.source" / "replay.json").read_text(encoding="utf-8"))
        self.assertEqual(replay["panels"][0]["data"], "panel-a.csv")
        self.assertEqual(len(report["numeric_artists"]["sha256"]), 64)
        for key in "abcd":
            self.assertIn(key, report["geometry_after_export"]["plot_areas_pt"])
        again = self.cli(self.root / "figure.json")
        self.assertNotEqual(again.returncode, 0)
        self.assertIn("overwrite", again.stderr)

    def test_long_labels_cannot_obtain_fake_geometry_pass(self):
        self.csv("values.csv", ["x", "y"], [(0, 1), (1, 2), (2, 1)])
        panel = self.panel("scatter", x="x", y="y", title="An unreasonably long label " * 12)
        result = self.cli(self.spec([panel], width_mm=70, height_mm=60))
        self.assertNotEqual(result.returncode, 0)
        report = json.loads((self.root / "out/figure.report.json").read_text(encoding="utf-8"))
        self.assertEqual(report["status"], "failed")
        self.assertTrue(report["geometry_before_export"]["failures"])
        self.assertFalse((self.root / "out/figure.pdf").exists())

    def test_limits_cannot_conceal_observations(self):
        self.csv("values.csv", ["x", "y"], [(0, 1), (1, 50), (2, 1)])
        panel = self.panel("scatter", x="x", y="y", ylim=[0, 5])
        result = self.cli(self.spec([panel]))
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("hide observations", result.stderr)

    def test_numeric_artist_fingerprint_changes_with_retained_observations(self):
        self.csv("values.csv", ["x", "y"], [(0, 1), (1, 2), (2, 3)])
        path = self.spec([self.panel("scatter", x="x", y="y")], height_mm=90)
        first = self.cli(path, "before")
        self.assertEqual(first.returncode, 0, first.stderr + first.stdout)
        a = json.loads((self.root / "out/before.report.json").read_text(encoding="utf-8"))
        self.csv("values.csv", ["x", "y"], [(0, 1), (1, 2.5), (2, 3)])
        second = self.cli(path, "after")
        self.assertEqual(second.returncode, 0, second.stderr + second.stdout)
        b = json.loads((self.root / "out/after.report.json").read_text(encoding="utf-8"))
        self.assertNotEqual(a["numeric_artists"]["sha256"], b["numeric_artists"]["sha256"])
        self.assertNotEqual(a["inputs"][0]["sha256"], b["inputs"][0]["sha256"])
        self.assertEqual(b["numeric_artists"]["panels"][0]["collections"][0]["offsets"], [[0, 1], [1, 2.5], [2, 3]])

    def test_paired_line_artist_follows_ids_when_csv_order_changes(self):
        self.csv("values.csv", ["condition", "value", "subject"], [("A", 1, "p"), ("A", 2, "q"), ("B", 5, "q"), ("B", 3, "p")])
        panel = self.panel("distribution", group="condition", y="value", paired_by="subject", center="mean", uncertainty={"kind": "none"})
        result = self.cli(self.spec([panel], height_mm=90))
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        record = json.loads((self.root / "out/figure.report.json").read_text(encoding="utf-8"))
        lines = record["numeric_artists"]["panels"][0]["lines"]
        self.assertEqual([point[1] for point in lines[0]], [1, 3])
        self.assertEqual([point[1] for point in lines[1]], [2, 5])
        # Errorbar collections sit between the two scatter collections; locate by offsets.
        dot_sets = [c["offsets"] for c in record["numeric_artists"]["panels"][0]["collections"] if len(c["offsets"]) == 2]
        self.assertEqual(sorted(y for x, y in dot_sets[0]), [1, 2])
        self.assertEqual(sorted(y for x, y in dot_sets[1]), [3, 5])

    def test_hero_layout_aligns_unequal_spans_using_actual_plot_areas(self):
        self.csv("values.csv", ["x", "y"], [(0, 1), (1, 3), (2, 2)])
        panels = [self.panel("scatter", x="x", y="y", title=title) for title in ("Primary observations", "Validation", "Boundary")]
        for layout in ("hero-left", "hero-right"):
            result = self.cli(self.spec(panels, layout=layout, height_mm=150), layout)
            self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
            record = json.loads((self.root / f"out/{layout}.report.json").read_text(encoding="utf-8"))
            a, b, c = [record["geometry_before_export"]["plot_areas_pt"][label] for label in "abc"]
            self.assertAlmostEqual(a[3], b[3], places=3)
            self.assertAlmostEqual(a[1], c[1], places=3)
            self.assertAlmostEqual(b[0], c[0], places=3)
            self.assertGreater(a[3] - a[1], 2 * (b[3] - b[1]))
            manifest = json.loads((self.root / f"out/{layout}.alignment-layout.json").read_text())
            self.assertEqual(manifest["panels"][0]["row_stop"], 2)

    def test_cache_can_be_written_and_is_removed_after_use(self):
        with FIGURE.matplotlib_cache() as cache:
            self.assertTrue(cache.is_dir())
            (cache / "font-test").write_text("writable", encoding="utf-8")
        self.assertFalse(cache.exists())


if __name__ == "__main__":
    unittest.main()
