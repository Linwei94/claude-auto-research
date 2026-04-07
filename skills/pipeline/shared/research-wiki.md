# Research Wiki — Schema & Operations

A persistent, cross-project knowledge base maintained by the Ideation Agent. Grows richer with every literature review, idea generation, and pilot failure. Never re-discovers what has already been learned.

---

## Location

```
~/.auto-research-wiki/
├── SCHEMA.md          ← this file (copy on wiki init)
├── index.md           ← content catalog (always maintained)
├── log.md             ← append-only ingest/query/lint log
├── topics/            ← high-level area overviews
├── methods/           ← technique & algorithm pages
├── papers/            ← one page per paper (key papers only)
├── datasets/          ← dataset pages
├── venues/            ← ICLR, NeurIPS, CVPR, etc. — requirements, trends
└── lessons/           ← cross-project failure lessons (aggregated)
```

**Init (first use only):**
```bash
mkdir -p ~/.auto-research-wiki/{topics,methods,papers,datasets,venues,lessons}
touch ~/.auto-research-wiki/index.md ~/.auto-research-wiki/log.md
```

---

## Page Formats

### topics/ — High-level area overview

```markdown
---
title: [Area Name]
type: topic
updated: YYYY-MM-DD
paper_count: N
key_methods: [method1, method2]
---

# [Area Name]

## One-line Summary
[What this area is about]

## Key Open Problems
- [problem 1]
- [problem 2]

## SOTA Methods
| Method | Venue | Key Idea | Limitations |
|--------|-------|----------|-------------|

## Research Gaps
- [gap 1 — with source citations]

## Cross-references
- Methods: [[methods/tent]], [[methods/tta-bn]]
- Related topics: [[topics/domain-adaptation]]
- Key papers: [[papers/wang2021tent]]
```

### methods/ — Algorithm or technique page

```markdown
---
title: [Method Name]
type: method
venue: [ICLR 2021]
year: 2021
authors: [key authors]
updated: YYYY-MM-DD
---

# [Method Name]

## Core Idea
[1-paragraph: what the method does and why]

## Algorithm
[pseudocode or step-by-step description]

## Strengths
- [strength 1]

## Weaknesses / Failure Modes
- [known limitation]

## Results (reported)
| Dataset | Metric | Value | Baseline |
|---------|--------|-------|----------|

## Cross-references
- Topic: [[topics/test-time-adaptation]]
- Builds on: [[methods/bn-stats]]
- Compared against: [[methods/tent]]
- Paper: [[papers/wang2021tent]]
```

### papers/ — Key paper pages (only papers that significantly inform the research direction)

```markdown
---
title: [Paper Title]
type: paper
venue: [ICLR 2021]
year: 2021
authors: [Author1, Author2]
url: https://arxiv.org/abs/...
updated: YYYY-MM-DD
---

# [Paper Title]

## Core Contribution
[1-2 sentences: what is new]

## Method Summary
[Key technical idea in 3-5 bullet points]

## Results
[Key numbers that matter for comparison]

## Limitations (stated or observed)
- [limitation]

## Relevance to Our Research
[Why this paper matters; what constraint or inspiration it provides]

## Cross-references
- Topic: [[topics/...]]
- Methods introduced: [[methods/...]]
```

### datasets/ — Dataset pages

```markdown
---
title: [Dataset Name]
type: dataset
updated: YYYY-MM-DD
---

# [Dataset Name]

## Description
[What it contains, task, domain]

## Stats
- Train: N samples | Val: N | Test: N
- Classes / domains: [list]

## Standard Splits
[Official split description]

## Common Baselines (on this dataset)
| Method | Metric | Value | Year |
|--------|--------|-------|------|

## Known Issues / Caveats
- [issue 1]

## Cross-references
- Used in topics: [[topics/...]]
```

### venues/ — Conference pages

```markdown
---
title: [Venue Name]
type: venue
updated: YYYY-MM-DD
---

# [Venue Name]

## Review Criteria
[Key dimensions reviewers score, with weights if known]

## Acceptance Rate
[Current and historical]

## Trends (recent cycles)
- [What's hot]
- [What's getting rejected]

## Submission Requirements
- Format: [LaTeX template]
- Page limit: [N pages + references]
- Anonymity: [double-blind / single-blind]
- Supplementary: [yes/no, limit]

## Cross-references
- Strong papers from this venue: [[papers/...]]
```

