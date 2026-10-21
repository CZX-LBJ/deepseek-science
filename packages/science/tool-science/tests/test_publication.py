"""Publication CLI behavior, with opt-in real TeX/Poppler integration checks.

Run: python -m unittest discover -s packages/science/tool-science/tests -p test_publication.py
Set DSH_PUBLICATION_TEX=1 to require the installed engines and matplotlib.
"""

import json
import importlib.util
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch


sys.dont_write_bytecode = True
SCRIPT = Path(__file__).resolve().parents[1] / "assets/recipes/deepseek-science-writing/scripts/publication.py"


class PublicationFixture(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="science-publication-test-")
        self.addCleanup(self.temp.cleanup)
        self.project = Path(self.temp.name) / "paper with spaces"

    def run_cli(self, *args):
        return subprocess.run([sys.executable, str(SCRIPT), *map(str, args)],
                              capture_output=True, text=True, encoding="utf-8", timeout=180)

    def initialize(self, *args):
        result = self.run_cli("init", self.project, "--title", "Measured & reproducible", *args)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        return json.loads(result.stdout)

    def change_config(self, **values):
        path = self.project / "publication.json"
        config = json.loads(path.read_text(encoding="utf-8"))
        config.update(values)
        path.write_text(json.dumps(config), encoding="utf-8")


