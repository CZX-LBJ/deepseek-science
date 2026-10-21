#!/usr/bin/env python3
"""Maintain editable LaTeX projects; compile with real TeX and inspect actual artifacts.

This is a build helper for trusted manuscript sources, not an OS sandbox. No shell,
shell escape, automatic package installation, or substitute PDF generator is used.
"""

from __future__ import annotations

import argparse
from contextlib import contextmanager
from datetime import date
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import signal
import stat
import subprocess
import sys
import tempfile
import threading
import time
import uuid
from typing import Any


SCHEMA_VERSION = 1
MAX_FILE_BYTES = 16 * 1024 * 1024
MAX_PROJECT_BYTES = 128 * 1024 * 1024
MAX_FILES = 512
MAX_OUTPUT_BYTES = 1024 * 1024
MAX_LOG_BYTES = 8 * 1024 * 1024
CONFIG_FIELDS = {"schema_version", "main", "template", "language", "engine", "cjk_fontset", "timeout_seconds", "max_passes", "figure_width_mm"}
TEMPLATES = ("neutral", "nature-inspired", "ieee")
LANGUAGES = ("en", "zh", "bilingual")
ASSET_COMMAND = re.compile(r"\\(input|include|includegraphics|bibliography|addbibresource)\*?(?:\s*\[[^\]]*\])*\s*\{([^{}]*)\}")
CITATION = re.compile(r"\\(?:cite[a-zA-Z]*|nocite)\*?(?:\s*\[[^\]]*\])*\s*\{([^{}]+)\}")
REFERENCE = re.compile(r"\\(?:ref|eqref|autoref|[cC]ref|pageref)\*?\s*\{([^{}]+)\}")
LABEL = re.compile(r"\\label\s*\{([^{}]+)\}")
MARKERS = re.compile(r"(?:CLAIM|CITATION|AUTHOR|DATA)[\\_]*UNKNOWN|TODO\s*:|\[VERIFY(?:\]|:)|\bTBD\b|\bDATA_NEEDED\b")


class PublicationError(ValueError):
    """A setup, input, or artifact failure that must be visible to the caller."""


def create_work_directory(parent: Path, prefix: str) -> Path:
    """Create an exclusive child, preserving the Windows parent's sandbox ACL.

    Python's Windows mkdir(0700), used by mkdtemp, replaces inherited capability
    entries with a protected owner/admin ACL. Default mkdir inherits the existing
    parent permissions; it neither changes existing ACLs nor relaxes confinement.
    POSIX keeps mkdtemp's private mode. Parents must already be trusted directories.
    """
    if os.name != "nt":
        return Path(tempfile.mkdtemp(prefix=prefix, dir=parent))
    for _ in range(16):
        candidate = parent / (prefix + uuid.uuid4().hex)
        try:
            candidate.mkdir()
            return candidate
        except FileExistsError:
            continue
    raise PublicationError("Could not allocate an exclusive work directory")


@contextmanager
def temporary_work_directory(parent: Path, prefix: str):
    """Clean up only the exclusive directory created for this helper operation."""
    directory = create_work_directory(parent, prefix)
    try:
        yield directory
    finally:
        shutil.rmtree(directory)


def safe_path(root: Path, relative: str, *, must_exist: bool = False) -> Path:
    """Resolve a literal project-relative path, refusing escape and symlink traversal."""
    normalized = relative.replace("\\", "/")
    parts = PurePosixPath(normalized).parts
    if (not relative or normalized.startswith(("/", "~")) or re.search(r"[:|\x00-\x1f]", normalized)
            or ".." in parts or not parts or any(part.startswith("-") for part in parts)):
        raise PublicationError(f"Expected a literal project-relative path: {relative!r}")
    candidate = root.joinpath(*parts)
    current = root
    for part in parts:
        current /= part
        attributes = current.lstat().st_file_attributes if current.exists() and os.name == "nt" else 0
        if current.is_symlink() or attributes & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0):
            raise PublicationError(f"Symlink/junction project path is unsupported: {relative}")
    if not candidate.resolve().is_relative_to(root.resolve()):
        raise PublicationError(f"Expected a project-relative path: {relative!r}")
    if must_exist and not candidate.is_file():
        raise PublicationError(f"Missing project file: {relative}")
    return candidate


def source_path(root: Path, relative: str, *, must_exist: bool = False) -> Path:
    """Keep manuscript inputs outside directories excluded from source hashing."""
    candidate = safe_path(root, relative, must_exist=must_exist)
    parts = candidate.relative_to(root).parts
    names = tuple(part.casefold() if os.name == "nt" else part for part in parts)
    if names[0] == "build" or any(name in ("__pycache__", ".git") for name in names):
        raise PublicationError(f"Generated or ignored directory cannot supply manuscript input: {relative}")
    return candidate


def read_text(path: Path) -> str:
    if path.stat().st_size > MAX_FILE_BYTES:
        raise PublicationError(f"Source exceeds {MAX_FILE_BYTES} bytes: {path.name}")
    return path.read_text(encoding="utf-8-sig")


