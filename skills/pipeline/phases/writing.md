# Phase 10–11: Writing & Internal Review

> **Entry gate**: Only enter this phase if `config/config.md` has `mode: paper`.
> ```bash
> grep "^mode:" config/config.md
> ```
> If `mode: research-only` → do NOT enter Phase 10. Proceed to Phase 9.5 (`phases/report.md`) instead.
> If `mode: paper` → proceed normally.

## Inputs
- `experiments/results/*.csv` — all final results
- `plan/result_debate.md` — narrative + limitations
- `plan/proposal.md` — method description
- `plan/literature_review.md` — related work
- `config/constraints.md` — writing rules
- `references/venue_requirements.md` — page limit, format, template
- `references/review_criteria.md` — venue reviewer guidelines (used by Phase 11 internal reviewers)

## Outputs
- `paper/main.tex`, `paper/figures/`, `paper/*.sty`
- `plan/simulated_peer_review.md`
- `plan/codex_review.md`
- `plan/rebuttal_prep.md`
- `plan/TODO.md`, `progress/progress.md`

---

## Phase 10: Paper Writing + Figures

Update `progress/team_state.json` at Phase 10 entry:
```json
{"current_phase": 10, "last_directive": "Phase 10 writing started"}
```

Before starting paper writing, copy figures from analysis output:
```bash
mkdir -p paper/figures/
cp experiments/results/figures/*.{pdf,png} paper/figures/ 2>/dev/null || true
# Note: figures from Phase 9 are the source of truth in experiments/results/figures/
# paper/figures/ is the working copy for LaTeX compilation
```

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
- ICLR: double-blind review (uses OpenReview — check current year's call for papers for blind/non-blind policy). High value on reproducibility + code
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
- Abstract: ONE paragraph, no line breaks, 150–250 words. Formula: `problem → gap → method (1 sentence, name the key mechanism) → results (metric, dataset, gain over named best baseline, e.g. "+2.1 pp over [Method] on [Benchmark]") → scope/implication (1 sentence: what kind of tasks/settings this matters for, NOT "we hope this helps")`. Write last, after all sections exist.
- Introduction: ends with bulleted contribution list.
  **Contribution bullet format** — each bullet must contain: (a) action verb (Propose/Introduce/Show/Prove), (b) specific technical contribution, (c) measurable or qualitative claim. Example: "We introduce [Method], a [mechanism type] that improves [metric] by [delta] over [baseline type] on [benchmark class]."
  **Banned bullets**: "We conduct experiments", "We show SOTA", "We achieve state-of-the-art results" as standalone bullets — these are process descriptions, not contributions.
- Related Work: organized by theme, not chronologically; each paragraph ends by contrasting with your method
- Method: starts with problem setting + notation; use `\paragraph{}` liberally; include algorithm box
- Experiments: setup paragraph, then one subsection per experiment; every table/figure referenced in text
- Conclusion: short (0.5–1 page); summarize actual contributions; acknowledge real limitations
- Limitations: 0.5–1 paragraph after Conclusion or as a subsection. List specific failure modes, scope restrictions, compute requirements. Do NOT replace with "future work". NeurIPS/ICLR expect this section.
- Broader Impact / Ethics Statement: required for NeurIPS (mandatory checklist, does NOT count toward page limit); check CFP for ICML/ICLR/AAAI. Write after Conclusion or Limitations.
- Appendix: proof details, extended ablations, hyperparameter sensitivity, qualitative examples, dataset details. Supplementary page limits: CVPR counts supplementary toward a separate 14-page limit.

**Language conventions:**
- `\citet` for "Author (Year)" in text; `\citep` for "(Author, Year)" parenthetical
- Figures/tables at top of page (`[t]`)
- Present tense for method; past tense for experiments; present tense for established facts
- Tables: use `booktabs` (`\toprule`, `\midrule`, `\bottomrule`); no vertical lines
  - Bold best result per column; underline second-best per column
  - Every numeric cell must include ± std if ≥2 seeds were run; if only 1 seed, add a table footnote: "†single seed"
  - All cell values must come from all_results.csv (no manual numbers)
- Claims of "consistent", "robust", "universal", or "general" require ≥80% of evaluated conditions (dataset × metric) where method wins; otherwise use "often" or "typically"
- Never: start sentence with math symbol or citation; use "significantly" without a test; use "state-of-the-art" without a table
- When claiming statistical significance, report the test inline: "(p < 0.05, paired t-test, N=3 seeds)" immediately after the claim sentence or in the table caption. Do not defer to the setup paragraph.

### 10.3.5: Construct references.bib

Before spawning writing subagents, construct `paper/references.bib`:
1. Extract all citations from `plan/proposal.md` and `plan/literature_review.md`
2. For each unique paper, fetch BibTeX entry via WebFetch from:
   - arXiv: `https://arxiv.org/abs/<ID>` (click Export Citation → BibTeX)
   - OR use mcp__arxiv-mcp-server__search_papers to get paper info
   - OR Google Scholar → Cite → BibTeX
3. Save all entries to `paper/references.bib`
4. Check for duplicate keys: ensure each @article/@inproceedings has a unique key

### 10.4: Write the Paper

**Step 10.4.0: Verify claims are supported by results**
Before writing, verify each contribution claim from plan/proposal.md has supporting evidence:
- Read plan/proposal.md §5 (Novelty & Contributions) — extract C1, C2, C3
- Check experiments/results/all_results.csv — for each claim, does our method show ≥1% improvement over best baseline on ≥2 datasets, OR demonstrate a novel capability not shown by baselines?
- If any claim fails both criteria: STOP — inform user of missing evidence. User must either:
  - A) Return to Phase 8 to run additional experiments supporting the claim, OR
  - B) Revise proposal.md to remove or weaken the unsupported claim
