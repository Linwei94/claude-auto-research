# Phase 9: Result Analysis

## Phase 9 Entry

**Trigger**: Lab Agent sends "Phase 8 complete. all_results.csv ready." via SendMessage to Pipeline Lead.

**Phase 9 Entry: Update team_state.json**
Before starting any analysis work, write to `progress/team_state.json`:
```json
{
  "current_phase": 9,
  "last_directive": "Phase 9 analysis started — running statistical tests",
  "last_updated": "<ISO timestamp>"
}
```

When Pipeline Lead receives this message, proceed **autonomously** to Step 9.0. Do NOT wait for additional user approval — the Phase 9 GO gate (Step 9.2) handles user approval before Phase 10.

## Inputs
- `experiments/results/all_results.csv` — all experiment results (from Phase 8.5 export)
- `plan/experiment_plan.md` — original hypotheses
- `plan/proposal.md` — claimed contributions
- wandb project — metrics, curves, per-seed runs

**Before running the debate:** compute significance tests using `shared/statistical-testing.md`. Skeptic will require p < 0.05 vs. best baseline and ≥3 seeds.

## Outputs
- `plan/result_debate.md`
- `experiments/results/significance_tests.csv` (from statistical-testing.md)
- `experiments/results/figures/` — exported plots (learning curves, metric bars, ablation plots)
- Updated `progress/progress.md`
- Additional experiment entries in `dispatch/state.json` (if debate triggers more runs)

---

## Step 9.0: Pre-Debate Statistical Tests

**Run before spawning any agents.** This step produces the evidence base the Skeptic needs.

```bash
cd <project-dir>
uv run --with scipy --with statsmodels python - <<'EOF'
import pandas as pd
from scipy import stats

df = pd.read_csv("experiments/results/all_results.csv")

# Validate required columns
REQUIRED = {"method", "dataset", "seed", "value"}
missing_cols = REQUIRED - set(df.columns)
if missing_cols:
    raise ValueError(f"all_results.csv missing required columns: {missing_cols}\n"
                     f"Actual columns: {df.columns.tolist()}")
print(f"Loaded {len(df)} rows, columns: {df.columns.tolist()}")

# Identify proposed vs baseline methods using the group column
if "group" not in df.columns:
    raise ValueError(
        "all_results.csv is missing required 'group' column. "
        "Each row must have group='main' (proposed) or group='baseline'. "
        "See experiments.md exp_id naming convention and tracker.py config spec."
    )
our_methods  = df[df["group"] == "main"]["method"].unique().tolist()
base_methods = df[df["group"] == "baseline"]["method"].unique().tolist()

# Run per primary metric (CSV may contain multiple metrics)
_metric_counts = df["metric"].value_counts() if "metric" in df.columns else pd.Series(dtype=str)
primary = _metric_counts.index[0] if len(_metric_counts) > 0 else None
df_m = df[df["metric"] == primary] if primary else df

df_clean = df.copy()

# Check that at least one proposed-method row exists
main_rows = df_clean[df_clean["group"] == "main"]
if len(main_rows) == 0:
    raise RuntimeError(
        "No proposed-method rows found in all_results.csv (group='main'). "
        "All proposed experiments may have failed. "
        "Abort Phase 9 — check dispatch/state.json for failure details."
    )

results = []
for our in our_methods:
    for dataset in df_m["dataset"].unique():
        our_vals = df_m[(df_m["dataset"] == dataset) & (df_m["method"] == our)].sort_values("seed")["value"].values
        for b in base_methods:
            base_vals = df_m[(df_m["dataset"] == dataset) & (df_m["method"] == b)].sort_values("seed")["value"].values
            if len(our_vals) == 0:
                continue
            if len(base_vals) == 0:
                print(f"WARNING: baseline '{b}' has zero valid values — skipping comparison. Check if baseline experiments failed.")
                continue
            if len(our_vals) < 3 or len(our_vals) != len(base_vals):
                # Not enough seeds for paired t-test — log as warning instead of silently skipping
                results.append({
                    "dataset": dataset, "our_method": our, "baseline": b,
                    "our_mean": round(our_vals.mean(), 4) if len(our_vals) > 0 else None,
                    "baseline_mean": round(base_vals.mean(), 4) if len(base_vals) > 0 else None,
                    # delta > 0: better for higher-is-better metrics (accuracy, F1)
                    # delta < 0: better for lower-is-better metrics (ECE, FID, perplexity)
                    # The Go/No-Go gate checks delta direction based on metric name
                    "delta": round(our_vals.mean() - base_vals.mean(), 4) if len(our_vals) > 0 and len(base_vals) > 0 else None,
                    "p_value": None, "significant": False,
                    "metric": primary,
                    "note": f"insufficient seeds ({len(our_vals)} vs {len(base_vals)}) — statistical test skipped",
                })
                continue
            t, p = stats.ttest_rel(our_vals, base_vals)
            results.append({
                "dataset": dataset, "our_method": our, "baseline": b,
                "our_mean": round(our_vals.mean(), 4), "baseline_mean": round(base_vals.mean(), 4),
                # delta > 0: better for higher-is-better metrics (accuracy, F1)
                # delta < 0: better for lower-is-better metrics (ECE, FID, perplexity)
                # The Go/No-Go gate checks delta direction based on metric name
                "delta": round(our_vals.mean() - base_vals.mean(), 4),
                "p_value": round(float(p), 4), "significant": p < 0.05,
                "metric": primary,
            })

from statsmodels.stats.multitest import multipletests
pvals = [r["p_value"] for r in results if r["p_value"] is not None]
if len(pvals) > 1:
    reject, corrected_pvals, _, _ = multipletests(pvals, method='holm')
    i = 0
    for r in results:
        if r["p_value"] is not None:
            r["corrected_p"] = corrected_pvals[i]
            r["holm_reject"] = bool(reject[i])
            i += 1

pd.DataFrame(results).to_csv("experiments/results/significance_tests.csv", index=False)
print(pd.DataFrame(results).to_string())

# Check for null p-values (insufficient seeds)
null_rows = [r for r in results if r["p_value"] is None]
if null_rows:
    print(f"WARNING: {len(null_rows)} comparison(s) have no p-value (< 3 seeds). "
          f"Affected: {[f\"{r['our_method']} vs {r['baseline']} on {r['dataset']}\" for r in null_rows]}")
    print("Skeptic MUST rate Statistical Validity as 'weak' for these comparisons.")
EOF
```