def write_json(path: Path, value: dict[str, Any]) -> None:
    """Atomically replace a UTF-8 report in its already validated parent directory."""
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent,
                                     prefix=".publication-", suffix=".json", delete=False) as handle:
        temporary = Path(handle.name)
        json.dump(value, handle, ensure_ascii=False, indent=2, allow_nan=False)
        handle.write("\n")
    try:
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def load_config(root: Path) -> dict[str, Any]:
    config = json.loads(read_text(safe_path(root, "publication.json", must_exist=True)))
    if not isinstance(config, dict) or set(config) != CONFIG_FIELDS:
        raise PublicationError("publication.json has missing or unknown fields; see the versioned schema")
    if type(config["schema_version"]) is not int or config["schema_version"] != SCHEMA_VERSION:
        raise PublicationError("Unsupported publication schema_version")
    for key, choices in (("template", TEMPLATES), ("language", LANGUAGES), ("engine", ("auto", "pdflatex", "xelatex")), ("cjk_fontset", ("fandol", "windows"))):
        if not isinstance(config[key], str) or config[key] not in choices:
            raise PublicationError(f"Invalid {key}; expected one of {', '.join(choices)}")
    for key, lower, upper in (("timeout_seconds", 5, 300), ("max_passes", 3, 6), ("figure_width_mm", 50, 190)):
        if type(config[key]) is not int or not lower <= config[key] <= upper:
            raise PublicationError(f"{key} must be an integer in [{lower}, {upper}]")
    if not isinstance(config["main"], str) or not config["main"].endswith(".tex"):
        raise PublicationError("main must name a project-relative .tex file")
    source_path(root, config["main"], must_exist=True)
    if config["language"] != "en" and config["engine"] == "pdflatex":
        raise PublicationError("Chinese and bilingual manuscripts require XeLaTeX (engine xelatex or auto)")
    return config


def uncomment(text: str) -> str:
    return re.sub(r"(?<!\\)%[^\n]*", "", text)


def source_check(root: Path, config: dict[str, Any]) -> dict[str, Any]:
    """Inspect literal TeX includes, citation keys, labels, assets and visible gaps."""
    issues: list[dict[str, str]] = []
    sources: dict[str, str] = {}
    bibliographies: set[Path] = set()
    pending = [config["main"]]

    def issue(code: str, detail: str) -> None:
        issues.append({"code": code, "detail": detail})

    while pending:
        relative = pending.pop()
        if relative in sources:
            continue
        if len(sources) >= MAX_FILES:
            raise PublicationError("Too many included TeX files")
        raw_source = read_text(source_path(root, relative, must_exist=True))
        source = uncomment(raw_source)
        sources[relative] = source
        for match in MARKERS.finditer(raw_source):
            issue("unfinished-marker", f"{relative}: {match.group(0)}")
        for match in re.finditer(r"\\begin\{((?:figure|table)\*?)\}\s*(?:\[([^\]]*)\])?", source):
            environment, placement = match.groups()
            allowed = "t" if environment.endswith("*") else "tb"
            positions = (placement or "").replace("!", "")
            if not positions or any(character not in allowed for character in positions):
                issue("float-placement", f"{relative}: {environment} needs explicit [{'!t' if environment.endswith('*') else 'tb'}]; inline h/H and float-page p are unsupported")
        for match in ASSET_COMMAND.finditer(source):
            command, value = match.groups()
            for name in value.split(",") if command == "bibliography" else [value]:
                name = name.strip()
                if not re.fullmatch(r"[\w .\-/]+", name, flags=re.UNICODE):
                    issue("unsupported-asset-path", f"{relative}: use a literal project-relative asset path: {name!r}")
                    continue
                extensions = (".tex",) if command in ("input", "include") else ((".bib",) if command in ("bibliography", "addbibresource") else (".pdf", ".png", ".jpg", ".jpeg"))
                try:
                    candidate = source_path(root, name)
                except PublicationError as error:
                    issue("generated-input-path", str(error))
                    continue
                paths = [candidate] if candidate.suffix else [source_path(root, name + suffix) for suffix in extensions]
                asset = next((path for path in paths if path.is_file()), None)
                if asset is None:
                    issue("missing-asset", f"{relative}: \\{command}{{{name}}}")
                elif command in ("input", "include"):
                    pending.append(asset.relative_to(root).as_posix())
                elif command in ("bibliography", "addbibresource"):
                    bibliographies.add(asset)
                elif asset.suffix.lower() == ".svg":
                    issue("unsupported-asset-format", f"{name}: include a vector PDF in LaTeX; retain SVG as editable source")
    all_source = "\n".join(sources.values())
    labels: set[str] = set()
    for label in LABEL.findall(all_source):
        if label in labels:
            issue("duplicate-label", label)
        labels.add(label)
    for reference in REFERENCE.findall(all_source):
        for key in reference.split(","):
            if key.strip() not in labels:
                issue("undefined-reference", key.strip())
    keys: set[str] = set()
    for bibliography in sorted(bibliographies):
        for kind, key in re.findall(r"@(\w+)\s*[({]\s*([^,\s]+)\s*,", read_text(bibliography)):
            if kind.lower() not in ("comment", "string", "preamble"):
                if key in keys:
                    issue("duplicate-citation-key", key)
                keys.add(key)
    for citation in CITATION.findall(all_source):
        for key in citation.split(","):
            if key.strip() != "*" and key.strip() not in keys:
                issue("undefined-citation", key.strip())
    if "\\addbibresource" in all_source:
        issue("unsupported-bibliography-backend", "This CLI supports BibTeX; use \\bibliography and a BibTeX .bst")
    return {"issues": issues, "sources": sorted(sources), "bibliographies": [path.relative_to(root).as_posix() for path in sorted(bibliographies)]}


