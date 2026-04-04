# Phase 9: Result Analysis

## Inputs
- `experiments/results/all_results.csv` — all experiment results (from Phase 8.5 export)
- `plan/experiment_plan.md` — original hypotheses
- `plan/proposal.md` — claimed contributions
- wandb project — metrics, curves, per-seed runs

**Before running the debate:** compute significance tests using `shared/statistical-testing.md`. Skeptic will require p < 0.05 vs. best baseline and ≥3 seeds.

## Outputs
- `plan/result_debate.md`
- `experiments/results/significance_tests.csv` (from statistical-testing.md)
- Updated `progress/progress.md`
- Additional experiment entries in `dispatch/state.json` (if debate triggers more runs)

---

## Step 9.0: Pre-Debate Statistical Tests

**Run before spawning any agents.** This step produces the evidence base the Skeptic needs.

```bash
cd <project-dir>
uv run python - <<'EOF'
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
our_methods  = df[df["group"].str.lower().isin(["main","proposed","our"])]["method"].unique().tolist()
base_methods = df[df["group"].str.lower().isin(["baseline","baselines"])]["method"].unique().tolist()

# Run per primary metric (CSV may contain multiple metrics)
_metric_counts = df["metric"].value_counts() if "metric" in df.columns else pd.Series(dtype=str)
primary = _metric_counts.index[0] if len(_metric_counts) > 0 else None
df_m = df[df["metric"] == primary] if primary else df

results = []
for our in our_methods:
    for dataset in df_m["dataset"].unique():
        our_vals = df_m[(df_m["dataset"] == dataset) & (df_m["method"] == our)].sort_values("seed")["value"].values
        for b in base_methods:
            base_vals = df_m[(df_m["dataset"] == dataset) & (df_m["method"] == b)].sort_values("seed")["value"].values
            if len(our_vals) < 3 or len(our_vals) != len(base_vals):
                continue
            t, p = stats.ttest_rel(our_vals, base_vals)
            results.append({
                "dataset": dataset, "our_method": our, "baseline": b,
                "our_mean": round(our_vals.mean(), 4), "baseline_mean": round(base_vals.mean(), 4),
                "delta": round(our_vals.mean() - base_vals.mean(), 4),
                "p_value": round(float(p), 4), "significant": p < 0.05,
                "metric": primary,
            })

pd.DataFrame(results).to_csv("experiments/results/significance_tests.csv", index=False)
print(pd.DataFrame(results).to_string())
EOF
```

If the script fails (wrong column names, insufficient seeds), read `shared/statistical-testing.md` for the corrected template. **Do NOT proceed to debate until `experiments/results/significance_tests.csv` exists.**

Pass `experiments/results/significance_tests.csv` as context to the Skeptic agent alongside the main CSVs.

## Step 9.1: Result Debate

**Pre-debate data check** (run before spawning agents):
```python
import pandas as pd
df = pd.read_csv("experiments/results/all_results.csv")
incomplete = df[df["value"].isna()]
if not incomplete.empty:
    print(f"WARNING: {len(incomplete)} incomplete rows (NaN value). These experiments may have crashed.")
    print(incomplete[["exp_id","method","dataset","seed"]].to_string())
    # Remove incomplete rows before passing to agents
    df = df.dropna(subset=["value"])
    df.to_csv("experiments/results/all_results_clean.csv", index=False)
    print("Saved cleaned CSV to all_results_clean.csv — use this for debate.")
```
If rows were removed, log in `progress/progress.md`:
```
### [date] — Phase 9 pre-debate data clean
- Removed N incomplete rows: [list affected exp_ids]
- Clean CSV: experiments/results/all_results_clean.csv
```

Pass the CLEAN CSV to all agents. Tell agents: "Incomplete runs (NaN values) were excluded. If a dataset/method combination has fewer seeds than expected, note it as a data gap, not a failure."

Run the 6-agent debate defined in `agents/result_debate.md`.

Spawn all 6 agents in parallel. Each receives: key results CSVs + `experiments/results/significance_tests.csv` + proposal + experiment plan + wandb project URL.

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

## Step 9.2: Go / No-Go Gate

**Mandatory. Do NOT proceed to Phase 10 until this passes.**

**"Strong baselines"** = baselines marked `(strong)` in Phase 6 experiment plan Section 3 (Baselines). These are the most competitive published methods in the experiment plan, not oracle/trivial ones. When evaluating this criterion, filter `all_results.csv` for rows where `method` matches these names.

| Criterion | Minimum bar |
|-----------|------------|
| Main results | Beat ≥2 strong baselines on primary metric across ≥2 datasets |
| Ablation | ≥1 ablation showing key component is responsible for the gain |
| Statistical validity | Consistent across seeds, p < 0.05 vs. best baseline (Skeptic gives passing score) |
| Venue bar | Skeptic + Comparativist both give ≥passing score on venue's scale |

**GO** → **STOP. Do NOT auto-proceed to Phase 10.**

**Check pipeline mode first:**
```bash
grep "^mode:" config/config.md
```

**If `mode: research-only`:**
- Skip Phase 10 and Phase 11 entirely
- Proceed directly to Phase 9.5 (`phases/report.md`)
- Do NOT send the writing-approval telegram below
- Instead send: `✅ Phase 9 GO (research-only) — [project name]\nResults validated. Generating research report now.`

**Optional mode switch at GO time**: If the user says "just give me a report" or "no paper" at Phase 9 GO, switch mode by: (1) edit `config/config.md` → `mode: research-only`; (2) proceed to Phase 9.5 directly. If the user says "start writing" or "write the paper" after a research-only run, switch by: edit config → `mode: paper`; send the writing-approval telegram; wait for "开始写" confirmation; then proceed to Phase 10.

**If `mode: paper`:**
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

**How to resume:** The pipeline is paused waiting for a user message in this conversation (or the next one if context was lost). When the user says "开始写" / "start writing" / "proceed" (or equivalent):
1. Check `plan/TODO.md` Human Approval Gate — mark the "User explicitly said" checkbox as `[x]`
2. Commit: `git commit -m "chore: mark Phase 10 approved by user"`
3. Proceed immediately to Phase 10 (`phases/writing.md`)

If resuming in a **new conversation** (context was lost): read `plan/TODO.md` first. If the Human Approval Gate shows `[x]` on all three checkboxes, proceed to Phase 10 directly without re-asking the user.

**NO-GO** → do NOT start writing. Instead:
1. Identify the specific failure
2. Notify-telegram immediately with: what failed, the gap, proposed next step
3. Roll back based on root cause:
   - **Weak method results** → Phase 5 (Method Iteration): revise method, run targeted pilot experiments
   - **Missing experiments or unfair evaluation** → Phase 6 (Full Experiment Planning): re-plan experiments and re-queue
   - **Statistical invalidity** (too few seeds, p ≥ 0.05) → Phase 8 (Full Experiments): run more seeds or more data
4. Return to Phase 9 when additional results are ready

**Do NOT paper-write your way out of weak results.**

Commit + notify-telegram.
