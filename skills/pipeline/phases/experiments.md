# Phase 6–8: Full Experiments

## Inputs
- `plan/proposal.md`
- `experiments/results/pilot_synthesis.md`
- `config/config.md`
- `plan/experiment_design_debate.md` (from Phase 7 debate — rationale for experiment design choices)

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

**Phase 6 completion** — before sending to Pipeline Lead:
1. Write `experiments/full_design.json` (empty table — all cells `status:"todo"`) using the same format as `pilot_design.json` (see `skills/lab/SKILL.md` Step 4.2), with `"phase": "full"`. Commit immediately so the dashboard can serve it.
2. Send to Pipeline Lead via SendMessage:
```
Phase 6 complete. Experiment plan ready at plan/experiment_plan.md. [N] experiments, ~[X] GPU-hours.
Summary: [key design decisions, e.g. '3 seeds × 5 datasets × 3 baselines = 45 experiments']
Empty design table written to experiments/full_design.json (visible on dashboard Experiments tab).
Ready for Phase 7 (experiment design debate).
```

---

## Phase 7: Experiment Design Debate

**Before running experiments.** Catch gaps before burning GPU hours.

### 7.1: Fetch Venue Review Criteria

Search for the actual review form: `"[venue] [year] review form reviewer guidelines"`. Extract scoring dimensions, scale, mandatory checklists, known rejection patterns. **Overwrite** `references/review_criteria.md` (a stub was created in Phase 0; replace it with actual criteria now).

**Required format:**
```markdown
# [Venue] [Year] Review Criteria

## Scoring Dimensions
| Dimension | Scale | Description |
|-----------|-------|-------------|
| Technical Quality | 1–10 | ... |

## Mandatory Checklists
- [ ] Reproducibility: ...

## Known Rejection Patterns
- Insufficient baselines: ...
```

**Fallback if search returns no results**: Use venue-specific defaults from `phases/writing.md` §10.1 (venue characteristics). Populate with generic ML conference criteria: Technical Quality (1-10), Novelty (1-10), Significance (1-10), Clarity (1-10), and note "Fetched from writing.md defaults — update when official form found."

### 7.2: 4-Agent Debate

Spawn in parallel. Each reads `plan/experiment_plan.md` + `plan/proposal.md` + `references/review_criteria.md`.

| Agent | Core Question |
|-------|--------------|
| **The Skeptic** | What's missing? Which baselines are suspiciously absent? Is evaluation biased? |
| **The Completionist** | Are all standard benchmarks included? Does this match top papers at this venue? |
| **The Reproducibility Hawk** | Can someone reproduce Table 1 from the paper alone? Are all hyperparameters specified? |
| **The Narrative Enforcer** | Does every claim have a supporting experiment? Is the story coherent end-to-end? |

Each agent produces: structured findings per their review angle + critical additions required + verdict (PASS/REVISE/REJECT).

**Passing threshold**: See `agents/experiment_design_debate.md` §Passing threshold for the canonical verdict-based rules. Agents produce PASS/REVISE/REJECT verdicts (not numeric scores) — do not apply numeric thresholds.

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
import wandb
from pathlib import Path

# ── Local checkpoint (for mid-training resume) ────────────────────────────────

def save_checkpoint(checkpoint_dir, step, model, optimizer, metrics):
    """Save a rotating local checkpoint (keeps last 3). Call every N steps."""
    path = Path(checkpoint_dir)
    path.mkdir(parents=True, exist_ok=True)
    torch.save({
        'step': step,
        'model': model.state_dict(),
        'optimizer': optimizer.state_dict(),
        'metrics': metrics,
    }, path / f'ckpt_{step:06d}.pt')
    # Keep only the 3 most recent (saves disk)
    for old in sorted(path.glob('ckpt_*.pt'))[:-3]:
        old.unlink()

def load_checkpoint(checkpoint_dir, model, optimizer=None):
    """Resume from the latest local checkpoint."""
    ckpts = sorted(Path(checkpoint_dir).glob('ckpt_*.pt'))
    if not ckpts:
        return 0, {}
    ckpt = torch.load(ckpts[-1], weights_only=True)
    model.load_state_dict(ckpt['model'])
    if optimizer:
        optimizer.load_state_dict(ckpt['optimizer'])
    return ckpt['step'], ckpt['metrics']