class PublicationCLI(PublicationFixture):
    def test_init_creates_editable_latex_bibliography_and_portable_cli(self):
        result = self.initialize("--language", "bilingual", "--template", "nature-inspired")
        self.assertEqual(result["status"], "initialized")
        source = (self.project / "main.tex").read_text(encoding="utf-8")
        self.assertIn("Measured \\& reproducible", source)
        self.assertIn("\\usepackage", source)
        self.assertIn("\\begin{equation}", source)
        for name in ("references.bib", "claims.csv", "publication.py", "plot_figure.py", "LICENSE", "publication.schema.json"):
            self.assertTrue((self.project / name).is_file(), name)

    def test_init_never_overwrites_a_project(self):
        self.initialize()
        before = (self.project / "main.tex").read_bytes()
        result = self.run_cli("init", self.project, "--title", "replacement")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual((self.project / "main.tex").read_bytes(), before)

    def test_copied_cli_initializes_a_second_portable_project(self):
        self.initialize()
        second = Path(self.temp.name) / "second"
        result = subprocess.run([sys.executable, str(self.project / "publication.py"), "init", str(second), "--title", "Portable"],
                                capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertTrue((second / "LICENSE").is_file())
        self.assertTrue((second / "publication.schema.json").is_file())

    def test_default_templates_use_full_width_title_two_columns_and_edge_floats(self):
        module = load_module()
        for template in ("neutral", "nature-inspired", "ieee"):
            source = module.manuscript("Title across columns", ["Author"], template, "en", True, 180, "windows")
            self.assertTrue("twocolumn" in source or "IEEEtran" in source)
            self.assertIn("\\maketitle", source)
            self.assertIn("\\begin{figure*}[!t]", source)
            self.assertIn("\\begin{table}[tb]", source)
            self.assertNotRegex(source, r"\\begin\{(?:figure|table)\*?\}\[[^\]]*[hH][^\]]*\]")

    @unittest.skipUnless(os.environ.get("DSH_PUBLICATION_TEX") == "1", "requires matplotlib layout fixture")
    def test_layout_demo_retains_multifigure_source_without_unknown_markers(self):
        self.initialize("--layout-demo", "--template", "nature-inspired", "--language", "bilingual")
        source = (self.project / "layout-body.tex").read_text(encoding="utf-8")
        self.assertGreater(len(source.split()), 4000)
        self.assertGreaterEqual(source.count("\\includegraphics"), 4)
        self.assertIn("\\begin{aligned}", source)
        self.assertIn("\\begin{figure*}[!t]", source)
        self.assertIn("\\begin{figure}[!b]", source)
        self.assertEqual(self.run_cli("check", self.project).returncode, 0)

    def test_authored_inline_or_unconstrained_floats_are_rejected(self):
        self.initialize()
        source = self.project / "main.tex"
        for environment, position in (("figure", "[h]"), ("table", "[H]"), ("figure*", "[!htbp]"), ("table*", "[b]"), ("figure", "")):
            source.write_text("\\documentclass[twocolumn]{article}\\begin{document}"
                              f"\\begin{{{environment}}}{position}Text.\\end{{{environment}}}\\end{{document}}", encoding="utf-8")
            result = self.run_cli("check", self.project)
            self.assertNotEqual(result.returncode, 0, environment + position)
            self.assertIn("float-placement", result.stdout)

    def test_scaffold_markers_fail_source_check(self):
        self.initialize()
        result = self.run_cli("check", self.project)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("CLAIM_UNKNOWN", result.stdout)
        self.assertIn("not-compiled", result.stdout)

    def test_aris_unfinished_markers_are_rejected_even_in_tex_comments(self):
        self.initialize()
        for marker in ("[VERIFY]", "TBD", "DATA_NEEDED"):
            (self.project / "main.tex").write_text("\\documentclass[twocolumn]{article}\n% " + marker + "\n\\begin{document}Text.\\end{document}\n", encoding="utf-8")
            result = self.run_cli("check", self.project)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn(marker, result.stdout)

    def test_missing_assets_and_undefined_keys_are_reported_together(self):
        self.initialize()
        source = self.project / "main.tex"
        source.write_text(source.read_text(encoding="utf-8").replace("\\end{document}",
            "\\includegraphics{figures/absent.pdf}\\cite{absent-key}\\ref{absent-label}\\end{document}"), encoding="utf-8")
        result = self.run_cli("check", self.project)
        self.assertNotEqual(result.returncode, 0)
        for expected in ("missing-asset", "undefined-citation", "undefined-reference"):
            self.assertIn(expected, result.stdout)

    def test_nested_input_is_checked(self):
        self.initialize()
        (self.project / "section.tex").write_text("Nested \\cite{nested-missing}", encoding="utf-8")
        path = self.project / "main.tex"
        path.write_text(path.read_text(encoding="utf-8").replace("\\end{document}",
            "\\input{section}\\end{document}"), encoding="utf-8")
        self.assertIn("nested-missing", self.run_cli("check", self.project).stdout)

    def test_generated_root_build_and_ignored_directories_cannot_supply_assets(self):
        self.initialize()
        for directory in ("build", "figures/__pycache__", ".git"):
            target = self.project / directory
            target.mkdir(parents=True, exist_ok=True)
            (target / "figure.pdf").write_bytes(b"%PDF-test-input")
            (target / "section.tex").write_text("Text.", encoding="utf-8")
            (target / "refs.bib").write_text("@misc{key,title={Title}}", encoding="utf-8")
            (self.project / "main.tex").write_text(
                "\\documentclass{article}\\begin{document}"
                f"\\includegraphics{{{directory}/figure.pdf}}\\input{{{directory}/section}}"
                f"\\bibliography{{{directory}/refs}}\\end{{document}}", encoding="utf-8")
            result = self.run_cli("check", self.project)
            self.assertNotEqual(result.returncode, 0, directory)
            self.assertIn("generated-input-path", result.stdout)

    def test_nested_build_directories_are_hashed_as_source_inputs(self):
        self.initialize()
        target = self.project / "figures/build"
        target.mkdir(parents=True)
        figure = target / "measured.pdf"
        figure.write_bytes(b"%PDF-input-A")
        module = load_module()
        before = module.inventory(self.project)
        self.assertIn("figures/build/measured.pdf", before)
        figure.write_bytes(b"%PDF-input-B")
        self.assertNotEqual(module.inventory(self.project), before)

    def test_relative_and_absolute_escape_are_rejected(self):
        self.initialize()
        for main in ("../outside.tex", str(Path(self.temp.name) / "outside.tex")):
            self.change_config(main=main)
            result = self.run_cli("compile", self.project)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("project-relative", result.stdout)

    def test_configuration_rejects_unknown_fields_and_unbounded_timeout(self):
        self.initialize()
        for value in (0, 301, True):
            self.change_config(timeout_seconds=value)
            result = self.run_cli("check", self.project)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("timeout_seconds", result.stdout)
        self.change_config(timeout_seconds=60, unexpected=True)
        self.assertIn("unknown", self.run_cli("check", self.project).stdout)

    def test_dynamic_asset_paths_fail_instead_of_bypassing_checks(self):
        self.initialize()
        path = self.project / "main.tex"
        path.write_text(path.read_text(encoding="utf-8").replace("\\end{document}",
            "\\input{\\dynamicpath}\\end{document}"), encoding="utf-8")
        self.assertIn("literal", self.run_cli("check", self.project).stdout)

    def test_unsupported_engine_never_falls_back(self):
        self.initialize()
        self.change_config(engine="fake-pdf")
        result = self.run_cli("compile", self.project)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("engine", result.stdout)
        self.assertFalse(any(self.project.rglob("*.pdf")))

    def test_cjk_requires_xelatex(self):
        self.initialize("--language", "zh")
        self.change_config(engine="pdflatex")
        result = self.run_cli("check", self.project)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("XeLaTeX", result.stdout)

    def test_missing_engine_is_needs_setup_and_never_produces_pdf(self):
        self.initialize()
        (self.project / "main.tex").write_text("\\documentclass{article}\\begin{document}Text.\\end{document}\n", encoding="utf-8")
        module = load_module()
        with patch.object(module.shutil, "which", return_value=None):
            report, code = module.compile_project(self.project, module.load_config(self.project))
        self.assertNotEqual(code, 0)
        self.assertEqual(report["status"], "needs-setup")
        self.assertIsNone(report["pdf"])

    def test_process_timeout_is_reported_and_child_is_reaped(self):
        module = load_module()
        result = module.run_command([sys.executable, "-c", "import time; time.sleep(30)"],
                                    Path(self.temp.name), 1, Path(self.temp.name) / "timeout.txt")
        self.assertTrue(result["timed_out"])
        self.assertNotEqual(result["exit_code"], 0)
        self.assertLess(result["seconds"], 8)

    def test_subprocess_environment_removes_credentials(self):
        module = load_module()
        with patch.dict(os.environ, {"PUBLICATION_TEST_SECRET": "DO_NOT_PASS_SENTINEL"}):
            result = module.run_command([sys.executable, "-c", "import os; print(os.environ.get('PUBLICATION_TEST_SECRET', 'scrubbed'))"],
                                        Path(self.temp.name), 5, Path(self.temp.name) / "environment.txt")
        self.assertEqual(result["exit_code"], 0)
        self.assertIn("scrubbed", result["output"])
        self.assertNotIn("DO_NOT_PASS_SENTINEL", result["output"])

    def test_process_output_is_bounded_and_reported_even_on_zero_exit(self):
        module = load_module()
        log = Path(self.temp.name) / "large-output.txt"
        result = module.run_command([sys.executable, "-c", "import sys; sys.stdout.write('x' * 10000000)"],
                                    Path(self.temp.name), 5, log)
        self.assertTrue(result.get("output_limit_exceeded", False))
        self.assertLessEqual(log.stat().st_size, 8 * 1024 * 1024)
        self.assertLessEqual(len(result["output"]), 1024 * 1024)

    def test_symlink_source_cannot_escape_project(self):
        self.initialize()
        outside = Path(self.temp.name) / "outside.tex"
        outside.write_text("private text", encoding="utf-8")
        try:
            (self.project / "linked.tex").symlink_to(outside)
        except OSError:
            self.skipTest("OS does not allow test symlink creation")
        self.change_config(main="linked.tex")
        result = self.run_cli("compile", self.project)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Symlink", result.stdout)


def load_module():
    spec = importlib.util.spec_from_file_location("science_publication", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@unittest.skipUnless(os.environ.get("DSH_PUBLICATION_TEX") == "1", "requires explicit real-TeX integration run")
class RealPublication(PublicationFixture):
    @unittest.skipUnless(os.name == "nt", "Windows inherited sandbox ACL regression")
    def test_build_and_render_preserve_inherited_windows_acl(self):
        import ctypes
        from ctypes import wintypes

        def inherits_parent(path):
            needed = wintypes.DWORD()
            security = ctypes.WinDLL("advapi32", use_last_error=True)
            security.GetFileSecurityW(str(path), 4, None, 0, ctypes.byref(needed))
            descriptor = ctypes.create_string_buffer(needed.value)
            self.assertTrue(security.GetFileSecurityW(str(path), 4, descriptor, needed, ctypes.byref(needed)))
            control, revision = wintypes.WORD(), wintypes.DWORD()
            self.assertTrue(security.GetSecurityDescriptorControl(descriptor, ctypes.byref(control), ctypes.byref(revision)))
            self.assertFalse(control.value & 0x1000, f"Directory replaced inherited sandbox ACL: {path}")

        self.initialize("--demo")
        compiled = self.run_cli("compile", self.project)
        self.assertEqual(compiled.returncode, 0, compiled.stdout)
        inherits_parent(Path(json.loads(compiled.stdout)["pdf"]).parent)
        rendered = self.run_cli("render", self.project)
        self.assertEqual(rendered.returncode, 0, rendered.stdout)
        inherits_parent(Path(json.loads(rendered.stdout)["pages"][0]).parent)

    def test_actual_long_illustrated_two_column_layout(self):
        for template, language in (("neutral", "en"), ("nature-inspired", "bilingual")):
            self.project = Path(self.temp.name) / template
            self.initialize("--layout-demo", "--template", template, "--language", language)
            result = self.run_cli("compile", self.project)
            self.assertEqual(result.returncode, 0, result.stdout)
            report = json.loads(result.stdout)
            self.assertGreaterEqual(report["pdf_inspection"]["page_count"], 5)
            self.assertEqual(report["pdf_inspection"]["font_embedding"], "all-embedded")
            self.assertFalse(any("Overfull" in line for line in report["layout_warnings"]))
            render = self.run_cli("render", self.project)
            self.assertEqual(render.returncode, 0, render.stdout)
            self.assertEqual(len(json.loads(render.stdout)["pages"]), report["pdf_inspection"]["page_count"])

    def test_real_csv_plot_uses_publication_labels_without_demo_heading(self):
        self.initialize()
        data = self.project / "measured.csv"
        data.write_text("group,value\nA,1\nA,3\nB,2\nB,4\n", encoding="utf-8")
        result = subprocess.run([sys.executable, str(self.project / "plot_figure.py"), "--input", str(data),
                                 "--output", str(self.project / "figures"), "--xlabel", "Treatment", "--ylabel", "Voltage (mV)"],
                                capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stderr)
        svg = (self.project / "figures/demonstration.svg").read_text(encoding="utf-8")
        self.assertIn("Treatment", svg)
        self.assertIn("Voltage (mV)", svg)
        self.assertNotIn("Invented data", svg)
        self.assertNotIn("Demonstration group", svg)

    def test_actual_overfull_mathematics_blocks_completion(self):
        self.initialize("--demo")
        source = self.project / "main.tex"
        source.write_text(source.read_text(encoding="utf-8").replace("\\end{document}",
            "\\[\\underbrace{a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a}_{\\text{deliberately too wide}}\\]\\end{document}"), encoding="utf-8")
        result = self.run_cli("compile", self.project)
        self.assertNotEqual(result.returncode, 0)
        report = json.loads(result.stdout)
        self.assertEqual(report["status"], "compile-failed")
        self.assertTrue(any("Overfull" in warning for warning in report["layout_warnings"]))
        self.assertIsNone(report["pdf"])

    def test_actual_nested_build_asset_mutation_invalidates_compiled_report(self):
        self.initialize("--demo")
        nested = self.project / "figures/build"
        nested.mkdir()
        figure = nested / "measured.pdf"
        (self.project / "figures/demonstration.pdf").rename(figure)
        source = self.project / "main.tex"
        source.write_text(source.read_text(encoding="utf-8").replace("figures/demonstration.pdf", "figures/build/measured.pdf"), encoding="utf-8")
        compiled = self.run_cli("compile", self.project)
        self.assertEqual(compiled.returncode, 0, compiled.stdout)
        self.assertIn("figures/build/measured.pdf", json.loads(compiled.stdout)["inputs"])
        self.assertEqual(self.run_cli("check", self.project, "--require-compiled").returncode, 0)
        figure.write_bytes(figure.read_bytes() + b"\n% edited vector source\n")
        checked = self.run_cli("check", self.project, "--require-compiled")
        self.assertNotEqual(checked.returncode, 0)
        self.assertIn("stale-build", checked.stdout)

    def test_actual_compile_bibtex_vector_figures_and_render(self):
        self.initialize("--demo")
        result = self.run_cli("compile", self.project)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        report = json.loads(result.stdout)
        self.assertEqual(report["status"], "compiled")
        self.assertTrue(Path(report["pdf"]).read_bytes().startswith(b"%PDF-"))
        self.assertTrue((self.project / "figures/demonstration.svg").is_file())
        self.assertTrue(any("bibtex" in step["argv"][0].lower() for step in report["commands"]))
        self.assertEqual(self.run_cli("check", self.project, "--require-compiled").returncode, 0)
        rendered = self.run_cli("render", self.project)
        self.assertEqual(rendered.returncode, 0, rendered.stdout)
        self.assertTrue(json.loads(rendered.stdout)["pages"])
        source = self.project / "main.tex"
        source.write_text(source.read_text(encoding="utf-8") + "% changed\n", encoding="utf-8")
        self.assertIn("stale-build", self.run_cli("check", self.project, "--require-compiled").stdout)

    def test_actual_cjk_compile(self):
        self.initialize("--demo", "--language", "bilingual", "--template", "nature-inspired")
        result = self.run_cli("compile", self.project)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(json.loads(result.stdout)["engine"], "xelatex")

    def test_actual_ieee_compile(self):
        self.initialize("--demo", "--template", "ieee", "--figure-width-mm", "180")
        result = self.run_cli("compile", self.project)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_actual_tex_error_has_no_successful_pdf(self):
        self.initialize("--demo")
        initial = self.run_cli("compile", self.project)
        self.assertEqual(initial.returncode, 0, initial.stdout)
        source = self.project / "main.tex"
        source.write_text(source.read_text(encoding="utf-8").replace("\\end{document}",
            "\\undefinedPublicationCommand\\end{document}"), encoding="utf-8")
        result = self.run_cli("compile", self.project)
        self.assertNotEqual(result.returncode, 0)
        report = json.loads(result.stdout)
        self.assertEqual(report["status"], "compile-failed")
        self.assertIsNone(report["pdf"])
        self.assertNotEqual(self.run_cli("check", self.project, "--require-compiled").returncode, 0)


if __name__ == "__main__":
    unittest.main()
