# Phase 6–8: Full Experiments

## Inputs
- `plan/proposal.md`
- `experiments/results/pilot_synthesis.md`
- `config/config.md`

## Outputs
- `plan/experiment_plan.md`
- `references/review_criteria.md`
- `plan/experiment_design_debate.md`
- `experiments/scripts/`, `experiments/utils/`, `experiments/configs/`
- `experiments/logs/<exp>.md` (one per experiment)
- `experiments/results/<exp>.csv`
- `dispatch/state.json` (pending entries added)
- `plan/TODO.md`, `progress/progress.md`

---

## Phase 6: Full Experiment Planning

**Triggered only after pilot passes.** Design a plan that meets top-venue standards.

Save to `plan/experiment_plan.md`:

```markdown
# Full Experiment Plan: [Paper Title]

## 1. Datasets & Benchmarks
[Table: name | task | #classes | shift type | source — aim for 4-8 datasets]

## 2. Models / Backbones
[Table: architecture | #params | pretrained source — mix CNNs + Transformers, ≥3 architectures]

## 3. Baselines
[Organized by category: static / online / oracle — include 5-10, always include uncalibrated + oracle]

Mark the strongest published competitors with `(strong)` — these are the baselines used in the Phase 9 Go/No-Go gate. Example:

| Method | Venue/Year | Type | Notes |
|--------|-----------|------|-------|
| Source-only | — | trivial | |
| TENT (strong) | ICLR 2021 | online | Best competitive baseline |
| TTT++ (strong) | NeurIPS 2021 | online | Second strongest |
| Oracle | — | oracle | Upper bound |

**Rule**: Mark as `(strong)` the 2–4 most competitive published methods in the literature. Do NOT mark trivial baselines (source-only, oracle) as strong. The `(strong)` tag is used by Phase 9 to identify which baselines must be beaten.

## 4. Metrics
- Primary (main tables): [2-3 metrics]
- Secondary (appendix): [diagnostics]
- Statistical: seeds, confidence intervals, significance tests

## 5. Statistical Protocol
- **Seeds**: Every main experiment and ablation runs with **seeds 0, 1, 2** (minimum 3). Analysis experiments (visualizations, failure analysis) may use seed 0 only.
- **Reporting**: Report mean ± std across seeds in all main result tables.
- **Significance**: Paired t-test vs. best baseline (see `shared/statistical-testing.md`). Required for any claim of improvement.
- **Compute implication**: multiply per-run GPU hours × 3 for seed budget in Resource Requirements.

## 6. Main Experiments (4-6)
For each: Setup | Hypothesis | Seeds | Which table/figure | Compute estimate (×3 seeds)

## 7. Ablation Studies (4-8) — MUST COVER ALL CLAIMED CONTRIBUTIONS

**Rule**: Every claimed contribution from `plan/proposal.md` must have ≥1 ablation. If a contribution cannot be ablated (e.g., a purely theoretical result), justify this explicitly.

For each ablation:
- **Component removed/varied**: name the component
- **Contribution it validates**: which contribution from proposal.md does this test?
- **Held fixed**: all other components
- **Seeds**: same seeds as main experiment
- **Expected finding**: e.g., "removing [X] drops accuracy by ≥2%, confirming it is essential"

**Anti-pattern**: ablating arbitrary hyperparameters (batch size, learning rate) without linking them to a claimed contribution. Reviewers will immediately notice missing ablations for claimed contributions.

## 8. Analysis Experiments (3-5)
Failure mode analysis, visualizations, efficiency comparison, qualitative examples. Seed 0 only unless variance is being studied.

## 9. Resource Requirements
Total GPU hours (all experiments × 3 seeds) | storage | available machines (from config/config.md)
```

Re-check GPU availability: `gnvitop --agent`. Mark lower-priority experiments optional if compute is limited.

Commit + notify-telegram.

---

## Phase 7: Experiment Design Debate

**Before running experiments.** Catch gaps before burning GPU hours.

### 7.1: Fetch Venue Review Criteria

Search for the actual review form: `"[venue] [year] review form reviewer guidelines"`. Extract scoring dimensions, scale, mandatory checklists, known rejection patterns. Save to `references/review_criteria.md`.

### 7.2: 4-Agent Debate

Spawn in parallel. Each reads `plan/experiment_plan.md` + `plan/proposal.md` + `references/review_criteria.md`.

