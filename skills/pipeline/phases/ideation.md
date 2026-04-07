# Phase 1–2: Ideation

## Agent Memory

Read and write persistent memory at `~/.auto-research-agents/ideation/`. Follow `shared/agent-memory.md` for full protocol.

**On startup (mandatory):**
```bash
mkdir -p ~/.auto-research-agents/ideation
touch ~/.auto-research-agents/ideation/MEMORY.md
```
Read `~/.auto-research-agents/ideation/MEMORY.md` and any relevant linked files before starting work.

**Save memories when you:**
- Learn what score/criteria Pipeline Lead or Reviewer consistently cares about → `feedback`
- Discover a recurring weakness in idea proposals for this research area → `feedback`
- Find a literature search strategy that reliably surfaces relevant papers → `feedback`
- Complete a project round (success or failure) — note what was tried → `project_<slug>`

**Do NOT duplicate** what's already in `~/.auto-research-wiki/` (research knowledge goes there; operational patterns go here).

---

## Inputs
- `config/config.md` — venue, topic
- `plan/idea_history.md` — archived ideas (read if exists)
- `lessons/round_*.md` — all lesson files (read if any exist)
- `~/.auto-research-wiki/` — persistent cross-project research wiki (read at start, updated after each round)
- `~/.auto-research-agents/ideation/MEMORY.md` — agent's own operational memory (read at start)

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

**Entry**: triggered when Pipeline Lead sends "Begin Phase 1. Project: [path]. Config: config/config.md."

### Step 1.0: Wiki Init & Pre-query

**Run BEFORE starting any literature search.**

#### Init wiki (first time only)
```bash
WIKI=~/.auto-research-wiki
if [ ! -d "$WIKI" ]; then
  mkdir -p $WIKI/{topics,methods,papers,datasets,venues,lessons}
  touch $WIKI/index.md $WIKI/log.md
  echo "# Research Wiki Index\nLast updated: $(date +%Y-%m-%d) | Total pages: 0" > $WIKI/index.md
  echo "# Research Wiki Log" > $WIKI/log.md
fi
```

#### Query wiki before searching
Read these files (if they exist) before spawning any lit-search sub-agent:
1. `~/.auto-research-wiki/index.md` — what's already covered
2. All `~/.auto-research-wiki/topics/<relevant>.md` — existing SOTA and gaps for this research area
3. All `~/.auto-research-wiki/lessons/*.md` — global hard constraints from all past projects

Synthesize a **Wiki Query Summary** (used internally, not written to file):
```
Already covered topics: [list from index.md]
Known gaps: [list from topic pages]
Global constraints (DO NOT revisit): [list from lessons/]
Relevant SOTA baselines already documented: [list from methods/]
```

Use this summary to:
- **Skip sub-areas already well-covered** in the wiki (avoid redundant search)
- **Focus Round 1 queries** on unexplored angles and identified gaps
- **Seed initial hard constraints** for idea generation in Step 1.2

### Step 1.1: Iterative Literature Review + Brainstorm

**This is a multi-round loop.** Do NOT do a single pass. Repeat until exit condition is met.

#### Search Platforms (use ALL of them, not just arXiv)

| Platform | How to access | Best for |
|----------|--------------|----------|
| arXiv | `mcp__arxiv-mcp-server__search_papers` | Preprints, ML papers |
| Semantic Scholar | `WebFetch` → `https://api.semanticscholar.org/graph/v1/paper/search?query=<q>&fields=title,year,venue,abstract,citationCount&limit=20` | Citation counts, related work |
| Google Scholar | `WebSearch` → `"site:scholar.google.com <query>"` or direct WebSearch | Broad coverage |
| OpenReview | `WebFetch` → `https://openreview.net/search?term=<query>&group=ICLR.cc` | ICLR, NeurIPS submissions + reviews |
| CVF Open Access | `WebFetch` → `https://openaccess.thecvf.com/CVPR2024?day=all` | CVPR, ECCV, ICCV papers |
| ACL Anthology | `WebFetch` → `https://aclanthology.org/search/?q=<query>` | NLP/language papers |
| PapersWithCode | `WebFetch` → `https://paperswithcode.com/search?q_meta=&q_type=&q=<query>` | SOTA benchmarks, code availability |
| Citation chains | `WebSearch` → `"cited by" <paper title>` or Semantic Scholar `/paper/<id>/citations` | Discover follow-up and foundational work |

