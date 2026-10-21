---
description: "Embedded research skill catalog with curated discovery, source metadata, and offline resource integrity checks."
kind: "package-reference"
---

# @deepseek-ai/dsh-skill-science

English | [中文](README.zh.md)

## Use this package

Mount the skill registry and this provider to advertise the curated `core`, `ai`, and `nature` packs. The full embedded library remains searchable through the exported catalog helpers without adding every summary to the model prompt. Registry contributions use the standard bundled rank, 600, and disappear when the plugin is disposed.

```yaml
- name: '@deepseek-ai/dsh-skill'
- name: '@deepseek-ai/dsh-skill-science'
  config:
    enabledPacks: [core, ai, nature]
```

`assetRoot` selects an absolute external directory containing `manifest.json` and its resource trees, including paths with spaces or Chinese characters. `enabledPacks` replaces the advertised pack selection; unknown packs reject activation. An empty array advertises no skills. Optional packs include engineering, scientific libraries, Hugging Face workflows, and additional AI, Nature, and OpenScience instructions. `scholar` contains Galaxy Dawn's Claude Scholar skills, and `aris` contains ARIS skills and their Codex, Claude-review, and Gemini-review variants. Both remain optional; the default packs stay `core`, `ai`, and `nature`. The available pack names are authoritative in [the generated manifest](assets/manifest.json).

The `academic-noncommercial` and `academic-codex-noncommercial` packs are isolated under `assets/noncommercial/`, disabled by default, and licensed CC-BY-NC-4.0. The latter contains the academic-research-skills Codex adapter and its vendored workflow resources. Each pack requires its own explicit activation before either registry advertisement or direct loading; enabling one does not enable the other. Activation does not grant commercial-use rights. Provider code is MIT; copied resources retain their declared and nested licenses, listed in [NOTICE](assets/NOTICE.md) and the manifest. Anthropic's restricted `docx`, `pdf`, `pptx`, and `xlsx` skills are excluded even when their containing repository uses a permissive root license.

The optional `biology` pack contains reviewed BioSkills experiment-design, omics, chemistry and biostatistics workflows. `electronics` contains KiCad, SPICE, EMC, datasheet and BOM review resources. `mathematics` includes Lean 4 proof guidance and a SymPy reference adapter; `physics`, `numerical` and `control` provide selected official QuTiP, SciPy and python-control documentation through local guide adapters. The adapters identify their local authorship and preserve the unmodified upstream documents under `assets/knowledge/`. They do not install scientific libraries or claim upstream skill authorship. BioSkills is archived upstream; its versioned instructions require current API checks before execution.

## Catalog API

`readScienceCatalog(assetRoot?)` parses one reusable catalog and checks resource presence. `searchScienceCatalog(catalog, query, { packs?, limit? })` searches names, descriptions, authors, source identifiers and paths, and prerequisites across every embedded pack. For example, `aris skills-codex-gemini-review/research-review` selects that ARIS review variant. `inspectScienceSkill(catalog, name)` returns one complete metadata entry. Entries retain source URL, pinned revision, source path, author, version, alternate identical sources, license texts, invocation flags, adaptation status, setup requirements, dependencies, and hashes.

`loadScienceSkill(catalog, name, { enabledPacks?, invocation?, signal? })` explicitly loads a selected entry, including entries outside the advertised packs. It defaults to model invocation, enforces model/user invocation flags and the noncommercial opt-in, and checks the instruction and resource hashes before returning a standard `SkillDefinition`. `loadScienceSkillResource(catalog, name, relative, options?)` reads one complete, declared UTF-8 resource, including a declared shared dependency, after checking the same invocation rules and exact SHA-256. The `nature-shared` support entry permits neither model nor user invocation; requesting Nature skills read its referenced files through their resource directory. A missing name returns `undefined`; invalid policy or assets throw. `verifyScienceCatalog(catalog)` checks every asset hash offline.

## Embedded resources and synchronization

The default `nature` pack contains all 22 callable Nature Skills workflows (`nature-academic-search`, `nature-citation`, `nature-data`, `nature-downloader`, `nature-experiment-log`, `nature-figure`, `nature-image2ppt`, `nature-literature-pipeline`, `nature-paper-card`, `nature-paper-to-patent`, `nature-paper-trans`, `nature-paper-xray`, `nature-paper2ppt`, `nature-polishing`, `nature-reader`, `nature-ref-verifier`, `nature-response`, `nature-reviewer`, `nature-social-science`, `nature-statistics`, `nature-writing`, and `researchwrite`) plus the non-invocable `nature-shared` support resource. The science kernel chooses a module from ordinary user language and supplies its complete applicable instructions; the catalog retains the full pinned Nature resource trees for additional references.