# ── wandb Artifact upload (for permanent traceability) ────────────────────────

def upload_best_checkpoint(run, exp_id: str, checkpoint_dir: str, best_metrics: dict) -> str:
    """Upload best checkpoint as wandb Artifact. Returns qualified name or "" on failure."""
    path = Path(checkpoint_dir)
    ckpts = sorted(path.glob('ckpt_*.pt'))
    if not ckpts:
        print(f"[checkpoint] WARNING: no checkpoint files found in {checkpoint_dir}. Artifact NOT uploaded.")
        return ""

    best_ckpt = ckpts[-1]  # last saved = best

    artifact = wandb.Artifact(
        name=f"{exp_id}-best",
        type="model",
        description=f"Best checkpoint for {exp_id}",
        metadata={
            "exp_id":   exp_id,
            "step":     best_ckpt.stem.replace("ckpt_", ""),
            **best_metrics,
        },
    )
    artifact.add_file(str(best_ckpt), name="best.pt")

    try:
        run.log_artifact(artifact)
        artifact.wait()
        qualified = artifact.qualified_name
        print(f"[checkpoint] Artifact uploaded: {qualified}")
        return qualified
    except Exception as e:
        print(f"[checkpoint] WARNING: artifact upload failed: {e}. Continuing without artifact.")
        return ""
```

Every training script MUST accept `--checkpoint-dir` and `--resume` and call these functions.

**Checkpoint lifecycle:**
1. During training: `save_checkpoint()` every N steps (keeps last 3 locally for resume)
2. End of training: `upload_best_checkpoint()` → uploads to wandb, returns `artifact_uri`
3. Write `artifact_uri` back to `dispatch/<EXP_ID>.status.json` as `wandb_artifact`
4. **Only after** `wandb_artifact` is confirmed non-empty: delete local checkpoint dir

**Checkpoint directory sync policy**: `checkpoint_dir` paths are local to the executing machine — do NOT rsync across machines. Copy manually before re-dispatching to a different host.

**Checkpoint cleanup (artifact-gated)**: After `status: "done"` AND `wandb_artifact` in `dispatch/<EXP_ID>.status.json` is confirmed non-empty:
```bash
ssh <HOST> "rm -rf <REMOTE_CHECKPOINT_DIR>"
```
If `wandb_artifact` is empty (upload failed): do NOT delete local checkpoint — the weights may be the only copy. Log a warning in `experiments/logs/<EXP_ID>.md` and escalate to Pipeline Lead.

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
                our_val  = exp_rows[exp_rows["group"].isin(["main"])]["value"].mean()  # CSV value is "main"; displayed as "Proposed" in dashboard
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

**wandb_run_id resume contract**: Before calling `wandb.init()`, read `wandb_run_id` from `dispatch/state.json` for your `exp_id`. If `wandb_run_id` is not null, pass `id=wandb_run_id` to resume the existing run. If null (first run), let wandb auto-generate an ID and save it back to `dispatch/state.json` immediately after `wandb.init()` — before any training begins. This ensures interrupted runs resume the same wandb run rather than creating duplicate entries.

```python
import os, wandb, torch

run = wandb.init(
    project="<project-name>",   # = git repo directory name as-is (e.g. "ttac-calibration"); use hyphens, not underscores; ALL experiments for this paper go in ONE project
    name="<exp_id>",            # matches dispatch/state.json id (e.g. "exp1_cifar10c_main_s0")
    tags=["phase8", "round-N", "<exp_type>"],  # e.g. "main", "ablation", "analysis"
    config={
        "dataset": dataset_name,
        "model": model_name,
        "lr": lr,
        "batch_size": batch_size,
        # REQUIRED: 'main' | 'baseline' | 'ablation' | 'analysis' (all lowercase)
        "group": "<one of: main | baseline | ablation | analysis>",
        # Environment fingerprint — for cross-machine result traceability
        "env/conda":        os.environ.get("CONDA_DEFAULT_ENV", "unknown"),
        "env/cuda_version": torch.version.cuda or "cpu",
        "env/torch":        torch.__version__,
        "env/gpu_name":     torch.cuda.get_device_name(0) if torch.cuda.is_available() else "cpu",
        "env/hostname":     os.uname().nodename,
    },
    resume="allow",
    id=wandb_run_id,            # from dispatch/state.json if resuming
)