**Rate limit handling:**
- arXiv 429: wait 60s, retry once. If still 429: skip. Semantic Scholar 429: wait 30s, retry once. If still blocked: skip.
- Any platform returning 5xx/timeout: skip. If ALL platforms fail: return empty list with error note. Do NOT loop.
- Google Scholar: if blocked, switch to Semantic Scholar or PapersWithCode.

#### Round Loop (typically 3–5 rounds)

**Initialize:**
```
paper_count = 0
round = 0
search_queries = [broad topic queries from config/config.md]
gaps_identified = []
```

**Each round:**

**Step A — Search (multi-topic × multi-platform, fully parallel)**

At the start of each round, derive **exactly 3 topic angles** from `search_queries` — always 3, not fewer. In Round 1, seed these from `config/config.md` and obvious sub-topics. In later rounds, use **only the new follow-up queries** generated by the brainstorm in the previous round as `search_queries`. Do NOT re-search queries from previous rounds — focus on new gaps. Append new queries to "Search Queries Attempted" in `plan/literature_review.md`.

Example decomposition for "test time adaptation + confidence calibration":
- Topic A: test-time adaptation methods (TENT, TTT, DUA, etc.)
- Topic B: confidence calibration under distribution shift
- Topic C: post-hoc calibration (temperature scaling, histogram binning)

Always choose 3 that cover **genuinely different angles**. Before finalizing, apply this diversity check:
- Do the 3 angles span at least 2 of: {method/mechanism, problem setting, application domain, theoretical lens}?
- Would you expect >50% overlap in the paper sets returned? If yes, replace the most overlapping angle with one from an adjacent domain (e.g., swap a second normalization angle for a calibration angle, a domain generalization angle, or a label noise angle).
- At least one angle must come from a venue different from the primary target venue (e.g., if the target is CVPR, one angle must look at EMNLP/ICML/NeurIPS proceedings for cross-domain ideas).
If fewer than 3 meaningful distinct angles exist, broaden the scope until you have 3.

Before spawning lit-search sub-agents, create `plan/literature_review.md` if it doesn't exist (with the standard stub below). This must be done by the Ideation Agent itself, not by sub-agents:
```markdown
# Literature Review: [Topic]
## Papers Reviewed: 0
## Search Rounds Completed: 0

## Paper Table
| # | Title | Authors | Year | Venue | Relevance | Key Idea | URL |
|---|-------|---------|------|-------|-----------|----------|-----|

## Research Gaps
(none yet)

## Search Queries Attempted (cumulative)
```

**Spawn one subagent per topic angle using the Agent tool** (`run_in_background: true`, `model: "haiku"`).

Spawn all Step A sub-agents with `run_in_background: true`. After spawning, wait for all to complete before proceeding to Step B. You will be notified when each background agent completes. Do NOT proceed to Step B until all Step A agents have reported completion (printed 'DONE: lit_r...' in their output).

**Timeout and fallback (per sub-agent):**
Wait up to 10 minutes after completion notification for each Step A agent.
If an agent does not print "DONE: lit_r<ROUND>_<SLUG>.md" within 10 minutes:
  - Check if the output file exists with ≥1 paper entry → treat as completed (DONE)
  - If file does not exist or has 0 papers → log warning: "lit_r<ROUND>_<SLUG> sub-agent failed or timed out — continuing with available results"
Do NOT block indefinitely on a single sub-agent. Proceed with available results.

Each sub-agent prompt MUST be self-contained. Use this template verbatim, filling in PLACEHOLDERS:

---
```
You are a literature search subagent.
**Your model**: You are running as `claude-haiku-4-5` (fast, high-volume search).
Research topic: <RESEARCH_TOPIC>
Your assigned sub-area: <TOPIC_ANGLE> (e.g. "test-time batch normalization adaptation")
Round: <ROUND>
Output file: <PROJECT_DIR>/progress/lit_r<ROUND>_<TOPIC_SLUG>.md
(`<TOPIC_SLUG>`: lowercase, hyphens only, no spaces, max 25 chars. Examples: `test-time-adaptation`, `confidence-calibration`, `batch-norm-adapt`. If topic angle name is long, abbreviate.)

## Step 1: Search ALL platforms for your sub-area

Use field-specific terms of art (e.g. "test-time adaptation" not "adapting at test time"). Run 2-3 queries with different phrasings per platform.

You MUST call ALL of the following tools. Do not skip any.

**arXiv** — call `mcp__arxiv-mcp-server__search_papers` with 2–3 different query phrasings for your topic. Use max_results=20 per query. Run 2–3 queries with different phrasings for your topic angle.

**Semantic Scholar** — call `WebFetch` on this URL (replace QUERY with URL-encoded query string):
`https://api.semanticscholar.org/graph/v1/paper/search?query=QUERY&fields=title,year,venue,abstract,citationCount&limit=20`
Use exactly these fields: title,year,venue,abstract,citationCount (do not add extra fields — minimize payload size).
Run 2 different queries.

**Google Scholar / web** — call `WebSearch` for your topic. Try 1–2 searches.

**OpenReview** (if topic is ICLR/NeurIPS relevant) — call `WebFetch`:
`https://openreview.net/search?term=QUERY&group=ICLR.cc`

**PapersWithCode** — call `WebFetch`:
`https://paperswithcode.com/search?q_meta=&q_type=&q=QUERY`

**CVF Open Access** (for CV topics: CVPR, ICCV, ECCV) — call `WebFetch`:
`https://openaccess.thecvf.com/CVPR2024?day=all` (adjust year as needed)
Also try: `https://openaccess.thecvf.com/ICCV2023?day=all`

**ACL Anthology** (for NLP/language model topics) — call `WebFetch`:
`https://aclanthology.org/search/?q=<ENCODED_QUERY>`
(Skip if topic is purely computer vision or not language-related)

**Citation chain** — for any highly-cited paper you find, call `WebFetch` on:
`https://api.semanticscholar.org/graph/v1/paper/PAPER_ID/citations?fields=title,year,venue,abstract&limit=10`

Rate limits: see platform rate limit rules above (same policy applies here).

## Step 2: Collect results (target 15–25 papers)

## Step 3: Write to <PROJECT_DIR>/progress/lit_r<ROUND>_<TOPIC_SLUG>.md

### Paper Table
| # | Title | Authors | Year | Venue | Relevance | Key Idea | URL |
|---|-------|---------|------|-------|-----------|----------|-----|
| 1 | "Test-Time Adaptation via Self-Training" | Smith et al. | 2023 | ICML | High | Self-training with augmentation at test time | https://arxiv.org/abs/2304.01234 |

### Topic Summary
Use this exact schema (required fields — brainstorm agents read these by field name):
- **Dominant_paradigm**: [1 sentence describing the main approach in this sub-area]
- **Best_method**: [paper title, year — what specifically makes it work mechanistically]
- **Primary_gap**: [1 sentence — the most cited limitation or unresolved problem]
- **Recent_trend**: [1 sentence — what direction the field is moving, or "none observed"]
- **Negative_result**: [surprising failure or counter-evidence, or "none found"]

### Follow-up Queries (2–3)
[specific queries targeting gaps found]

## Done
Print: "DONE: lit_r<ROUND>_<TOPIC_SLUG>.md — N papers found."
Do NOT use SendMessage.
```
---

After ALL topic sub-agents complete, the Ideation Agent reads each `progress/lit_r<ROUND>_*.md` and merges into `plan/literature_review.md`. Deduplicate (same paper in multiple files = count once). 
Deduplication rules:
- Primary key: arXiv ID if available (e.g., `2310.12345`), otherwise DOI
- Fallback: exact title match (case-insensitive, strip punctuation)
- CROSS-ROUND deduplication: if a paper was found in Round N, do NOT add it again in Round N+1 — but DO update its metadata (citation count, etc.) if newer

Update `paper_count` (count unique papers only).

Log after merge:
```bash
echo "[$(date '+%H:%M:%S')] Round $round search done: $paper_count papers total (topics: A=$nA B=$nB ...)" >> progress/ideation.log
```

**Step B — Cross-Topic Brainstorm (spawn 3 subagents in parallel)**

**Spawn 3 brainstorm subagents in parallel** (Agent tool, `run_in_background: true`, `model: "sonnet"`).

Collect the topic summary sections from all `progress/lit_r<ROUND>_*.md` files written in Step A. Pass them inline in each sub-agent prompt. Use this template, varying only the ROLE section:

---
```
You are a brainstorm subagent.
Project directory: <PROJECT_DIR>
All file paths in this prompt are relative to <PROJECT_DIR>.
Research topic: <RESEARCH_TOPIC>
Role: <ROLE_NAME>

