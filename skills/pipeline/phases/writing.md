# Phase 10–11: Writing & Internal Review

## Inputs
- `experiments/results/*.csv` — all final results
- `plan/result_debate.md` — narrative + limitations
- `plan/proposal.md` — method description
- `plan/literature_review.md` — related work
- `config/constraints.md` — writing rules
- `references/venue_requirements.md` — page limit, format, template

## Outputs
- `paper/main.tex`, `paper/figures/`, `paper/*.sty`
- `plan/simulated_peer_review.md`
- `plan/codex_review.md`
- `plan/rebuttal_prep.md`
- `plan/TODO.md`, `progress/progress.md`

---

## Phase 10: Paper Writing + Figures

**Entry gate** — verify before writing a single word:

```bash
grep -A3 "Human Approval Gate" plan/TODO.md
```

Expected output must show `[x]` (checked) on the "User explicitly said" line. If it shows `[ ]`, STOP — the user has not approved. Do not proceed until the user says "开始写" / "start writing" / "proceed" (or equivalent) in this conversation.

### 10.1: Refresh Venue Requirements

Before writing, fetch the latest requirements via web search (do NOT use memorized info — page limits change yearly):

1. Style file: `"[venue] [year] latex template"` → download `.sty`/`.cls` to `paper/`
2. Submission guidelines: page limit, anonymity, supplementary rules
3. Deadlines: `"[venue] [year] important dates"`
4. Review criteria: `"[venue] [year] reviewer guidelines"`

Update `references/venue_requirements.md`. Read `config/constraints.md`.

**Venue characteristics (stable):**
- NeurIPS: values theory + empirical equally; appreciates honest limitations
- ICML: more theory-oriented; formal analysis and appendix proofs expected
- ICLR: open review — rebuttals are public; high value on reproducibility + code
- CVPR/ECCV: strong visual/qualitative results; side-by-side figures; ImageNet/COCO expected
- ACL: error analysis expected; human evaluation for generation tasks
- AAAI: broader scope; tighter page limits; ethical statement may be required

### 10.2: Figure Design

Use seaborn + matplotlib. Standard setup:

```python
import seaborn as sns
import matplotlib.pyplot as plt
import matplotlib

sns.set_theme(style="whitegrid", font_scale=1.2)
matplotlib.rcParams.update({
    'font.family': 'serif',
    'font.serif': ['Times New Roman', 'DejaVu Serif'],
    'font.size': 12,
    'axes.labelsize': 14,
    'figure.dpi': 300,
    'savefig.dpi': 300,
    'savefig.bbox': 'tight',
})
```

Guidelines:
- Consistent color palette across all figures: `sns.color_palette("Set2")`
- Always label axes with units; use LaTeX notation for math symbols
- Save as both PDF (LaTeX) and PNG (preview): `paper/figures/`
- Single column = 3.25 inches, double column = 6.75 inches

### 10.3: Writing Rules

**Structure:**
- Abstract: ONE paragraph, no line breaks, 150–250 words. Structure: problem → gap → method (1 sentence) → key results (real numbers) → significance
- Introduction: ends with bulleted contribution list
- Related Work: organized by theme, not chronologically; each paragraph ends by contrasting with your method
- Method: starts with problem setting + notation; use `\paragraph{}` liberally; include algorithm box
- Experiments: setup paragraph, then one subsection per experiment; every table/figure referenced in text
- Conclusion: short (0.5–1 page); summarize actual contributions; acknowledge real limitations

**Language conventions:**
- `\citet` for "Author (Year)" in text; `\citep` for "(Author, Year)" parenthetical
- Figures/tables at top of page (`[t]`)
- Present tense for method; past tense for experiments; present tense for established facts
- Tables: use `booktabs` (`\toprule`, `\midrule`, `\bottomrule`); no vertical lines; bold best result per column
- Never: start sentence with math symbol or citation; use "significantly" without a test; use "state-of-the-art" without a table

### 10.4: Write the Paper

Use subagents in parallel. Each subagent writes to its OWN file — do NOT have multiple subagents write to `paper/main.tex` simultaneously:

| Subagent | Output file | Source |
|----------|-------------|--------|
| Subagent 1 | `paper/sections/experiments.tex` | CSVs + analysis |
| Subagent 2 | `paper/figures/*.pdf` + `paper/scripts/fig_*.py` | Result CSVs |
| Subagent 3 | `paper/sections/intro_related_method.tex` | proposal.md + literature_review.md |
| Main agent | `paper/main.tex` | Integrates all three + writes Abstract + Conclusion |