If the script fails (wrong column names, insufficient seeds), read `shared/statistical-testing.md` for the corrected template. **Do NOT proceed to debate until `experiments/results/significance_tests.csv` exists.**

**Statistical power note**: With N=3 seeds, paired t-test is underpowered — a p<0.05 result requires a signal-to-noise ratio of ~4σ. When reporting results in the paper, flag any significant result where N<5 seeds. For the Go/No-Go gate (Step 9.2), p<0.05 with N=3 seeds is an acceptable pass for proceeding, but the paper must note seed count and preferably include N≥5 for primary results.

**Multiple comparisons**: Holm-Bonferroni correction is applied inside the script above (before the null p-value check). The Skeptic agent is given both raw p-values and corrected p-values. At minimum, note in the paper how many comparisons were made.

Pass `experiments/results/significance_tests.csv` as context to the Skeptic agent alongside the main CSVs.

## Step 9.0b: Export Figures

After significance tests pass, export figures from wandb before spawning debate agents:

```bash
mkdir -p experiments/results/figures
```

Export the following plot types from the wandb project and save as PNG to `experiments/results/figures/`:
- **Learning curves**: training/validation loss and primary metric vs. step, one plot per dataset
- **Metric bars**: bar chart of mean ± std across methods for each dataset/metric
- **Ablation plots**: bar or line charts showing component contribution

These figures will be included directly in the paper (Phase 10). Name files descriptively, e.g., `cifar10c_accuracy_bar.png`, `ablation_component_x.png`.

**Do NOT proceed to debate until at least metric bar plots exist for the primary metric.**

## Step 9.0c: Baseline Validation Pre-Check

Before spawning debate agents, verify the results CSV contains sufficient baselines:

```python
import pandas as pd
df = pd.read_csv("experiments/results/all_results.csv")
strong_baselines = df[df["group"] == "baseline"]["method"].nunique()
if strong_baselines < 2:
    raise RuntimeError(
        f"all_results.csv contains only {strong_baselines} baseline method(s). "
        "Phase 9 requires ≥2 strong baselines for meaningful comparison. "
        "ABORT: notify Pipeline Lead to add baselines before proceeding with analysis."
    )
print(f"Baseline check passed: {strong_baselines} baseline method(s) found.")
```

**If fewer than 2 baselines exist, abort Phase 9 and notify Pipeline Lead to add baselines before analysis.**

## Step 9.1: Result Debate

