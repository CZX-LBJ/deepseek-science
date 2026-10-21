#!/usr/bin/env python3
"""Create an evidence-preserving manuscript scaffold with visible citation gaps."""

import argparse
import csv
import hashlib
import json
import platform
import sys
from pathlib import Path


FIELDS = ["claim", "artifact", "locator", "quote", "support", "depth"]


def load_evidence(path):
    if path is None:
        return [], None
    raw = path.read_bytes()
    evidence = json.loads(raw.decode("utf-8-sig"))
    if not isinstance(evidence, list):
        raise ValueError("Evidence JSON must be an array")
    for index, entry in enumerate(evidence, start=1):
        if not isinstance(entry, dict):
            raise ValueError(f"Evidence entry {index} must be an object")
        for field in FIELDS:
            if not isinstance(entry.get(field), str) or not entry[field].strip():
                raise ValueError(f"Evidence entry {index} needs a nonempty {field}")
        if entry["support"] not in ("supported", "partial", "unsupported"):
            raise ValueError(f"Evidence entry {index} has an invalid support assessment")
        if entry["depth"] not in ("full-text", "abstract-only", "experiment"):
            raise ValueError(f"Evidence entry {index} has an invalid reading depth")
        artifact = Path(entry["artifact"]).read_text(encoding="utf-8-sig")
        escaped = json.dumps(entry["quote"], ensure_ascii=False)[1:-1]
        if entry["quote"] not in artifact and escaped not in artifact:
            raise ValueError(f"Evidence quote {index} is absent from its artifact")
    return [{field: entry[field] for field in FIELDS} for entry in evidence], raw


def tex(value):
    escapes = {"\\": r"\textbackslash{}", "&": r"\&", "%": r"\%", "$": r"\$",
               "#": r"\#", "_": r"\_", "{": r"\{", "}": r"\}",
               "~": r"\textasciitilde{}", "^": r"\textasciicircum{}"}
    return "".join(escapes.get(character, character) for character in value)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--topic", required=True)
    parser.add_argument("--output", type=Path, required=True, help="New output directory")
    parser.add_argument("--evidence-json", type=Path)
    args = parser.parse_args()
    try:
        if not args.topic.strip():
            raise ValueError("--topic must be nonempty")
        if args.output.exists():
            raise ValueError(f"Output directory already exists: {args.output}")
        evidence, raw = load_evidence(args.evidence_json)
        script = Path(__file__).read_bytes()
        paragraphs = ["\\documentclass[10pt,twocolumn]{article}", "\\title{" + tex(args.topic) + "}",
                      "\\author{AUTHOR UNKNOWN}", "\\date{}", "\\begin{document}", "\\maketitle",
                      "\\begin{abstract}", "TODO: State the question, measured result and limitations.", "\\end{abstract}"]
        sections = {
            "Introduction": "TODO: Define the question and source-supported gap. CITATION_UNKNOWN.",
            "Methods": "TODO: Describe design, sampling units, input data and actual analysis commands.",
            "Results": "TODO: Report observed results with data and figure locators; keep unsupported claims visible.",
            "Discussion": "TODO: Interpret within the design and evidence limits. CITATION_UNKNOWN.",
            "Limitations": "TODO: Describe dependence, missing evidence, reading depth and uncertainty.",
        }
        markdown = ["# " + args.topic, "", "Draft scaffold. Citation and evidence gaps require review.", ""]
        for heading, instruction in sections.items():
            paragraphs.extend(["\\section{" + heading + "}", tex(instruction)])
            markdown.extend(["## " + heading, "", instruction, ""])
        paragraphs.append("\\section{Claim evidence register}")
        if evidence:
            paragraphs.append("\\begin{enumerate}")
            for entry in evidence:
                paragraphs.extend(["\\item " + tex(entry["claim"]),
                                   tex("Author assessment: " + entry["support"] + "; depth: " + entry["depth"] + "."),
                                   tex("Artifact: " + entry["artifact"] + "; locator: " + entry["locator"] + "."),
                                   r"\textbf{CITATION\_UNKNOWN: verify the source or data reference.}"])
            paragraphs.append("\\end{enumerate}")
        else:
            paragraphs.append(r"\textbf{CLAIM\_UNKNOWN; CITATION\_UNKNOWN: no evidence supplied.}")
        paragraphs.extend(["% Add verified citation keys and bibliography commands when references are ready.", "\\end{document}"])
        metadata = {"status": "scaffold-created", "topic": args.topic, "evidence_count": len(evidence),
                    "evidence_sha256": hashlib.sha256(raw).hexdigest() if raw is not None else None,
                    "script_sha256": hashlib.sha256(script).hexdigest(), "python": platform.python_version(),
                    "compilation": "not-run; check an actual TeX engine", "scientific_validation": "not-performed"}
        args.output.mkdir(parents=True, exist_ok=False)
        (args.output / "draft.tex").write_text("\n".join(paragraphs) + "\n", encoding="utf-8")
        (args.output / "manuscript.md").write_text("\n".join(markdown).rstrip() + "\n", encoding="utf-8")
        (args.output / "references.bib").write_text("% CITATION_UNKNOWN: add actual verified bibliography entries.\n", encoding="utf-8")
        with (args.output / "claims.csv").open("w", encoding="utf-8", newline="") as output:
            writer = csv.DictWriter(output, fieldnames=FIELDS + ["citation_status"])
            writer.writeheader()
            writer.writerows({**entry, "citation_status": "CITATION_UNKNOWN"} for entry in evidence)
        if raw is not None:
            (args.output / "evidence-input.json").write_bytes(raw)
        (args.output / "scaffold_manuscript.py").write_bytes(script)
        (args.output / "metadata.json").write_text(json.dumps(metadata, indent=2, allow_nan=False) + "\n", encoding="utf-8")
        print(json.dumps({"status": "scaffold-created", "output": str(args.output.resolve()),
                          "claims": len(evidence), "compilation": "not-run"}))
        return 0
    except (OSError, UnicodeError, ValueError) as error:
        print(f"writing scaffold failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