def inventory(root: Path) -> dict[str, str]:
    """Hash bounded source inputs; generated build files never satisfy freshness checks."""
    result: dict[str, str] = {}
    total = 0
    for directory, directories, files in os.walk(root, followlinks=False):
        parent = Path(directory)
        excluded = {"__pycache__", ".git"} | ({"build"} if parent == root else set())
        directories[:] = sorted(name for name in directories if (name.casefold() if os.name == "nt" else name) not in excluded)
        for name in directories:
            safe_path(root, (parent / name).relative_to(root).as_posix())
        for name in sorted(files):
            relative = (parent / name).relative_to(root).as_posix()
            path = safe_path(root, relative, must_exist=True)
            size = path.stat().st_size
            total += size
            if size > MAX_FILE_BYTES or total > MAX_PROJECT_BYTES or len(result) >= MAX_FILES:
                raise PublicationError("Publication inputs exceed file, count, or total byte limits")
            result[relative] = hashlib.sha256(path.read_bytes()).hexdigest()
    return result


def child_environment() -> dict[str, str]:
    env = {name: value for name, value in os.environ.items()
           if not re.search(r"KEY|SECRET|TOKEN|PASSWORD", name, flags=re.IGNORECASE)}
    env.update({"openin_any": "p", "openout_any": "p", "shell_escape": "f", "MIKTEX_ENABLE_INSTALLER": "0"})
    return env


def run_command(argv: list[str], cwd: Path, timeout: int, log_path: Path) -> dict[str, Any]:
    """Bound duration and retained output; reap a process group on timeout or overflow."""
    started = time.monotonic()
    output_limit = threading.Event()
    read_errors: list[OSError] = []
    with log_path.open("wb") as output:
        process = subprocess.Popen(argv, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                   stdin=subprocess.DEVNULL, env=child_environment(), shell=False,
                                   start_new_session=os.name != "nt",
                                   creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0)
        def capture() -> None:
            retained = 0
            try:
                assert process.stdout is not None
                while chunk := process.stdout.read(65536):
                    remaining = MAX_LOG_BYTES - retained
                    output.write(chunk[:remaining])
                    retained += min(len(chunk), remaining)
                    if len(chunk) > remaining:
                        output_limit.set()
            except OSError as error:
                read_errors.append(error)
                output_limit.set()
            finally:
                if process.stdout is not None:
                    process.stdout.close()

        reader = threading.Thread(target=capture, name="science-publication-output", daemon=True)
        reader.start()
        deadline = started + timeout
        while process.poll() is None and not output_limit.is_set() and time.monotonic() < deadline:
            try:
                process.wait(timeout=min(0.1, max(0.001, deadline - time.monotonic())))
            except subprocess.TimeoutExpired:
                continue
        timed_out = process.poll() is None and time.monotonic() >= deadline
        if process.poll() is None:
            if os.name == "nt":
                subprocess.run([str(Path(os.environ.get("SystemRoot", r"C:\Windows")) / "System32/taskkill.exe"),
                                "/PID", str(process.pid), "/T", "/F"], stdout=subprocess.DEVNULL,
                               stderr=subprocess.DEVNULL, timeout=10, check=False)
            else:
                os.killpg(process.pid, signal.SIGKILL)
            if process.poll() is None:
                process.kill()
            process.wait(timeout=10)
        reader.join(timeout=10)
        if reader.is_alive():
            raise PublicationError("Child output stream did not close after process termination")
        if read_errors:
            raise PublicationError(f"Failed to retain child output: {read_errors[0]}")
    with log_path.open("rb") as handle:
        output_text = handle.read(MAX_OUTPUT_BYTES).decode("utf-8", errors="replace")
    return {"argv": argv, "exit_code": process.returncode, "timed_out": timed_out,
            "seconds": round(time.monotonic() - started, 3), "log": str(log_path),
            "output_limit_exceeded": output_limit.is_set(),
            "output_truncated": log_path.stat().st_size > MAX_OUTPUT_BYTES, "output": output_text}


def require_program(name: str) -> str:
    program = shutil.which(name)
    if program is None:
        raise PublicationError(f"needs-setup: {name} is unavailable on PATH; configure it before building")
    return program


def engine_name(config: dict[str, Any]) -> str:
    return ("xelatex" if config["language"] != "en" else "pdflatex") if config["engine"] == "auto" else config["engine"]


