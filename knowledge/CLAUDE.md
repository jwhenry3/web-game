# Research Wiki Schema and Conventions: [Your Topic]

This file defines the structure, naming conventions, and operational workflows for maintaining this LLM Knowledge Base. It transforms a generic LLM into a disciplined knowledge worker.

## Project Structure

- `raw/` — Immutable source documents. **NEVER modify files here.** All input must be added to `raw/`.
- `wiki/` — LLM-generated and maintained markdown pages.
    - `concepts/`: Core theoretical ideas (e.g., attention, quantization).
    - `entities/`: Specific models, companies, or people (e.g., OpenAI, GPT-4o).
    - `sources/`: Direct summaries of ingested documents.
    - `comparisons/`: Structured comparisons between two or more concepts/models.
- `wiki/index.md` — Master content catalog and navigation map. Updated on every operation.
- `wiki/log.md` — Append-only record of all wiki operations.
- `outputs/`: Generated reports, lint results, presentations.

## Page Frontmatter Convention (YAML)

Every wiki page must begin with the following YAML frontmatter for proper processing:

---
title: Page Title
type: concept | entity | source-summary | comparison
sources: # List of raw/ files that informed this page's content
  - path/to/raw/file.md
related: # Internal [[wikilinks]] to related pages
  - "[[related-concept]]"
created: YYYY-MM-DD
updated: YYYY-MM-DD
confidence: high | medium | low # LLM's confidence score in the accuracy of this page.
---

## Naming Conventions & Links

1.  **Filenames:** Use `kebab-case` matching the concept (e.g., `attention-mechanism`).
2.  **Cross-references:** Always use standard [[wikilinks]] format for internal links.
3.  **Source references:** When citing raw material, always link back to the full path in `raw/`.

## Operational Workflows (The Compiler Analogy)

### 1. Ingest (Compilation)
When a new source is added to `raw/`:
1.  Read the source document content fully.
2.  Identify key takeaways and core concepts.
3.  Create or update dedicated pages in `wiki/sources/[source-name].md`.
4.  Update or create related concept (`concepts/`) and entity (`entities/`) pages as needed, linking back to the raw source.
5.  Append a detailed operation record to `wiki/log.md` describing changes made to index and other wiki files.

### 2. Query (Runtime)
When a question is asked:
1.  Consult `wiki/index.md` to identify the most relevant concepts and sources.
2.  Read those targeted pages, synthesizing an answer by reading only the necessary context chunks.
3.  Cite all information using [[wikilinks]] pointing back to specific wiki pages or raw sources.
4.  If the synthesized knowledge is novel and valuable, proactively suggest saving it as a new, permanent page in `concepts/` or `comparisons/`.

### 3. Lint (Testing)
Periodically run this operation (e.g., daily):
1.  **Contradictions Check:** Scan all wiki pages for factual conflicts across different sources. Flag the specific claim and the conflicting source file(s).
2.  **Orphan Detection:** Identify any page that has incoming `[[wikilinks]]` but is not itself a well-defined Concept or Entity page.
3.  **Missing Concepts:** Check if concepts are referenced in `related:` fields but do not have their own dedicated file (e.g., `concepts/missing-concept.md`).
4.  **Stale Claims:** Compare the 'updated' date of a wiki page against its source files to flag claims that may be superseded by newer raw sources.

---
*Customization Note: Customize this template for your domain. A machine learning wiki might add conventions for tracking paper citations and benchmark results.*