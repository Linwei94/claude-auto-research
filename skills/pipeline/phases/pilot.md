# Phase 3–5: Pilot

## Inputs
- `plan/proposal.md`
- `plan/idea_summary.md`
- `config/config.md` — selected machines

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

**Mapping proposal contributions to pilot dimensions:**
- C1 (primary contribution) → always maps to "Core Mechanism" dimension (most important pilot)
- C2 (secondary contribution) → maps to the dimension that directly tests the second claim (e.g., efficiency → computational overhead; generalization → cross-dataset)
- C3 (if exists) → maps to an optional ablation dimension
- Any claim about "robustness" → always adds a "Robustness / Distribution Shift" dimension
- Any claim about "efficiency" → always adds a "Computational Overhead" dimension
If unsure: always include Core Mechanism + Cross-dataset Generalization as mandatory; add others based on contributions.

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

**Baseline selection**: Read `plan/proposal.md` §4 (Experimental Plan) for the initial baseline list. 
Select 2-4 baselines:
- MUST include: the strongest published baseline from the proposal
- MUST include: the simplest baseline (e.g., vanilla approach without your method)
- OPTIONAL: 1-2 additional competitive methods from literature_review.md
If proposal §4 doesn't specify baselines, search literature_review.md for the 2-3 most cited methods in the same task.

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

**Note**: Pilot scripts are written in Phase 4.1 (not Phase 3). 
For script structure, reference: `skills/pipeline/phases/experiments.md` §8.2 training script template (tracker.py + wandb.init()).
All pilot scripts must include tracker.init(), wandb.init(), and write results to the result_file specified in dispatch entry.

Proceed to Phase 4 immediately.

---

## Phase 4: Pilot Experiments

### 4.1: Implement Core Method

Minimum viable version only — no bells and whistles.

### 4.2: Reproduce Key Baselines

Reproduce reported numbers for 2–3 baselines on ≥1 dataset before comparing anything. Log to `experiments/results/baseline_reproduction.md`.

**Acceptable variance**: within `min(2%, 20% × metric_range)` where `metric_range = max_reported - min_reported` across all methods on that dataset. For a task where SOTA is 95.2% and the range across methods is 5%, the acceptable gap is `min(2%, 1%) = 1%`. For a task where accuracy ranges 50–90%, the acceptable gap is `min(2%, 8%) = 2%`. This prevents over-triggering on high-variance tasks and under-triggering on tight ones.

**Baseline reproduction gate**: If gap exceeds the above threshold on primary metric: STOP pilot execution. Escalate to Pipeline Lead: "Baseline reproduction failed (gap: X%, threshold: Y%). Investigate before continuing." Do NOT dispatch pilot experiments until baselines reproduce.

#### Step 4.2b: Environment Setup

Spawn one Environment Sub-agent per **unique host** (not per experiment). If 3 experiments use xuchang-lab1 and 2 use xuchang-lab2, spawn 2 ENV agents. Use the template from `skills/lab/agents/env_agent.md`. Run ENV agents in parallel across machines, sequential within same machine (only one ENV agent per machine at a time).

If ENV_FAILED on ALL machines: do not proceed to Step 4.3. Write `progress/escalate_pilot.md` and notify Pipeline Lead.

### 4.3: Dispatch Pilots via Execution Sub-agents

**After writing all pilot scripts**: create dispatch entries, then spawn one Execution Sub-agent per pilot (see `skills/lab/SKILL.md` "Execution Sub-agent Templates" for selection logic). Use `model: haiku`, `run_in_background: true`. Each sub-agent handles: code sync → env check → launch → monitor → report back.

Select the exec agent template based on the `host` field in each dispatch entry:
- `xuchang-lab*` → `skills/lab/agents/exec_local.md`
- `finn_cci_c500` → `skills/lab/agents/exec_c500.md`
- hosts containing `gadi` → `skills/lab/agents/exec_gadi.md`

Sub-agents report completion by writing `status: 'done'` to `dispatch/<EXP_ID>.status.json` (one sidecar per experiment — NOT the shared `dispatch/state.json`). Lab Agent merges sidecars into `state.json` via the merge_sidecars() function and polls every 2 minutes — do NOT wait for SendMessage. After each completion is detected: run early-stop check (§4.3b).

**Hanging pilot detection**: if a pilot has been `status: "running"` for more than 2× its `expected_duration_hours` with no wandb log update in 30 minutes, treat it as hung. Action: SSH to host and check if PID is alive (`ps -p <pid>`). If dead: mark `status: "failed"`, create retry entry (append `_r1` suffix to exp_id), re-dispatch via exec agent. If PID alive but no wandb update: log warning and wait another 30 minutes before declaring hung.