- Do NOT auto-continue until all claims are covered by evidence

Use subagents in parallel. Each subagent writes to its OWN file — do NOT have multiple subagents write to `paper/main.tex` simultaneously:

| Subagent | Output file | Source | Model |
|----------|-------------|--------|-------|
| Subagent 1 | `paper/sections/experiments.tex` | CSVs + analysis | **Sonnet (claude-sonnet-4-6)** |
| Subagent 2 | `paper/figures/*.pdf` + `paper/scripts/fig_*.py` | Result CSVs | **Sonnet (claude-sonnet-4-6)** |
| Subagent 3 | `paper/sections/intro_related_method.tex` | proposal.md + literature_review.md | **Sonnet (claude-sonnet-4-6)** |
| Main agent | `paper/main.tex` | Integrates all three + writes Abstract + Conclusion | — |

**Subagent 1 — experiments section details:**

**Mode G annotation** — each table must include a LaTeX comment before `\begin{table}`:
`% MODE_G: exp_ids=[exp1,exp2] methods=[MethodA,MethodB,Ours] metric=accuracy`
Column headers must use the exact `method` string from `all_results.csv`, OR include a mapping comment:
`% METHOD_MAP: Ours=<method_name_in_csv>`
This enables Mode G consistency check to cross-reference without guessing.

**Merge protocol** (main agent, after all subagents complete):
1. Read `experiments.tex` → paste into `\section{Experiments}` in `main.tex`
2. Read `intro_related_method.tex` → paste into corresponding sections
3. Write Conclusion directly in `main.tex`
4. Add each section individually in `main.tex` — do NOT use `\include` (avoids page breaks) and do NOT use wildcards (`\input{sections/*.tex}` is NOT valid LaTeX). Use:
   ```latex
   \input{sections/introduction}
   \input{sections/related_work}
   \input{sections/method}
   \input{sections/experiments}
   \input{sections/conclusion}
   ```
5. Verify no `\TODO` or placeholder text remains before proceeding to 10.5
6. **Abstract is written LAST** — after all three subagents complete and their sections are merged into main.tex. Write Abstract only after reading the complete paper sections to ensure accuracy.

All results must come from actual CSVs — no placeholders.

**Subagent 2 — figure generation details:**

Subagent 2 generates only figures that can be produced directly from CSV data. It does NOT create `fig_method.pdf` — see Subagent 3 for that.

