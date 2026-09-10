## Agent Protocol and Operational Guidelines

This document defines my operational mandate as an expert software engineering agent within this project. I am responsible for maintaining code quality, adhering to best practices, and, specifically, managing the structure and content of the LLM Wiki Knowledge Base following the Karpathy pattern.

### ⚙️ Core Coding Practices
1.  **Precision:** Adhere strictly to user requirements. Never fix unrelated bugs or over-engineer solutions unless explicitly requested for robustness.
2.  **Best Effort:** Always prioritize technical correctness and efficiency in code changes (minimal diffs, targeted edits).
3.  **Validation:** When possible, run diagnostics/tests after making changes and report the results clearly.

### 🧠 Knowledge Base Maintenance Protocol: LLM Wiki Operation
This knowledge base adheres to the LLM Wiki pattern (Karpathy's architecture). All agents operating in this repository must adhere strictly to the following protocols when ingesting, querying, or maintaining knowledge. Failure to follow these steps will result in unstructured data and an unreliable wiki.

#### 1. Core Principles
*   **Stateful Knowledge:** The wiki is a persistent knowledge graph, not a collection of isolated documents. Every piece of information should ideally link back to another concept or source.
*   **Traceability is Law:** Every claim generated must be traceable back to an immutable source in the `raw/` directory.
*   **System First:** Always check or update `knowledge/wiki/index.md` after any major write operation.

#### 2. Operational Workflow: Ingest (The Compiler)
When a new document is added to `knowledge/raw/*`:
1.  **Read Source:** Read the entire content of the source file, treating it as primary evidence.
2.  **Summarize:** Create a structured summary page in `knowledge/wiki/sources/[source-name].md` containing key takeaways and high-level findings.
3.  **Identify Concepts:** Extract all major concepts (e.g., 'Attention', 'Embeddings') and ensure dedicated, up-to-date concept pages exist in `knowledge/wiki/concepts/`. If a page doesn't exist, create it with the standard YAML frontmatter template from `CLAUDE.md`.
4.  **Cross-Reference:** Update related Concept or Entity pages to include links (`related:`) pointing back to the newly created source summary.
5.  **Cataloging:** Update `knowledge/wiki/index.md` with new entries and append a detailed log entry to `knowledge/wiki/log.md`.

#### 3. Operational Workflow: Query (The Synthesizer)
When answering a user query:
1.  **Index Consult:** First, read `knowledge/wiki/index.md` to determine the most relevant concepts or sources. Do not rely on brute-force searching all files unless necessary.
2.  **Targeted Retrieval:** Read only the top N most relevant pages identified via the index.
3.  **Synthesis & Citation:** Synthesize a coherent answer, ensuring every key claim is immediately followed by its citation (e.g., "This process requires X [See [[automation-scripting]]]").
4.  **Knowledge Compound:** If the synthesized answer is novel and valuable enough to warrant permanent storage, proactively draft a new page in `knowledge/wiki/comparisons/` or `knowledge/wiki/concepts/` for user review.

#### 4. Operational Workflow: Lint (The Auditor)
Periodically run this check to maintain knowledge integrity. This operation must be executed before any major release or complex update:
1.  **Contradiction Scan:** Systematically compare all wiki pages against each other and the raw sources, specifically flagging conflicting claims (e.g., "Source A says X, but Source B contradicts it by stating Y").
2.  **Orphan Page Detection:** Identify any page with incoming links (`related:` fields) that is not a primary Concept or Entity page itself.
3.  **Staleness Check:** Compare the `updated` date of wiki pages against the modification time of their source files in `raw/`. If a source was updated but the derived concept page wasn't, flag it as stale.

*Self-Correction: Always reference `knowledge/wiki/CLAUDE.md` when unsure about conventions.*