| Agent | Core Question |
|-------|--------------|
| **The Skeptic** | What's missing? Which baselines are suspiciously absent? Is evaluation biased? |
| **The Completionist** | Are all standard benchmarks included? Does this match top papers at this venue? |
| **The Reproducibility Hawk** | Can someone reproduce Table 1 from the paper alone? Are all hyperparameters specified? |
| **The Narrative Enforcer** | Does every claim have a supporting experiment? Is the story coherent end-to-end? |

Each agent produces: scores per venue dimension + critical gaps + nice-to-haves + verdict (PASS/REVISE/REJECT).

**Passing threshold:**
- NeurIPS/ICML: avg overall ≥5/9
- ICLR: avg overall ≥5/10
- CVPR/ECCV: no agent gives Reject, ≤1 gives Weak Reject

**Auto-decision:**
- All PASS → Phase 8
- Any REVISE with critical gaps → update plan, re-run flagging agents (max 2 cycles)
- Any REJECT or still failing → rollback to Phase 6, redesign from scratch, notify-telegram

Save to `plan/experiment_design_debate.md`. Commit + notify-telegram.

---

## Phase 8: Full Experiments (Autonomous)

Do NOT wait for user instructions between experiments. Handle errors autonomously. Only escalate if a fix requires fundamentally rethinking the method.

### 8.1: Setup — Checkpoint Utility

Copy this template to `experiments/utils/checkpoint.py` at Phase 8 start:

```python
import torch
from pathlib import Path

def save_checkpoint(checkpoint_dir, step, model, optimizer, metrics):
    path = Path(checkpoint_dir)
    path.mkdir(parents=True, exist_ok=True)
    torch.save({
        'step': step,
        'model': model.state_dict(),
        'optimizer': optimizer.state_dict(),
        'metrics': metrics,
    }, path / f'ckpt_{step:06d}.pt')
    for old in sorted(path.glob('ckpt_*.pt'))[:-3]:
        old.unlink()

def load_checkpoint(checkpoint_dir, model, optimizer=None):
    ckpts = sorted(Path(checkpoint_dir).glob('ckpt_*.pt'))
    if not ckpts:
        return 0, {}
    ckpt = torch.load(ckpts[-1], weights_only=True)
    model.load_state_dict(ckpt['model'])
    if optimizer:
        optimizer.load_state_dict(ckpt['optimizer'])
    return ckpt['step'], ckpt['metrics']
```

Every training script MUST accept `--checkpoint-dir` and `--resume` and call these.

**Checkpoint directory sync policy**: `checkpoint_dir` paths are **local to the executing machine** — do NOT include them in `multi-machine-sync.md` rsync rules. Checkpoints are large and machine-specific. Only the final `result_file` (CSV) is synced back to the central machine. If an experiment needs to resume on a *different* machine (e.g., original machine failed), you must first manually copy the checkpoint directory to the new machine before re-dispatching.

**Checkpoint cleanup**: After an experiment reaches `status: "done"` or `status: "failed"` (all retries exhausted), delete its `checkpoint_dir` to conserve disk space: `ssh <host> "rm -rf <checkpoint_dir>"`. Only keep checkpoints for experiments with `status: "running"` or `status: "pending"` (may still need resume). Log the cleanup in `experiments/logs/<exp_id>.md`.

For non-PyTorch evaluation scripts: write `partial_results.json` after each dataset/seed, skip completed entries on restart.

Also at Phase 8 start, write `experiments/scripts/early_stop_check.py` with this exact code (same logic as Phase 4.3b):