# Write wandb_run_id back immediately — before training begins.
# Copy to experiments/utils/dispatch_utils.py; import in every script.
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
            pass  # non-fatal

_dispatch_update_wandb_id(exp_id, run.id)

# training loop
wandb.log({"loss": loss, "ece": ece, "acc": acc, "step": step})

final_metrics = {"ece": final_ece, "acc": final_acc}
wandb.log({f"final/{k}": v for k, v in final_metrics.items()})

from experiments.utils.checkpoint import upload_best_checkpoint
artifact_uri = upload_best_checkpoint(
    run=run,
    exp_id=exp_id,
    checkpoint_dir=args.checkpoint_dir,
    best_metrics=final_metrics,
)
# Write artifact URI into sidecar so exec agent can gate checkpoint cleanup on it
import json as _json
_sidecar = f"dispatch/{exp_id}.status.json"
if Path(_sidecar).exists():
    with open(_sidecar) as _f: _sd = _json.load(_f)
    _sd["wandb_artifact"] = artifact_uri
    with open(_sidecar, "w") as _f: _json.dump(_sd, _f, indent=2)

wandb.finish()
```

wandb automatically captures: `git.commit`, `host`, `gpu_name`, `gpu_count`, `pip` packages. The `env/*` fields above add the **environment fingerprint** (conda env, CUDA, torch version, GPU model, hostname) so you can verify results came from the same "扣子" across machines. If `env/conda`, `env/cuda_version`, and `env/torch` differ between two runs claiming the same result, investigate before treating them as equivalent.

### 8.2b: Research Dashboard (tracker.py)

**Hierarchy**: wandb is the PRIMARY logging system (used for analysis in Phase 9 and for generating `all_results.csv` in Phase 8.5 via `export_results.py`). tracker.py is the SECONDARY system for the local Result Shower dashboard and offline cluster sync.

**Offline clusters** (C500, Gadi): tracker.py auto-detects that the dashboard (10.165.232.227) is unreachable and saves results to `pending_sync/`. After the job completes, the exec agent syncs via `tracker_cli.py` from localhost (pull-then-push pattern).

**all_results.csv** is generated in Phase 8.5 by `export_results.py` reading from the wandb API. tracker.py is NOT the source for `all_results.csv` — it feeds the dashboard only.

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
        # REQUIRED: group must be set correctly or all_results.csv analysis will fail.
        # Use exactly one of: 'main', 'baseline', 'ablation', 'analysis' (all lowercase).
        "group":   "<one of: main | baseline | ablation | analysis>",
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

**Cluster configuration** (recorded in `config/config.md` during Phase 0 setup):
- C500: CCI machine `finn_cci_c500` (testing only), platform submit via `sco acp jobs create`, AFS base `/mnt/afs/lixiaoou/intern/linweitao`, Docker image `metax_pt` (or `maca31_pt` if CUDA errors)
- Gadi: login `gadi.nci.org.au`, project `li96`, scratch `/scratch/li96/lt2442`, queue `gpuvolta`, modules `cuda/11.7.0 python3/3.10.4`

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
python3 ~/result_shower/tracker_cli.py sync \
    --host 10.165.232.227 \
    --project $PROJECT \
    --pending-dir $TMPDIR/

# Clean up (tracker_cli moves synced files to synced/ subdir — safe to rm all)
rm -rf $TMPDIR
```

Monitor C500 job: `sco acp jobs stream-logs --workspace-name aceworld-base <jobid> -f`

#### Gadi (NCI debug node)

Experiments run on debug nodes where `/home` has only 10GB — **must** specify `pending_dir` pointing to scratch:

```python
SCRATCH = "/scratch/li96/lt2442"
run = tracker.init(
    project="<project-name>", name="<exp_id>", host="10.165.232.227",
    config={"method": method, "dataset": dataset, ...},
    pending_dir=f"{SCRATCH}/<project-name>/experiments/results/pending_sync",
)
```

From localhost, pull-push to dashboard (same pattern as C500 above — replace `finn_cci_c500:${AFS}` with `gadi:${SCRATCH}`):

```bash
rsync -av gadi:/scratch/li96/lt2442/${PROJECT}/experiments/results/pending_sync/ $TMPDIR/
python3 ~/result_shower/tracker_cli.py sync --host 10.165.232.227 --project $PROJECT --pending-dir $TMPDIR/
```

**Re-syncing is safe** — the server updates by exp_id (idempotent). Exec agents handle result sync automatically — manual sync only needed for debugging.

**exp_id naming convention** (determines Results Table layout):
- `exp<N>_<dataset>_main` → method from config['method'], group=Proposed (CSV value is `"main"`; displayed as "Proposed" in dashboard)
- `exp<N>_<dataset>_baseline` → group=Baselines
- `exp<N>_<dataset>_abl_<variant>` → group=Ablations

Always set `config['method']` and `config['dataset']` explicitly — the dashboard prefers these over exp_id parsing.

**Group value validation** — the `group` column in `all_results.csv` is written by the tracker/server and uses lowercase values: `"main"` (proposed method), `"baseline"`, `"ablation"`, `"analysis"`. The `early_stop_check()` function reads `"main"`/`"proposed"` and `"baseline"` case-sensitively. Wrong group values silently skip data. Verify with:
```bash
python -c "import pandas as pd; df=pd.read_csv('experiments/results/all_results.csv'); print(df['group'].unique())"
```
Expected values: `main`, `baseline`, `ablation`, `analysis`, `other`. If you see unexpected values, check `config['method']` and `config['dataset']` are set correctly in your tracker.init() call.

### 8.3: Dispatch

**`dispatch/state.json` top-level structure** (initialize before adding any entries — `merge_sidecars()` expects `state["experiments"]`):
```json
{
  "project": "<project-slug>",
  "experiments": []
}
```

For each experiment:

1. Create log at `experiments/logs/<exp_id>.md` **before launching** (leave `wandb_run` blank — fill in after `wandb.init()` returns)
2. Append entry to `state["experiments"]` in `dispatch/state.json` **before** creating the git tag, so the tag's committed state always includes the dispatch entry:
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
     "group": "main",  // MUST be canonical: "main" / "baseline" / "ablation" / "analysis" — matches all_results.csv group column and early-stop checks
     "early_stop_check_after": 1,
     "early_stop_threshold_pct": 0.5,   // minimum improvement in PERCENTAGE POINTS over best baseline (e.g. 0.5 = must beat baseline by ≥0.5pp; e.g. 88.0% → 88.5%)
     "early_stop_metric": "acc",
     "host": null,
     "gpu": null,
     "pid": null,
     "wandb_run_id": null,
     "checkpoint_dir": "experiments/checkpoints/exp1_cifar10c_main_s0/",
     "method": "<METHOD_NAME>",    // e.g., "TTAC", "TTT", "TENT" — must match all_results.csv method column
     "dataset": "<DATASET_NAME>",  // e.g., "cifar10c", "imagenetc" — must match all_results.csv dataset column
     "command": "uv run python experiments/scripts/run_exp1.py --seed 0 --checkpoint-dir experiments/checkpoints/exp1_cifar10c_main_s0/ --resume",
     "started": null,
     "finished": null,
     "retry_count": 0,
     "max_retries": 3,
     "git_commit": null,
     "expected_duration_hours": null,
     "gadi_walltime_hours": null,
     "duration_basis": null,
     "pbs_script_path": null,
     "result_file": "experiments/results/exp1_cifar10c_main_s0.csv",
     "wandb_artifact": null
   }
   ```
   `wandb_artifact` is filled by the training script at the end of training (see §8.2 `upload_best_checkpoint()`). Format: `"<entity>/<project>/<exp_id>-best:v0"`. A non-null value means the model weights are permanently stored in wandb — safe to delete the local checkpoint. A null value means the artifact upload failed — do NOT delete local files.
   ```
   These fields ensure the dispatch entry is self-documenting. The tracker.py init() call should use these values: `tracker.init(project=..., exp_id=..., config={"method": entry["method"], "dataset": entry["dataset"], "seed": seed, ...})`

   Create three entries per experiment (seeds 0, 1, 2), suffixed `_s0`, `_s1`, `_s2`. All seeds in the same experiment share the same `group`. Analysis-only experiments use `_s0` only and may omit `early_stop_*` fields.

   **`git_commit` field**: Set to `null` at dispatch time. The supervisor fills it in before launching each run (from `git rev-parse HEAD` on the executing machine). Used by `shared/multi-machine-sync.md` to verify code version matches across machines. Short hash (7 chars) is acceptable.

   **Group naming convention** (canonical values only — must match `all_results.csv` group column):
   - Main experiments: `"main"` — DO NOT use `"main_cifar10c"` or similar compound names
   - Baselines: `"baseline"`
   - Ablations: `"ablation"`
   - Analysis: `"analysis"`

   Using compound group names (e.g. `"main_cifar10c"`) will cause silent data loss in early-stop checks and Phase 9 analysis, which filter on exact canonical values.

   **Early-stop semantics for full experiments**: use `early_stop_check_after: 1` for main experiments (one seed reveals if the method is completely broken on this dataset). For ablations testing component importance, use `early_stop_check_after: 2`.

### 8.4: Execution Sub-agents

**Before spawning exec sub-agents — supervisor conflict check:**
Check if experiment-supervisor service is running:
```bash
systemctl is-active experiment-supervisor 2>/dev/null
```
- If `active`: supervisor is managing experiments. Do NOT spawn exec sub-agents manually — supervisor will pick up the dispatched entries automatically. Proceed to polling (Step 8.5).
- If `inactive` or `not-found`: spawn exec sub-agents manually as described below.

**One Execution Sub-agent per experiment entry (per seed).** Spawn all in parallel immediately after the dispatch table is committed.

Each sub-agent is responsible end-to-end for one experiment: code sync → environment check → launch → monitor (every 5 min) → error recovery → result collection → checkpoint cleanup → report back.

**Full sub-agent prompt template and responsibilities: use the platform-specific template from `skills/lab/agents/` based on the dispatch entry's `host` field (see `skills/lab/SKILL.md` "Execution Sub-agent Templates" for selection logic).**

Sub-agents use **model: haiku** (lightweight — all execution, no research decisions).

Lab Agent responsibilities while sub-agents run:
- Sub-agents write to `dispatch/<EXP_ID>.status.json` (sidecar per experiment) — not via SendMessage. Lab Agent polls and merges sidecars into `dispatch/state.json` every 2 minutes via `merge_sidecars()`. Escalations appear as `progress/escalate_<EXP_ID>.md` files — check for these on each poll.
- On each detected completion: log to `progress/lab.log`; run `early_stop_check.py`
  - If a **main** group is early-stopped: set all other pending entries to `status: "on_hold"`, notify Pipeline Lead, wait for direction
- On escalation file detected: relay to Pipeline Lead immediately
- Commit after each group completes: `git commit -m "results: <group_id> complete"`
- When ALL sub-agents are done (all entries `status: "done"` or `"cancelled"`) → proceed to §8.5

### 8.5: Export Results to CSV

**Pre-export guard — verify ALL experiments are complete:**
```python
import json, sys
with open("dispatch/state.json") as f:
    state = json.load(f)
pending = [e for e in state["experiments"] if str(e.get("phase")) in ("8", "Phase 8")
           and e["status"] not in ("done", "failed", "cancelled")]
if pending:
    print(f"ERROR: {len(pending)} experiments still running or pending:")
    for e in pending: print(f"  {e['id']} status={e['status']}")
    print("Wait for all experiments to complete before exporting.")
    sys.exit(1)
phase8 = [e for e in state["experiments"] if str(e.get("phase")) in ("8", "Phase 8")]
print(f"OK: all Phase 8 experiments complete ({len(phase8)} entries).")
```
Do NOT proceed past this check if any experiments are still running.

When ALL experiments complete, export final metrics from wandb to CSV so `paper_integrity.py` can trace numbers back to sources.

```python
import wandb, pandas as pd, os, sys
from pathlib import Path

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

    # Get artifact URI for this run (type="model" artifact = best checkpoint)
    artifact_uri = ""
    try:
        arts = run.logged_artifacts()
        model_art = next((a for a in arts if a.type == "model"), None)
        if model_art:
            artifact_uri = model_art.qualified_name   # e.g. "entity/project/exp1_s0-best:v0"
    except Exception:
        pass  # non-fatal; artifact_uri stays ""

    if not artifact_uri:
        print(f"WARNING: run {run.name} has no model artifact — checkpoint may be lost. "
              f"Check if upload_best_checkpoint() was called in the training script.")

    for key, val in run.summary.items():
        if key.startswith("final/"):
            metric = key.replace("final/", "")
            rows.append({
                "exp_id":          run.name,
                "method":          run.config.get("method", run.name),
                "dataset":         run.config.get("dataset", "unknown"),
                "group":           run.config.get("group", "other"),
                "metric":          metric,
                "seed":            run.config.get("seed", 0),
                "value":           val,
                "wandb_run":       run.url,
                "wandb_artifact":  artifact_uri,  # permanent link to model weights
            })

df = pd.DataFrame(rows)
# Defensive: create output directory if missing
out_path = Path("experiments/results/all_results.csv")
out_path.parent.mkdir(parents=True, exist_ok=True)
df.to_csv(out_path, index=False)
# Warn on incomplete metrics (NaN rows)
if df.isna().any().any():
    print(f"WARNING: {df.isna().sum().sum()} NaN values in exported results.")
    print(df[df.isna().any(axis=1)][["exp_id", "method", "dataset"]].to_string())
    print("These experiments may have crashed or not logged final/* metrics.")
```

**Required CSV format** (columns: exp_id, method, dataset, group, metric, seed, value, wandb_run, wandb_artifact):
- `exp_id`: the dispatch/state.json id (e.g., `exp1_cifar10c_main_s0`) — for traceability
- `method`: algorithm name (must match how it appears in the paper's tables)
- `group`: canonical group value — must be one of `"main"`, `"baseline"`, `"ablation"`, `"analysis"`.
- `wandb_run`: wandb URL — links number → training run (metrics, config, logs)
- `wandb_artifact`: wandb artifact qualified name — links number → model weights (permanent, reproducible)

**Traceability chain**: paper number → `all_results.csv` row → `wandb_run` (metrics + logs) + `wandb_artifact` (model weights). Every number in the paper must have a non-empty `wandb_artifact`. If any row has an empty `wandb_artifact`, the artifact upload failed and the weights may be lost — investigate before proceeding to writing.

**Post-export artifact check** (run after `export_results.py`):
```python
import pandas as pd
df = pd.read_csv("experiments/results/all_results.csv")
missing_artifact = df[df["wandb_artifact"].isna() | (df["wandb_artifact"] == "")]
if not missing_artifact.empty:
    print(f"WARNING: {len(missing_artifact)} rows missing wandb_artifact:")
    print(missing_artifact[["exp_id", "method", "dataset", "metric"]].to_string())
    print("These experiments either did not call upload_best_checkpoint() or the upload failed.")
    print("Options: (A) re-run upload manually via wandb SDK, (B) re-run the experiment with the fixed script.")
else:
    print(f"✅ All {len(df)} rows have wandb_artifact links. Full checkpoint traceability confirmed.")
```

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

After verifying `all_results.csv` completeness:

**SendMessage to Pipeline Lead** (mandatory — triggers Phase 9):
```
Phase 8 complete. all_results.csv ready.
Experiments: <N_total> total, <N_done> done, <N_failed> failed, <N_cancelled> cancelled
Coverage: <summary of methods × datasets matrix>
Early stop triggered: <yes/no — which groups>
Key result: <best metric vs. strongest baseline>
Ready for Phase 9 analysis.
```