**Required figures for a complete ML paper (produce all applicable):**
1. `fig_main_results.pdf` — main results comparison across datasets/methods (REQUIRED)
2. `fig_ablation.pdf` — ablation bar chart, one panel per component (REQUIRED if ablations exist)
3. `fig_qualitative.pdf` — qualitative examples, failure cases, or t-SNE (REQUIRED for vision/NLP)
4. `fig_efficiency.pdf` — FLOPs/runtime vs accuracy trade-off (REQUIRED only if efficiency is claimed)
Missing a required figure is a Phase 11 self-review failure.

**Mandatory figures** (every paper must include at least 1–3):
1. **Main results figure** (bar chart or line plot) — visual summary of Table 1 or the primary metric across datasets. Required if the main results have ≥3 methods × ≥2 datasets.
2. **Ablation figure** — if ablation study has ≥3 components, visualize the contribution of each.
3. **Qualitative figure** (optional but strongly recommended for vision papers) — shows input/output pairs or failure cases.
4. **Learning curves** (required if training dynamics are claimed as a contribution).

**Negative results rule**: If any dataset or metric shows our method losing to a baseline, include a figure panel or table note making this visible — do NOT relegate losing results to the appendix without a main-text mention.

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
- Include figures in LaTeX: `\begin{figure}[t]\centering\includegraphics[width=\columnwidth]{figures/fig_name.pdf}\caption{Caption.}\label{fig:name}\end{figure}`

**Subagent 3 — intro/related work/method details + method figure:**
- Source: `plan/proposal.md` (method) + `plan/literature_review.md` (related work)
- **`fig_method.pdf`**: Method overview figure — draw from `plan/proposal.md` understanding using TikZ or matplotlib. This is NOT generated from CSV data and must be created based on the proposed method's architecture/algorithm. Save to `paper/figures/fig_method.pdf`. This figure is REQUIRED at all venues and must exist before Phase 11.1 checklist.
- **Plagiarism prevention**: Do NOT copy sentences verbatim from `plan/literature_review.md` into the Related Work section. Paraphrase with original vocabulary. Every claim about a prior work must include `\cite{key}`.
- After writing Related Work, extract all paper keys from `plan/literature_review.md` and verify each appears at least once as `\cite{}` in the Related Work section. Any missing key must be added. Log verified count as: "[N/M] literature_review papers cited in Related Work section."

### 10.5: Compile

```bash
mkdir -p paper/compile_logs
cd paper
pdflatex main.tex 2>&1 | tee compile_logs/compile1.log
bibtex main 2>&1 | tee compile_logs/bibtex.log
pdflatex main.tex 2>&1 | tee compile_logs/compile2.log
pdflatex main.tex 2>&1 | tee compile_logs/compile3.log
# Check for errors
grep -i "^!" compile_logs/compile3.log || echo "No errors in final pass."
grep -i "Warning" compile_logs/compile3.log | grep -v "hyperref" || true
grep -i "^!" compile_logs/bibtex.log || echo "No bibtex errors."
```

Read `paper/compile_logs/compile3.log` if errors appear. Fix all errors before proceeding.

After successful compilation, check page count:
```bash
pdfinfo paper/main.pdf | grep Pages
```
Check venue page limit from `references/venue_requirements.md` (populated in §10.1 web search). Do NOT use memorized values — page limits change yearly.
If page count > limit, STOP — do not proceed to Phase 11.
Fix page limit then re-verify:
1. Shorten or move content: trim verbose sections, move theorem proofs/ablations/hyperparameter details to appendix
2. Re-compile: `cd paper && pdflatex main.tex && bibtex main && pdflatex main.tex && pdflatex main.tex 2>&1 | tee compile_logs/compile_fix.log`
3. Re-check: `pdfinfo paper/main.pdf | grep Pages` — must be ≤ venue limit
4. Repeat until within limit (max 5 trimming iterations), then proceed to Phase 11.0

**If page limit is unachievable after 5 iterations**: Stop. Notify user via telegram: "Page limit unachievable after 5 trim attempts. Options: (A) Target longer-page venue (reply 'change venue: [name]'), (B) Move method details to supplementary only (reply 'supplementary'), (C) Cut a full ablation section (reply 'cut ablation: [section]'). Waiting for your decision." Then STOP and wait.