def build_directory(root: Path) -> Path:
    build = safe_path(root, "build")
    build.mkdir(exist_ok=True)
    return build


def compile_project(root: Path, config: dict[str, Any]) -> tuple[dict[str, Any], int]:
    checks = source_check(root, config)
    build = build_directory(root)
    report: dict[str, Any] = {"schema_version": SCHEMA_VERSION, "status": "compile-failed", "pdf": None,
                              "engine": engine_name(config), "source_check": checks, "commands": []}
    destination = safe_path(root, "build/compile-report.json")
    try:
        if checks["issues"]:
            raise PublicationError("Source checks failed; resolve citation, reference, asset and unfinished-marker diagnostics")
        report["inputs"] = inventory(root)
        engine = require_program(report["engine"])
        bibtex = require_program("bibtex") if checks["bibliographies"] else None
        run = create_work_directory(build, "run-")
        report["run_directory"] = run.relative_to(root).as_posix()
        version = run_command([engine, "--version"], root, 10, run / "engine-version.txt")
        report["engine_version"] = version["output"].splitlines()[0] if version["output"] else "unavailable"
        if version["timed_out"] or version["output_limit_exceeded"] or version["exit_code"] != 0:
            raise PublicationError("TeX engine version check failed")
        argv = [engine, "-no-shell-escape", "-interaction=nonstopmode", "-halt-on-error", "-file-line-error", "-recorder",
                "-jobname=manuscript", f"-output-directory={run}"]
        if "miktex" in version["output"].lower():
            argv.append("-disable-installer")
        argv.append(config["main"])
        biblio_ran = False
        for index in range(config["max_passes"]):
            command = run_command(argv, root, config["timeout_seconds"], run / f"tex-pass-{index + 1}.txt")
            report["commands"].append(command)
            if command["timed_out"] or command["output_limit_exceeded"] or command["exit_code"] != 0:
                if command["timed_out"]:
                    raise PublicationError("TeX timed out; inspect the retained log")
                if command["output_limit_exceeded"]:
                    raise PublicationError("TeX exceeded the retained output limit; inspect the retained log")
                if re.search(r"LaTeX Error: File .*not found|font.*cannot be found|fontspec Error", command["output"], re.IGNORECASE):
                    raise PublicationError("needs-setup: a required TeX package or font is unavailable; inspect the retained log")
                raise PublicationError("TeX returned a nonzero exit; inspect the retained log")
            if index == 0 and bibtex:
                # BibTeX reads sources relative to the project; its aux argument identifies the fresh run.
                auxiliary = (run / "manuscript").relative_to(root).as_posix()
                command = run_command([bibtex, auxiliary], root, config["timeout_seconds"], run / "bibtex.txt")
                report["commands"].append(command)
                if command["timed_out"] or command["output_limit_exceeded"] or command["exit_code"] != 0:
                    raise PublicationError("BibTeX failed or timed out; inspect its retained log")
                biblio_ran = True
            if index >= (2 if biblio_ran else 1):
                log = read_text(run / "manuscript.log")
                if not re.search(r"Rerun to get|Label\(s\) may have changed|rerunfilecheck.*Warning", log):
                    break
        log = read_text(run / "manuscript.log")
        errors = [line.strip() for line in log.splitlines() if re.search(
            r"(?:Citation|Reference).*undefined|undefined (?:references|citations)|Missing character:|No file .*\.(?:bbl|pdf|png|jpg)|Rerun to get|Label\(s\) may have changed|rerunfilecheck.*Warning|multiply defined", line)]
        report["diagnostics"] = errors
        report["layout_warnings"] = [line.strip() for line in log.splitlines() if "Overfull \\" in line or "Underfull \\" in line]
        report["font_diagnostics"] = [line.strip() for line in log.splitlines() if re.search(r"Font shape .*undefined|Some font shapes were not available", line)]
        if report["font_diagnostics"]:
            raise PublicationError("needs-setup: an unavailable font shape caused substitution; configure the required fonts")
        if any("Overfull \\hbox" in warning for warning in report["layout_warnings"]):
            raise PublicationError("Overfull hbox blocks completion; fix content or break mathematics without shrinking the page")
        if errors:
            raise PublicationError("Unresolved TeX diagnostics remain after bounded passes")
        pdf = run / "manuscript.pdf"
        if not pdf.is_file() or not pdf.read_bytes().startswith(b"%PDF-"):
            raise PublicationError("TeX did not produce an actual PDF")
        if inventory(root) != report["inputs"]:
            raise PublicationError("Publication source inputs changed during compilation; rebuild")
        report["pdf_inspection"] = {"page_count": None, "font_embedding": "not-checked"}
        for tool in ("pdfinfo", "pdffonts"):
            program = shutil.which(tool)
            if program is None:
                continue
            inspection = run_command([program, str(pdf)], root, config["timeout_seconds"], run / f"{tool}.txt")
            report["commands"].append(inspection)
            if inspection["exit_code"] != 0 or inspection["timed_out"] or inspection["output_limit_exceeded"]:
                raise PublicationError(f"{tool} inspection failed; inspect retained output")
            if tool == "pdfinfo":
                count = re.search(r"(?m)^Pages:\s*(\d+)\s*$", inspection["output"])
                if count:
                    report["pdf_inspection"]["page_count"] = int(count.group(1))
            else:
                fonts = [match.groups() for match in re.finditer(r"(?m)^(\S+).*?\s(yes|no)\s+(yes|no)\s+(yes|no)\s+\d+\s+\d+\s*$", inspection["output"])]
                report["pdf_inspection"]["fonts"] = [{"name": name, "embedded": embedded == "yes"} for name, embedded, _, _ in fonts]
                report["pdf_inspection"]["font_embedding"] = "all-embedded" if fonts and all(font[1] == "yes" for font in fonts) else "unverified"
                if any(font[1] == "no" for font in fonts):
                    raise PublicationError("Unembedded PDF font blocks completion")
        report.update({"status": "compiled", "pdf": str(pdf), "pdf_sha256": hashlib.sha256(pdf.read_bytes()).hexdigest(),
                       "rendering": "required; run render and inspect every page", "scientific_validation": "not-performed"})
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        report["error"] = str(error)
        if "needs-setup" in str(error):
            report["status"] = "needs-setup"
    write_json(destination, report)
    return report, 0 if report["status"] == "compiled" else 1