**Pre-debate data check** (run before spawning agents):
```python
import itertools
import pandas as pd
df = pd.read_csv("experiments/results/all_results.csv")
incomplete = df[df["value"].isna()]
if not incomplete.empty:
    print(f"WARNING: {len(incomplete)} incomplete rows (NaN value). These experiments may have crashed.")
    print(incomplete[["exp_id","method","dataset","seed"]].to_string())
    # Remove incomplete rows before passing to agents
    df_clean = df.dropna(subset=["value"])
    df_clean.to_csv("experiments/results/all_results_clean.csv", index=False)
    print("Saved cleaned CSV to all_results_clean.csv — use this for debate.")
else:
    df_clean = df.copy()

# Verify required baselines still have data after cleanup
baseline_df = df_clean[df_clean["group"] == "baseline"]
baseline_methods_with_data = baseline_df["method"].unique()
if len(baseline_methods_with_data) < 2:
    raise RuntimeError(
        f"After NaN cleanup, only {len(baseline_methods_with_data)} baseline(s) have valid results: "
        f"{list(baseline_methods_with_data)}. "
        "Abort Phase 9 — re-run failed baseline experiments first, or lower minimum to 1 baseline with explicit justification."
    )
```
If rows were removed, log in `progress/progress.md`:
```
### [date] — Phase 9 pre-debate data clean
- Removed N incomplete rows: [list affected exp_ids]
- Clean CSV: experiments/results/all_results_clean.csv
```

After cleanup, check for entirely missing (method, dataset) combinations:
```python
expected = set(itertools.product(df["method"].unique(), df["dataset"].unique()))
present  = set(zip(df["method"], df["dataset"]))
missing  = expected - present
if missing:
    print(f"WARNING: {len(missing)} (method, dataset) combinations are ENTIRELY missing after cleanup:")
    for m, d in sorted(missing): print(f"  {m} × {d}")
```
If any combination is entirely missing, log in `progress/progress.md` and tell debate agents explicitly: "The following (method, dataset) pairs have ZERO valid results — likely experiment failures, not data gaps: [list]. Do NOT assume zero performance; flag these as incomplete."

Pass the CLEAN CSV to all agents. Tell agents: "Incomplete runs (NaN values) were excluded. If a dataset/method combination has fewer seeds than expected, note it as a data gap, not a failure."

Run the 6-agent debate defined in `agents/result_debate.md`.

**Debate verdict ownership**: After all 6 sub-agents complete, Pipeline Lead (the runner of Phase 9) synthesizes the debate and writes the `## Verdict:` section to `plan/result_debate.md`. Pipeline Lead is running Phase 9 autonomously — Lab Agent is NOT involved in the synthesis step.

**Invocation**: Use the Agent tool to spawn all 6 agents in parallel (`run_in_background: true`, `model: "sonnet"`). For each agent role, fill the prompt template in `agents/result_debate.md` with:
- Project directory path
- Path to cleaned all_results.csv
- Path to experiments/results/significance_tests.csv
- Path to plan/proposal.md and plan/experiment_plan.md
- wandb project URL

Wait for all 6 agents to complete (or 30-min timeout per agent) before proceeding to Round 2 synthesis.

**If any agent exceeds 30-minute timeout**: mark that agent as timed-out. Proceed with the reports that DID complete (minimum 4 agents required; if fewer than 4 complete, escalate to Pipeline Lead). Log: "[HH:MM:SS] WARNING: [Agent name] timed out after 30 min. Proceeding with N/6 reports."

Each receives: key results CSVs + `experiments/results/significance_tests.csv` + proposal + experiment plan + wandb project URL.

| Agent | Focus |
|-------|-------|
| Optimist | Strongest results, compelling narrative, extension directions |
| Skeptic | Statistical significance, confounds, cherry-picking check |
| Strategist | Triage results, prioritize missing experiments, paper structure |
| Methodologist | Internal/external validity, reproducibility, construct validity |
| Comparativist | SOTA positioning, missing baselines, win/loss patterns |
| Revisionist | Check original hypotheses against evidence, revise narrative |

Process:
1. Round 1: all 6 agents independently analyze
2. Synthesize: consensus findings, conflicts, action items
3. Auto-decide based on consensus:
   - **Additional experiments**: run any flagged as critical by ≥2 agents (or Skeptic on statistical validity)
   - **Framing**: Strategist's narrative + Revisionist's hypothesis check
   - **Limitations**: acknowledge all limitations raised by any agent