**Appendix/Supplementary Material** (if needed to stay within page limits):
Move to appendix: theorem proofs, extended ablations, hyperparameter details, additional figures
Keep in main paper: core method, primary results, ablations that directly support claims
Note: NeurIPS/ICML/ICLR appendix does NOT count toward page limit. CVPR: check yearly CFP.

Commit + notify-telegram with dashboard URL.

---

## Phase 11: Internal Review & Polish

Update `progress/team_state.json` at Phase 11 entry (after paper compiles successfully):
```json
{"current_phase": 11, "last_directive": "Phase 11 internal review started"}
```

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

**After running paper_integrity.py**, additionally run the artifact completeness check:
```python
import pandas as pd
df = pd.read_csv("experiments/results/all_results.csv")
# Check that all required columns are present and results are complete
missing_results = df[df["value"].isna()]
if not missing_results.empty:
    print("❌ ARTIFACT GAP: the following rows have missing result values:")
    print(missing_results[["exp_id","method","dataset","metric","value"]].to_string())
    print("These numbers CANNOT be reproduced if asked. Fix before submission.")
else:
    print(f"✅ Result completeness check passed: all {len(df)} rows have values.")
```
Note: `all_results.csv` does not contain a `wandb_artifact` column — verify wandb artifacts exist manually by checking the wandb dashboard for each `exp_id` before submission. Do NOT proceed to Phase 12 (submission) if wandb runs are missing for any paper-reported result.

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

**Figure data verification** (mandatory before 11.1):
For each figure in `paper/figures/`:
1. Identify which script generated it (check `paper/scripts/fig_*.py`)
2. Verify the script reads from `experiments/results/all_results.csv` (not a hardcoded subset)
3. Spot-check: for main results figures, confirm the displayed values match `all_results.csv` for the top-1 and bottom-1 rows
4. If any figure uses hardcoded values or a different data source: flag for regeneration

If a figure cannot be traced to all_results.csv, regenerate it from the correct data before proceeding.

**Mode G Consistency Check** (MANDATORY before self-review):
Send to Reviewer Agent via SendMessage: "Run Mode G consistency check. Project: [path]. Paper: paper/main.tex. Results: experiments/results/all_results.csv. Save to progress/consistency_check.md"
Wait for CONSISTENCY_PASS before proceeding to self-review checklist.
If CONSISTENCY_FAIL: fix all BLOCKING issues listed in progress/consistency_check.md, then re-run Mode G.

### 11.1: Self-Review Checklist

**Critical vs Minor distinction:**
- **Critical** (fail checklist → fix before Phase 11.2): contribution not backed by experiments; missing error bars on main results; figures missing or unreadable; page limit exceeded; paper doesn't compile
- **Minor** (note but proceed): minor wording issues, small formatting inconsistencies, non-critical missing citations

**Content:**
- [ ] Abstract is ONE paragraph, 150–250 words
- [ ] Introduction ends with contribution list
- [ ] Every contribution backed by experiments
- [ ] Every table/figure referenced and discussed in text
- [ ] No claims without evidence
- [ ] Limitations section is honest and specific
- [ ] Method overview figure (fig_method.pdf or equivalent architecture diagram) exists

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