**Merge protocol** (main agent, after all subagents complete):
1. Read `experiments.tex` → paste into `\section{Experiments}` in `main.tex`
2. Read `intro_related_method.tex` → paste into corresponding sections
3. Write Abstract + Conclusion directly in `main.tex`
4. Add `\input{sections/*.tex}` or paste inline — do NOT use `\include` (avoids page breaks)
5. Verify no `\TODO` or placeholder text remains before proceeding to 10.5

All results must come from actual CSVs — no placeholders.

**Subagent 2 — figure generation details:**
- Write reproducible Python scripts to `paper/scripts/fig_<name>.py` (one script per figure)
- Each script reads directly from `experiments/results/all_results.csv` or a specific result CSV — NO hardcoded numbers
- Save outputs to `paper/figures/<name>.pdf` (for LaTeX) and `paper/figures/<name>.png` (for preview)
- Apply the standard seaborn style from Phase 10.2
- Naming convention: `fig_main_results.py`, `fig_ablation.py`, `fig_qualitative.py`, etc.
- Run all scripts to generate figures before handing off to main agent:
  ```bash
  for f in paper/scripts/fig_*.py; do uv run python "$f"; done
  ```
- If results change later (e.g., after rebuttal experiments), just re-run the scripts — do NOT manually edit the PDFs

### 10.5: Compile

```bash
cd paper
pdflatex main.tex 2>&1 | tee /tmp/compile1.log
bibtex main 2>&1 | tee /tmp/bibtex.log
pdflatex main.tex 2>&1 | tee /tmp/compile2.log
pdflatex main.tex 2>&1 | tee /tmp/compile3.log
# Check for errors
grep -i "^!" /tmp/compile3.log || echo "No errors in final pass."
grep -i "Warning" /tmp/compile3.log | grep -v "hyperref" || true
```

Read `/tmp/compile3.log` if errors appear. Fix all errors before proceeding. Commit + notify-telegram with dashboard URL.

---

## Phase 11: Internal Review & Polish

### 11.0: Paper Integrity Check

`paper_integrity.py` lives at `~/research_tools/paper_integrity.py`. Check it exists first:

```bash
ls ~/research_tools/paper_integrity.py || echo "NOT FOUND — see fallback below"
```

**If found**, run:
```bash
python3 ~/research_tools/paper_integrity.py \
  --paper paper/main.tex \
  --results experiments/results/
```

What it checks: every number in `paper/main.tex` against `experiments/results/all_results.csv`; every `\cite{}` key against the `.bib` file. Outputs `NOT IN BIB` for missing citations and `UNVERIFIED NUMBER` for numbers not traceable to results.

**If NOT found** (tool not installed), perform these manual checks instead. **This is a mandatory PAUSE** — complete all checks and resolve every issue before proceeding to Phase 11.1. Do NOT auto-continue.

1. **Citation check**: `grep -oE '\\cite[a-z*]*\{[^}]+\}' paper/main.tex | sort -u` — this captures `\cite{}`, `\citet{}`, `\citep{}`, `\cite*{}` variants. Then verify each key exists in the `.bib` file and resolves to a real paper (check via arXiv MCP or Semantic Scholar MCP).
2. **Number traceability**: For every numeric claim in abstract and main results tables, confirm it appears in `experiments/results/all_results.csv` with matching method/dataset/metric
3. Log results in `plan/integrity_issues.md` using this template:

```markdown
# Integrity Issues: [Paper Title]

| # | Type | Item | Source | Status | Resolution |
|---|------|------|--------|--------|------------|
| 1 | Citation | \cite{Smith2023} | abstract p1 | ✅ verified | doi:10.xxxx |
| 2 | Number | "84.3%" | Table 1 row 3 | ✅ verified | all_results.csv row 47 |
| 3 | Citation | \cite{Unknown2024} | related work | ❌ not found | — |
```

Status values: `✅ verified` / `⚠️ partial` / `❌ not found`

**Do NOT proceed to Phase 12 (submission) if any row has Status ≠ `✅ verified`.** For `❌ not found` citations: remove from paper or replace with a real citation found via arXiv MCP search.

For any `NOT IN BIB` citations (either path): verify via arXiv MCP or official venue proceedings. Do not proceed until integrity check passes.

### 11.1: Self-Review Checklist

**Content:**
- [ ] Abstract is ONE paragraph, 150–250 words
- [ ] Introduction ends with contribution list
- [ ] Every contribution backed by experiments
- [ ] Every table/figure referenced and discussed in text
- [ ] No claims without evidence
- [ ] Limitations section is honest and specific