```python
import json, pandas as pd
from pathlib import Path

def early_stop_check(state_path="dispatch/state.json", results_dir="experiments/results/"):
    with open(state_path) as f:
        state = json.load(f)
    groups = {}
    for exp in state["experiments"]:
        g = exp.get("group")
        if g:
            groups.setdefault(g, []).append(exp)

    cancelled = []
    for group_id, exps in groups.items():
        cfg = next((e for e in exps if "early_stop_check_after" in e), None)
        if not cfg:
            continue
        check_after = cfg["early_stop_check_after"]
        threshold   = cfg["early_stop_threshold_pct"]
        metric      = cfg["early_stop_metric"]
        done    = [e for e in exps if e["status"] == "done"]
        pending = [e for e in exps if e["status"] == "pending"]
        if len(done) < check_after or not pending:
            continue
        improvements = []
        # Read from all_results.csv (single file written by tracker/server).
        # Schema: exp_id, method, dataset, group, metric, seed, value
        # group values: "main"/"baseline" (raw names, not display labels)
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
                # Best baseline across all experiments on the same dataset(s)
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
                pass
        if not improvements:
            continue
        # Guard: only cancel if ALL completed experiments show weak results.
        # If some show promise (high variance), do NOT cancel — wait for more data.
        n_weak = sum(1 for x in improvements if x < threshold)
        if n_weak < len(improvements):
            continue
        avg_improvement = sum(improvements) / len(improvements)
        if avg_improvement < threshold:
            for exp in pending:
                exp["status"] = "cancelled"
                cancelled.append(exp["id"])
    if cancelled:
        with open(state_path, "w") as f:
            json.dump(state, f, indent=2)
    return cancelled

if __name__ == "__main__":
    cancelled = early_stop_check()
    if cancelled:
        print(f"⏹ Early stop triggered. Cancelled: {cancelled}")
    else:
        print("✓ No early stop triggered.")
```

### 8.2: wandb Setup

Every experiment script MUST init wandb. Required pattern:

```python
import os, wandb, torch

run = wandb.init(
    project="<project-name>",   # = git repo directory name as-is (e.g. "ttac-calibration"); use hyphens, not underscores; ALL experiments for this paper go in ONE project
    name="<exp_id>",            # matches dispatch/state.json id (e.g. "exp1_cifar10c_main_s0")
    tags=["phase8", "round-N", "<exp_type>"],  # e.g. "main", "ablation", "analysis"
    config={
        # ALL hyperparams
        "dataset": dataset_name,
        "model": model_name,
        "lr": lr,
        "batch_size": batch_size,
        # ...
        # Environment fingerprint ("扣子") — for cross-machine result traceability
        "env/conda":        os.environ.get("CONDA_DEFAULT_ENV", "unknown"),
        "env/cuda_version": torch.version.cuda or "cpu",
        "env/torch":        torch.__version__,
        "env/gpu_name":     torch.cuda.get_device_name(0) if torch.cuda.is_available() else "cpu",
        "env/hostname":     os.uname().nodename,
    },
    resume="allow",             # supports re-runs from checkpoint
    id=wandb_run_id,            # pass from dispatch/state.json if resuming
)

# Write wandb_run_id back to dispatch/state.json so supervisor can resume this run
# Do this IMMEDIATELY after wandb.init() — before any training begins
# NOTE: copy this function to experiments/utils/dispatch_utils.py ONCE at Phase 8 start,
# then import it in every script: from experiments.utils.dispatch_utils import _dispatch_update_wandb_id
def _dispatch_update_wandb_id(exp_id: str, wid: str, state_path: str = "dispatch/state.json"):
    import json, threading
    _lock = getattr(_dispatch_update_wandb_id, "_lock", None) or threading.Lock()
    _dispatch_update_wandb_id._lock = _lock
    with _lock:
        try:
            with open(state_path) as f:
                state = json.load(f)
            for exp in (state.get("experiments") or []):
                if exp.get("id") == exp_id:
                    exp["wandb_run_id"] = wid
                    break
            with open(state_path, "w") as f:
                json.dump(state, f, indent=2)
        except Exception:
            pass  # non-fatal; supervisor will still track via PID

_dispatch_update_wandb_id(exp_id, run.id)

# training loop
wandb.log({"loss": loss, "ece": ece, "acc": acc, "step": step})

# save final results
wandb.log({"final/ece": final_ece, "final/acc": final_acc})
wandb.finish()
```

wandb automatically captures: `git.commit`, `host`, `gpu_name`, `gpu_count`, `pip` packages. The `env/*` fields above add the **environment fingerprint** (conda env, CUDA, torch version, GPU model, hostname) so you can verify results came from the same "扣子" across machines. If `env/conda`, `env/cuda_version`, and `env/torch` differ between two runs claiming the same result, investigate before treating them as equivalent.

### 8.2b: Research Dashboard (tracker.py)

Every experiment script MUST also push to the local Research Dashboard via `tracker.py`. This feeds the live experiment list and results table visible at `http://10.165.232.227:8080`.

Add to the top of each experiment script:

```python
import sys, os
sys.path.insert(0, os.path.expanduser("~/result_shower"))
import tracker

run = tracker.init(
    project="<project-name>",      # must match git repo directory name under HOME
    name="<exp_id>",               # same exp_id as dispatch/state.json
    host="10.165.232.227",         # central machine running Result Shower
    config={
        "method":  method_name,    # required — used for results table columns
        "dataset": dataset_name,   # required — used for results table rows
        "seed":    seed,
        # any other hyperparams
    },
    log_every=50,                  # push step logs every N steps (default 50)
)

# In training loop:
run.log({"loss": loss, "step": step})

# At end:
run.finish({"final_ece": final_ece, "final_acc": final_acc})
# Note: metric names with "final_" prefix are stripped automatically in the dashboard
```

**Offline clusters (C500 platform / Gadi):** Compute nodes have no internet, so tracker auto-detects and saves to `pending_sync/`. The central dashboard (10.165.232.227) is on the lab intranet and NOT reachable from C500/Gadi login nodes — sync must run **from localhost** using a pull-then-push pattern.

> **Cluster skill references**: When running experiments on these clusters, invoke the relevant skill first:
> - C500 (MetaX): invoke the `use-c500` skill for job submission, env setup, AFS paths
> - Gadi (NCI): invoke the `use-gadi` skill for debug node setup, PBS queues, scratch paths

#### C500 Platform (sco acp jobs)

Experiments run inside Docker containers where `HOME=/root` is ephemeral — **must** specify `pending_dir` pointing to AFS (persists after container exit):

```python
AFS_BASE = "/mnt/afs/lixiaoou/intern/linweitao"
run = tracker.init(
    project="<project-name>",
    name="<exp_id>",
    host="10.165.232.227",
    config={"method": method, "dataset": dataset, ...},
    pending_dir=f"{AFS_BASE}/<project-name>/experiments/results/pending_sync",
)
```

After the platform job finishes, **from localhost** pull and push:

```bash
# Pull pending_sync from AFS via finn_cci_c500, then push to local dashboard
PROJECT=<project-name>
AFS=/mnt/afs/lixiaoou/intern/linweitao
TMPDIR=/tmp/sync-c500-${PROJECT}
mkdir -p $TMPDIR

rsync -av finn_cci_c500:${AFS}/${PROJECT}/experiments/results/pending_sync/ $TMPDIR/
python3 ~/.claude/skills/autoresearch-dashboard/tracker_cli.py sync \
    --host 10.165.232.227 \
    --project $PROJECT \
    --pending-dir $TMPDIR/

# Clean up (tracker_cli moves synced files to synced/ subdir — safe to rm all)
rm -rf $TMPDIR
```

Monitor while running — check job status then sync:
```bash
sco acp jobs stream-logs --workspace-name aceworld-base <jobid> -f
# When done: run the rsync+sync block above, then open dashboard
```

#### Gadi (NCI debug node)

Experiments run on debug nodes (`gadi-gpu-h200-xxxx`) where `/home` has only 10GB — **must** specify `pending_dir` pointing to scratch:

```python
SCRATCH = "/scratch/li96/lt2442"
run = tracker.init(
    project="<project-name>",
    name="<exp_id>",
    host="10.165.232.227",
    config={"method": method, "dataset": dataset, ...},
    pending_dir=f"{SCRATCH}/<project-name>/experiments/results/pending_sync",
)
```

From localhost, pull-push to dashboard:

```bash
PROJECT=<project-name>
SCRATCH=/scratch/li96/lt2442
TMPDIR=/tmp/sync-gadi-${PROJECT}
mkdir -p $TMPDIR

rsync -av gadi:${SCRATCH}/${PROJECT}/experiments/results/pending_sync/ $TMPDIR/
python3 ~/.claude/skills/autoresearch-dashboard/tracker_cli.py sync \
    --host 10.165.232.227 \
    --project $PROJECT \
    --pending-dir $TMPDIR/

rm -rf $TMPDIR
```

For **live monitoring** while experiment is running (poll every 5 min from localhost):
```bash
# Run in a loop — Ctrl+C to stop
while true; do
    echo "=== Syncing $(date) ==="
    PROJECT=<project-name>; TMPDIR=/tmp/sync-loop-${PROJECT}; mkdir -p $TMPDIR
    rsync -aq gadi:/scratch/li96/lt2442/${PROJECT}/experiments/results/pending_sync/ $TMPDIR/ 2>/dev/null
    python3 ~/.claude/skills/autoresearch-dashboard/tracker_cli.py sync \
        --host 10.165.232.227 --project $PROJECT --pending-dir $TMPDIR/ 2>/dev/null
    rm -rf $TMPDIR
    sleep 300
done
```