**Invocation (Pipeline Lead)**: Send Reviewer Agent Mode C:
```
SendMessage to Reviewer Agent: "Run Mode C paper pre-review.
Project: [absolute project path]
Paper: paper/main.tex
Results: experiments/results/all_results.csv
Proposal: plan/proposal.md
Venue: [venue]
Save output to: plan/simulated_peer_review.md"
```
**Wait** for Reviewer Agent to report back with the Mode C verdict before proceeding. Do NOT spawn the reviewers yourself — Mode C is the Reviewer Agent's responsibility.

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
| Reject — weak results (avg score < 5.5 OR Devil's Advocate/Empiricist give Fatal) | **Stop writing. Notify user + telegram. Wait for confirmation. Then return to Phase 9.** |
| Reject — presentation/framing issue (avg score ≥ 5.5 but Reject from Presentation Critic / Related Work Detective) | Fix writing issues → re-run full peer review (back to 11.2) |

**Do NOT proceed to 11.3 if AC gives Reject due to weak results.** Rewriting cannot compensate for insufficient empirical evidence.

**Note on Phase 9 GO vs. Phase 11 Reject**: These are not contradictory. Phase 9 GO means results clear the *statistical minimum* (p < 0.05 vs. best baseline, ≥2 datasets). Phase 11 peer review applies the *venue-specific acceptance bar* — reviewers may find the margin too small, baselines missing, or generalization insufficient for the target venue. A Phase 11 Reject due to weak results means the bar is higher than the minimum. Do not interpret this as a pipeline error.

**When AC Rejects due to weak results**, notify the user before rolling back:

```
⚠️ Simulated peer review rejected paper due to weak results.

Venue: [venue]
AC score: [X]/10 (threshold: 5.5)
Key issues:
  - [Empiricist/Devil's Advocate finding 1]
  - [Empiricist/Devil's Advocate finding 2]

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
| "run more" / "加实验" | Ask user: "Which experiments should I add? (e.g., more baselines, more datasets, more ablations)" → design the specific experiments → add to `dispatch/state.json` with `phase: "Phase 8 extra"` → run Phase 8.4–8.5 again for new experiments → merge new results into `all_results.csv` → re-run Phase 9 analysis (result debate + go/no-go) → if GO again → re-run Phase 11 peer review. **Maximum 2 rounds of additional experiments**: if AC still gives Reject or Weak Reject after the second round of extra experiments, do NOT run more experiments. Escalate to user: present options (lower venue, reframe contribution, archive project) and wait for their decision. |
| "lower venue: [name]" | Update `config/config.md` venue field and `references/venue_requirements.md` → re-run Phase 11 peer review with the new venue's criteria → if AC accepts, continue to Phase 11.3 |
| "rollback" | Archive current paper draft to `paper/archived/` → return to Phase 5 method iteration with a new direction → do NOT delete existing results (they may inform next iteration) |

### 11.3: Codex Cross-Review

**Skip this step if**: AC gave REJECT due to weak results (handled in §11.2 — user is choosing next action).

Send full paper to Codex (GPT via MCP) for independent review. A different model family catches different blind spots. Save output to `plan/codex_review.md`.

**Invocation** (via MCP codex tool if available):
```
Use WebFetch or MCP codex tool to send:
  - Prompt: "Please review this machine learning paper for acceptance at [venue]. Identify: (1) critical weaknesses, (2) missing baselines or experiments, (3) potential reviewer objections, (4) clarity issues. Be direct and critical."
  - Content: full text of paper/main.tex (or a summary if token limit is hit)
```

If Codex MCP is unavailable: skip this step and note "Codex unavailable — skipped" in `plan/codex_review.md`. Do NOT block Phase 11.4 on this step.

**Output**: Save Codex response verbatim to `plan/codex_review.md`. Extract any new concerns not already identified in §11.1–11.2 and add them to the fix list for §11.4.

### 11.4: Address Issues + Rebuttal Prep

Fix all issues identified in 11.1–11.3. For issues that can't be fixed (e.g., need more compute), write rebuttal notes in `plan/rebuttal_prep.md`.

### 11.5: Pre-Submission Checklist

Before notifying the user to submit, verify ALL of the following:

**Required files:**
- [ ] `paper/main.pdf` — compiled, ≤ venue page limit (check `references/venue_requirements.md`)
- [ ] `paper/references.bib` — all citations complete, no `??` or missing entries in PDF
- [ ] `experiments/results/all_results.csv` — all experiments finished, no pending entries

**Anonymity check:**
- [ ] No author names, emails, or institution names in PDF text or metadata
- [ ] Run: `pdfinfo paper/main.pdf | grep -i author` — should return blank or "Anonymous"
- [ ] No self-citations that would reveal identity

**If supplementary material exists:**
- [ ] `paper/supplementary.pdf` — exists and ≤ venue supplementary page limit
- [ ] All figures/tables referenced as "Appendix X" in main paper are present

**Code/data availability:**
- [ ] If code release is promised in paper, `README.md` explains how to run experiments
- [ ] If a submission portal requires code, it's prepared (even if not yet public)

**Git state:**
- [ ] All changes committed: `git status` shows clean working tree
- [ ] No large binary files accidentally staged

**Venue-specific requirements** (in addition to generic checklist above):
- NeurIPS: [ ] Broader Impacts/Ethics .tex file prepared; [ ] NeurIPS checklist PDF completed
- ICLR: [ ] No identifying self-citations (grep `\citet` for author surnames); [ ] OpenReview format
- CVPR: [ ] Supplementary ≤ 14 pages total including main; [ ] copyright form ready
- ICML: [ ] Appendix proof style matches venue template
- ACL: [ ] Named Limitations section present; [ ] human eval protocol documented if generation task

If any item is ❌, fix it before proceeding. Do NOT submit with known checklist failures.

Commit + notify-telegram: "Pipeline FINISHED — paper ready for submission."

---

## Phase 12: Post-Submission Review

Update `progress/team_state.json` at Phase 12 entry (when official reviews arrive):
```json
{"current_phase": 12, "last_directive": "Phase 12 rebuttal started"}
```

**Entry gate**: The pipeline enters Phase 12 when the user sends a message indicating reviews have arrived (e.g., "reviews are out", "received reviews", pasting review text). Until then, the pipeline is idle — do NOT poll or auto-start Phase 12.

**Immediate on submission (Phase 11 complete → Phase 12.0):**
- Tag the submitted version: `git tag submission/<venue>-<year> && git push origin --tags`
- Mark `plan/TODO.md` Phase 12 block as started
- Then enter idle state — no autonomous work until user provides reviews

**When user provides reviews → Phase 12.1+**: Proceed autonomously from 12.1 onward.

### 12.0: Deadline Gate

Before planning any rebuttal experiments, check the rebuttal deadline:
```bash
grep -i "rebuttal.*deadline\|deadline.*rebuttal\|response.*period" references/venue_requirements.md
```

Calculate: `days_remaining = rebuttal_deadline_date - today`

- If `days_remaining ≤ 0`: STOP. Rebuttal period is over. Do not queue experiments. Notify user: "Rebuttal deadline has passed. If this is an error, update `references/venue_requirements.md` with the correct deadline."
- If `days_remaining ≤ 2`: Warn: "Only [N] days remain. Limit experiments to ≤6 GPU-hours total. Prioritize response writing over new experiments."
- If `days_remaining > 2`: Proceed normally.

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

**Invocation (Pipeline Lead)**: Send Reviewer Agent Mode D:
```
Send to Reviewer Agent:
"Run Mode D rebuttal strategy.
Project: [absolute project path]
Reviews at: plan/official_reviews/ (one .txt file per reviewer)
Triage: plan/review_triage.md (from Phase 12.2)
Proposal: plan/proposal.md
Results: experiments/results/all_results.csv
Save strategy to: plan/rebuttal_strategy.md"
```
**Wait** for Reviewer Agent to write `plan/rebuttal_strategy.md` before proceeding.

Mode D produces a rebuttal strategy plan covering: concern taxonomy, priority ranking, response drafts, and experiment plan.
Save Mode D output to `plan/rebuttal_strategy.md` before writing responses.

Check rebuttal page/word limit before writing (NeurIPS: 1 page; ICML: 1 page; ICLR: ~500-700 words; CVPR: usually none). Prioritize critical concerns if space is limited.

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

### Phase 12.8: Post-Rebuttal Final Decision

After AC final decision:

**If ACCEPT** (with or without minor revisions):
- If revisions required: apply them during camera-ready (Phase 12.7)
- Notify via Telegram: "🎉 Paper accepted at <venue>! Preparing camera-ready."
- Proceed to Phase 12.7

**If REJECT**:
- Notify via Telegram: "Paper rejected at <venue>. Reviews saved to plan/reviews_raw.md."
- Do NOT auto-retry. Present options to user:
  1. Submit to a lower-tier venue (adjust paper for new venue requirements)
  2. Iterate: return to Phase 9 with new experiments addressing reviewer concerns
  3. Archive: save plan/rebuttal_final.md + all artifacts for reference
- PAUSE and wait for user decision before taking any action.
- Git tag: `git tag rejected/<venue>-<year>`
