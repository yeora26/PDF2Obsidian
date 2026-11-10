# PDF2Obsidian · Technical Documentation Index

This directory is the single source for the design, configuration and usage docs of PDF2Obsidian. The Chinese version in [`docs/zh/`](../zh/README.md) is authoritative; this English version is its translation. Rules for coding agents live in [`docs/rules/`](../rules/) (English), entered from the root [`AGENTS.md`](../../AGENTS.md).

## Contents

### Core documents

| Document | Covers |
| --- | --- |
| [System Architecture and Detailed Design](system-design.md) | Purpose and principles, packages and dependency direction, config system, import pipeline, task management, local web workbench, API contract, data and storage, known issues and doc/code differences |
| [Installation, Configuration and Usage Guide](user-guide.md) | Requirements, installation, config keys, using the web workbench, CLI usage, output files, data directories, troubleshooting |
| [Glossary](glossary.md) | One word per concept; terms mapped to code and config identifiers |

### Topics

| Document | Status | Covers |
| --- | --- | --- |
| [PDF Import Pipeline](topics/pdf-import-pipeline.md) | Current state | Follows the code through the six stages, the enrichment steps between them (auto-links, metadata, reading assets, reference stubs), caches and resume, what is written to and deleted from the Vault, known risks |

## Reading paths

| You want to | Read |
| --- | --- |
| Understand what the project does and what it is made of | System design §1–§2 |
| Run it locally | User guide §1–§4 |
| Change a config key or default | System design §3; user guide §3; [config rule](../rules/config.md) |
| Change parsing, translation, reading assets, metadata or export | PDF import pipeline topic; system design §4 |
| Change batch, watch, retry or task state | System design §5; user guide §5 |
| Change web pages or API routes | System design §6–§7 |
| Find where outputs and caches live | System design §8; user guide §6–§7 |
| Debug a failed import | User guide §8; system design §9 |
| Look up a term | [Glossary](glossary.md) |

## Documentation conventions

### Writing rules

- **For humans: one topic, one document.** Design, usage and topic documents are not split per chapter; section numbers stay stable, and cross-references are written as "document §section" with a link.
- **For agents: small pages, read on demand.** `AGENTS.md` only routes and sets global constraints (at most 80 lines); details live in `docs/rules/`, one topic per page, each starting with when to read it, written in English.
- **One fact, one place.** Each fact is defined once and linked elsewhere. Config defaults are defined by `packages/core/src/config/load-config.ts`, meanings by the comments in `pdf2obsidian.config.example.yaml`; docs list only common keys.
- **Integrate, don't append.** When behaviour changes, rewrite the section that owns it; don't add an "update" paragraph at the end.
- **Describe the current state, not the history.** Discussion and revisions stay in git commits. Proposal topics state their status at the top (proposal / in progress / implemented) and are rewritten as current-state docs once implemented.
- **Placement:** architecture, modules and API → system design; installation, config, usage and troubleshooting → user guide; causes, options and trade-offs of a single problem → `topics/`; terms → glossary; agent constraints → `docs/rules/`.
- Use the words in the [glossary](glossary.md); keep code identifiers, config keys, commands and API fields unchanged.

### Chinese / English sync

- Chinese is authoritative. Any change under `docs/zh/` updates the matching file in `docs/en/` in the same commit; a new document is created in both languages and added to both indexes.
- Both languages keep the same section numbers and structure.
- The root `README.md` is for first-time users: introduction, quick start and links to the docs; detailed config descriptions are owned by this directory.

### Checks

After changing docs, check the relative links and anchors, file paths, commands and config keys you touched against the code (see the [verification rule](../rules/verification.md)).