4. Round 2 (if additional experiments run): re-run Skeptic + Comparativist to verify

Save to `plan/result_debate.md`.

---

## Step 9.1b: Extract Debate Verdict

After result debate completes, extract the overall verdict from `plan/result_debate.md`:

```bash
grep "^## Verdict:" plan/result_debate.md
# → RESULTS_SUFFICIENT / RESULTS_WEAK / RESULTS_FATAL
```

**Verdict → action mapping:**

| Verdict | Meaning | Next step |
|---------|---------|-----------|
| `RESULTS_SUFFICIENT` | ≥4/6 agents agree results are publication-ready | Proceed to Step 9.2 Go/No-Go criteria check |
| `RESULTS_WEAK` | Results borderline — some criteria unmet | Proceed to Step 9.2, but expect stricter scrutiny; Skeptic or Comparativist likely to give NO-GO |
| `RESULTS_FATAL` | Fundamental flaw (data leakage, statistical invalidity, wrong baselines) | **Immediate NO-GO** — skip Step 9.2. Identify root cause from debate, then rollback per Step 9.2 NO-GO guidance |

**Note on the two verdict systems** (read this BEFORE looking at the mapping table above): `RESULTS_*` is the overall debate consensus; Step 9.2 criteria are per-dimension thresholds. **Both must pass for GO** — a `RESULTS_SUFFICIENT` verdict does NOT override a Step 9.2 failure. Resolution rules:
- `RESULTS_SUFFICIENT` AND Skeptic ≥"adequate" AND Comparativist ≥"competitive" → **GO**
- `RESULTS_SUFFICIENT` BUT Skeptic="weak" OR Comparativist="weak" → **NO-GO** (Step 9.2 overrides)
- `RESULTS_WEAK` AND Skeptic ≥"adequate" AND Comparativist ≥"competitive" → **Conditional**: run additional experiments flagged as critical by ≥2 agents, then re-run result debate
- `RESULTS_FATAL` → **Immediate NO-GO**, no Step 9.2 check needed

---

## Step 9.2: Go / No-Go Gate

**Mandatory. Do NOT proceed to Phase 10 until this passes.**

**"Strong baselines"** = baselines marked `(strong)` in Phase 6 experiment plan Section 3 (Baselines). These are the most competitive published methods in the experiment plan, not oracle/trivial ones. When evaluating this criterion, filter `all_results.csv` for rows where `method` matches these names.

| Criterion | Minimum bar |
|-----------|------------|
| Main results | Beat ≥2 strong baselines on primary metric across ≥2 datasets. For lower-is-better metrics (ECE, FID, perplexity), "Beat baseline" means delta < 0. |
| Ablation | ≥1 ablation showing key component is responsible for the gain |
| Statistical validity | Consistent across seeds, p < 0.05 vs. best baseline (Skeptic gives passing score) |
| Venue bar | Skeptic + Comparativist both give ≥passing score on venue's scale |

**Go/No-Go pass criteria (explicit thresholds)**:
- Skeptic gives Statistical Validity ≥ **"adequate"** (not "weak"). If "weak" → NO-GO.
- Comparativist gives Competitive Standing ≥ **"competitive"** (not "weak"). If "weak" → NO-GO.
- If either agent scores "weak" on their primary criterion, the result is **NO-GO** regardless of other criteria.

**GO** → **STOP. Do NOT auto-proceed to Phase 10.**

**Check pipeline mode first:**
```bash
grep "^mode:" config/config.md
```

**Run mode check BEFORE constructing or sending any telegram message.** The telegram content differs based on mode. Determine mode FIRST. If research-only, send the research-only telegram and skip to Phase 9.5. Only construct the paper-mode telegram if mode is 'paper'.

**If `mode: research-only`:**
- Skip Phase 10 and Phase 11 entirely
- Proceed directly to Phase 9.5 (`phases/report.md`)
- Do NOT send the writing-approval telegram below
- Instead send: `✅ Phase 9 GO (research-only) — [project name]\nResults validated. Generating research report now.`

**Optional mode switch at GO time**: If the user says "just give me a report" or "no paper" at Phase 9 GO, switch mode by: (1) edit `config/config.md` → `mode: research-only`; (2) proceed to Phase 9.5 directly. If the user says "start writing" or "write the paper" after a research-only run, switch by: edit config → `mode: paper`; send the writing-approval telegram; wait for "开始写" confirmation; then proceed to Phase 10.