### Phase 4.2c: Estimate Pilot Duration

Before creating dispatch entries, estimate runtime for each pilot experiment.

**For pilots:** Use dataset heuristics (no prior pilot data yet):
- CIFAR-10/100 (50k): ~5 min/epoch × number of epochs
- ImageNet: ~60 min/epoch
- Custom small (<10k): ~2 min/epoch
- Scale by number of epochs planned

Apply platform factors: gadi × 0.6, c500 × 1.2, local × 1.0. Add 20% buffer.

Set in each dispatch entry:
- `expected_duration_hours`: estimated run time
- `gadi_walltime_hours`: `ceil(estimated_hours × 1.5)`
- `duration_basis`: brief description of estimate method

Default if unknown: `expected_duration_hours: 4`, `gadi_walltime_hours: 6`.

Include `expected_duration_hours`, `gadi_walltime_hours`, `duration_basis` in each pilot dispatch entry (same fields as Phase 8, see `phases/experiments.md §8.3`).

### 4.3: Dispatch Entry Format

**Required pilot result CSV format** — each pilot script must write a CSV with these exact columns (must match `all_results.csv` schema used by Phase 9 analysis):

```
exp_id, method, dataset, group, metric, seed, value
```

Where `group` must be one of:
- `"main"` — for rows produced by our method
- `"baseline"` — for rows produced by baseline methods
- `"ablation"` — for rows produced by ablation variants

`method` must be a short identifier matching the `method` column in `all_results.csv` (e.g., `"TTAC"`, `"TENT"`, `"BN_adapt"`).

Example:
```
pilot1_cifar10c, TTAC, CIFAR-10-C, main, acc, 0, 92.3
pilot1_cifar10c, TENT, CIFAR-10-C, baseline, acc, 0, 90.1
```

The early-stop check (`4.3b`) reads from `all_results.csv` using lowercase group values (`"main"`/`"baseline"`) — these must match exactly. Before running pilots, run a **mandatory pre-flight dry run** on each pilot script to verify its CSV format:

```bash
# Run 1 step to generate a sample CSV, then validate group values
uv run python experiments/scripts/pilot1.py --seed 0 --max-steps 1
python -c "
import pandas as pd, sys
df = pd.read_csv('experiments/results/pilot1_cifar10c_core.csv')
bad = set(df['group'].unique()) - {'main', 'baseline', 'ablation'}
if bad: sys.exit(f'ERROR: invalid group values: {bad}. Fix before dispatching. Expected: main/baseline/ablation (all lowercase)')
print('✅ CSV format OK')
"
```

If a CSV has wrong group values, fix the script before dispatching. Wrong group values cause silent data loss in early-stop and stat tests.

For each pilot, create log file, git tag, then append to `dispatch/state.json`.

**`dispatch/state.json` top-level structure** (always use this wrapper — `merge_sidecars()` in Lab SKILL.md expects `state["experiments"]`):
```json
{
  "project": "<project-slug>",
  "experiments": [
    { <entry1> },
    { <entry2> }
  ]
}
```
Initialize with `{"project": "<slug>", "experiments": []}` before appending any entries.

Use **group + priority** to enable early stopping:

```json
{
  "id": "pilot1_cifar10c_core",
  "phase": "Phase 4",
  "status": "pending",
  "priority": 1,
  "group": "main",
  "early_stop_check_after": 2,
  "early_stop_threshold_pct": 0.5,   // min improvement in PERCENTAGE POINTS over best baseline (0.5 = must beat baseline by ≥0.5pp)
  "early_stop_metric": "acc",
  "command": "uv run python experiments/scripts/pilot1.py --seed 0",
  "result_file": "experiments/results/pilot1_cifar10c_core.csv",
  "host": null, "gpu": null, "pid": null,
  "started": null, "finished": null,
  "retry_count": 0, "max_retries": 2,
  "expected_duration_hours": 4.0,  // from Step 4.2c duration estimation
  "gadi_walltime_hours": null,
  "duration_basis": null
}
```

> **Note**: `expected_duration_hours` must be populated BEFORE creating the dispatch entry. Run Step 4.2c first.

Do NOT use custom group names (e.g. `"pilot_core_mechanism"`) — the early-stop check will silently skip them. All pilots testing the same hypothesis share a group value. Pilot 1 always gets `priority: 1`.