#### Viewing cluster experiments in dashboard

After syncing, open the dashboard: `http://10.165.232.227:8080` → select project → click 🔬 Research tab.
- Synced cluster runs appear in the experiment list with their `host` field showing the cluster node name (e.g. `gadi-gpu-h200-0024`, `sco-worker-xxx`)
- Status will show `done` if `run.finish()` was called, `running` if synced mid-run
- Results table and step log history are fully available after sync

**Re-syncing is safe** — the server updates by exp_id (idempotent), so running the rsync+sync block multiple times does not create duplicates.

**exp_id naming convention** (determines Results Table layout):
- `exp<N>_<dataset>_main` → method from config['method'], group=Proposed
- `exp<N>_<dataset>_baseline` → group=Baselines
- `exp<N>_<dataset>_abl_<variant>` → group=Ablations

Always set `config['method']` and `config['dataset']` explicitly — the dashboard prefers these over exp_id parsing.

**Group value validation** — the `group` column in `all_results.csv` is written by the tracker/server and uses lowercase values: `"main"` (proposed method), `"baseline"`, `"ablation"`, `"analysis"`. The `early_stop_check()` function reads `"main"`/`"proposed"` and `"baseline"` case-sensitively. Wrong group values silently skip data. Verify with:
```bash
python -c "import pandas as pd; df=pd.read_csv('experiments/results/all_results.csv'); print(df['group'].unique())"
```
Expected values: `main`, `baseline`, `ablation`, `analysis`, `other`. If you see unexpected values, check `config['method']` and `config['dataset']` are set correctly in your tracker.init() call.

### 8.3: Dispatch

For each experiment:

1. Create log at `experiments/logs/<exp_id>.md` **before launching** (leave `wandb_run` blank — fill in after `wandb.init()` returns)
2. Append to `dispatch/state.json` **before** creating the git tag, so the tag's committed state always includes the dispatch entry:
   ```bash
   git add dispatch/state.json experiments/logs/<exp_id>.md
   git commit -m "dispatch: add <exp_id>"
   git tag exp/<project>/<exp_id>-$(date +%Y%m%d-%H%M%S) && git push origin --tags
   ```
3. **Dispatch entry** — **one entry per seed**:
   ```json
   {
     "id": "exp1_cifar10c_main_s0",
     "phase": "Phase 8",
     "status": "pending",
     "priority": 1,
     "group": "main_cifar10c",
     "early_stop_check_after": 1,
     "early_stop_threshold_pct": 0.5,
     "early_stop_metric": "acc",
     "host": null,
     "gpu": null,
     "pid": null,
     "wandb_run_id": null,
     "checkpoint_dir": "experiments/checkpoints/exp1_cifar10c_main_s0/",
     "command": "uv run python experiments/scripts/run_exp1.py --seed 0 --checkpoint-dir experiments/checkpoints/exp1_cifar10c_main_s0/ --resume",
     "started": null,
     "finished": null,
     "retry_count": 0,
     "max_retries": 3,
     "git_commit": null,
     "result_file": "experiments/results/exp1_cifar10c_main_s0.csv"
   }
   ```
   Create three entries per experiment (seeds 0, 1, 2), suffixed `_s0`, `_s1`, `_s2`. All seeds in the same experiment share the same `group`. Analysis-only experiments use `_s0` only and may omit `early_stop_*` fields.

   **`git_commit` field**: Set to `null` at dispatch time. The supervisor fills it in before launching each run (from `git rev-parse HEAD` on the executing machine). Used by `shared/multi-machine-sync.md` to verify code version matches across machines. Short hash (7 chars) is acceptable.

   **Group naming convention**:
   - Main experiments: `"main_<dataset>"` (e.g., `"main_cifar10c"`)
   - Ablations: `"abl_<component>"` (e.g., `"abl_loss_weight"`)
   - Analysis: `"analysis_<type>"` (e.g., `"analysis_efficiency"`)

   **Early-stop semantics for full experiments**: use `early_stop_check_after: 1` for main experiments (one seed reveals if the method is completely broken on this dataset). For ablations testing component importance, use `early_stop_check_after: 2`.