**Formatting:**
- [ ] Within page limit (check venue_requirements.md)
- [ ] No orphan/widow lines
- [ ] All figures readable at column width
- [ ] Tables use booktabs, best results bolded
- [ ] References consistent and complete

**Technical:**
- [ ] All error bars / confidence intervals present
- [ ] Statistical significance noted where claimed
- [ ] Hyperparameters fully specified
- [ ] Algorithm pseudocode matches implementation

### 11.2: Simulated Peer Review (6 agents)

**Model tier**: All 6 reviewers and AC use Light tier (Sonnet). See `shared/models.md`.

Spawn in parallel. Each reads `paper/main.tex` + `references/review_criteria.md`.

| Agent | Archetype |
|-------|-----------|
| Methodologist | Scrutinizes theoretical soundness, proof correctness |
| Empiricist | Scrutinizes experiments, baselines, statistical significance |
| Related Work Detective | Hunts missing citations, overclaimed novelty |
| Presentation Critic | Writing quality, figure clarity, pedagogy |
| Devil's Advocate | Finds the single most damaging flaw |
| Champion | Makes strongest case for acceptance |

Each produces: Summary + Strengths + Weaknesses + Questions + Score per venue dimension + Recommendation.

**If any agent fails to respond**: AC proceeds with 5 reports and notes the missing reviewer. Do NOT block — a partial review is better than no review.

Then spawn **Area Chair (AC)** agent: reads all 6 reports (or however many returned), identifies consensus strengths/weaknesses, adjudicates disagreements, computes aggregated score, recommends accept/revise/reject.

Save to `plan/simulated_peer_review.md`. See `agents/peer_review.md` for full agent prompts.

**AC decision handling** (mandatory — do NOT skip):

| AC Decision | Action |
|-------------|--------|
| Strong Accept / Accept | Fix revision requirements → proceed to 11.3 |
| Weak Accept / Borderline | Fix all critical issues → re-run Methodologist + Empiricist only → if both pass, proceed to 11.3. **Max 1 re-run cycle**: if Methodologist or Empiricist still reject after the single re-run, escalate to AC one more time; if AC gives Weak Accept again, treat as Accept and proceed. Do NOT loop indefinitely. |
| Reject — weak results (avg score < 5.5 OR Skeptic/Empiricist give Fatal) | **Stop writing. Notify user + telegram. Wait for confirmation. Then return to Phase 9.** |
| Reject — presentation/framing issue (avg score ≥ 5.5 but Reject from Presentation Critic / Related Work Detective) | Fix writing issues → re-run full peer review (back to 11.2) |

**Do NOT proceed to 11.3 if AC gives Reject due to weak results.** Rewriting cannot compensate for insufficient empirical evidence.

**Note on Phase 9 GO vs. Phase 11 Reject**: These are not contradictory. Phase 9 GO means results clear the *statistical minimum* (p < 0.05 vs. best baseline, ≥2 datasets). Phase 11 peer review applies the *venue-specific acceptance bar* — reviewers may find the margin too small, baselines missing, or generalization insufficient for the target venue. A Phase 11 Reject due to weak results means the bar is higher than the minimum. Do not interpret this as a pipeline error.

**When AC Rejects due to weak results**, notify the user before rolling back:

```
⚠️ Simulated peer review rejected paper due to weak results.

Venue: [venue]
AC score: [X]/10 (threshold: 5.5)
Key issues:
  - [Empiricist/Skeptic finding 1]
  - [Empiricist/Skeptic finding 2]

Phase 9 passed the statistical minimum, but this venue requires a stronger margin.
Options:
  A) Run additional experiments (reply "run more" — returns to Phase 9)
  B) Target a lower-tier venue (reply "lower venue: [venue name]")
  C) Rollback to method iteration Phase 5 (reply "rollback")

Waiting for your decision.
```

**STOP. End your response here.** Do not write another word, run another tool, or take any action until the user explicitly responds to this telegram message. This is a hard blocking gate — if you are resuming from a new conversation, check `plan/TODO.md` for a "Phase 11 AC Decision" entry; if it shows the user's choice, take the corresponding action below.

**User response handling:**

| User says | Action |
|-----------|--------|
| "run more" / "加实验" | Ask user: "Which experiments should I add? (e.g., more baselines, more datasets, more ablations)" → design the specific experiments → add to `dispatch/state.json` with `phase: "Phase 8 extra"` → run Phase 8.4–8.5 again for new experiments → merge new results into `all_results.csv` → re-run Phase 9 analysis (result debate + go/no-go) → if GO again → re-run Phase 11 peer review |
| "lower venue: [name]" | Update `config/config.md` venue field and `references/venue_requirements.md` → re-run Phase 11 peer review with the new venue's criteria → if AC accepts, continue to Phase 11.3 |
| "rollback" | Archive current paper draft to `paper/archived/` → return to Phase 5 method iteration with a new direction → do NOT delete existing results (they may inform next iteration) |