Dispatch ALL pilots at once — supervisor picks them up by priority order as GPUs become available.

**`experiments/definitions.json` schema** — Lab Agent writes this file alongside the dispatch entries. Dashboard and dashboard-update skill read it to display human-readable labels:
```json
[
  {
    "id": "pilot1_cifar10c_core",
    "name": "Core Mechanism — CIFAR-10-C",
    "phase": "Phase 3",
    "group": "main",
    "description": "Tests the core mechanism (feature adaptation) on CIFAR-10-C with ResNet50."
  },
  {
    "id": "pilot1_baseline_tent",
    "name": "TENT Baseline — CIFAR-10-C",
    "phase": "Phase 3",
    "group": "baseline",
    "description": "TENT baseline for comparison."
  }
]
```
Required fields: `id` (must match `exp_id` column in `all_results.csv`), `name`, `phase`, `group`, `description`. The `id` field is the join key used by the dashboard and Mode G consistency check.

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
                # group="main" only — "proposed" is not a valid group value per experiment-log-format.md
                our_val  = exp_rows[exp_rows["group"] == "main"]["value"].mean()
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
<!-- This is the authoritative format for `pilot_synthesis.md`. The format in `skills/lab/SKILL.md` is a simplified reference — use this full format. -->

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
| Pilot 1 (core mechanism) fails | **ROLLBACK** — core mechanism doesn't work; rollback immediately regardless of other pilots |
| Pilot 1 passes AND ≥ half of remaining mandatory pilots pass | **PROCEED** → Phase 6 |
| Pilot 1 passes AND all failures share the same diagnosable root cause with a targeted fix | **ITERATE** → Phase 5 |
| Pilot 1 passes AND failures have 2+ different root causes | **ROLLBACK** — too many independent issues; rollback |
| Pilot 1 passes but majority of mandatory pilots fail | **ROLLBACK** — scale/generalization is broken; rollback |

**Optional pilots** (marked in Phase 3 plan): do NOT count toward the pass threshold. A failing optional pilot is a nice-to-have ablation, not a blocker.

**"Pass" definition for a pilot**: method beats best baseline, where the gap must satisfy BOTH:
1. Absolute improvement ≥ 1% on primary metric (or matches, if the contribution is efficiency/simplicity, not accuracy)
2. Delta ≥ 2× the within-run variance: `delta > 2 × std(our_runs)` — this guards against noise masquerading as signal with 1-2 seeds