## Your role
<INSERT ONE OF:>
- Cross-Pollinator: Find synergies across sub-areas. Ask "What happens if you combine the mechanism from Topic X with the setting/insight from Topic Y? What novel method emerges?"
- Gap Hunter: Find whitespace. Ask "Looking across ALL topics, what problems appear in multiple sub-areas but have no unified solution? What is consistently unsolved?"
- Contrarian: Challenge shared assumptions. Ask "What assumption is shared by dominant methods across ALL topics? What breaks if you remove or invert that assumption?"

## Read these topic summaries now

(Paste ONLY the "Topic Summary (3–5 bullets)" subsection from each lit_r<ROUND>_*.md file.
Do NOT paste the full paper table — too much noise. Limit each topic to ~200 tokens.)

<PASTE TOPIC SUMMARY SECTIONS FROM ALL lit_r<ROUND>_*.md FILES HERE>

Also read `plan/literature_review.md` section "Research Gaps" for cumulative context.

Also read `plan/literature_review.md` section '## Search Queries Attempted (cumulative)' to avoid re-suggesting queries already tried in previous rounds.

## Your output (return directly in your response — no file write needed)

Do NOT use SendMessage. Return your results directly in your response.

### Research Directions (2–3)
For each:
- **Title**: [short name]
- **Core Mechanism**: [1 sentence — what novel thing does it do?]
- **Connection Map**: paper A (Sub-area X) + paper B (Sub-area Y) → enables [Z]
- **Why novel**: differs from existing work because [specific gap addressed]

**Evidence rule:** EVERY connection map claim must cite at least one specific paper or bullet from the topic summaries above as evidence. Do NOT invent mechanisms not present in the provided summaries.

### Follow-up Queries (3–5)
Specific queries targeting gaps you identified — feed these to the next search round.

### Confidence: High/Medium/Low — and why
```
---

The Ideation Agent collects each brainstorm agent's response text directly (no files to read).

**Step C — Synthesize and Decide**

Merge the 3 brainstorm outputs:
1. Collect all proposed research directions → candidate idea pool
2. Collect all follow-up queries → `search_queries` for next round
3. Assess: are the new queries substantially different from what's already been searched?

**Exit condition** (satisfy EITHER condition, OR hit round cap):
- `paper_count >= 100` — sufficient coverage; OR
- Diminishing returns: ≥70% of new follow-up queries from brainstorm have >60% unigram overlap (after removing stopwords like "in", "of", "the", "using", "for") with any previously-searched query. To check overlap: tokenize both queries by whitespace, remove stopwords, compute |intersection| / |union|. If uncertain whether two queries overlap, count as NOT overlapping (err on side of continuing search).

**Round cap:** Maximum 5 rounds. After Round 5, exit immediately regardless of paper_count or query overlap. Log: `"[HH:MM:SS] Round cap (5) reached. Proceeding with N papers found."` >> progress/ideation.log

#### Wiki Ingest (after EVERY round, before deciding exit or continue)

After completing Step C synthesis, ingest this round's findings into the wiki. Read `shared/research-wiki.md` Operations → Ingest for full procedure. Quick summary:

1. For each new paper meeting significance threshold (≥20 citations OR directly relevant): create/update `~/.auto-research-wiki/papers/<slug>.md`
2. For each key method: create/update `~/.auto-research-wiki/methods/<slug>.md`
3. Update the topic page for this research area: add to SOTA table, append newly identified gaps
4. Update `~/.auto-research-wiki/index.md` with any new or changed pages
5. Append to `~/.auto-research-wiki/log.md`:
   ```
   ## [YYYY-MM-DD] ingest | [project-slug]: Phase 1 round R
   - Papers added: N new | Updated: M pages
   - New gaps: [bullet list]
   - Follow-up queries seeded for next round: [list]
   ```

**Do NOT skip ingest** — it is what makes the wiki compound across projects.

**Wiki Ingest Self-Verification:** After ingest, run `tail -5 ~/.auto-research-wiki/log.md`. If the last `## [YYYY-MM-DD] ingest` entry doesn't match today's date and current project/round, retry once. If still missing after retry, log warning and continue (do not block).