def check_project(root: Path, config: dict[str, Any], require_compiled: bool = False) -> tuple[dict[str, Any], int]:
    checks = source_check(root, config)
    report_path = safe_path(root, "build/compile-report.json")
    status = "not-compiled"
    if report_path.is_file():
        compiled = json.loads(read_text(report_path))
        if compiled.get("status") == "compiled":
            pdf_relative = Path(compiled.get("pdf", "")).resolve().relative_to(root)
            pdf = safe_path(root, pdf_relative.as_posix(), must_exist=True)
            if compiled.get("inputs") != inventory(root) or compiled.get("pdf_sha256") != hashlib.sha256(pdf.read_bytes()).hexdigest():
                checks["issues"].append({"code": "stale-build", "detail": "Source inputs or compiled PDF changed; rebuild"})
                status = "stale-build"
            else:
                status = "compiled"
        else:
            status = compiled.get("status", "compile-failed")
    if require_compiled and status != "compiled":
        checks["issues"].append({"code": "compiled-artifact-required", "detail": status})
    return {"status": status, **checks}, 1 if checks["issues"] else 0


def render_project(root: Path, config: dict[str, Any], dpi: int) -> tuple[dict[str, Any], int]:
    checks, code = check_project(root, config, require_compiled=True)
    if code:
        return checks, code
    program = require_program("pdftoppm")
    compiled = json.loads(read_text(safe_path(root, "build/compile-report.json", must_exist=True)))
    run = safe_path(root, compiled["run_directory"])
    render = create_work_directory(run, "render-")
    command = run_command([program, "-png", "-r", str(dpi), compiled["pdf"], str(render / "page")],
                          root, config["timeout_seconds"], render / "render.txt")
    pages = sorted(str(path) for path in render.glob("page-*.png"))
    ok = not command["timed_out"] and not command["output_limit_exceeded"] and command["exit_code"] == 0 and bool(pages)
    report = {"status": "rendered" if ok else "render-failed", "pages": pages, "pdf_sha256": compiled["pdf_sha256"],
              "command": command, "visual_review": "required; rendered pages do not establish visual quality"}
    write_json(safe_path(root, "build/render-report.json"), report)
    return report, 0 if ok else 1


def tex_escape(value: str) -> str:
    escapes = {"\\": r"\textbackslash{}", "&": r"\&", "%": r"\%", "$": r"\$", "#": r"\#",
               "_": r"\_", "{": r"\{", "}": r"\}", "~": r"\textasciitilde{}", "^": r"\textasciicircum{}"}
    return "".join(escapes.get(character, character) for character in value)