The supervisor owns: host/GPU selection, actual launch, monitoring, retry. Claude only writes `status: "pending"`.

Queue all experiments at once — supervisor launches as GPUs become available.

### 8.4: Monitor + Collect Results

**Primary dashboard: Result Shower Research tab** — open with `/autoresearch-dashboard` in Claude Code, or go to `http://10.165.232.227:8080` → select project → click 🔬 Research. Shows:
- Live experiment list: status badge (running/done/pending), host·GPU, elapsed time
- Click any row → expand: config kv grid, latest step metrics, log file
- Results table: method × dataset matrix with ✅/🔄/— cells

**Secondary: WandB project page** — `wandb.ai/<entity>/<project-name>` for detailed loss curves, full log history, and git commit traceability.

On error: read the failed wandb run's logs tab, fix issue, re-queue (new log file + new git tag + new wandb run ID). Escalate to user only if fix requires rethinking the method.

### 8.4b: Autonomous Error Handling

Handle these errors without asking the user. Re-queue with a new `exp_id` (append `_r2`, `_r3`) and new git tag.

| Error | Signal | Autonomous fix |
|-------|--------|----------------|
| **CUDA OOM** | `RuntimeError: CUDA out of memory` | Halve `batch_size`; add `--accumulate-grad-batches 2` to compensate; if still OOM, move to smaller pilot on this dataset |
| **NaN loss** | Loss becomes `nan` after N steps | Add `eps=1e-8` to all divisions/log operations; disable AMP (`--fp16 false`); log gradient norm — if it spikes to >100 before NaN, add `clip_grad_norm_(params, 1.0)` |
| **NaN metric (not loss)** | Final **primary metric** is `nan` but loss is finite | Check for division by zero in the primary metric calculation (e.g., empty class in ECE bins, zero-support F1); add guard: `if denominator == 0: continue`. NaN in auxiliary metrics while primary is clean is non-blocking — log it but do not halt. |
| **wandb unreachable** | `ConnectionError` or `wandb: Network error` | `wandb.init(..., mode="offline")`; results still saved to `wandb/` dir locally; sync after: `wandb sync wandb/run-*/` |
| **SSH connection drops mid-run** | Supervisor marks run as dead | Supervisor auto-retries up to `max_retries`; script resumes from last checkpoint via `--resume` flag — no action needed unless all retries exhausted |
| **Script crashes immediately** (exit code ≠ 0, 0 steps logged) | Import error, missing file, misconfigured path | SSH to the machine, run script interactively with `uv run python script.py --dry-run` (or just 1 step) to reproduce the error; fix and re-queue |
| **Results are all identical across seeds** | Seeds not being passed correctly to all RNG sources | Add `torch.manual_seed(seed); np.random.seed(seed); random.seed(seed)` at top of script; verify `config['seed']` is varying in wandb |
| **Experiment takes 10× longer than estimated** | Data loading bottleneck or inefficient augmentation | Add `num_workers=4, pin_memory=True` to DataLoader; profile with `torch.profiler` for one batch |

**Escalate to user only if:**
- Fix requires changing the method (loss function, architecture, core algorithm)
- All 3 retries exhausted with different fixes attempted
- Results are suspiciously good (e.g., 99% accuracy on a hard benchmark) — verify before treating as real

Save results as CSV: `experiments/results/<exp_id>.csv` (columns: method, dataset, metric, seed, value).

Update `progress/progress.md` and commit after each experiment completes.

### 8.4c: Early-Stop Check (after each experiment completes)

**Run this after every experiment completes** — script was written to `experiments/scripts/early_stop_check.py` in Phase 8.1:

```bash
uv run python experiments/scripts/early_stop_check.py
```

If any group is cancelled:
- Notify-telegram: "⏹ Early stop: group `[group_id]`, avg improvement `[X]`% < threshold `[Y]`%. Cancelled `[N]` pending experiments."
- Append to `experiments/logs/early_stop.md`: date, group, improvement value, cancelled experiment IDs
- **If the cancelled group is a main experiment group** (not ablation): this is a serious signal. Do the following immediately:
  1. Set ALL other pending experiment entries in `dispatch/state.json` to `status: "on_hold"` (the supervisor will not launch `on_hold` entries — they are treated like `cancelled` for scheduling purposes but can be reactivated)
  2. Send telegram notification with the early-stop details and ask: "Main experiment group `[group_id]` shows no improvement. Options: A) Continue remaining experiments anyway (reply 'continue'), B) Return to Phase 5 method iteration (reply 'rollback')"
  3. Wait for user response before resuming. Do NOT auto-proceed.
  4. On "continue": change all `on_hold` entries back to `pending`; continue Phase 8
  5. On "rollback": leave `on_hold` entries as-is; proceed to Phase 5 rollback