If exit: proceed to Step 1.2.
If not exit: `round += 1`, repeat loop with updated `search_queries`.

**If paper_count == 0 after Round 1:**
All topic sub-agents found 0 papers — queries may be too narrow or platforms are unavailable.
Log: `"[HH:MM:SS] WARNING: 0 papers found in Round 1. Broadening queries."` → progress/ideation.log
Notify via Telegram (see shared/notifications.md): "Round 1 found 0 papers. Queries may be too narrow."
Broaden queries for Round 2: use more general topic names, remove domain-specific jargon.
Continue to Round 2 — do NOT stop.

#### Literature Review Document Format

Save to `plan/literature_review.md`:
```markdown
# Literature Review: [Topic]
## Papers Reviewed: N  (update after each round)
## Search Rounds Completed: R

## Round R Summary
- New papers: X | Total: Y
- Platforms searched: [list]
- Key gaps identified this round: [bullet points]
- Follow-up queries for next round: [list]

## Paper Table
| # | Title | Authors | Year | Venue | Relevance | Key Idea | URL |
|---|-------|---------|------|-------|-----------|----------|-----|
...

## Research Gaps (cumulative, updated each round)
- [gap 1]
- [gap 2]
...

## Search Queries Attempted (cumulative)
### Round 1
- [query 1]
- [query 2]
### Round 2
- [new query from brainstorm]
```
(Used by brainstorm agents to avoid re-suggesting already-tried queries)

### Step 1.2: Idea Generation

**Before generating ideas, query the wiki and local history:**

1. **Wiki query** (run Operations → Query from `shared/research-wiki.md`):
   - Read `~/.auto-research-wiki/index.md` + all relevant topic/method/lesson pages
   - Extract: unexploited gaps, global hard constraints, known baselines

2. **Local history** (read if exists):
   - `plan/idea_history.md` — archived ideas from THIS project
   - `lessons/round_*.md` — failure lessons from THIS project

Combine into a single constraint set:
```
Hard constraints (DO NOT propose):
  [from ~/.auto-research-wiki/lessons/ — cross-project]
  [from plan/idea_history.md + lessons/ — this project]

Fertile gaps (prioritize):
  [from wiki topic pages + this project's literature_review.md]
```

**Cross-Venue Prior Art Check** (run before scoring each candidate idea):
For each candidate, run one targeted search: `mcp__arxiv-mcp-server__search_papers` with query "[core mechanism name] [task name]". If ≥1 paper implements the same core mechanism for the same task, discard and note the specific prior work. Only ideas with no direct mechanism match proceed to scoring.
Additionally: if the primary venue is CV (CVPR/ICCV/ECCV), search ACL Anthology or EMNLP for structurally equivalent problems. If primary is NLP, check ICML/NeurIPS/CVPR proceedings.

Generate 3–5 research directions. Score each on:
- **Novelty** (1–5)
- **Feasibility** (1–5): can this be implemented with available resources?
- **Impact** (1–5): would this excite reviewers at the target venue?
- **Risk** (1–5, lower is better)
- **Differentiation** (pass/fail): must differ in core mechanism from ALL archived ideas. Also run a targeted arXiv search for the core mechanism name: `mcp__arxiv-mcp-server__search_papers` with "[mechanism name] [task]". If ≥1 paper directly implements the same mechanism on the same task, mark as FAIL_DIFFERENTIATION with the specific citation. Project history alone is not sufficient — check the literature.

**Feasibility score calibration**:
- 5 = runnable in <50 GPU-hours on available hardware, no new dataset needed
- 4 = <200 GPU-hours, standard datasets
- 3 = <500 GPU-hours, may need cluster access
- 2 = requires >500 GPU-hours or proprietary data
- 1 = requires pretraining from scratch or multi-machine distributed training

**Venue-weighted score** (read target venue from config/config.md):
- ICML/NeurIPS/ICLR: `(2×Novelty + Feasibility + Impact) - Risk`
- CVPR/ICCV/ECCV:    `(Novelty + Feasibility + 2×Impact) - Risk`
- ACL/EMNLP/NAACL:   `(Novelty + 2×Feasibility + Impact) - Risk`
- Default:           `(Novelty + Feasibility + Impact) - Risk`
Tie-break: prefer higher Novelty (or higher Feasibility for CVPR/ECCV).