def manuscript(title: str, authors: list[str], template: str, language: str, demo: bool, figure_width: int, cjk_fontset: str, layout_demo: bool = False) -> str:
    if template == "ieee":
        preamble = [r"\documentclass[journal]{IEEEtran}"]
    else:
        preamble = [r"\documentclass[10pt,a4paper,twocolumn]{article}",
                    r"\usepackage[top=19mm,bottom=21mm,left=18mm,right=18mm,columnsep=6mm]{geometry}",
                    r"\usepackage[font=small,labelfont=bf,labelsep=period]{caption}", r"\usepackage{titlesec}"]
    preamble += [r"\usepackage{amsmath,amssymb,booktabs,siunitx,graphicx,xcolor}"]
    if template == "ieee":
        preamble += [r"\usepackage{cite}"]
    preamble += [r"\usepackage[hidelinks]{hyperref}"]
    if language != "en":
        preamble += [r"\usepackage[UTF8,fontset=" + cjk_fontset + r",scheme=plain]{ctex}"]
    if template == "nature-inspired":
        preamble += [r"\definecolor{scienceaccent}{HTML}{244B63}",
                     r"\titleformat{\section}{\fontsize{11}{13}\selectfont\sffamily\bfseries\color{scienceaccent}}{\thesection}{0.6em}{}",
                     r"\titleformat{\subsection}{\normalsize\sffamily\bfseries}{\thesubsection}{0.6em}{}"]
    elif template == "neutral":
        preamble += [r"\titleformat{\section}{\fontsize{11}{13}\selectfont\bfseries}{\thesection}{0.6em}{}",
                     r"\titleformat{\subsection}{\normalsize\bfseries}{\thesubsection}{0.6em}{}"]
    if template != "ieee":
        preamble += [r"\titlespacing*{\section}{0pt}{9pt plus 2pt minus 1pt}{4pt}",
                     r"\titlespacing*{\subsection}{0pt}{7pt plus 1pt minus 1pt}{3pt}"]
    if template != "ieee":
        preamble += [r"\setlength{\columnsep}{6mm}", r"\setlength{\textfloatsep}{10pt plus 2pt minus 2pt}",
                 r"\setlength{\floatsep}{8pt plus 2pt minus 2pt}", r"\setlength{\dbltextfloatsep}{10pt plus 2pt minus 2pt}",
                 r"\renewcommand{\topfraction}{0.9}\renewcommand{\bottomfraction}{0.8}",
                 r"\renewcommand{\textfraction}{0.08}\renewcommand{\floatpagefraction}{0.8}",
                     r"\renewcommand{\dbltopfraction}{0.9}\setcounter{topnumber}{2}\setcounter{bottomnumber}{2}\setcounter{totalnumber}{4}"]
    preamble += [r"\makeatletter\setlength{\@fptop}{0pt}\setlength{\@dblfptop}{0pt}\makeatother"]
    if language != "en":
        preamble += [r"\newcommand{\sciencebilingual}{}"]
    draft_label = r"\date{\small\textsf{Unofficial Nature-inspired research draft}}" if template == "nature-inspired" else r"\date{}"
    preamble += [r"\setlength{\emergencystretch}{2em}", r"\title{" + tex_escape(title) + "}",
                 r"\author{" + tex_escape("; ".join(authors)) + "}", draft_label, r"\begin{document}", r"\maketitle"]
    body = [r"\begin{abstract}",
            "This document demonstrates editable scientific typesetting using invented measurements. It is a build fixture, with no experimental or clinical conclusion." if demo else
            "CLAIM_UNKNOWN: State the question, actual design, measured findings and limits.", r"\end{abstract}"]
    if language != "en":
        body += [r"\section*{中文摘要}", "本示例用于检验中文、数学公式与矢量插图的排版。演示数据是虚构数据，不构成科研结论。" if demo else "CLAIM_UNKNOWN: 请根据实际证据撰写中文摘要。"]
    body += [r"\section{Introduction}",
             r"Scientific writing requires explicit assumptions, editable equations and inspectable sources. This fixture uses the documentation of the \LaTeX{} Project~\cite{latex-project} as a software reference." if demo else
             "CITATION_UNKNOWN: Define the evidence-supported question and disciplinary context.",
             r"\section{Methods}", r"\subsection{Estimand and units}",
             r"For independent observations $x_i$ measured in \si{\milli\volt}, define the arithmetic mean and sample standard deviation:",
             r"\begin{equation}\begin{aligned}", r"\bar{x}&=\frac{1}{n}\sum_{i=1}^{n}x_i,\\ s^2&=\frac{1}{n-1}\sum_{i=1}^{n}(x_i-\bar{x})^2.",
             r"\end{aligned}",
             r"\label{eq:mean}\end{equation}",
             r"Equation~\eqref{eq:mean} defines a descriptive summary. It does not imply a causal effect, a group comparison test, or independence of real measurements.",
             r"\subsection{Design and uncertainty}",
             "The fixture contains two groups of five invented values. Each point represents one demonstration row. Error bars show sample SD, not a confidence interval or SEM; no hypothesis test was run." if demo else
             "DATA_UNKNOWN: Describe independent units, technical and biological replicates, exclusions, uncertainty, analysis commands and required approvals.",
             r"\section{Results}"]
    if demo:
        figure_environment = "figure*" if figure_width > 90 else "figure"
        body += ["\\begin{" + figure_environment + r"}[!t]\centering", r"\newlength{\sciencefigurewidth}\setlength{\sciencefigurewidth}{" + str(figure_width) + "mm}",
                 r"\ifdim\sciencefigurewidth>\linewidth\setlength{\sciencefigurewidth}{\linewidth}\fi",
                 r"\includegraphics[width=\sciencefigurewidth]{figures/demonstration.pdf}",
                 r"\caption{Invented demonstration measurements. Dots: individual rows ($n=5$ per group); squares: means; bars: sample SD (ddof = 1). The axis unit is millivolts. Colours and marker shapes distinguish groups. No inferential or biological conclusion is intended.}\label{fig:demo}\end{" + figure_environment + "}",
                 r"Figure~\ref{fig:demo} and Table~\ref{tab:summary} report the same invented values.",
                 r"\begin{table}[tb]\centering\caption{Descriptive fixture summaries; invented data.}\label{tab:summary}",
                 r"\begin{tabular}{lrrr}\toprule Group & $n$ & Mean (mV) & SD (mV) \\\midrule",
                 r"A & 5 & 10.0 & 1.58 \\ B & 5 & 13.0 & 1.58 \\\bottomrule\end{tabular}\end{table}"]
    else:
        body += ["CLAIM_UNKNOWN: Report observed results with exact data, figure and claim-register locators."]
    body += [r"\section{Discussion and limitations}",
             "The synthetic fixture tests typography and build diagnostics only. Real studies require design-specific analysis, verified references, and substantive expert review." if demo else
             "CLAIM_UNKNOWN: Interpret only supported findings; state assumptions, counter-evidence, scope and unresolved limitations.",
             r"\section*{Data and code availability}",
             "Invented inputs and the figure-generating Python source are retained with this document." if demo else
             "DATA_UNKNOWN: Give actual accessions, persistent identifiers, restrictions and executable code locations.",
             r"\section*{Declarations}",
             "Typesetting demonstration; no participant, animal or clinical data were used. No journal affiliation or acceptance is implied." if demo else
             "AUTHOR_UNKNOWN: Record contributions, funding, competing interests, ethics and consent where applicable.",
             r"\begingroup\raggedright",
             r"\bibliographystyle{IEEEtran}" if template == "ieee" else r"\bibliographystyle{unsrt}",
             r"\bibliography{references}", r"\endgroup", r"\end{document}"]
    if layout_demo:
        # A separate editable body keeps the realistic layout fixture out of authored projects.
        body = body[:body.index(r"\section{Introduction}")] + [r"\input{layout-body}"] + body[body.index(r"\begingroup\raggedright"):]
    return "\n".join(preamble + body) + "\n"


