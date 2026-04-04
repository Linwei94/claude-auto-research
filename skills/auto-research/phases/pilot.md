# Phase 3–5: Pilot

> **Mode note**: Phases 3–5 run identically in both `paper` and `research-only` modes. After a successful Phase 5 (or Phase 4 if no iteration needed), continue to Phase 6. The mode only diverges at Phase 9 → see `phases/report.md` for `research-only`.

## Inputs
- `plan/proposal.md`
- `plan/idea_summary.md`
- `config/config.md` — selected machines, mode

## Outputs
- `plan/pilot_experiment_plan.md`
- `experiments/results/baseline_reproduction.md`
- `experiments/results/pilot_synthesis.md`
- `experiments/results/method_iterations.md` (if Phase 5 needed)
- `experiments/logs/<pilot_name>.md` (one per pilot)
- `plan/idea_history.md` (updated on rollback)
- `lessons/round_N.md` (on rollback)
- `plan/TODO.md`, `progress/progress.md`

---

## Phase 3: Pilot Experiment Design

Design **5–7 targeted pilots** that stress-test the core idea from multiple angles. Each pilot tests a **different dimension** — do not cluster on the same dimension.

| Dimension | Mandatory? | What failure means |
|-----------|-----------|-------------------|
| Core mechanism | ✅ | Fundamental flaw — pivot idea |
| Cross-dataset generalization | ✅ | Too narrow for a top venue |
| Component necessity (mini-ablation) | ✅ | Gain comes from elsewhere |
| Shift severity sensitivity | ✅ | Only works in narrow regime |
| Computational cost | ✅ | Impractical |
| Architecture/backbone generalization | Recommended | Architecture-specific |
| Hyperparameter sensitivity | Recommended | Brittle results |

### Scale Coverage Rule

Pilots must cover **multiple scales** — not just small datasets:

| Scale tier | Strategy | Goal |
|-----------|----------|------|
| Small (e.g. CIFAR-10, STL-10) | Full run | Fast iteration, core mechanism check |
| Medium/Large (e.g. ImageNet, COCO) | **Subset only** (10–20% of data, or 2–3 classes, or 1 epoch) | Verify algorithm doesn't break at scale — NOT a full benchmark |

For large-scale pilots: use `--max-samples N` or `--subset-classes K` to run just enough to check for crashes, gradient issues, or clearly wrong behavior. A large-scale pilot passing at subset level means "no obvious scale failure" — it does NOT replace the full-scale experiment in Phase 8.

**Minimum requirement**: at least 1 small-scale pilot (full) + 1 large-scale pilot (subset). If both pass, the idea has demonstrated multi-scale viability.

For each pilot, explicitly state: **"if this pilot fails, what does that tell us about the idea?"**

Save to `plan/pilot_experiment_plan.md`. Format:

```markdown
# Pilot Plan: [Idea Title]

## Core Hypothesis
[One sentence: what behavior signals success?]

## Shared Baselines
- Trivial: [no adaptation / source-only]
- Strongest competing: [name, venue/year]
- Second: [name, venue/year]

## Pilots

### Pilot 1: Core Mechanism (Small Scale — Full)
- Tests: [hypothesis]
- Dataset: [small dataset, e.g. CIFAR-10]
- Success criterion: [specific, measurable]
- If fails: [consequence for idea]
- Compute: ~[N] GPU hours

### Pilot 2: Scale Sanity (Large Scale — Subset)
- Tests: no obvious failure at scale
- Dataset: [large dataset, e.g. ImageNet] — **subset only** (e.g. 10 classes, 1 epoch)
- Success criterion: training stable, metric in reasonable range, no crash/NaN
- If fails: algorithm likely has scale-specific bug — do NOT proceed to full experiments
- Compute: ~[N] GPU hours

[repeat for each additional dimension pilot]

## Total compute: ~[N] GPU hours
```

Proceed to Phase 4 immediately.

---