Auto-select highest; log all scores to `plan/idea_summary.md`.

Update `plan/idea_history.md`: record selected idea as "Active Idea" with current round number.

### Step 1.3: Idea Debate

Run the 6-agent debate defined in `agents/idea_debate.md`.

Process:
1. Spawn all 6 reviewer agents in parallel
2. Synthesize into SWOT summary
3. Auto-incorporate suggestions raised by ≥2 agents
4. Re-run Contrarian, Empiricist, and (for ICML/NeurIPS/ICLR) Theorist to verify revisions address all Critical concerns
   - If all pass: proceed to AC
   - If any still flags a critical issue: escalate to AC directly with both the revision AND the remaining objection. AC arbitrates — do NOT loop these agents again.
5. AC Decision:
   - **ACCEPT (≥7/10)** → proceed to Step 1.4 (external Mode E review).
   - **WEAK_ACCEPT (score 5–6/10)** → Proceed to Step 1.4 (external Mode E review), but note in `plan/idea_brief.md`:
     "Internal AC: WEAK_ACCEPT — specific concerns: [list from AC debate]. Requires Pipeline Lead approval before Phase 2."
     Pipeline Lead will decide whether to accept (with user approval) or require more revision after Mode E.
   - **REVISE** → revise idea, re-run full debate (max 3 cycles)
   - **REJECT** → select next-highest scored direction from Step 1.2 list; re-run debate from Step 1.3 with the new direction. If all top-3 directions are exhausted (all REJECTED after max cycles), do NOT loop forever: notify-telegram "All top-3 idea directions rejected after debate. Generating new directions." then re-run Step 1.2 brainstorm with the existing literature + new constraints (must avoid rejected mechanisms). Max 2 re-generation rounds total. If still no accepted idea: escalate to user via telegram with a summary of what was tried and why it failed, then STOP and wait for user input.

Save full debate record + AC meta-review to `plan/idea_debate.md`.

Model: debate agents use Light tier (Sonnet). See `shared/models.md`.

### Step 1.4: External Idea Review (via Pipeline Lead → Reviewer Agent)

**Triggered by**: Internal AC ACCEPT from Step 1.3.

Write a concise idea brief to `plan/idea_brief.md`:
```markdown
# Idea Brief: [Title]

## Core Contribution (1 sentence)
[What novel thing does this do?]

## Key Mechanism
[2-3 sentences: algorithm/approach at a high level]

## Novelty Delta (vs. 3 closest papers)
| Paper | What we do differently |
|-------|----------------------|
| [Paper A] | [specific delta] |
| [Paper B] | [specific delta] |
| [Paper C] | [specific delta] |

## Expected Contributions
- **C1**: [most important]
- **C2**: [second contribution]
- **C3**: [if applicable]

## Anticipated Objections
- [Objection 1] → [sketch rebuttal]
- [Objection 2] → [sketch rebuttal]

## Target Venue & Bar
- Venue: [ICML/ICLR/NeurIPS/CVPR/...]
- Recent accepted papers with highest overlap: [2-3 paper titles + years]
- How this clears their bar: [1 sentence]

## Contrarian's Top Objection (verbatim from idea_debate.md)
[Copy the #1 ranked vulnerability from the Contrarian agent's report]

## Internal Debate Summary
- AC score: [X/10]
- Main concerns raised: [list from idea_debate.md]
- How addressed: [brief]
```

Then **send to Pipeline Lead via SendMessage**:
```
Idea ready for external review.
Topic: [idea title]
Core mechanism: [1 sentence]
Internal AC score: [X/10]
Files: plan/idea_brief.md, plan/idea_debate.md, plan/literature_review.md
Waiting for Mode E verdict before writing full proposal.
```

**Wait for Pipeline Lead to return Mode E verdict.** Do NOT write `plan/proposal.md` yet.

#### If Pipeline Lead sends Mode E STRONG_ACCEPT (score ≥ 7):
→ Proceed to Step 1.5 (Idea Refinement) and then Phase 2 (write full proposal).

#### If Pipeline Lead sends Mode E WEAK_ACCEPT or REVISE (score < 7):