Resources retain their source directory layout. Nature's shared references, the academic packs' shared roles and scripts, ARIS MCP/tool/template resources, and Scholar agent/command/hook/rule/script/template/utility resources are included. Existing documents linked outside those directories are copied transitively with their effective licenses and hashes; absent upstream links remain recorded in `metadata.resourceAudit`. This audit covers literal Markdown file links outside code examples, not every dynamically constructed script path. The manifest collapses identical skill trees into one catalog entry while retaining relative resource locations needed by other instructions. [names.lock.json](names.lock.json) preserves existing public names when new sources introduce collisions. New collisions use deterministic source prefixes and, for distinct same-source variants, content-hash suffixes; source paths identify each variant. Nature skill names keep their `nature-` identifiers. Upstream `disable-model-invocation` and `user-invocable` flags remain effective.

Run `node scripts/sync-science-skills.mjs --source-root <review-clones>` from the repository to regenerate assets from the pinned sources in [sources.json](sources.json). Missing clones fail unless `--fetch` is explicitly supplied. `--verify-only` checks the existing assets without Git or network access. `--complete-resources` repairs only transitive document resources and their audit metadata in a verified existing tree. The script does not run upstream installers or resource scripts. It excludes repository tests, build products, data directories, and proprietary document skills, retains applicable license/notice files, and only replaces a target inside this package directory.

The declaration `Complete terms in LICENSE.txt` resolves only from a present skill-local `LICENSE.txt`; the original declaration and copied terms remain in the catalog. Missing or unrecognized terms remain excluded. Informational notices inherit the reviewed repository terms without overriding redistribution restrictions.

Synchronization copies pinned Git blob bytes without checkout line-ending conversion. Official knowledge subsets use the explicit selections in `sources.json`; absent selected files, missing root licenses, unsupported terms and nonregular resources fail synchronization. ARIS's root and Codex shared-reference trees are included explicitly, including writing principles, venue checklists and citation discipline named in plain backticks; their files belong to each ARIS entry's verified dependencies. The resource audit also follows literal reStructuredText include, image, figure and plot directives; it does not build Sphinx sites or resolve all cross-references. Generated guide metadata identifies the original source document separately from its local `SKILL.md` adapter, and both remain covered by integrity checks.

## Model Experience

### Skill discovery and loading

#### What the model sees

The skill consumer shows summaries from enabled packs and loads one selected instruction body with its filesystem resource directory. The catalog consumer may return full source and readiness metadata for an explicit search or inspection. Every loaded entry states its source URL, pinned revision, and Harness readiness status. Noncommercial entries and entries with repository-level dependencies also state the original repository directory so shared roles, tools, and scripts resolve after relocation. Guidance-adapted entries prepend resource/tool guidance; the remaining instruction body is copied upstream content with frontmatter removed.

##### Workflow verification limit

```markdown
Workflow and script execution have not been tested in this Harness.
```

##### Resource and tool guidance

```markdown
## DeepSeek Science resource and tool guidance

Resolve relative files against the resource directory supplied with this skill. Use available Harness tools for the capabilities described by upstream tool names. Do not assume optional MCP servers, credentials, packages, GPUs, or provider-specific agent APIs are installed. Check prerequisites before running a resource script; upstream scripts and workflows have not been executed in this Harness. Preserve the evidence limits and citation requirements in the upstream instructions.
```

#### Token effect

Discovery adds only enabled summaries through the skill consumer. Loading adds one body and its resource hint; resource files remain on disk until specifically requested. Searching or inspecting the complete manifest does not automatically inject the library.

#### KV Cache effect

The package owns no model requests or cache. Enabled summaries remain stable for one plugin lifetime. Changing pack configuration replaces the discovery contribution; explicitly loaded bodies add context through the consumer that logs the result.

## Known Limitations and Deferred Work

- Copied skills are instructions, not installed scientific packages, credentials, MCP servers, GPU capacity, or tested research workflows. `guidance-adapted` records the local resource/tool preface; `guidance-only` describes usable instructions and does not certify script execution. Other entries require upstream setup review. All entries record `testedHere: false`.
- Static copies of journal policies and package advice can age. Source revisions and hashes identify the bundled content, and users must verify current venue requirements and software documentation when accuracy depends on them.
- Catalog-entry deduplication preserves source resource trees for relative references; duplicated resource files can remain at different logical paths. Unadapted skills can still name upstream-specific tools and dynamically constructed paths, especially in optional packs. Upstream-missing instructions remain visible as setup requirements rather than invented resources.
- A file-level license declaration that is unknown, proprietary, restricted, or points to absent terms remains excluded in the manifest. In particular, the pinned Hugging Face LLM trainer refers to a missing `LICENSE.txt`; its repository's root license does not resolve that exception.