### 11.3: Codex Cross-Review

Send full paper to Codex (GPT via MCP) for independent review. Different model family catches different blind spots. Save to `plan/codex_review.md`.

### 11.4: Address Issues + Rebuttal Prep

Fix all issues identified in 11.1–11.3. For issues that can't be fixed (e.g., need more compute), write rebuttal notes in `plan/rebuttal_prep.md`.

Commit + notify-telegram: "Pipeline FINISHED — paper ready for submission."

---

## Phase 12: Post-Submission Review

**Entry gate**: The pipeline enters Phase 12 when the user sends a message indicating reviews have arrived (e.g., "reviews are out", "received reviews", pasting review text). Until then, the pipeline is idle — do NOT poll or auto-start Phase 12.

**Immediate on submission (Phase 11 complete → Phase 12.1):**
- Tag the submitted version: `git tag submission/<venue>-<year> && git push origin --tags`
- Mark `plan/TODO.md` Phase 12 block as started
- Then enter idle state — no autonomous work until user provides reviews

**When user provides reviews → Phase 12.2+**: Proceed autonomously from 12.2 onward.

### 12.1: While Waiting

Between submission and reviews (~2–3 months), do NOT idle. Prepare:
- Read `plan/rebuttal_prep.md` (written in Phase 11) — refresh memory on known weaknesses
- Archive the submitted version: `git tag submission/<venue>-<year>` and push
- Note the decision date from `references/venue_requirements.md`

### 12.2: Read and Triage Reviews

When reviews arrive:

1. Read all reviews fully before reacting. Do NOT draft responses yet.
2. Save raw reviews to `plan/reviews_raw.md` (copy-paste from submission portal)
3. Categorize every concern:

```markdown
# Review Triage: [Paper Title]

## Reviewer 1 (score: X/Y)
| #  | Concern | Type | Priority | Addressable? |
|----|---------|------|----------|-------------|
| R1.1 | [quoted or paraphrased] | [factual error / missing exp / misunderstanding / valid weakness] | [critical / major / minor] | [yes / partially / no] |

## Reviewer 2 (score: X/Y)
...

## Consensus Issues (raised by ≥2 reviewers)
- [issue] — must address

## Borderline Issues (1 reviewer, critical)
- [issue] — should address

## Minor Issues (style, typos, clarifications)
- [issue] — address in camera-ready
```

Save to `plan/review_triage.md`.

### 12.3: Hallucination Reference Check

Before writing the rebuttal, verify that any new citations you plan to add (or existing citations reviewers questioned) are real.

**Step 12.3.1 — Automated: Semantic Scholar**

For each citation key that reviewers questioned OR that you plan to add in the rebuttal:

**Option A — Semantic Scholar MCP (preferred)**:
```
Search Semantic Scholar MCP: query = "<title> <first author>"
Compare: title, authors, year, venue against your .bib entry
Flag if: title differs by >3 words, year ±2, venue mismatch
```

**Option B — WebSearch fallback** (use if Semantic Scholar MCP is unavailable or returns no results):
```
WebSearch query: '"<paper title>" "<first author>" site:semanticscholar.org'
If no result: '"<paper title>" "<first author>" filetype:pdf'
Compare returned metadata against .bib entry
```

If neither MCP nor WebSearch returns a match, flag the citation as ❌ not found in the hallucination check log.

**Action on ❌ not found**: Do NOT include the citation in the rebuttal. Either (a) remove the reference from the planned rebuttal response, or (b) find a verified substitute via arXiv MCP search. Never submit a rebuttal with an unverified citation — reviewers will notice fabricated references and it will damage credibility.

Report per citation: ✅ verified / ⚠️ discrepancy found / ❌ not found

Save to `plan/hallucination_check.md`.

**Step 12.3.2 — Manual: bib-checker Chrome extension (user action)**

After Step 12.3.1, notify user:

> "Automated Semantic Scholar check complete — results in `plan/hallucination_check.md`. Please run the `~/bib-checker/` Chrome extension on Google Scholar to verify the flagged entries before I write the rebuttal."

**Wait for user confirmation** before proceeding to Step 12.4. This is the only mandatory pause in Phase 12.

### 12.4: Plan Rebuttals and Additional Experiments

For each critical/major concern, decide response type:

| Response Type | When to use |
|-------------|-------------|
| **Text clarification** | Misunderstanding or already in paper but not noticed |
| **New experiment** | Reviewer requests missing baseline, ablation, or analysis |
| **Concede + mitigate** | Valid weakness; acknowledge, explain scope limitation |
| **Reject (politely)** | Out of scope, infeasible within rebuttal period, wrong assumption |

For new experiments, assess compute feasibility vs. rebuttal deadline (typically 1–2 weeks). Prioritize experiments that address ≥2 reviewers at once.

Add rebuttal experiments to `dispatch/state.json` (same format as Phase 8 — supervisor handles them). Tag: `["rebuttal", "<venue>-<year>"]`.

Save plan to `plan/rebuttal_plan.md`.

### 12.5: Run Rebuttal Experiments

**Feasibility check before queuing:** For each proposed rebuttal experiment:
1. Estimate compute cost (GPU hours)
2. Estimate time to completion: hours / available GPUs
3. If time to completion > (rebuttal deadline − 2 days): flag as risky
   - Ask user: "Experiment [X] may not finish in time. Options: (A) queue anyway, (B) skip and address in text only, (C) reduce scope (fewer seeds / smaller dataset)."
   - Wait for response before queuing. Only queue experiments expected to finish in time.

Same launch process as Phase 8:
1. Create log at `experiments/logs/<exp_id>_rebuttal.md` before launching
2. Git tag: `git tag exp/<project>/rebuttal-$(date +%Y%m%d-%H%M) && git push origin --tags`
3. Append `status: "pending"` to `dispatch/state.json`
4. After completion: save results to `experiments/results/<exp_id>_rebuttal.csv`

**After all rebuttal experiments complete — merge and verify:**
1. Append all `<exp_id>_rebuttal.csv` rows into `experiments/results/all_results.csv`
2. Check if the new results change the narrative:
   - Do new experiments flip any ablation from FAIL to PASS?
   - Do new baselines now tie or beat our method on any dataset?
   - Do new analysis experiments reveal weaknesses not in the original paper?
3. **"Significantly changed" definition**: the narrative has significantly changed if ANY of these hold: (a) a previously-passing dataset now shows our method losing to the best baseline; (b) a new baseline beats our method by ≥1% on the primary metric; (c) a rebuttal ablation contradicts the core claimed contribution. Minor changes (e.g., ±0.5% fluctuation, cosmetic ablations) do NOT count. When in doubt, err toward re-running Phase 9.
4. If narrative changes significantly → re-run Phase 9 (Result Debate + Go/No-Go). If Phase 9 now says NO-GO, STOP and notify user before writing rebuttal.
4. If narrative is consistent → proceed to Phase 12.6.

Do NOT alter the submitted paper during this phase — changes go into the rebuttal text only.

### 12.6: Write the Rebuttal

Structure:

```markdown
# Rebuttal: [Paper Title]

**Venue**: [venue + year]
**Submitted**: [date]
**Reviews received**: [date]

---

## Summary Response

[2–3 sentences: thank reviewers, acknowledge main concerns, state that experiments confirm/address them]

---

## Response to Reviewer 1 (score: X/Y)

### R1.1: [Quoted concern title]

> "[Reviewer's exact quote]"

[Response: clarification / new result / concession]

If new experiment: "We ran [exp] and found [result] (wandb: [URL], log: experiments/logs/[id]_rebuttal.md)"

### R1.2: ...

---

## Response to Reviewer 2

...

---

## Response to Reviewer 3

...

---

## Summary of Changes (if accepted)

- [Change 1]: addressing R1.1, R2.3
- [Change 2]: ...
```

**Rules:**
- Never claim a result without a citation to wandb run or CSV file
- Never promise a change you won't make in camera-ready
- Address every critical/major concern — silence is treated as concession
- Keep tone factual and non-defensive

Save to `plan/rebuttal_final.md`.

### 12.7: Camera-Ready (after acceptance)

1. Apply all promised changes from rebuttal
2. Address minor reviewer comments (typos, clarifications)
3. Run paper integrity check again:
   ```bash
   python3 ~/research_tools/paper_integrity.py --paper paper/main.tex --results experiments/results/
   ```
4. Re-run compile:
   ```bash
   cd paper && pdflatex main.tex && bibtex main && pdflatex main.tex && pdflatex main.tex
   ```
5. Check camera-ready requirements from venue (page limit may differ, copyright form)
6. Commit: `git tag camera-ready/<venue>-<year>` and push
7. Notify-telegram: "🎉 Camera-ready submitted to [venue]."