Enter revision loop: read specific concerns, track `revision_cycle`. Address each required action:
- "Sharper framing only" → revise `plan/idea_brief.md` Core Contribution + Novelty Delta
- "Slight mechanism change" → revise + re-run Contrarian + Empiricist agents only; update `plan/idea_debate.md`
- "Fundamental rethinking" → redesign core mechanism (keep high-level motivation)

Update files, send to Pipeline Lead: `"Idea revised (cycle N). Score last round: [X/10]. Changes: [list]. Requesting re-review."` Repeat until STRONG_ACCEPT or stagnation.

**Stagnation exit** (triggered by Pipeline Lead when score delta < 1 for 2 consecutive rounds): treat as REJECT.

#### If Pipeline Lead sends Mode E REJECT or Stagnation notice:
1. Update `plan/idea_history.md`: archive current idea with REJECT/Stagnation status, reason, final score, and all revision cycles attempted
2. Write `lessons/round_N.md` with lessons: what mechanism was tried, why it couldn't reach venue bar, what the Reviewer said repeatedly
3. Select next-highest scored direction from Step 1.2 candidate list
4. If another candidate exists: re-run from Step 1.3 (internal debate) with the new direction
5. If all Step 1.2 candidates are exhausted: re-run Step 1.2 brainstorm with existing literature + new constraints (must avoid all rejected mechanisms and patterns from lessons)
6. After generating new candidates from Step 1.2: start fresh from Step 1.3 → Step 1.4 (external review loop) with each new candidate
7. If still no STRONG_ACCEPT after exhausting 2 full re-generation rounds: escalate to user via Telegram:
   ```
   ⚠️ Idea generation stalled for [project].
   Rounds attempted: [N]
   Ideas tried: [list with final scores]
   Repeated blocker: [most common rejection reason]
   Options: A) Try a fundamentally different sub-area, B) Broaden lit review (run Step 1.1 again), C) End project
   ```
   Wait for user decision before any action.

### Step 1.5: Idea Refinement

After External Mode E ACCEPT, crystallize to `plan/idea_summary.md`:
- 3 closest related papers and precise differences
- One-paragraph elevator pitch (seed for abstract)
- Expected contributions (3–5 bullet points)
- Anticipated reviewer objections + sketch rebuttals

Update `plan/idea_history.md` with AC score and ACCEPT status.

Commit + notify-telegram. See `shared/git-workflow.md` and `shared/notifications.md`.

**Before proceeding to Phase 2**, append to `progress/progress.md`:
```
[<timestamp>] Phase 1 complete. Idea: <title>. Internal AC: <score>/10. Mode E: STRONG_ACCEPT (or WEAK_ACCEPT + user approved). Proceeding to Phase 2 (write proposal).
```

---

**When Pipeline Lead sends "Mode E STRONG_ACCEPT..." (or "Mode E WEAK_ACCEPT..." with explicit user approval confirmation)**: Proceed to write full proposal (Phase 2). A bare WEAK_ACCEPT does NOT unlock Phase 2 — Pipeline Lead must explicitly include "User approved".

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

**proposal.md required template:**

```markdown
# Research Proposal: [Title]

## 1. Motivation & Problem Statement
[2-3 paragraphs: what problem, why hard, why now]

## 2. Related Work
[Key papers and their limitations; 1-2 paragraphs]

## 3. Proposed Method
### 3.1 Core Idea
[One paragraph: the key insight]

### 3.2 Algorithm
```
Algorithm 1: [Method Name]
Input: ...
Output: ...
1. ...
```

### 3.3 Theoretical Grounding
[Convergence bound or complexity analysis if applicable]

## 4. Experimental Plan
[Which datasets, baselines, metrics; 1 paragraph]

## 5. Novelty & Contributions
- **C1**: [Contribution 1 — most important]
- **C2**: [Contribution 2]
- **C3**: [Contribution 3 if applicable]

## 6. Venue Positioning
[Why this method fits [venue]. How it aligns with venue trends.]

## 7. References
[Key references used in this proposal — arXiv IDs or full citations]
```