### lessons/ — Cross-project failure lessons

```markdown
---
title: Round [N] — [Project Slug] — [Idea Title]
type: lesson
project: [project-slug]
date: YYYY-MM-DD
---

# Cross-Project Lesson: [Idea Title]

## What Failed
[Concise description]

## Root Cause
[Fundamental reason — not just "results were bad"]

## Hard Constraints (global — apply to ALL future ideas)
- Do NOT use: [mechanism] — because [reason]

## What This Suggests Might Work
[Positive inference from the failure]
```

---

## Operations

### Ingest (after each literature review round)

After completing a lit-search round (Step A → B → C in ideation.md), run ingest on the new papers found:

**For each new paper:**
1. Determine if it warrants a `papers/` page (significance threshold: cited ≥20 times OR directly comparable to proposed method OR introduces a key dataset/metric)
2. If yes: create or update `papers/<slug>.md`
3. For each key method introduced: create or update `methods/<slug>.md`
4. Update the topic page for this area: add to SOTA table, update gaps
5. Add dataset used to `datasets/<slug>.md` if not present
6. Update `index.md` (new or updated entries)
7. Append to `log.md`:
   ```
   ## [YYYY-MM-DD] ingest | [Project]: round R lit search
   - New papers added: N
   - Updated pages: [list]
   - New gaps identified: [bullet points]
   ```

**Batch ingest from pilot failure (§5.4 rollback):**
When a pilot fails and lessons are written, ingest the failure into the wiki:
1. Create or update `lessons/<date>-<project>-round<N>.md`
2. Update the relevant topic page: add to "Known Failure Modes" section
3. Update the relevant method page: add negative result data
4. Append to `log.md`: `## [date] ingest | [Project] round N pilot failure — [idea title]`

### Query (before idea generation — Step 1.2)

Before generating candidate ideas in Step 1.2, query the wiki:

```
1. Read index.md — identify all relevant topic and method pages
2. Read topics/<area>.md — current SOTA, known gaps
3. Read lessons/*.md — global hard constraints across ALL projects
4. Synthesize: "what has been tried globally, what gaps remain, what constraints apply"
```

Output: a **Wiki Query Summary** (written inline, not to file) with:
- Top 3 unexploited gaps from the wiki
- Global hard constraints (from all lessons/)
- Most relevant SOTA baselines (from methods/ and papers/)

Use this summary to guide idea generation. Ideas that violate global constraints from lessons/ are automatically discarded.

### Lint (run when requested, or every 5 projects)

Check wiki health:
```
1. Orphan pages: pages in methods/ or papers/ not linked from any topic page
2. Stale SOTA: topic pages with "updated" date > 12 months old
3. Contradictions: two pages making conflicting claims about the same method/result
4. Missing cross-references: papers/ pages without a topic link
5. Gaps in lessons/: pilot failures not yet integrated into topic/method pages
```

Report as a markdown checklist. Fix all Critical items; queue Important items for next ingest.

---

## index.md Format

```markdown
# Research Wiki Index
Last updated: YYYY-MM-DD | Total pages: N

## Topics
- [[topics/test-time-adaptation]] — TTA methods under distribution shift (42 papers, updated 2026-03)
- [[topics/confidence-calibration]] — Post-hoc and training-time calibration (18 papers, updated 2026-02)

## Methods (key techniques)
- [[methods/tent]] — entropy minimization at test time (Wang et al., ICLR 2021)
- [[methods/tta-bn]] — batch norm statistics adaptation

## Datasets
- [[datasets/cifar10c]] — CIFAR-10 with 19 corruption types
- [[datasets/imagenet-c]] — ImageNet with 75 corruptions

## Venues
- [[venues/iclr]] — acceptance rate ~30%, strong ML theory + empirical
- [[venues/neurips]] — ...

## Cross-Project Lessons
- [[lessons/2026-03-tracedet-round1]] — Entropy-based TTA on medical imaging fails (distribution too OOD)
```

---

## Wiki Path Convention

Always reference the wiki as `WIKI_DIR = Path.home() / ".auto-research-wiki"`.

When running on a remote machine (gadi, c500): the wiki lives on the **local machine only** — do not rsync it to remote hosts. It is a local knowledge artifact, not part of the experiment codebase.