Additionally, the `pilot_synthesis.md` must explicitly state the `expected_noise_floor` (derived from the baseline's reported inter-seed variance in `literature_review.md`). If `delta < expected_noise_floor`, the pilot does NOT pass even if it clears the 1% absolute threshold.

- [ ] PROCEED → Phase 6
- [ ] ITERATE → Phase 5
- [ ] ROLLBACK → Phase 5 rollback
```

Update `plan/idea_summary.md` with an "Empirical Evidence" section.

Commit + notify-telegram (include wandb project URL in message).

**Notify Pipeline Lead** (MANDATORY — do NOT skip, regardless of PROCEED/ITERATE/ROLLBACK):
```
SendMessage to Pipeline Lead:
"Pilot synthesis ready.
Decision: [PROCEED / ITERATE / ROLLBACK]
File: experiments/results/pilot_synthesis.md
Deciding factor: [one sentence — e.g. 'Core mechanism passed, 4/5 mandatory pilots passed, main gap is hyperparameter sensitivity']
Requesting Mode B verdict."
```
Then wait for Pipeline Lead to initiate Mode B review. Do NOT proceed to Phase 6 or Phase 5 iteration before receiving Pipeline Lead's response.

**Phase 3 completion**: 
- Commit: `git add plan/ && git commit -m 'feat: pilot experiment plan (Phase 3)'`
- Notify Pipeline Lead via SendMessage: "Phase 3 complete. Pilot plan ready at plan/pilot_experiment_plan.md. N=<count> pilots across M=<count> dimensions. Awaiting Phase 4 dispatch."
- **Wait for user approval**: After sending the Phase 3 completion message, Pipeline Lead will post the plan for user approval and then send "User approved Phase 3 plan. Begin Phase 4 (pilot execution)." Wait for this message before starting Phase 4.

**PROCEED → Phase 6** (documented in `skills/pipeline/phases/experiments.md`): Plan full benchmark experiments based on successful pilot configurations. Phase 7 runs an experiment design debate (4-agent review) before Phase 8 executes full experiments.

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
- After iteration 1: evaluate results; if pass, proceed to Mode B; if fail but diagnosable, continue to iteration 2
- After iteration 2: if < 1% improvement over best baseline → mandatory rollback (skip iteration 3); if ≥1% improvement, proceed to iteration 3
- After iteration 3: Lab Agent writes `experiments/results/pilot_synthesis.md` and sends it to Pipeline Lead via SendMessage:

**After iteration 1 PASS** — write `pilot_synthesis.md` and send:
```
SendMessage to Pipeline Lead:
"Pilot iteration 1 complete (PASS).
Decision: PROCEED
File: experiments/results/pilot_synthesis.md
Deciding factor: [one sentence — e.g. 'Core mechanism passed on 4/5 pilots, primary metric delta > threshold']
Requesting Mode B verdict."
```
Wait for Pipeline Lead Mode B verdict before proceeding to Phase 6.

**After iteration 2 PASS** — write `pilot_synthesis.md` and send the same format with "iteration 2 complete (PASS)".

- After iteration 3: Lab Agent writes `experiments/results/pilot_synthesis.md` and sends it to Pipeline Lead via SendMessage:
  ```
  SendMessage to Pipeline Lead: "Pilot iteration 3 complete.
  Synthesis: experiments/results/pilot_synthesis.md
  Primary metric: [X.XX]% (improvement over best baseline: [+Y.YY]%)
  Seeds: [N]. Requesting Mode B verdict."
  ```
  **Lab Agent then STOPS and WAITS.** Do NOT proceed to Phase 6 without receiving the Mode B verdict.

  Pipeline Lead routes to Reviewer Agent Mode B. When verdict arrives, Pipeline Lead sends:
  ```
  SendMessage to Lab Agent: "Mode B verdict: [CONTINUE / PIVOT / KILL]. Reason: [...]"
  ```

  Mode B verdict handling:
  - **CONTINUE** → Lab Agent proceeds to Phase 6 (Experiment Design)
  - **PIVOT** → iteration budget is exhausted; treat as rollback (§5.4). PIVOT ≠ KILL — PIVOT means "this specific approach is exhausted, try a variant"; KILL means "this idea has no merit". Both lead to rollback at budget-exhaustion, but PIVOT can return to ideation with a closer variant while KILL restarts from scratch.
  - **KILL** → rollback immediately (§5.4), restart ideation from scratch
  **Do NOT auto-rollback if iteration 3 shows sufficient improvement** — let Mode B decide.

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
5. Increment the global round counter in TWO places (per `shared/progress-format.md`):
   - `config/config.md` field `idea_round: N+1` — authoritative
   - `progress/progress.md` header `**Idea round:** N+1` — display copy
   
   Do NOT add a `## Idea Rounds: N` section header — that format is explicitly disallowed. The count must equal the number of `### Round N:` entries in `idea_history.md`. If they diverge, reconcile by re-counting `idea_history.md` entries and updating `config.md` field to match.
6. **Write `experiments/results/pilot_failure_summary.md`** — a concise context document for Ideation Agent:
   ```markdown
   # Pilot Failure Summary — Round N
   
   **Failed Idea**: [title]
   **Root Cause**: [1–2 sentences — WHY it failed, not just what failed]
   **Pilot Evidence**: [list of failed pilots with their metrics]
   **Iteration History**: [what fixes were tried and why they didn't work]
   
   ## Hard Constraints for Next Idea
   - Do NOT use: [mechanism 1] — reason: [why]
   - Do NOT use: [mechanism 2] — reason: [why]
   - Avoid dataset: [if a dataset proved insufficient/misleading]
   
   ## What This Failure Suggests Might Work
   [Optional: inferences from the failure pattern — what direction could exploit these findings]
   ```
7. **Send to Pipeline Lead via SendMessage — then STOP and WAIT:**
   ```
   Pilot rollback complete. Round N idea exhausted after [M] iteration(s).
   
   Failed idea: [title]
   Root cause: [1 sentence]
   Full reflection: lessons/round_N.md
   Failure summary for Ideation: experiments/results/pilot_failure_summary.md
   Hard constraints: [bullet list copied from pilot_failure_summary.md]
   
   Awaiting instruction to continue.
   ```
   **Do NOT restart Phase 1 autonomously.** Pipeline Lead reads the reflection and instructs Ideation Agent directly.

   **Note on wiki**: Ideation Agent will ingest this failure into `~/.auto-research-wiki/lessons/` as part of Rollback Resume Mode (Step 1 of "What to read first"). Lab Agent does NOT write to the wiki — only Ideation Agent maintains the wiki.

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