## Phase 4: Pilot Experiments

### 4.1: Implement Core Method

Minimum viable version only — no bells and whistles.

### 4.2: Reproduce Key Baselines

Reproduce reported numbers for 2–3 baselines on ≥1 dataset before comparing anything. Acceptable variance: within 1–2% of reported. Log to `experiments/results/baseline_reproduction.md`.

### 4.3: Dispatch Pilots

**Required pilot result CSV format** — each pilot script must write a CSV with these exact columns:

```
exp_id, dataset, model, seed, group, metric, value
```

Where `group` must be one of:
- `"Proposed"` — for rows produced by our method
- `"Baselines"` — for rows produced by baseline methods

Example:
```
pilot1_cifar10c, CIFAR-10-C, ResNet50, 0, Proposed, acc, 92.3
pilot1_cifar10c, CIFAR-10-C, ResNet50, 0, Baselines, acc, 90.1
```

The early-stop check (`4.3b`) reads from `all_results.csv` using lowercase group values (`"main"`/`"baseline"`) written by tracker.py — NOT from the per-pilot CSV. The per-pilot CSV format with `"Proposed"`/`"Baselines"` is for human-readable standalone result files only. Before running pilots, run a **mandatory pre-flight dry run** on each pilot script to verify its CSV format:

```bash
# Run 1 step to generate a sample CSV, then validate group values
uv run python experiments/scripts/pilot1.py --seed 0 --max-steps 1
python -c "
import pandas as pd, sys
df = pd.read_csv('experiments/results/pilot1_cifar10c_core.csv')
bad = set(df['group'].unique()) - {'Proposed', 'Baselines', 'Ablations'}
if bad: sys.exit(f'ERROR: invalid group values: {bad}. Fix before dispatching.')
print('✅ CSV format OK')
"
```

If a CSV has wrong group values, fix the script before dispatching. Wrong group values cause silent data loss in early-stop and stat tests.

For each pilot, create log file, git tag, then append to `dispatch/state.json`. Use **group + priority** to enable early stopping:

```json
{
  "id": "pilot1_cifar10c_core",
  "phase": "Phase 4",
  "status": "pending",
  "priority": 1,
  "group": "pilot_core_mechanism",
  "early_stop_check_after": 2,
  "early_stop_threshold_pct": 0.5,
  "early_stop_metric": "acc",
  "command": "uv run python experiments/scripts/pilot1.py --seed 0",
  "result_file": "experiments/results/pilot1_cifar10c_core.csv",
  "host": null, "gpu": null, "pid": null,
  "started": null, "finished": null,
  "retry_count": 0, "max_retries": 2
}
```

**Group naming convention**: all pilots testing the same hypothesis share a `group` value (e.g., `"pilot_core_mechanism"`, `"pilot_scale"`, `"pilot_domain_generalization"`). Pilot 1 always gets `priority: 1`.

Dispatch ALL pilots at once — supervisor picks them up by priority order as GPUs become available. Lower number = higher priority = launches first.

### 4.3b: Early-Stop Check (per group)

**Run this check after every pilot completes.** Check each group independently:

```python
import json, pandas as pd

def early_stop_check(state_path="dispatch/state.json", results_dir="experiments/results/"):
    with open(state_path) as f:
        state = json.load(f)
    
    # Group experiments
    groups = {}
    for exp in state["experiments"]:
        g = exp.get("group")
        if g:
            groups.setdefault(g, []).append(exp)
    
    cancelled = []
    for group_id, exps in groups.items():
        # Find early_stop config from any entry in group
        cfg = next((e for e in exps if "early_stop_check_after" in e), None)
        if not cfg:
            continue
        
        check_after = cfg["early_stop_check_after"]
        threshold   = cfg["early_stop_threshold_pct"]
        metric      = cfg["early_stop_metric"]
        
        done    = [e for e in exps if e["status"] == "done"]
        pending = [e for e in exps if e["status"] == "pending"]
        
        if len(done) < check_after or not pending:
            continue  # not enough data yet, or nothing left to cancel
        
        # Compute avg improvement over best baseline in completed experiments.
        # Read from all_results.csv (schema: exp_id, method, dataset, group, metric, seed, value)
        improvements = []
        try:
            all_df = pd.read_csv(Path(results_dir) / "all_results.csv")
        except Exception:
            continue
        for exp in done:
            try:
                exp_rows = all_df[(all_df["exp_id"] == exp["id"]) & (all_df["metric"] == metric)]
                our_val  = exp_rows[exp_rows["group"].isin(["main", "proposed"])]["value"].mean()
                if pd.isna(our_val):
                    continue
                datasets = exp_rows["dataset"].unique()
                baseline_rows = all_df[
                    all_df["dataset"].isin(datasets) &
                    (all_df["metric"] == metric) &
                    (all_df["group"] == "baseline")
                ]
                baseline_val = baseline_rows["value"].max()
                if pd.isna(baseline_val):
                    continue
                improvements.append(our_val - baseline_val)
            except Exception:
                pass  # skip if result not parseable
        
        if not improvements:
            continue

        # Filter out NaN values (unparseable results), then guard against empty list
        improvements = [x for x in improvements if x == x]  # removes NaN
        if not improvements:
            # All completed experiments had unparseable results — cannot compute improvement
            print(f"[early_stop] WARNING: group '{group_id}': all {len(done)} completed "
                  f"experiments had unparseable results — skipping early-stop check.")
            continue

        # Only cancel if ALL parseable completed experiments show weak results.
        # If even one shows promise, wait for more data.
        n_failed = sum(1 for x in improvements if x < threshold)
        if n_failed < len(improvements):
            continue

        avg_improvement = sum(improvements) / len(improvements)  # safe: len > 0
        
        if avg_improvement < threshold:
            # Cancel remaining pending experiments in this group
            for exp in pending:
                exp["status"] = "cancelled"
                cancelled.append(exp["id"])
    
    if cancelled:
        with open(state_path, "w") as f:
            json.dump(state, f, indent=2)

    return cancelled
```

**After running the check:**
- If any group is cancelled: notify-telegram — "⏹ Early stop triggered for group `[group_id]`: avg improvement = `[X]`% < `[threshold]`%. Cancelled: `[exp list]`."
- Log the cancellation in `experiments/logs/early_stop.md`
- Continue monitoring other groups normally

**Supervisor behaviour**: supervisor only launches `pending` entries. `cancelled` entries are silently skipped. Running experiments are NOT killed — they finish normally (results may be useful for diagnosis).

**When NOT to early-stop**: if only 1 of the 2 completed experiments shows weak results (the other was strong), do not cancel — variance is expected. Only cancel if the criterion fails consistently across all completed experiments in the group.

Commit incrementally — don't wait for all pilots to finish.

### 4.4: Pilot Evidence Synthesis

After ALL pilots complete, write `experiments/results/pilot_synthesis.md`:

```markdown
# Pilot Evidence Summary

| Pilot | Dimension | Setup | Method | Best Baseline | Δ | Pass? |
|-------|-----------|-------|--------|--------------|---|-------|

## Key Findings
1. [What works and under what conditions]
2. [What doesn't work and possible reasons]
3. [Surprising observations]

## Empirical Evidence
- Supports hypothesis: [which pilots and why]
- Challenges hypothesis: [which pilots and why]
- Suggests modifications: [what evidence points toward]

## Decision

**Root cause analysis first**: before applying the decision tree, group failing pilots by likely root cause. If multiple pilots fail for the same reason (e.g., learning rate instability across 3 datasets), treat it as one diagnosable fix — not N separate failures. Write one paragraph in `pilot_synthesis.md` summarizing "Common failure: [cause], affects pilots [list]." This prevents over-counting failures and allows a targeted Phase 5 iteration.

Apply this decision tree in order — first matching rule wins:

| Condition | Decision |
|-----------|----------|
| Pilot 1 (core mechanism) fails | **PIVOT** — core mechanism doesn't work; rollback immediately regardless of other pilots |
| Pilot 1 passes AND ≥ half of remaining mandatory pilots pass | **PROCEED** → Phase 6 |
| Pilot 1 passes AND all failures share the same diagnosable root cause with a targeted fix | **ITERATE** → Phase 5 |
| Pilot 1 passes AND failures have 2+ different root causes | **PIVOT** — too many independent issues; rollback |
| Pilot 1 passes but majority of mandatory pilots fail | **PIVOT** — scale/generalization is broken; rollback |

**Optional pilots** (marked in Phase 3 plan): do NOT count toward the pass threshold. A failing optional pilot is a nice-to-have ablation, not a blocker.

**"Pass" definition for a pilot**: method beats best baseline by ≥1% on primary metric (or matches, if the contribution is efficiency/simplicity, not accuracy).

- [ ] PROCEED → Phase 6
- [ ] ITERATE → Phase 5
- [ ] PIVOT → Phase 5 rollback
```

Update `plan/idea_summary.md` with an "Empirical Evidence" section.

Commit + notify-telegram (include wandb project URL in message).

---

## Phase 5: Method Iteration

**Triggered when pilot fails with diagnosable cause.** Max 3 iterations total.

### 5.1: Diagnose

Read the failing pilot's wandb run. Check: loss curves, gradient norms, validation metric trajectory, per-class or per-domain breakdowns. Understand **WHY**, not just WHAT. Match to the table below.

**Common failure modes and first-line fixes:**

| Signal in wandb / results | Likely cause | First fix to try |
|---------------------------|-------------|-----------------|
| Loss spikes then diverges | LR too high, unstable gradients | Halve LR; add gradient clipping (`max_norm=1.0`) |
| Loss plateaus early (high) | Underfitting — model capacity or LR too low | Increase LR; add capacity; fewer regularization constraints |
| Val metric improves then collapses | Overfitting to small pilot dataset | Add dropout / weight decay; check if baseline also collapses |
| Method worse than vanilla baseline on ALL domains | Core mechanism not doing what you think | Add diagnostic probe: log the output of the key module to verify it activates |
| Method better than baseline on easy domains, worse on hard | Method helps in-distribution but hurts OOD | Re-examine normalization, batch statistics, or domain-specific components |
| Ablation with component removed is **better** | Component is harmful or redundant | Remove it; re-examine the motivation — maybe the inductive bias is wrong |
| Results are high-variance across seeds (±5%+ on primary metric) | Unstable optimization or data-split sensitivity | Fix random seeds; check for data leakage; increase seeds to 5 |
| NaN loss after N steps | Numerical instability (log(0), division by zero, mixed precision) | Add `eps` to denominators; disable AMP or use `fp32` for critical ops |
| GPU memory OOM | Batch size too large for pilot | Halve batch size; accumulate gradients; use `torch.no_grad()` in eval |
| Baseline reproduction fails (>2% gap from paper) | Environment mismatch or data split differs | Check preprocessing, normalization, split — reproduce paper's exact split |

**Decision rule for iteration scope**: If the fix changes the **core mechanism** (e.g., replacing the loss function with something conceptually different, or changing the architecture fundamentally), treat it as a new idea variant — update `plan/idea_summary.md` and document as a sub-direction, not just a hyperparameter sweep. A new idea variant is NOT a new idea round — it stays within the current round's 3-iteration budget. Only a full rollback (via 5.4) increments the round counter.