def init_project(args: argparse.Namespace) -> dict[str, Any]:
    root = args.project.absolute()
    if root.exists():
        raise PublicationError(f"Output directory already exists: {root}")
    if not args.title.strip() or any(not author.strip() for author in args.author):
        raise PublicationError("Title and supplied authors must be nonempty")
    root.mkdir(parents=True, exist_ok=False)
    config = {"schema_version": SCHEMA_VERSION, "main": "main.tex", "template": args.template, "language": args.language,
              "engine": "auto", "cjk_fontset": args.cjk_fontset, "timeout_seconds": 60, "max_passes": 4, "figure_width_mm": args.figure_width_mm}
    write_json(root / "publication.json", config)
    (root / "main.tex").write_text(manuscript(args.title, args.author or ["Demonstration author" if args.demo else "AUTHOR_UNKNOWN"],
                                             args.template, args.language, args.demo, args.figure_width_mm, args.cjk_fontset, args.layout_demo), encoding="utf-8")
    bibliography = ("@misc{latex-project,\n  author = {{The LaTeX Project}},\n  title = {{LaTeX} documentation},\n"
                    "  howpublished = {\\url{https://www.latex-project.org/help/documentation/}},\n"
                    f"  note = {{Accessed {date.today().isoformat()}}}\n}}\n") if args.demo else "% Add verified BibTeX records exported from your literature register.\n"
    (root / "references.bib").write_text(bibliography, encoding="utf-8")
    (root / "claims.csv").write_text("claim,artifact,locator,quote,support,depth,citation_status\n", encoding="utf-8")
    script = Path(__file__).resolve()
    (root / "publication.py").write_bytes(script.read_bytes())
    (root / "plot_figure.py").write_bytes(script.with_name("plot_figure.py").read_bytes())
    for resource in ("layout_fixture.tex", "plot_layout.py"):
        (root / resource).write_bytes(script.with_name(resource).read_bytes())
    license_source = script.with_name("LICENSE") if script.with_name("LICENSE").is_file() else script.parents[2] / "LICENSE"
    schema_source = script.with_name("publication.schema.json") if script.with_name("publication.schema.json").is_file() else script.parent.parent / "references/publication.schema.json"
    (root / "LICENSE").write_bytes(license_source.read_bytes())
    (root / "publication.schema.json").write_bytes(schema_source.read_bytes())
    (root / "README.md").write_text("# Editable LaTeX manuscript\n\nRun `python publication.py doctor .`, `compile .`, `check . --require-compiled` and `render .`. Inspect every rendered page.\n\n"
        "Edit main.tex, references.bib, claims.csv and publication.json. The compile report records input hashes and exact commands. Build output stays in build/.\n\n"
        "This helper uses trusted source files; execute it inside your configured OS sandbox for untrusted TeX. Templates do not establish journal compliance or scientific validity.\n", encoding="utf-8")
    if args.demo:
        (root / "demonstration.csv").write_text("group,value\nA,8\nA,9\nA,10\nA,11\nA,12\nB,11\nB,12\nB,13\nB,14\nB,15\n", encoding="utf-8")
        (root / "figures").mkdir()
        family = "sans" if args.template == "nature-inspired" else "serif"
        result = run_command([sys.executable, str(root / "plot_figure.py"), "--input", str(root / "demonstration.csv"),
                              "--output", str(root / "figures"), "--width-mm", str(args.figure_width_mm), "--demo", "--font-family", family], root, 60, root / "figure-build.txt")
        if result["timed_out"] or result["output_limit_exceeded"] or result["exit_code"] != 0:
            raise PublicationError(f"needs-setup: demo figure generation failed; sources retained at {root}; inspect figure-build.txt")
    if args.layout_demo:
        (root / "layout-body.tex").write_bytes(script.with_name("layout_fixture.tex").read_bytes())
        result = run_command([sys.executable, str(root / "plot_layout.py"), "--output", str(root / "figures"), "--font-family", family],
                             root, 60, root / "layout-figure-build.txt")
        if result["timed_out"] or result["output_limit_exceeded"] or result["exit_code"] != 0:
            raise PublicationError(f"needs-setup: layout figures failed; inspect {root / 'layout-figure-build.txt'}")
    return {"status": "initialized", "project": str(root), "template": args.template,
            "compilation": "not-run", "demo": args.demo}


