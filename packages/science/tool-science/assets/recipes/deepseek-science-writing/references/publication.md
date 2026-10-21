# LaTeX publication CLI reference

`scripts/publication.py` is a Python 3.10+ build helper for trusted manuscript sources. Python's standard library is sufficient for normal projects; the optional synthetic demonstration and `plot_figure.py` require matplotlib. It is bundled with the writing recipe and runs through the configured shell; it does not launch a separate Harness application. No external account, model key, or user-facing skill name is needed.

## Commands

Resolve the script from this recipe's resource directory. Create a new two-column project with `python scripts/publication.py init manuscript --title "Actual study title" --author "First Author" --template neutral --language en`. The command refuses an existing directory. `--author` may repeat; `--template` accepts `neutral`, `nature-inspired` or `ieee`; `--language` accepts `en`, `zh` or `bilingual`; `--figure-width-mm` accepts an integer from 50 to 190 and defaults to 90, clamped to the actual available column/page width. Add `--demo` only for a short invented typesetting fixture or `--layout-demo` for a realistic multi-page illustrated layout fixture; never use either to manufacture a study result.

Each initialized project contains `main.tex`, `references.bib`, `claims.csv`, `publication.json`, portable CLI/figure scripts, the schema and license. Layout fixture sources are retained for a reproducible typesetting check; `--layout-demo` additionally includes `layout-body.tex` with six vector figures, two tables, multiline equations and optional CJK text. The ordinary scaffold intentionally contains visible unknown markers. Author the real manuscript, verify bibliography metadata, fill the claim register, and resolve these markers before compiling. Existing `scaffold_manuscript.py` remains available for evidence staging; bring those actual claims into this publication project rather than replacing them with demonstration rows.

From the new project run:

```sh
python publication.py doctor .
python publication.py check .
python publication.py compile .
python publication.py check . --require-compiled
python publication.py render . --dpi 130
```

`doctor` checks the selected executable, BibTeX, Kpathsea lookup, Poppler tools and selected template dependencies. It does not install or update TeX packages. `compile` selects pdfLaTeX for English or XeLaTeX for Chinese/bilingual unless explicitly configured; it never falls back to another engine. The bounded build runs TeX, BibTeX when bibliography sources exist, and enough TeX passes to settle references. Use of `biblatex`/Biber is rejected with a diagnostic; use a BibTeX `.bst` for this helper or a venue's separately reviewed build procedure. A missing prerequisite or undefined font-shape substitution returns `needs-setup` and a nonzero exit. IEEE uses the actual class, `cite` and its Times resources; it does not silently certify a substituted class font.

`check` reads literal TeX includes, bibliography keys, labels and assets recursively; it reports missing figures, undefined references/citations, duplicate labels/keys and visible `CLAIM_UNKNOWN`, `CITATION_UNKNOWN`, `DATA_UNKNOWN`, `AUTHOR_UNKNOWN` or `TODO:` markers. All asset paths resolve from the project root, including assets referenced from nested source files. Use explicit project-relative names; macro-built asset paths are unsupported and fail the check. The root `build/` directory is reserved for generated output and cannot supply TeX, bibliography or figure inputs; `.git` and `__pycache__` directories are also excluded and cannot supply inputs. Nested source directories such as `figures/build/` remain fully hashed, so editing a figure there invalidates a prior build. The compiler's final log supplies additional unresolved-reference and missing-glyph diagnostics. `check --require-compiled` additionally requires a successful build whose input hashes and actual PDF hash still match. `check` without that flag can pass source checks while reporting `not-compiled`; that is not a completed publication build.

`render` requires a fresh compiled PDF and uses installed `pdftoppm` to render every page at 72–300 dpi. It retains PNGs and exact rendering commands. The compiler blocks every overfull hbox, while preserving underfull messages as warnings. When `pdfinfo` and `pdffonts` are available, it records the actual page count and font embedding; an unembedded font blocks completion. Missing inspection tools are reported as unchecked, never inferred to have passed. Inspect every page for clipping, missing symbols, figure legibility, captions, tables, two-column flow and actual edge placement; rendered status records an operation, never an automatic visual approval. Changes after compilation invalidate the build. A successful compiler log does not validate a scientific claim, ethics compliance, statistical design, citation accuracy or journal acceptance.

## Configuration and reports

The versioned machine-readable schema is [publication.schema.json](publication.schema.json); unknown or missing fields fail. A generated configuration is:

```json
{
  "schema_version": 1,
  "main": "main.tex",
  "template": "neutral",
  "language": "en",
  "engine": "auto",
  "cjk_fontset": "fandol",
  "timeout_seconds": 60,
  "max_passes": 4,
  "figure_width_mm": 90
}
```

`timeout_seconds` is the per-process limit (5–300); `max_passes` bounds TeX passes (3–6). Template, language and `cjk_fontset` choose generated source only during initialization; changing those fields later does not rewrite an authored manuscript. The font set defaults to `windows` on Windows and `fandol` elsewhere, with `--cjk-fontset` selecting either explicitly. `figure_width_mm` records the project's preferred figure size and initializes the demonstration; later figure regeneration must pass the desired width explicitly. Keep scientific content in editable `.tex`, verified records in `.bib`, and figure sources/data beside their exported vectors.

`build/compile-report.json` records status, exact argv, exit codes, timeout state, retained logs, engine version, source hashes, diagnostic lists and a successful PDF's SHA-256. Each attempt uses a new directory, so an earlier PDF cannot make a failed build succeed. On failure, its report has no successful PDF path. `build/render-report.json` records rendered pages and the corresponding PDF hash. Shell callers must inspect the process exit status as well as the JSON; zero means the requested operation succeeded, not that the manuscript is publication-ready.

## Execution limits

Subprocesses use argv arrays, no shell, no stdin, scrubbed key/secret/token/password environment variables, disabled shell escape and disabled MiKTeX automatic installation. Each process has a timeout; timeout or output overflow cleanup terminates its process group/tree and waits for it. The helper restricts literal project paths and refuses symlink/junction traversal. Input inspection is bounded to 512 files, 16 MiB per file and 128 MiB in total; returned command output is truncated at 1 MiB, retained process output is bounded at 8 MiB and overflow is a build failure even if the child exits zero. Normal TeX logs remain in their run directory. TeX passes are bounded, not byte-reproducible across engines or distributions.

These controls do not make TeX a sandbox. Run untrusted sources inside the configured OS sandbox; external TeX distributions and their trusted packages can read their own installed resources. This CLI supports pdfLaTeX and XeLaTeX, not arbitrary engine flags, LuaLaTeX code, automatic SVG shell conversion, Biber or an exhaustive TeX parser. The selected environment must already supply packages and fonts. Poppler and matplotlib are separate prerequisites; bundled recipe files do not include those runtimes. No fake PDF or raster substitute is emitted when TeX fails.