**Fix vs. Pivot threshold**: If after 2 iterations the primary metric has not improved by more than 1% over the vanilla baseline, the mechanism is likely wrong — not just mis-tuned. Escalate directly to rollback; do NOT use the 3rd iteration. **"Vanilla baseline"** = the strongest competing baseline from the Shared Baselines list in `plan/pilot_experiment_plan.md` — NOT the trivial baseline. If no strong baseline exists yet (baseline reproduction failed), use the trivial baseline as a proxy, but note this caveat in `experiments/results/method_iterations.md`. If BOTH the strong baseline AND the trivial baseline are unavailable (both reproductions failed), use the best-performing pilot result across all completed experiments as the reference metric. Note this explicitly in `method_iterations.md` and increase skepticism about any "improvement" claim until a real baseline is reproducible.

**Iteration budget summary**:
- After iteration 1: evaluate results
- After iteration 2: if < 1% improvement → mandatory rollback (skip iteration 3)
- After iteration 3 (if reached): rollback regardless of results

### 5.2: Revise

Targeted changes only: loss function, regularization, architecture, hyperparameters. Log each iteration to `experiments/results/method_iterations.md`:

```markdown
## Round [N] — Idea: [title]

### Iteration 1
- Change: [what was changed and why]
- Result: [pilot metric before → after] (wandb run: [URL])
- Analysis: [why it did/didn't help]
```

### 5.3: Re-pilot

Re-run the failing pilot. Create new log file + new git tag + new wandb run.

Repeat 5.1–5.3 until passing or max iterations reached.

### 5.4: Rollback (if all iterations exhausted OR user-triggered)

**Trigger:** max 3 iterations reached (or 2 iterations with < 1% improvement — see 5.1), OR user says "换个方向" / "stop this idea" / similar.

**Round counter definition**: A "round" = one failed idea attempt, regardless of how many method iterations it took. Whether you exhaust 3 iterations or exit early at iteration 2 via the fix-vs-pivot threshold, it counts as exactly 1 round. The round counter tracks **how many distinct ideas have been tried and abandoned**, not the number of iteration cycles.

Rollback procedure:
1. Update `plan/idea_history.md` with full record (see ideation.md format)
2. Write `lessons/round_N.md` (format below) — **mandatory, never skip**
3. Move experiment code to `experiments/archived/round_N/`
4. Notify-telegram: idea failed, rolling back
5. Increment the global round counter in `progress/progress.md` as `## Idea Rounds: N`. This counter must equal the count of `### Round N:` entries in `idea_history.md`. If they diverge (e.g., a round was added to history but not progress.md), reconcile by re-counting `idea_history.md` entries and updating progress.md to match.
6. **If this is round 1 or 2**: loop back to Phase 1 Step 1.2 autonomously (skip literature review — reuse existing). New idea must avoid all mechanisms listed in existing `lessons/` files.
7. **If this is round 3** (3rd consecutive failed idea): STOP autonomous loop. Send telegram:
   ```
   ⚠️ 3 consecutive idea rounds have failed for [project].
   Failed ideas: [list]
   Root causes: [summary from lessons/]
   Options:
     A) Generate new ideas (send "继续" / "continue")
     B) Pivot research topic entirely (send "换方向" / "pivot")
   Waiting for your decision.
   ```
   Do NOT generate new ideas until user responds. Their response resumes Phase 1.2 (A) or Phase 0 topic re-selection (B).

---

## Lessons File Format (`lessons/round_N.md`)

```markdown
# Lesson: Round N — [Idea Title]

**Date**: [YYYY-MM-DD]
**Trigger**: [automatic: N iterations failed | user-triggered]
**Idea AC Score**: [X/10]

## What We Tried
[1-paragraph: what the idea was, what core mechanism it relied on]

## What Failed and How
[Specific: metric values, which pilots failed, what was observed in wandb]

## Root Cause
[Why it failed fundamentally — wrong inductive bias, flawed assumption, etc.]

## Key Lessons
- **Lesson 1**: [Actionable and specific]
- **Lesson 2**: [...]

## What to Avoid in Future Ideas
[Explicit list — these become hard constraints for next idea generation]

## Potential Directions Suggested by This Failure
[Optional: what does this failure suggest might work?]
```