def doctor(root: Path, config: dict[str, Any]) -> tuple[dict[str, Any], int]:
    names = (engine_name(config), "bibtex", "kpsewhich", "pdftoppm", "pdfinfo", "pdffonts")
    programs = {name: shutil.which(name) for name in names}
    report: dict[str, Any] = {"status": "ready" if all(programs.values()) else "needs-setup", "python": sys.executable,
                              "programs": programs, "engine": engine_name(config), "packages": {}}
    if programs["kpsewhich"]:
        packages = ["amsmath.sty", "amssymb.sty", "booktabs.sty", "siunitx.sty", "graphicx.sty", "hyperref.sty"]
        packages += ["IEEEtran.cls", "IEEEtran.bst", "cite.sty", "ot1ptm.fd"] if config["template"] == "ieee" else ["geometry.sty", "caption.sty", "titlesec.sty"]
        packages += ["ctex.sty"] if config["language"] != "en" else []
        packages += ["FandolSong-Regular.otf"] if config["language"] != "en" and config["cjk_fontset"] == "fandol" else []
        with temporary_work_directory(build_directory(root), "doctor-") as temporary:
            for index, package in enumerate(packages):
                result = run_command([programs["kpsewhich"], package], root, 10, Path(temporary) / f"lookup-{index}.txt")
                found = result["exit_code"] == 0 and not result["timed_out"] and not result["output_limit_exceeded"]
                report["packages"][package] = found
        if not all(report["packages"].values()):
            report["status"] = "needs-setup"
    if config["language"] != "en" and config["cjk_fontset"] == "windows":
        fonts = Path(os.environ.get("SystemRoot", r"C:\Windows")) / "Fonts"
        report["windows_fonts"] = {name: (fonts / name).is_file() for name in ("simsun.ttc", "simhei.ttf", "simkai.ttf", "simfang.ttf")}
        if not all(report["windows_fonts"].values()):
            report["status"] = "needs-setup"
    return report, 0 if report["status"] == "ready" else 1


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    init = commands.add_parser("init", help="Create a new editable project; never overwrite")
    init.add_argument("project", type=Path)
    init.add_argument("--title", required=True)
    init.add_argument("--author", action="append", default=[])
    init.add_argument("--template", choices=TEMPLATES, default="neutral")
    init.add_argument("--language", choices=LANGUAGES, default="en")
    init.add_argument("--cjk-fontset", choices=("fandol", "windows"), default="windows" if os.name == "nt" else "fandol")
    init.add_argument("--figure-width-mm", type=int, choices=range(50, 191), default=90, metavar="50..190")
    init.add_argument("--demo", action="store_true", help="Invented build fixture, requires matplotlib")
    init.add_argument("--layout-demo", action="store_true", help="Long illustrated two-column layout fixture, implies --demo")
    for name in ("doctor", "compile", "check", "render"):
        child = commands.add_parser(name)
        child.add_argument("project", type=Path)
        if name == "check":
            child.add_argument("--require-compiled", action="store_true")
        if name == "render":
            child.add_argument("--dpi", type=int, choices=range(72, 301), default=130, metavar="72..300")
    args = parser.parse_args()
    if args.command == "init" and args.layout_demo:
        args.demo = True
    try:
        if args.command == "init":
            result, code = init_project(args), 0
        else:
            root = args.project.resolve(strict=True)
            config = load_config(root)
            if args.command == "compile":
                result, code = compile_project(root, config)
            elif args.command == "check":
                result, code = check_project(root, config, args.require_compiled)
            elif args.command == "render":
                result, code = render_project(root, config, args.dpi)
            else:
                result, code = doctor(root, config)
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        result, code = {"status": "needs-setup" if "needs-setup" in str(error) else "failed", "error": str(error)}, 1
    print(json.dumps(result, ensure_ascii=True, allow_nan=False))
    return code


if __name__ == "__main__":
    raise SystemExit(main())
