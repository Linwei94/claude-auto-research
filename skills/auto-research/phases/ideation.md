# Phase 1–2: Ideation

> **Mode note**: Phases 1–2 run identically in both `paper` and `research-only` modes. The mode only affects the post-Phase 9 path. See `phases/report.md` for `research-only` output.

## Inputs
- `config/config.md` — venue, topic, mode (paper / research-only)
- `plan/idea_history.md` — archived ideas (read if exists)
- `lessons/round_*.md` — all lesson files (read if any exist)

## Outputs
- `plan/literature_review.md`
- `plan/idea_summary.md`
- `plan/idea_debate.md`
- `plan/idea_history.md` (updated)
- `plan/proposal.md`
- `plan/TODO.md` (Phase 1–2 checkboxes checked)
- `progress/progress.md` (Phase 1 + Phase 2 entries appended)

---

## Phase 1: Idea Exploration

### Step 1.1: Literature Review

Spawn a subagent. Target **100 papers** minimum. Search across:
1. **arXiv MCP** (`mcp__arxiv-mcp-server__search_papers`) — primary source, batches of 20
2. **Google Scholar / Semantic Scholar** (via `WebSearch`) — for venue proceedings and citation counts
3. **Venue proceedings pages** (via `WebFetch`) — ICML/NeurIPS/ICLR OpenReview, CVPR/ECCV CVF

Search strategy: start broad (topic keywords), then narrow by venue, then by sub-topic. Run multiple searches with different query angles to reach 100.

**Rate limit handling (mandatory — do NOT stop early):**
- arXiv MCP: if rate-limited (429 or connection error), wait 60 seconds then retry the same query
- WebSearch: if Google Scholar rate-limits, switch to Semantic Scholar API (`api.semanticscholar.org/graph/v1/paper/search`) or use `mcp__arxiv-mcp-server__search_papers` as fallback
- If any source is temporarily unavailable, continue with remaining sources and retry the blocked one after ≥2 minutes
- Never give up due to rate limits — keep retrying until 100 papers are collected

Track progress: after every 20 papers collected, log count to avoid losing work on context overflow.

Organize findings into a table: Title | Venue/Year | Key Contribution | Method Category | Limitations | arXiv ID.

Identify: research gaps, unsolved problems, strongest assumptions to challenge.

Save to `plan/literature_review.md` (include paper count at top: `## Papers Reviewed: N`).

### Step 1.2: Idea Generation

**If `plan/idea_history.md` or any `lessons/` files exist, read them ALL first.** Extract:
- Archived idea summaries and their core mechanisms
- All failure reasons and lessons — these are **hard negative constraints**

Generate 3–5 research directions. Score each on:
- **Novelty** (1–5)
- **Feasibility** (1–5): can this be implemented with available resources?
- **Impact** (1–5): would this excite reviewers at the target venue?
- **Risk** (1–5, lower is better)
- **Differentiation** (pass/fail): must differ in core mechanism from ALL archived ideas

Composite score: (Novelty + Feasibility + Impact) - Risk. Auto-select highest. **Tie-breaking**: if two ideas share the same composite score, prefer the one with higher Novelty; if still tied, prefer higher Feasibility; if still tied, pick the one ranked earlier in the generated list. Log all scores to `plan/idea_summary.md`.

Update `plan/idea_history.md`: record selected idea as "Active Idea" with current round number.

### Step 1.3: Idea Debate

Run the 6-agent debate defined in `agents/idea_debate.md`.

Process:
1. Spawn all 6 reviewer agents in parallel
2. Synthesize into SWOT summary
3. Auto-incorporate suggestions raised by ≥2 agents
4. Re-run Contrarian + Empiricist to verify revisions address their concerns
   - If both pass: proceed to AC
   - If either still flags a critical issue: escalate to AC directly with both the revision AND the remaining objection. AC arbitrates — do NOT loop Contrarian/Empiricist again.
5. AC Decision:
   - **ACCEPT (≥6/10)** → proceed to Phase 2
   - **REVISE** → revise idea, re-run full debate (max 3 cycles)
   - **REJECT** → select next-highest direction; if all exhausted, generate new directions

Save full debate record + AC meta-review to `plan/idea_debate.md`.

Model: debate agents use Light tier (Sonnet). See `shared/models.md`.

### Step 1.4: Idea Refinement

After AC ACCEPT, crystallize to `plan/idea_summary.md`:
- 3 closest related papers and precise differences
- One-paragraph elevator pitch (seed for abstract)
- Expected contributions (3–5 bullet points)
- Anticipated reviewer objections + sketch rebuttals

Update `plan/idea_history.md` with AC score and ACCEPT status.

Commit + notify-telegram. See `shared/git-workflow.md` and `shared/notifications.md`.

---

## Phase 2: Research Proposal

Write a proposal detailed enough that a PhD student could implement from it alone. Save to `plan/proposal.md`.

Structure:
1. **Motivation & Problem Statement** — formal definition, gap statement
2. **Related Work** — organized by category, ends with positioning paragraph
3. **Proposed Method** — framework overview, full math formulation, algorithm pseudocode, theoretical analysis (convergence/bounds/complexity), connections to PAC learning / online learning / information theory
4. **Experimental Plan** (brief — full plan in Phase 3)
5. **Novelty & Contributions** — numbered, verifiable from experiments
6. **Venue Positioning** — why this venue, anticipated reviewer concerns
7. **References**

The theoretical section (§3) is especially important for ICML/NeurIPS. Include propositions/theorems with proof sketches.

Proceed directly to Phase 3 after saving. No user approval needed.

Commit + notify-telegram.

---

## Idea History Format (`plan/idea_history.md`)

Maintain throughout the project. Records every idea attempted.

```markdown
# Idea History: [Research Topic]

## Active Idea
- **Round**: [N]
- **Title**: [title]
- **Status**: [exploring / debating / piloting / accepted / failed]

## Archived Ideas (DO NOT REUSE)

### Round N: [idea title]
- **Summary**: [1-paragraph]
- **Key Mechanism**: [core technical contribution]
- **Idea Debate Outcome**: [ACCEPT/REVISE/REJECT] — AC score: [X/10]
- **Pilot Result**: [passed / failed — brief description]
- **Failure Reason**: [specific and actionable]
- **Lessons Learned**: [what to avoid in future ideas]
- **Date Archived**: [date]
```

**Rules:**
1. Every idea that enters Step 1.3 (debate) must be recorded
2. When archived, also write `lessons/round_N.md`
3. New idea generation MUST read all archived ideas and lessons as hard constraints

**On rollback (Phase 5.4):**
1. Change `Active Idea` → `Status: failed`
2. Move the entire Active Idea block into `## Archived Ideas` as a new `### Round N: [title]` entry, filling in all fields
3. Replace the `## Active Idea` section with exactly this placeholder (do NOT delete the section header — it must always exist):
   ```
   ## Active Idea
   *(none — rollback to idea generation)*
   ```
4. Commit: `git commit -m "archive: round N idea failed — [title]"`

```markdown
# Idea History: [Research Topic]

## Active Idea
*(none — see archived below)*

## Archived Ideas (DO NOT REUSE)

### Round 1: [idea title]
- **Summary**: ...
- **Key Mechanism**: ...
...
```