**Required output: `plan/pilot_seed.md`** (structured handoff for Lab Agent — §1→hypothesis, §3→method, §5→dimensions, §4→baselines): (structured handoff for Lab Agent — write alongside proposal.md):
```markdown
# Pilot Seed (for Lab Agent)
## hypothesis
[1 sentence from §1 of proposal.md]
## Pilot Dimensions (from §5 contributions)
| Dim | Contribution | test_criteria (Measurable Test) | Success Criterion |
|-----|-------------|----------------------------------|-------------------|
| D1  | C1: ...     | Experiment: ...                  | Delta > X%        |
| D2  | C2: ...     | Experiment: ...                  | ...               |
## baseline
[dataset, baseline method, metric]
## compute_estimate
[GPU-hours range, from Pragmatist score]
```
Key fields (must all be present, names must match exactly for Lab Agent to parse):
- `hypothesis` — core testable claim (1 sentence)
- `test_criteria` — measurable experiment(s) per dimension
- `baseline` — dataset, baseline method, metric
- `compute_estimate` — GPU-hours range
Lab Agent reads `plan/pilot_seed.md` as the primary Phase 3 input (alongside `plan/proposal.md`) — it provides machine-readable pilot dimensions without requiring Lab Agent to re-parse the full proposal.

### Phase 2 Substeps

1. Write `plan/proposal.md` per template above
2. Update `plan/TODO.md`; append to `progress/progress.md`
3. `git add plan/ && git commit -m 'docs: research proposal (Phase 2)'` and push
4. Notify via Telegram (see `shared/notifications.md`)
5. Send to Pipeline Lead:
   ```
   Phase 1-2 complete. Proposal ready at plan/proposal.md.
   Top idea: [one-line summary]
   Score: Novelty=X Feasibility=X Impact=X Risk=X
   Mode E verdict: ACCEPT (already cleared in Step 1.4)
   Ready for Phase 3 (pilot design) — assign to Lab Agent.
   ```

Do NOT proceed to Phase 3 autonomously — Phase 3 belongs to the Lab Agent.

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

---

## Rollback Resume Mode

**Triggered when**: Pipeline Lead sends a SendMessage containing "Rollback: previous idea failed. New idea needed."

This is NOT a fresh start — it is a constrained restart from Phase 1 Step 1.2. Follow these rules:

### What to skip
- **Skip Phase 1 Step 1.1** (literature review) — `plan/literature_review.md` already exists and is comprehensive. Do NOT re-run lit search sub-agents.
- **Skip writing a new `plan/literature_review.md`** — append any critical new references found during idea generation, but do not re-structure the file.

### What to read first (mandatory before generating any idea)
0. Read `config/config.md` field `idea_round` — to know which round this rollback is.
   Report the round in your Phase 1-2 complete message: include "Current idea_round: N".
1. All files matching `lessons/round_*.md` — extract every "What to Avoid" constraint. These are **hard negative constraints**. Violation means immediate discard of the idea.
2. `plan/idea_history.md` — every archived idea's "Key Mechanism". Do NOT propose a mechanism that was already tried.
3. `experiments/results/pilot_failure_summary.md` (if exists) — read "Hard Constraints" and "What This Failure Suggests Might Work" sections.
4. `plan/literature_review.md` — review the existing research landscape for inspiration.
5. **Wiki ingest of failure** (before querying for new ideas):
   - Create `~/.auto-research-wiki/lessons/<YYYY-MM-DD>-<project>-round<N>.md` from `lessons/round_N.md`
   - Update relevant topic/method pages in the wiki with the negative result
   - Append to wiki `log.md`
6. **Wiki query** (Operations → Query from `shared/research-wiki.md`):
   - Read all `~/.auto-research-wiki/topics/<area>.md` — cross-project SOTA and gaps
   - Read all `~/.auto-research-wiki/lessons/` — global constraints (includes the one just ingested)
   - Synthesize unexploited gaps that avoid ALL global constraints

### Idea generation (Phase 1 Step 1.2 onward)
- Generate **3 candidate ideas** (not 1) — at least 2 must be mechanistically different from all archived ideas
- For each candidate: explicitly check against the hard constraints list; discard and regenerate if any constraint is violated
- Select the most promising candidate
- Continue with Step 1.3 (idea debate) → Step 2 (proposal) as normal

### Completion
When proposal is finalized and committed, send to Pipeline Lead via SendMessage:
```
Phase 1-2 complete. Proposal ready at plan/proposal.md.
Idea title: [title]
Core mechanism: [1 sentence]
How it avoids past failures: [1 sentence per constraint from lessons]
AC score from debate: [X/10]
```

Do NOT proceed to Phase 3 on your own — Pipeline Lead will dispatch Lab Agent for Phase 3.