**If `mode: paper`:**
Update `progress/team_state.json` before sending the Telegram:
```json
{"current_phase": "waiting_approval_phase10", "last_directive": "Phase 9 GO — awaiting user '开始写' to start Phase 10"}
```

Send a telegram notification with the full results summary:
```
✅ Phase 9 GO — [project name]
Venue: [venue]
Key results:
  [dataset 1]: [method] [X.XX]% vs best baseline [Y.YY]% (p=[p-value])
  [dataset 2]: [method] [X.XX]% vs best baseline [Y.YY]% (p=[p-value])
Ablation: [component] contributes [+Z.Z]%

All criteria passed. Waiting for your approval to start writing.
Reply "开始写" / "start writing" / "proceed" to begin Phase 10.
```

Then **pause the pipeline**. Do not write a single line of the paper until the user explicitly says to proceed. Commit the final results + mark Phase 9 complete in `plan/TODO.md`.

**Write to `plan/TODO.md` before pausing** (required for crash recovery):
```
- [x] Phase 9 analysis complete — [timestamp]
- [x] Telegram sent to user — [timestamp]
- [ ] Human Approval Gate: User explicitly said "开始写" / "start writing" / "proceed to Phase 10" [ ]
```
A re-spawned Pipeline Lead checks: if all three boxes have [x], Phase 9 is done — proceed to Phase 10. If the last box is [ ], re-send the Telegram and wait.

**How to resume:** The pipeline is paused waiting for a user message **in this Claude Code conversation** (NOT just a Telegram reply — do NOT interpret a Telegram response as approval). When the user sends "开始写" / "start writing" / "proceed" (or equivalent) **in this chat**:
1. Check `plan/TODO.md` Human Approval Gate — mark the "User explicitly said" checkbox as `[x]`
2. Commit: `git commit -m "chore: mark Phase 10 approved by user"`
3. Update `progress/team_state.json`:
   ```json
   {"current_phase": 10, "last_directive": "User approved Phase 9 GO — proceeding to Phase 10 (writing)"}
   ```
4. Proceed immediately to Phase 10 (`phases/writing.md`)

**Note**: If the user only replies via Telegram but not in chat, do NOT proceed. Wait for them to also confirm in the chat window.

If resuming in a **new conversation** (context was lost): read `plan/TODO.md` first. If the Human Approval Gate shows `[x]` on all three checkboxes, proceed to Phase 10 directly without re-asking the user.

**NO-GO** → do NOT start writing. Instead:
1. Identify the specific failure
2. Notify-telegram immediately with: what failed, the gap, proposed next step
3. Roll back based on root cause:
   - **Weak method results** → Phase 5 (Method Iteration): revise method, run targeted pilot experiments
   - **Missing experiments or unfair evaluation** → Phase 6 (Full Experiment Planning): re-plan experiments and re-queue
   - **Statistical invalidity** (too few seeds, p ≥ 0.05) → Phase 8 (Full Experiments): run more seeds or more data
4. Return to Phase 9 when additional results are ready

**NO-GO Rollback dispatch** — Before sending the rollback message to Lab Agent, write `experiments/results/analysis_summary.md`:

```markdown
## Analysis Summary (Phase 9 NO-GO)
- Primary metric: [metric name]
- Best result: [our method mean] vs [baseline mean] (delta: [value])
- Verdict: NO-GO
- Key issues: [list the main failures from debate, e.g. "delta < 0.01 threshold on all datasets"]
- Recommended next step: [ROLLBACK_PHASE / KILL / additional experiments]
```

Then Pipeline Lead sends to Lab Agent via SendMessage:

- Phase 5 rollback (method is flawed): "Phase 9 NO-GO. Root cause: [1 sentence]. Rollback to Phase 5 — iterate on method. Read experiments/results/analysis_summary.md for details."
- Phase 6 rollback (experiment design flawed): "Phase 9 NO-GO. Root cause: [1 sentence]. Rollback to Phase 6 — redesign full experiments. Read experiments/results/analysis_summary.md."
- Phase 8 rollback (partial results, need more experiments): "Phase 9 NO-GO. Root cause: [1 sentence]. Rollback to Phase 8 — run additional experiments: [specific exp_ids]. Read experiments/results/analysis_summary.md."

After sending, Pipeline Lead STOPS and WAITS for Lab Agent acknowledgment.

**Do NOT paper-write your way out of weak results.**

Commit + notify-telegram.