Running experiments are **never killed** — let them finish and record the results for diagnosis.

### 8.5: Export Results to CSV

When ALL experiments complete, export final metrics from wandb to CSV so `paper_integrity.py` can trace numbers back to sources.

```python
import wandb, pandas as pd, os, sys

# Validate wandb credentials before making API calls
api = wandb.Api()
try:
    _ = api.viewer  # triggers auth check
except Exception as e:
    print(f"ERROR: wandb authentication failed: {e}")
    print("Fix: run 'wandb login' on this machine, or set WANDB_API_KEY environment variable")
    sys.exit(1)

runs = api.runs("<entity>/<project-name>", filters={"tags": {"$in": ["phase8"]}})

rows = []
for run in runs:
    if run.state != "finished":
        continue
    for key, val in run.summary.items():
        if key.startswith("final/"):
            metric = key.replace("final/", "")
            rows.append({
                "exp_id":  run.name,
                "method":  run.config.get("method", run.name),
                "dataset": run.config.get("dataset", "unknown"),
                "group":   run.config.get("group", "other"),  # must be "main"/"baseline"/"ablation"/"analysis"
                "metric":  metric,
                "seed":    run.config.get("seed", 0),
                "value":   val,
                "wandb_run": run.url,
            })

df = pd.DataFrame(rows)
df.to_csv("experiments/results/all_results.csv", index=False)
```

**Required CSV format** (columns: exp_id, method, dataset, group, metric, seed, value, wandb_run):
- `exp_id`: the dispatch/state.json id (e.g., `exp1_cifar10c_main_s0`) — for traceability
- `method`: algorithm name (must match how it appears in the paper's tables)
- `group`: canonical group value — must be one of `"main"`, `"baseline"`, `"ablation"`, `"analysis"`. Set this in your experiment script config: `config={"group": "main", ...}`. Do NOT use the dispatch group ID (e.g. `"main_cifar10c"`) here.
- `wandb_run`: wandb URL — used by `paper_integrity.py` to verify numbers

**Action**: Write the code above to `experiments/scripts/export_results.py` now (at Phase 8.5 start, before running it). Then:

```bash
uv run python experiments/scripts/export_results.py
# Verify output:
python3 -c "import pandas as pd; df=pd.read_csv('experiments/results/all_results.csv'); print(df.shape, df.columns.tolist(), df.isnull().sum())"
```

Expected: no NaN values; `exp_id`, `method`, `dataset`, `group`, `metric`, `seed`, `value`, `wandb_run` columns present; row count = (# experiments) × (# seeds) × (# metrics).

**If export_results.py fails (wandb auth error or network):**
1. Check if `experiments/results/all_results.csv` already exists from a previous partial export — if yes, verify it has all expected experiments, and proceed using it (log warning in `progress/progress.md`)
2. If no CSV exists: STOP and notify user — "wandb authentication failed and no offline results found. Options: (A) fix wandb credentials (`wandb login`) then re-run export, or (B) manually populate `experiments/results/all_results.csv` using local run logs". If option B is chosen, use this required column format:
   ```
   exp_id,method,dataset,group,metric,seed,value,wandb_run
   exp1_cifar10c_main_s0,our_method,cifar10c,main,acc,0,92.3,
   exp1_cifar10c_baseline_s0,TENT,cifar10c,baseline,acc,0,90.1,
   ```
   Validate after manual creation: `python3 -c "import pandas as pd; df=pd.read_csv('experiments/results/all_results.csv'); assert set(df.columns) >= {'exp_id','method','dataset','group','metric','seed','value'}, 'missing columns'; print('OK', df.shape)"`
3. Do NOT attempt to run Phase 9 without `all_results.csv`

### 8.6: Summary for Phase 9

- Review `experiments/results/all_results.csv` — check for missing entries, NaN values, mismatched seeds
- Update `progress/progress.md` with best result per dataset
- Commit all results + notify-telegram with wandb project URL and path to CSV
